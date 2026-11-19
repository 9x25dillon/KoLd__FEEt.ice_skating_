// Deterministic boards audit. Reads only named replay/session JSON, never writes sources.
import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { rinkHit, resolveRinkCollision } from "../game/rink.ts";
import { WarmupGroup } from "../game/warmup.ts";
import { RIVALS } from "../game/rivals.ts";
import { setupParams } from "../game/setups.ts";
import type { Setup } from "../game/setups.ts";
import { decode } from "../test/setup-script.ts";
import { createState, step } from "../sim/solver.ts";
import { SIM_DT, DEFAULT_PARAMS } from "../sim/params.ts";
import { IceGrid } from "../sim/ice.ts";
import { parseReplay, replayDigest, REPLAY_SOLVER, MAX_REPLAY_BYTES } from "../sim/replay.ts";
import type { Replay } from "../sim/replay.ts";
import type { SkaterState, EdgeEvent } from "../sim/types.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DEFAULT_SESSIONS = "/home/kill/KoLd__FEEt.ice_skating_/E_W_replays_sessions_eng_bld";
// AUTHORED diagnostic definitions, not a new gameplay gate.
export const OUTSIDE_EPS = 1e-9; // m; separately count every positive signed distance.
export const STUCK_DISTANCE = 0.002; // m from board
export const STUCK_SPEED = 0.1; // m/s
export const STUCK_SECONDS = 1;

type Span = { firstTick: number; lastTick: number; ticks: number; seconds: number;
  maxDepthM: number; inbound: number; outbound: number; tangent: number; fallen: number };
export class OutsideMeter {
  ticks = 0; rawPositiveTicks = 0; outsideTicks = 0; maxDepthM = 0;
  inbound = 0; outbound = 0; tangent = 0; fallen = 0;
  spans: Span[] = [];
  private active: Span | null = null;
  sample(s: SkaterState) {
    this.ticks++;
    const hit = rinkHit(s.pos.x, s.pos.y);
    if (hit) this.rawPositiveTicks++;
    if (!hit || hit.penetration <= OUTSIDE_EPS) { this.active = null; return; }
    const direction = s.vel.x * hit.nx + s.vel.y * hit.ny;
    const key = direction < 0 ? "inbound" : direction > 0 ? "outbound" : "tangent";
    this.outsideTicks++; this[key]++; if (s.fallen) this.fallen++;
    this.maxDepthM = Math.max(this.maxDepthM, hit.penetration);
    if (!this.active) {
      this.active = { firstTick: s.tick, lastTick: s.tick, ticks: 0, seconds: 0,
        maxDepthM: 0, inbound: 0, outbound: 0, tangent: 0, fallen: 0 };
      this.spans.push(this.active);
    }
    const span = this.active;
    span.lastTick = s.tick; span.ticks++; span.seconds = span.ticks * SIM_DT;
    span.maxDepthM = Math.max(span.maxDepthM, hit.penetration);
    span[key]++; if (s.fallen) span.fallen++;
  }
  result() {
    return { sampledTicks: this.ticks, rawPositiveTicks: this.rawPositiveTicks,
      outsideTicks: this.outsideTicks, seconds: this.outsideTicks * SIM_DT,
      maxDepthM: this.maxDepthM, inbound: this.inbound, outbound: this.outbound,
      tangent: this.tangent, fallen: this.fallen,
      longestSeconds: Math.max(0, ...this.spans.map(s => s.seconds)), spans: this.spans };
  }
}

function boundaryDistance(s: SkaterState) {
  // Same signed-distance construction, extended inside the rink.
  const cx = Math.max(-19, Math.min(19, s.pos.x));
  const cy = Math.max(-1, Math.min(37, s.pos.y));
  return Math.abs(Math.hypot(s.pos.x - cx, s.pos.y - cy) - 9);
}
class StuckMeter {
  spans: { firstTick: number; lastTick: number; ticks: number; seconds: number }[] = [];
  private active: (typeof this.spans)[number] | null = null;
  sample(s: SkaterState) {
    if (boundaryDistance(s) > STUCK_DISTANCE || Math.hypot(s.vel.x, s.vel.y) > STUCK_SPEED) {
      this.active = null; return;
    }
    if (!this.active) {
      this.active = { firstTick: s.tick, lastTick: s.tick, ticks: 0, seconds: 0 };
      this.spans.push(this.active);
    }
    this.active.lastTick = s.tick; this.active.ticks++; this.active.seconds = this.active.ticks * SIM_DT;
  }
  result() { return this.spans.filter(s => s.seconds >= STUCK_SECONDS); }
}

export function auditReplay(clip: Replay, enabled = false) {
  let p = { ...clip.initial.params };
  const s = createState(p, clip.initial.speed, clip.initial.lean);
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const before = new OutsideMeter(), after = new OutsideMeter(), stuck = new StuckMeter();
  const digests: number[] = [], displayedDigests: number[] = [];
  let firstRecordedMismatch: number | null = null;
  for (const frame of clip.frames) {
    if (frame.params) p = { ...frame.params };
    const events: EdgeEvent[] = [];
    step(s, frame.input, p, SIM_DT, events, ice);
    const digest = replayDigest(s, events); // actual recorder order: BEFORE boards
    digests.push(digest);
    if (firstRecordedMismatch === null && digest !== frame.digest) firstRecordedMismatch = s.tick;
    before.sample(s);
    resolveRinkCollision(s, events, { boardsSnapInbound: enabled ? 1 : 0 });
    after.sample(s); stuck.sample(s);
    displayedDigests.push(replayDigest(s, events));
  }
  return { enabled, ticks: s.tick, firstRecordedMismatch, before: before.result(), after: after.result(),
    stuck: stuck.result(), digests, displayedDigests };
}

function differences(a: number[], b: number[]) {
  const ticks = a.flatMap((n, i) => n !== b[i] ? [i + 1] : []);
  return { changedTicks: ticks.length, firstChangedTick: ticks[0] ?? null,
    lastChangedTick: ticks.at(-1) ?? null };
}
function compact(run: ReturnType<typeof auditReplay>) {
  const { digests, displayedDigests, ...rest } = run;
  const hash = (values: number[]) => createHash("sha256").update(JSON.stringify(values)).digest("hex");
  return { ...rest, recorderDigestSha256: hash(digests), displayedDigestSha256: hash(displayedDigests) };
}
function compare(clip: Replay) {
  const off = auditReplay(clip), on = auditReplay(clip, true);
  return { off: compact(off), on: compact(on), recorderChanges: differences(off.digests, on.digests),
    displayedChanges: differences(off.displayedDigests, on.displayedDigests) };
}
function warmup(enabled: boolean) {
  const group = new WarmupGroup(RIVALS.map(r => r.name));
  const meters = group.skaters.map(() => new OutsideMeter());
  const hashes = group.skaters.map(() => createHash("sha256"));
  while (!group.done) {
    group.tick();
    group.skaters.forEach((k, i) => {
      // The existing caller has already resolved outbound hits. The prototype's
      // extra operation affects only the remaining standing inward/tangent hits.
      if (enabled) resolveRinkCollision(k.state, [], { boardsSnapInbound: 1 });
      meters[i].sample(k.state);
      hashes[i].update(String(replayDigest(k.state, [])) + "\n");
    });
  }
  return group.skaters.map((k, i) => ({ skater: k.name, ...meters[i].result(), stateSha256: hashes[i].digest("hex") }));
}

/** Explicit benchmark-only adapter, never a change to the replay importer.
 * Nov 11 /39 lacks only the later transfer knobs. The disabled mode produces
 * no new state fields. Accept this adapter only with every archived digest
 * verified under the off policy (checked below). */
export function preTransferReplay(candidate: Replay): Replay | null {
  if (candidate.solver !== REPLAY_SOLVER) return null;
  const snapshots = [candidate.initial.params, ...candidate.frames.flatMap(f => f.params ? [f.params] : [])];
  const absent = snapshots.map(p => Object.keys(DEFAULT_PARAMS).filter(k => !(k in p)));
  if (!absent.every(keys => keys.length === 2 && keys.includes("weightTransferMode") && keys.includes("weightTransferTime"))) return null;
  const copy = structuredClone(candidate);
  for (const p of [copy.initial.params, ...copy.frames.flatMap(f => f.params ? [f.params] : [])])
    Object.assign(p, { weightTransferMode: 0, weightTransferTime: 0.25 });
  return parseReplay(JSON.stringify(copy));
}

export function buildReport(sessions = DEFAULT_SESSIONS, firstIce?: string) {
  const tracked = execFileSync("git", ["ls-files", "*.json"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n");
  const inputs = tracked.filter(f => /replay|fixtures\//.test(f)).map(f => ({ id: f, path: resolve(ROOT, f) }));
  for (const name of readdirSync(sessions).sort()) {
    // Explicit allowlist: this shared folder also contains private unrelated material.
    if (/^(?:a?edgework-(?:replay|session)|2026-09-24.*session).*\.json$/.test(name))
      inputs.push({ id: "recordings/" + name, path: resolve(sessions, name) });
  }
  if (firstIce) inputs.push({ id: "owner-first-ice", path: resolve(firstIce) });
  const inventory: { source: string; sha256: string; status: string; reason?: string; solver?: string; ticks?: number }[] = [];
  const replays: { source: string; comparison: ReturnType<typeof compare> }[] = [];
  const sessionsLinked: { source: string; ticks: number | null; digest: number | null; matchingReplays: string[] }[] = [];
  const lastDigests: { source: string; ticks: number; digest: number }[] = [];
  for (const input of inputs) {
    if (statSync(input.path).size > MAX_REPLAY_BYTES) throw Error(`Oversized corpus file: ${input.id}`);
    const text = readFileSync(input.path, "utf8"), sha256 = createHash("sha256").update(text).digest("hex");
    let raw;
    try { raw = JSON.parse(text); } catch {
      inventory.push({ source: input.id, sha256, status: "invalid-json", reason: "Not repaired or replayed" }); continue;
    }
    if (String(raw.schema).startsWith("edgework-session/")) {
      inventory.push({ source: input.id, sha256, status: "summary-only", reason: "No per-tick positions or inputs" });
      sessionsLinked.push({ source: input.id, ticks: raw.clip?.ticks ?? null, digest: raw.clip?.digest ?? null, matchingReplays: [] });
      continue;
    }
    // Native exports may wrap the solver replay in an envelope.
    const candidate = raw.schema === "edgework-replay/1" ? raw : raw.replay;
    if (candidate?.schema === "edgework-replay/1") {
      if (candidate.frames?.length) lastDigests.push({ source: input.id, ticks: candidate.frames.length,
        digest: candidate.frames.at(-1).digest });
      let clip: Replay | null = null, adapted = false;
      try { clip = parseReplay(JSON.stringify(candidate)); }
      catch (error) {
        clip = preTransferReplay(candidate); adapted = clip !== null;
        if (!clip) inventory.push({ source: input.id, sha256, status: "unsupported-replay", solver: candidate.solver,
          ticks: candidate.frames?.length, reason: error instanceof Error ? error.message : String(error) });
      }
      if (clip) {
        const comparison = compare(clip);
        if (adapted && comparison.off.firstRecordedMismatch !== null)
          throw Error(`Pre-transfer adapter did not reproduce archived digest at tick ${comparison.off.firstRecordedMismatch}: ${input.id}`);
        inventory.push({ source: input.id, sha256, status: adapted ? "measured-verified-pre-transfer" : "measured",
          solver: clip.solver, ticks: clip.frames.length,
          ...(adapted ? { reason: "Benchmark-only: add exactly weightTransferMode=0 and weightTransferTime=0.25; every archived off digest matched" } : {}) });
        replays.push({ source: input.id, comparison });
      }
    } else if (input.id.endsWith("setup-mapping-v1.json")) {
      inventory.push({ source: input.id, sha256, status: "measured-input-fixture", ticks: raw.ticks });
      for (const [setup, value] of Object.entries(raw.setups)) {
        const frames = decode((value as { inputs: Parameters<typeof decode>[0] }).inputs, raw.ticks);
        const clip: Replay = { schema: "edgework-replay/1", solver: REPLAY_SOLVER, hz: 120,
          initial: { speed: raw.speed, lean: 0, params: setupParams(setup as Setup, raw.assistance) },
          frames: frames.map(input => ({ input, scheme: "D", digest: 0 })) };
        replays.push({ source: input.id + "#" + setup, comparison: compare(clip) });
      }
    } else inventory.push({ source: input.id, sha256, status: "not-a-replay", reason: "Geometry/program/measurement fixture; no full replay input stream" });
  }
  for (const session of sessionsLinked) session.matchingReplays = lastDigests.filter(r => r.ticks === session.ticks && r.digest === session.digest).map(r => r.source);
  return { schema: "boards-gap-audit/1", solver: REPLAY_SOLVER,
    method: { dt: SIM_DT, outsideEpsilonM: OUTSIDE_EPS, rawPositiveTicks: "all strictly positive rinkHit distances, including rounding noise",
      duration: "outside tick count / 120; spans include both endpoints; pre- and post-collision measured separately",
      heading: "sign of velocity dot outward normal; zero is tangent/stationary; fallen counted separately",
      feedback: "boards mutate the SAME state used by the next solver tick; recorder digest is taken before each collision",
      historicalPolicy: "No version relabels or blanket substitution of current defaults. Only /39 missing exactly the two transfer knobs may use the explicit disabled-transfer adapter, and only if every archived off digest matches. Other unsupported clips and summary-only sessions are inventoried, not claimed measured.",
      stuckRuleAuthored: { distanceM: STUCK_DISTANCE, speedMps: STUCK_SPEED, minimumSeconds: STUCK_SECONDS },
      fixturePolicy: "setup-mapping inputs are reconstructed with current setupParams; digest=0 is an authored placeholder, not an archived digest" },
    inventory, sessionsLinked, replays, warmup: { off: warmup(false), on: warmup(true) },
    firstIce: firstIce ? "Candidate: live Godot export modified 2026-11-11 18:02:19, 9,000 ticks (75 s). The hand-off cites 17:55; identity as that exact run is not confirmed. Every archived off digest matches using the explicit disabled-transfer adapter. See owner-first-ice comparison and stuck intervals; this does not establish a fix for the owner's experience." : "Missing: the 2026-11-11 17:55 recording is not in the specified corpus",
    ownerChoice: "Pending owner decision: keep the shipped behavior (default off), or authorize enabling inward snapping after reviewing replay changes. This experiment does not enable it in gameplay." };
}

export function markdown(report: ReturnType<typeof buildReport>) {
  const lines = ["# Boards gap — November 2026", "", "Measured by `tools/ice-lab/bench/boardsgap.ts`. All durations use 120 Hz. Thresholds in the JSON method are authored diagnostic definitions.", "",
    "The exact rule is `into <= 0` in `game/rink.ts`: an outside standing skater moving inward or tangentially returns before projection. Fallen skaters return even earlier. The prototype projects only the former, without changing velocity or events.", "",
    "The collision mutates the same state the next solver tick reads. Capturing a digest before collision does **not** isolate future ticks from it. Both recorder and post-collision digest changes are measured.", "",
    "## Replay and input-fixture measurements", "", "| Source | Off outside ticks | On outside ticks | Off max depth (mm) | On max depth (mm) | Changed recorder ticks | First change |", "|---|---:|---:|---:|---:|---:|---:|"];
  for (const r of report.replays) {
    const { off, on, recorderChanges: c } = r.comparison;
    lines.push(`| ${r.source} | ${off.after.outsideTicks} | ${on.after.outsideTicks} | ${(off.after.maxDepthM * 1000).toFixed(6)} | ${(on.after.maxDepthM * 1000).toFixed(6)} | ${c.changedTicks} | ${c.firstChangedTick ?? "—"} |`);
  }
  lines.push("", "The JSON includes every contiguous outside interval, inbound/outbound/tangent counts, fallen counts, total and longest duration, pre-collision measurements, raw positive-distance counts, input SHA-256 hashes, and digest-stream hashes. Unsupported recordings are not zero-gap results.", "", "## Warm-up reproducer", "", "| Skater | Off ticks | On ticks | Off max depth (mm) | Off seconds | Longest interval (s) |", "|---|---:|---:|---:|---:|---:|");
  report.warmup.off.forEach((s, i) => lines.push(`| ${s.skater} | ${s.outsideTicks} | ${report.warmup.on[i].outsideTicks} | ${(s.maxDepthM * 1000).toFixed(6)} | ${s.seconds.toFixed(6)} | ${s.longestSeconds.toFixed(6)} |`));
  lines.push("", "This is the existing 45-second warm-up pilot. In the on trial, the extra projection runs after its existing collision call, before the next tick; no controls or tolerances change.", "", "## Corpus coverage", "", "| Source | Status | Reason |", "|---|---|---|");
  for (const row of report.inventory) lines.push(`| ${row.source} | ${row.status} | ${row.reason ?? row.solver ?? "—"} |`);
  lines.push("", "Session summaries only link to replay files by tick count and final digest; they cannot supply missing tick trajectories. Older solvers and malformed JSON require their original compatible recordings/builds; they were neither repaired nor relabelled.", "", "## First ice", "", report.firstIce, "", "The authored stuck diagnostic is speed ≤0.1 m/s within 2 mm of the boards for at least one second. It is a proxy, not a claim about what the player felt; intervals are in JSON when the run is available.", "", "## Owner's choice", "", report.ownerChoice, "");
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (key: string) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
  const report = buildReport(value("--sessions"), value("--first-ice"));
  const json = JSON.stringify(report, null, 2) + "\n";
  const output = value("--out") ?? resolve(ROOT, "docs/boardsgap-2026-11");
  writeFileSync(output + ".json", json); writeFileSync(output + ".md", markdown(report));
  console.log(JSON.stringify({ output: basename(output), inputs: report.inventory.length, measuredStreams: report.replays.length,
    changedStreams: report.replays.filter(r => r.comparison.recorderChanges.changedTicks).map(r => r.source) }));
}
