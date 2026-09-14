// tools/ice-lab/validate.mjs — the fidelity gate, run headlessly.
//
//   node tools/ice-lab/validate.mjs            human-readable report
//   node tools/ice-lab/validate.mjs --json     machine-readable, for CI
//   node tools/ice-lab/validate.mjs --cases <dir>
//
// docs/fidelity-gate.md is the specification and this file implements it; where
// they disagree, one of them is wrong and the disagreement is fixed in the open.
// The case format is data/validation/README.md.
//
// Zero dependencies. Every case runs through the same solver the lab runs, is
// recorded as an edgework-replay clip while it runs, and the clip is then
// verified by the existing replay player: a case whose second run does not
// reproduce its first, tick for tick, fails as nondeterministic before any
// observable is looked at.
//
// Exit 0 only when every sourced case passes. Unsourced (expected null) and
// unmodelled cases never move the exit code.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BOOT_PRESET, PRESETS, SIM_DT, SIM_HZ, validate } from "./sim/params.ts";
import { createState, step } from "./sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, REGIME } from "./sim/types.ts";
import { applyProfile, makeProfile } from "./sim/profile.ts";
import { JUMP_PHASE } from "./sim/jump.ts";
import { REPLAY_SOLVER, ReplayPlayer, ReplayRecorder, parseReplay, verifyReplay } from "./sim/replay.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CASES = join(HERE, "..", "..", "data", "validation", "cases");
/** Reported alongside the preset under test, never gated (fidelity-gate §3). */
const REFERENCE_PRESET = "spec";

/** Model features a case may require; anything else is unmodelled (data/validation/README.md). */
const FEATURES = new Set(["jumps", "moves", "three-turn", "mohawk", "twizzle", "spin", "ina-bauer", "crossover"]);
const KINDS = new Set(["carve", "tracing", "transition", "glide", "jump", "inertia", "propulsion"]);
const SOURCES = new Set(["derived", "literature", "protocol", "footage"]);

/**
 * fidelity-gate §5.1, the model band b per observable. `rel` bands are a share
 * of the expected value. null marks one-sided and categorical observables,
 * which carry no band. Must match the document; a case whose band disagrees
 * with this table fails as invalid.
 */
const BANDS = {
  carve_lean_deg: { b: 3 }, carve_lean_residual_deg: { b: 0.5 }, angulation_deg: { b: 5 },
  trace_radius_m: { b: 0.10, rel: true }, trace_lobe_radius_m: { b: 0.10, rel: true },
  turn_entry_angle_deg: { b: 10 }, turn_exit_angle_deg: { b: 10 }, turn_speed_loss_ms: { b: 0.15 },
  twizzle_rate_rps: { b: 0.15, rel: true },
  glide_decel_ms2: { b: 0.25, rel: true }, glide_loss_per_m: { b: 0.25, rel: true },
  ina_bauer_speed_loss_ms: { b: 0.25, rel: true },
  air_time_s: { b: 0.05 }, air_time_height_residual_m: { b: 0.05 }, revolutions_turned: { b: 0.125 },
  pull_in_ratio: { b: 0.15, rel: true }, spin_rate_rps: { b: 0.15, rel: true },
  spin_decay_per_s: { b: 0.30, rel: true },
  stroke_gain_ms: { b: 0.20, rel: true }, crossover_gain_ms: { b: 0.20, rel: true },
  rotation_call: null, carve_held: null, jump_reachable: null, propulsion_reachable: null,
};

// ── the case file ───────────────────────────────────────────────────────────

/** Structural checks only. Returns the first problem, or null. */
function invalid(c, file) {
  if (!c || typeof c !== "object") return "not a JSON object";
  if (`${c.id}.json` !== file) return `id "${c.id}" does not match the file name`;
  if (!KINDS.has(c.kind)) return `unknown kind "${c.kind}"`;
  if (c.role !== "validation" && c.role !== "calibration") return `role must be validation or calibration`;
  if (!c.source || !SOURCES.has(c.source.type)) return `unknown source type`;
  if (!Array.isArray(c.requires)) return "requires must be a list";
  if (!c.observable || !(c.observable.name in BANDS)) return `unknown observable "${c.observable?.name}"`;
  const e = c.expected;
  if (e === null) return null;
  if (c.inputs === null || typeof c.inputs !== "object") return "a sourced case needs inputs";
  const hasScript = Array.isArray(c.inputs.script), hasClip = typeof c.inputs.clip === "string";
  if (hasScript === hasClip) return "exactly one of inputs.script and inputs.clip";
  const band = BANDS[c.observable.name];
  if (e.comparison === "within" || e.comparison === "at_least" || e.comparison === "at_most") {
    if (band === null) return `${c.observable.name} is one-sided or categorical, not ${e.comparison}`;
    for (const k of ["value", "measurement_uncertainty", "band", "tolerance"]) {
      if (typeof e[k] !== "number" || !Number.isFinite(e[k])) return `expected.${k} must be a finite number`;
    }
    const b = band.rel ? band.b * Math.abs(e.value) : band.b;
    if (Math.abs(e.band - b) > 1e-9) return `expected.band ${e.band} is not fidelity-gate §5.1's ${b}`;
    const rss = Math.sqrt(e.measurement_uncertainty ** 2 + e.band ** 2);
    if (Math.abs(e.tolerance - rss) > 1e-9) return `expected.tolerance ${e.tolerance} is not √(u_m² + b²) = ${rss}`;
  } else if (e.comparison !== "holds" && e.comparison !== "call") {
    return `unknown comparison "${e.comparison}"`;
  }
  return null;
}

/** The preset, the skater baked over it, and only what a case may set (fidelity-gate §3). */
function paramsFor(c, preset) {
  const sk = c.skater;
  const profile = makeProfile("case", sk ? { massKg: sk.mass_kg, heightM: sk.height_m } : {});
  const p = applyProfile(PRESETS[preset], profile);
  const modes = c.inputs.modes ?? { jumpMode: 0, movesMode: 0 };
  p.jumpMode = modes.jumpMode;
  p.movesMode = modes.movesMode;
  const v = c.venue;
  if (v) {
    if (typeof v.air_density_kg_m3 === "number") p.airDensity = v.air_density_kg_m3;
    const surf = v.surface;
    if (surf && surf.measured === true && typeof surf.relief_mm === "number") p.rinkRelief = surf.relief_mm / 1000;
  }
  const errs = validate(p);
  if (errs.length) throw new Error(`parameters invalid: ${errs.join("; ")}`);
  return p;
}

/** Script segments to one input per tick, and the ticks where the input changed. */
function expand(script) {
  const inputs = [], changes = [];
  for (const seg of script) {
    const n = Math.round(seg.seconds * SIM_HZ);
    if (n > 0) changes.push(inputs.length);
    const input = { ...NEUTRAL_INPUT, ...seg.input };
    for (let i = 0; i < n; i++) inputs.push(input);
  }
  return { inputs, changes };
}

// ── running a case ──────────────────────────────────────────────────────────

/** What a camera could see, per tick, plus the flags the steady window needs. */
function snapshot(s, input, events) {
  return {
    tick: s.tick,
    x: s.pos.x, y: s.pos.y,
    lean: s.lean,
    z: s.jump.phase === JUMP_PHASE.Air ? Math.max(0, s.jump.z) : 0,
    air: s.jump.phase === JUMP_PHASE.Air,
    skid: s.blade.some((b) => b.inContact && b.regime === REGIME.Skid),
    push: input.push === true || s.strokeTime > 0,
    fallen: s.fallen,
    events: events.map((e) => e.type),
    landed: events.some((e) => e.type === EVENT.Landing) ? { ...s.landed } : null,
  };
}

function runCase(c, preset, casesDir) {
  const p = paramsFor(c, preset);
  const trace = [];
  if (Array.isArray(c.inputs.script)) {
    const { inputs, changes } = expand(c.inputs.script);
    const speed = c.inputs.initial.speed_ms, lean = c.inputs.initial.lean_rad;
    const rec = new ReplayRecorder(p, speed, lean);
    const s = createState(p, speed, lean);
    const events = [];
    for (const input of inputs) {
      events.length = 0;
      step(s, input, p, SIM_DT, events);
      rec.capture(input, p, s, events);
      trace.push(snapshot(s, input, events));
    }
    // The second run: the recorded clip through the replay player.
    const check = verifyReplay(parseReplay(rec.toJson()));
    return { trace, changes, g: p.gravity, settle: settleTicks(p), nondeterministic: check.divergence, divergence: null };
  }
  const clip = parseReplay(readFileSync(resolve(casesDir, "..", c.inputs.clip), "utf8"));
  const player = new ReplayPlayer(clip);
  const changes = [0];
  let prev = null;
  while (player.index < player.total) {
    player.advance();
    const input = player.input;
    if (prev && JSON.stringify(prev) !== JSON.stringify(input)) changes.push(player.index - 1);
    prev = input;
    trace.push(snapshot(player.state, input, player.events));
    if (player.divergence) player.divergence = { ...player.divergence }; // reported, not fatal
  }
  return { trace, changes, g: p.gravity, settle: settleTicks(p), nondeterministic: null, divergence: player.divergence };
}

// ── windows and observables ─────────────────────────────────────────────────

const DEG = 180 / Math.PI;
const STEADY_TICKS = SIM_HZ;          // at least 1.0 s
/**
 * Seconds after the last input change before a steady window may begin
 * (fidelity-gate §4.4): long enough for the arms' authority to wash out where
 * the preset washes it out — three 1.5 s time constants, rounded up — and the
 * original 2.0 s where it never does.
 */
function settleTicks(p) { return (p.internalWashout > 0 ? 5 : 2) * SIM_HZ; }
const STEADY_LEAN_PP = 1 / DEG;       // phi varying by less than 1 degree peak to peak

/**
 * fidelity-gate §4.4: the earliest span of exactly 1.0 s that begins at least
 * the preset's settle time after the last input change, with no skid, push, fall or flight, and
 * lean within 1 degree peak to peak. Indices into the trace, [from, to).
 * Leaves one tick either side so central differences exist.
 */
function steadyWindow(trace, changes, settle) {
  const start = Math.max(1, (changes.length ? changes[changes.length - 1] : 0) + settle);
  outer: for (let i = start; i + STEADY_TICKS < trace.length; i++) {
    let lo = Infinity, hi = -Infinity;
    for (let k = i; k < i + STEADY_TICKS; k++) {
      const t = trace[k];
      if (t.skid || t.push || t.fallen || t.air) { i = k; continue outer; }
      lo = Math.min(lo, t.lean); hi = Math.max(hi, t.lean);
    }
    if (hi - lo < STEADY_LEAN_PP) return { from: i, to: i + STEADY_TICKS };
  }
  return null;
}

/** Centre-of-mass velocity and acceleration at trace index k, by central differences of position. */
function kinematics(trace, k) {
  const a = trace[k - 1], b = trace[k], c = trace[k + 1];
  const vx = (c.x - a.x) / (2 * SIM_DT), vy = (c.y - a.y) / (2 * SIM_DT);
  const ax = (c.x - 2 * b.x + a.x) / (SIM_DT * SIM_DT), ay = (c.y - 2 * b.y + a.y) / (SIM_DT * SIM_DT);
  const speed = Math.hypot(vx, vy);
  return { speed, lateral: speed > 0 ? Math.abs(vx * ay - vy * ax) / speed : 0 };
}

function explicitWindow(trace, w) {
  const from = Math.max(1, Math.round(w.from_s * SIM_HZ)), to = Math.min(trace.length - 1, Math.round(w.to_s * SIM_HZ));
  return to > from ? { from, to } : null;
}

function flight(trace) {
  const up = trace.findIndex((t) => t.events.includes(EVENT.Takeoff));
  if (up < 0) return null;
  const down = trace.findIndex((t, i) => i > up && t.events.includes(EVENT.Landing));
  if (down < 0) return null;
  let h = 0;
  for (let k = up; k <= down; k++) h = Math.max(h, trace[k].z);
  return { t: (trace[down].tick - trace[up].tick) * SIM_DT, h, landed: trace[down].landed };
}

/** Each returns { value } or { reason } when the run could not produce the observable. */
const EXTRACT = {
  carve_lean_residual_deg(run, c) {
    const w = c.observable.window === "steady" ? steadyWindow(run.trace, run.changes, run.settle) : null;
    if (!w) return { reason: "no steady window (fidelity-gate §4.4)" };
    let sum = 0;
    for (let k = w.from; k < w.to; k++) {
      const { lateral } = kinematics(run.trace, k);
      sum += (Math.abs(run.trace[k].lean) - Math.atan(lateral / run.g)) * DEG;
    }
    return { value: sum / (w.to - w.from), window: w };
  },
  carve_lean_deg(run, c) {
    const w = c.observable.window === "steady" ? steadyWindow(run.trace, run.changes, run.settle) : null;
    if (!w) return { reason: "no steady window (fidelity-gate §4.4)" };
    let sum = 0;
    for (let k = w.from; k < w.to; k++) sum += Math.abs(run.trace[k].lean) * DEG;
    return { value: sum / (w.to - w.from), window: w };
  },
  glide_decel_ms2(run, c) {
    const w = c.observable.window === "steady" ? steadyWindow(run.trace, run.changes, run.settle)
      : typeof c.observable.window === "object" ? explicitWindow(run.trace, c.observable.window) : null;
    if (!w) return { reason: "no usable window" };
    const v0 = kinematics(run.trace, w.from).speed, v1 = kinematics(run.trace, w.to - 1).speed;
    return { value: (v0 - v1) / ((w.to - 1 - w.from) * SIM_DT), window: w };
  },
  air_time_s(run) {
    const f = flight(run.trace);
    return f ? { value: f.t } : { reason: "no takeoff and landing" };
  },
  air_time_height_residual_m(run) {
    const f = flight(run.trace);
    return f ? { value: f.h - run.g * f.t * f.t / 8 } : { reason: "no takeoff and landing" };
  },
  revolutions_turned(run) {
    const f = flight(run.trace);
    return f && f.landed ? { value: f.landed.turned } : { reason: "no landing" };
  },
};

function compare(e, value) {
  const deviation = value - e.value;
  switch (e.comparison) {
    case "within": return { deviation, pass: Math.abs(deviation) <= e.tolerance + 1e-12 };
    case "at_least": return { deviation, pass: deviation >= -e.tolerance - 1e-12 };
    case "at_most": return { deviation, pass: deviation <= e.tolerance + 1e-12 };
    default: return null;
  }
}

/** One preset's verdict on one case. */
function judge(c, preset, casesDir) {
  let run;
  try { run = runCase(c, preset, casesDir); }
  catch (err) { return { verdict: "fail", reason: `run failed: ${err.message}` }; }
  if (run.nondeterministic) {
    return { verdict: "fail", reason: `nondeterministic: replay diverged at tick ${run.nondeterministic.tick}` };
  }
  const extract = EXTRACT[c.observable.name];
  if (!extract) return { verdict: "fail", reason: `no extractor for ${c.observable.name} yet` };
  const got = extract(run, c);
  if (!("value" in got)) return { verdict: "fail", reason: got.reason };
  const cmp = compare(c.expected, got.value);
  if (!cmp) return { verdict: "fail", reason: `comparison "${c.expected.comparison}" not implemented yet` };
  return {
    verdict: cmp.pass ? "pass" : "fail", actual: got.value, deviation: cmp.deviation,
    ...(run.divergence ? { divergence: run.divergence } : {}),
  };
}

// ── the corpus ──────────────────────────────────────────────────────────────

export function validateCorpus(casesDir = DEFAULT_CASES) {
  const files = readdirSync(casesDir).filter((f) => f.endsWith(".json")).sort();
  const results = [];
  for (const file of files) {
    let c;
    try { c = JSON.parse(readFileSync(join(casesDir, file), "utf8")); }
    catch (err) { results.push({ id: file, verdict: "fail", reason: `unreadable: ${err.message}` }); continue; }
    const base = {
      id: c.id ?? file, kind: c.kind, role: c.role, source: c.source?.type,
      primary_checked: c.source?.primary_checked ?? null, observable: c.observable?.name,
    };
    const bad = invalid(c, file);
    if (bad) { results.push({ ...base, verdict: "fail", reason: `invalid case: ${bad}` }); continue; }
    const missing = c.requires.filter((f) => !FEATURES.has(f));
    if (missing.length) { results.push({ ...base, verdict: "unmodelled", reason: `needs ${missing.join(", ")}` }); continue; }
    if (c.expected === null) { results.push({ ...base, verdict: "unsourced" }); continue; }
    const gated = judge(c, BOOT_PRESET, casesDir);
    const reference = judge(c, REFERENCE_PRESET, casesDir);
    results.push({
      ...base, expected: c.expected.value, comparison: c.expected.comparison,
      tolerance: c.expected.tolerance, unit: c.expected.unit, ...gated,
      [REFERENCE_PRESET]: { verdict: reference.verdict, actual: reference.actual ?? null, reason: reference.reason },
    });
  }
  return summarize(results);
}

/** fidelity-gate §6.2 and §6.3, items 1–3. Item 4 is CI's to establish. */
function summarize(results) {
  const count = (v) => results.filter((r) => r.verdict === v).length;
  const sourcedFails = results.filter((r) => r.verdict === "fail").length;
  const coverage = {};
  for (const kind of KINDS) coverage[kind] = 0;
  for (const r of results) {
    const external = r.source === "footage" || r.source === "protocol" || (r.source === "literature" && r.primary_checked === true);
    if (r.verdict === "pass" && r.role === "validation" && external) coverage[r.kind]++;
  }
  // §6.3 item 2 asks for three passing external cases per class from at least
  // two independent sources; sources are not yet distinguished here, so the
  // count is necessary, not sufficient, and the report says so.
  const required = ["carve", "tracing", "glide", "jump", "inertia", "propulsion", "transition"];
  const covered = required.every((k) => coverage[k] >= 3);
  return {
    preset: BOOT_PRESET, reference: REFERENCE_PRESET, solver: REPLAY_SOLVER,
    summary: {
      cases: results.length, pass: count("pass"), fail: count("fail"),
      unsourced: count("unsourced"), unmodelled: count("unmodelled"),
    },
    coverage, gate: { no_failing_sourced: sourcedFails === 0, coverage_count_met: covered, met: false },
    results,
  };
}

// ── output ──────────────────────────────────────────────────────────────────

function fmt(x, unit) {
  if (x === undefined || x === null) return "—";
  if (typeof x !== "number") return String(x);
  return `${x.toFixed(Math.abs(x) >= 10 ? 2 : 4)}${unit ? " " + unit : ""}`;
}

function human(report) {
  const out = [];
  out.push(`Fidelity gate — preset ${report.preset} (reference ${report.reference}), solver ${report.solver}`);
  out.push("");
  const rows = report.results.filter((r) => r.verdict === "pass" || r.verdict === "fail");
  const head = ["case", "observable", "expected", "actual", "deviation", "tolerance", "verdict", report.reference];
  const table = [head, ...rows.map((r) => [
    r.id, r.observable ?? "—", fmt(r.expected, r.unit), fmt(r.actual, r.unit), fmt(r.deviation), fmt(r.tolerance),
    r.verdict.toUpperCase() + (r.reason ? ` (${r.reason})` : ""),
    r[report.reference] ? `${r[report.reference].verdict}${r[report.reference].actual !== null ? " " + fmt(r[report.reference].actual) : ""}` : "—",
  ])];
  const widths = head.map((_, i) => Math.max(...table.map((row) => String(row[i]).length)));
  for (const row of table) out.push(row.map((cell, i) => String(cell).padEnd(widths[i])).join("  ").trimEnd());
  const unsourced = report.results.filter((r) => r.verdict === "unsourced");
  const unmodelled = report.results.filter((r) => r.verdict === "unmodelled");
  out.push("");
  out.push(`unsourced (${unsourced.length}): ${unsourced.map((r) => r.id).join(", ") || "none"}`);
  out.push(`unmodelled (${unmodelled.length}): ${unmodelled.map((r) => `${r.id} [${r.reason}]`).join(", ") || "none"}`);
  out.push("");
  const s = report.summary;
  out.push(`${s.pass} pass, ${s.fail} fail, ${s.unsourced} unsourced, ${s.unmodelled} unmodelled — `
    + (s.fail === 0 ? "no failing sourced case" : "FIDELITY REGRESSION"));
  out.push(`gate: not met (external passing cases per class: ${Object.entries(report.coverage).map(([k, n]) => `${k} ${n}`).join(", ")})`);
  return out.join("\n") + "\n";
}

function main(argv) {
  const json = argv.includes("--json");
  const at = argv.indexOf("--cases");
  const dir = at >= 0 && argv[at + 1] ? resolve(argv[at + 1]) : DEFAULT_CASES;
  const report = validateCorpus(dir);
  process.stdout.write(json ? JSON.stringify(report, null, 2) + "\n" : human(report));
  return report.summary.fail === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
