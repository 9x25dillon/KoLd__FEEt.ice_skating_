// The numerical floor: how much of a gate observable is the step size?
//
// Every other test in this directory runs at one dt, 1/120 s, so none of them
// can see discretisation error. docs/fidelity-gate.md §5.1 asks for it by name:
// carve_lean_residual_deg's ±0.5° band is "to be replaced by the numerical floor
// the first validator run measures". This file is that measurement, kept as a
// test so the number in the gate can be reproduced by anyone.
//
// Method (the 2026-11-15 review's, written out): a held edge on the preset the
// gate makes claims about, at 120, 240, 480 and 960 Hz. Two seconds to settle,
// then three windows of a third of a second. The radius is the circle through
// the three window-end POSITIONS, the same independent fit carve.test.ts uses;
// the balance lean is atan(v² / (g R)) from that radius and the speed at the
// middle point; the residual is the solver's own lean less that. 960 Hz stands
// in for the converged answer, so every "error" below is a difference from it.
//
// This test MEASURES. It tunes nothing, and nothing in sim/ reads it.
//
// What it asserts, and where each number comes from:
//   1. The gate's own bands (fidelity-gate §5.1), which existed before this
//      measurement: the step-size error is inside ±10% of radius and ±0.5°.
//   2. Convergence: the error shrinks every time the step halves, at an order
//      of at least 1, which is what a semi-implicit Euler step is in theory.
//   3. The measured floor, pinned (2026-11-14, solver ice-lab-f64/39). A pin
//      moves only with a deliberate solver change, and the gate's §5.3 table
//      moves with it.
//   4. The review's two floor figures, 1e-4 relative radius and 1e-3°, as the
//      brief stated them before this run. They do NOT hold on this case set,
//      and that test is left failing, marked todo so the failure prints on
//      every run without closing the build. See docs/fidelity-gate.md §5.3.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, BOOT_PRESET } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, FALL, REGIME } from "../sim/types.ts";
import type { EdgeEvent, SkatingInput } from "../sim/types.ts";
import type { Vec2 } from "../sim/math.ts";

const DEG = 180 / Math.PI;
const RATES = [120, 240, 480, 960] as const;
const CASES = [
  { speed: 4, leanDeg: 20 }, { speed: 4, leanDeg: 30 },
  { speed: 6, leanDeg: 20 }, { speed: 6, leanDeg: 30 },
] as const;
const SETTLE_S = 2.0;
const WINDOW_S = 1 / 3;
/**
 * fidelity-gate §4.4: on a preset whose arm authority washes out, a steady
 * window opens 5.0 s after the last input change and lasts 1.0 s. An edge the
 * skater cannot stand on for those 6 s never reaches a gate observable.
 */
const GATE_WINDOW_END_S = 6.0;
/** fidelity-gate §5.1, set before this measurement existed. */
const GATE_RADIUS_BAND_REL = 0.10;
const GATE_RESIDUAL_BAND_DEG = 0.5;
/** The review's floor figures as the brief stated them (asserted, not adjusted). */
const BRIEF_RADIUS_REL = 1e-4;
const BRIEF_RESIDUAL_DEG = 1e-3;

/** Radius of the circle through three points. Independent of the solver. */
function circumradius(a: Vec2, b: Vec2, c: Vec2): number {
  const ax = a.x - c.x, ay = a.y - c.y, bx = b.x - c.x, by = b.y - c.y;
  const cross = ax * by - ay * bx;
  if (Math.abs(cross) < 1e-12) return Infinity;
  const la = ax * ax + ay * ay, lb = bx * bx + by * by;
  const ux = (by * la - ay * lb) / (2 * cross);
  const uy = (ax * lb - bx * la) / (2 * cross);
  return Math.sqrt(ux * ux + uy * uy);
}

interface Sample {
  hz: number;
  radius: number;        // m, fitted to positions
  residualDeg: number;   // solver lean − atan(v²/(gR)) at the middle point
  leanPpDeg: number;     // lean peak to peak across the three windows
  end: Vec2;             // position at the end of the third window
  fell: boolean;
  onEdge: boolean;
}

function held(p: Params, speed: number, leanDeg: number, hz: number): Sample {
  const dt = 1 / hz, lean = leanDeg / DEG;
  const s = createState(p, speed, lean);
  const input: SkatingInput = { ...NEUTRAL_INPUT, lean: lean / p.maxLean, weight: 1 };
  const events: EdgeEvent[] = [];
  let lo = Infinity, hi = -Infinity, watching = false;
  const advance = (seconds: number): void => {
    const n = Math.round(seconds * hz);
    for (let i = 0; i < n; i++) {
      events.length = 0;
      step(s, input, p, dt, events);
      if (watching) { lo = Math.min(lo, s.lean); hi = Math.max(hi, s.lean); }
    }
  };
  advance(SETTLE_S);
  watching = true;
  const pts: Vec2[] = [];
  let leanMid = 0, speedMid = 0;
  for (let i = 0; i < 3; i++) {
    advance(WINDOW_S);
    pts.push({ ...s.pos });
    if (i === 1) { leanMid = Math.abs(s.lean); speedMid = Math.hypot(s.vel.x, s.vel.y); }
  }
  const radius = circumradius(pts[0], pts[1], pts[2]);
  const support = s.blade[s.supportFoot];
  return {
    hz, radius,
    residualDeg: (leanMid - Math.atan(speedMid * speedMid / (p.gravity * radius))) * DEG,
    leanPpDeg: (hi - lo) * DEG,
    end: pts[2],
    fell: s.fallen || s.fallReason !== FALL.None,
    onEdge: support.regime === REGIME.Edge || support.regime === REGIME.Carve,
  };
}

/** Whether the skater is still up at the end of the gate's own steady window, at the shipped step. */
function stands(p: Params, speed: number, leanDeg: number): boolean {
  const lean = leanDeg / DEG;
  const s = createState(p, speed, lean);
  const input: SkatingInput = { ...NEUTRAL_INPUT, lean: lean / p.maxLean, weight: 1 };
  const events: EdgeEvent[] = [];
  const n = Math.round(GATE_WINDOW_END_S * 120);
  for (let i = 0; i < n; i++) { events.length = 0; step(s, input, p, 1 / 120, events); }
  return !s.fallen && s.fallReason === FALL.None;
}

interface Floor {
  speed: number; leanDeg: number; steady: boolean;
  radius960: number;
  /** vs 960 Hz, per rate in RATES order (the last is 0 by definition). */
  radiusRel: number[]; residualDriftDeg: number[]; posErr: number[];
  /** log2(error at one step / error at half that step), from position error. */
  order: number[];
  leanPpDeg: number;
}

function sweep(p: Params): Floor[] {
  return CASES.map(({ speed, leanDeg }) => {
    const rows = RATES.map((hz) => held(p, speed, leanDeg, hz));
    const ref = rows[rows.length - 1];
    const posErr = rows.map((r) => Math.hypot(r.end.x - ref.end.x, r.end.y - ref.end.y));
    return {
      speed, leanDeg,
      steady: rows.every((r) => !r.fell && r.onEdge) && stands(p, speed, leanDeg),
      radius960: ref.radius,
      radiusRel: rows.map((r) => Math.abs(r.radius - ref.radius) / ref.radius),
      residualDriftDeg: rows.map((r) => Math.abs(r.residualDeg - ref.residualDeg)),
      posErr,
      order: [Math.log2(posErr[0] / posErr[1]), Math.log2(posErr[1] / posErr[2])],
      leanPpDeg: Math.max(...rows.map((r) => r.leanPpDeg)),
    };
  });
}

function table(floors: Floor[]): string {
  const out = ["v m/s  lean°  steady  R(960) m   R rel err @120  residual drift° @120  pos err m @120  order 120→240, 240→480  lean pp°"];
  for (const f of floors) {
    out.push([
      String(f.speed).padEnd(5), String(f.leanDeg).padEnd(5), String(f.steady).padEnd(6),
      f.radius960.toFixed(4).padEnd(9), f.radiusRel[0].toExponential(3).padEnd(14),
      f.residualDriftDeg[0].toExponential(3).padEnd(20), f.posErr[0].toExponential(3).padEnd(14),
      `${f.order[0].toFixed(2)}, ${f.order[1].toFixed(2)}`.padEnd(22), f.leanPpDeg.toExponential(2),
    ].join("  "));
  }
  return out.join("\n");
}

const GATED = sweep(PRESETS[BOOT_PRESET]);

// ── the same question, asked the validator's way ────────────────────────────
//
// validate.mjs takes carve_lean_residual_deg per tick, from central differences
// of position, and averages it over 1.0 s that begins after the preset's settle
// time (fidelity-gate §4.4: 5.0 s on `responsive`). This repeats that extractor
// at each rate, so the floor is stated for the observable as the gate measures
// it, and reports how far the per-tick residual moves inside the window: the
// model's own settling ripple, which is not step-size error.

interface Windowed { meanDeg: number; rippleDeg: number }

function windowed(p: Params, speed: number, leanDeg: number, hz: number, settleS: number): Windowed {
  const dt = 1 / hz, lean = leanDeg / DEG;
  const s = createState(p, speed, lean);
  const input: SkatingInput = { ...NEUTRAL_INPUT, lean: lean / p.maxLean, weight: 1 };
  const events: EdgeEvent[] = [];
  const from = Math.round(settleS * hz), to = from + hz;
  const xs: number[] = [], ys: number[] = [], leans: number[] = [];
  for (let i = 0; i <= to; i++) {
    events.length = 0;
    step(s, input, p, dt, events);
    xs.push(s.pos.x); ys.push(s.pos.y); leans.push(s.lean);
  }
  let sum = 0, lo = Infinity, hi = -Infinity;
  for (let k = from; k < to; k++) {
    const vx = (xs[k + 1] - xs[k - 1]) / (2 * dt), vy = (ys[k + 1] - ys[k - 1]) / (2 * dt);
    const ax = (xs[k + 1] - 2 * xs[k] + xs[k - 1]) / (dt * dt), ay = (ys[k + 1] - 2 * ys[k] + ys[k - 1]) / (dt * dt);
    const speedNow = Math.hypot(vx, vy);
    const lateral = Math.abs(vx * ay - vy * ax) / speedNow;
    const r = (Math.abs(leans[k]) - Math.atan(lateral / p.gravity)) * DEG;
    sum += r; lo = Math.min(lo, r); hi = Math.max(hi, r);
  }
  return { meanDeg: sum / hz, rippleDeg: hi - lo };
}

interface GateFloor {
  speed: number; leanDeg: number;
  residual120: number; residual960: number; driftDeg: number;
  rippleAtGateSettle: number; rippleAt2s: number;
}

function gateWindow(p: Params): GateFloor[] {
  const settle = p.internalWashout > 0 ? 5.0 : 2.0;
  return CASES.filter(({ speed, leanDeg }) => stands(p, speed, leanDeg)).map(({ speed, leanDeg }) => {
    const coarse = windowed(p, speed, leanDeg, 120, settle), fine = windowed(p, speed, leanDeg, 960, settle);
    return {
      speed, leanDeg, residual120: coarse.meanDeg, residual960: fine.meanDeg,
      driftDeg: Math.abs(coarse.meanDeg - fine.meanDeg),
      rippleAtGateSettle: coarse.rippleDeg, rippleAt2s: windowed(p, speed, leanDeg, 120, 2.0).rippleDeg,
    };
  });
}

function gateTable(rows: GateFloor[]): string {
  const out = ["v m/s  lean°  residual° @120  residual° @960  drift°       ripple° pp, gate settle  ripple° pp, 2 s settle"];
  for (const r of rows) {
    out.push([
      String(r.speed).padEnd(5), String(r.leanDeg).padEnd(5), r.residual120.toExponential(3).padEnd(14),
      r.residual960.toExponential(3).padEnd(14), r.driftDeg.toExponential(3).padEnd(11),
      r.rippleAtGateSettle.toExponential(2).padEnd(23), r.rippleAt2s.toExponential(2),
    ].join("  "));
  }
  return out.join("\n");
}

const GATE_WINDOW = gateWindow(PRESETS[BOOT_PRESET]);

/** Measured 2026-11-14 on `responsive`, ice-lab-f64/39. docs/fidelity-gate.md §5.3. Same re-pin rule as PINNED. */
const PINNED_GATE: Record<string, { driftDeg: number; residual960: number; rippleAtGateSettle: number; rippleAt2s: number }> = {
  "4/20": { driftDeg: 2.763e-3, residual960: 5.40e-4, rippleAtGateSettle: 7.42e-5, rippleAt2s: 1.64e-2 },
  "6/20": { driftDeg: 2.738e-3, residual960: 4.33e-4, rippleAtGateSettle: 1.98e-4, rippleAt2s: 4.96e-2 },
  "6/30": { driftDeg: 3.825e-3, residual960: 1.08e-4, rippleAtGateSettle: 1.01e-3, rippleAt2s: 5.10e-2 },
};

/**
 * Measured 2026-11-14 on `responsive`, solver ice-lab-f64/39: the 120 Hz error
 * against 960 Hz. Recorded in docs/fidelity-gate.md §5.3. Re-pin only for a
 * deliberate solver change, and change that table in the same commit.
 */
const PINNED: Record<string, { steady: boolean; radiusRel: number; residualDriftDeg: number; posErr: number }> = {
  "4/20": { steady: true, radiusRel: 5.096e-5, residualDriftDeg: 2.876e-3, posErr: 1.987e-2 },
  "4/30": { steady: false, radiusRel: 1.336e-4, residualDriftDeg: 1.252e-2, posErr: 1.205e-2 },
  "6/20": { steady: true, radiusRel: 1.682e-4, residualDriftDeg: 1.533e-3, posErr: 4.379e-2 },
  "6/30": { steady: true, radiusRel: 2.426e-4, residualDriftDeg: 1.918e-3, posErr: 5.502e-2 },
};

test("the dt-sweep: what was measured", (t) => {
  t.diagnostic(`preset ${BOOT_PRESET} (gated)\n${table(GATED)}`);
  t.diagnostic(`preset spec (reported, not gated)\n${table(sweep(PRESETS.spec))}`);
  t.diagnostic(`preset ${BOOT_PRESET}, the validator's extractor over the gate's steady window\n${gateTable(GATE_WINDOW)}`);
});

test("in the gate's own window the residual is mostly step size, and inside the band", () => {
  assert.equal(GATE_WINDOW.length, 3, "three standing cases");
  const close = (got: number, want: number): boolean => Math.abs(got - want) <= 0.02 * Math.abs(want);
  for (const r of GATE_WINDOW) {
    const key = `${r.speed}/${r.leanDeg}`, pin = PINNED_GATE[key];
    assert.ok(r.driftDeg < GATE_RESIDUAL_BAND_DEG, `${key}: drift ${r.driftDeg}° is outside the gate band`);
    assert.ok(Math.abs(r.residual120) < GATE_RESIDUAL_BAND_DEG, `${key}: residual ${r.residual120}° is outside the gate band`);
    // What is left at 960 Hz is smaller than what the step adds at 120 Hz.
    assert.ok(Math.abs(r.residual960) < r.driftDeg, `${key}: residual at 960 Hz ${r.residual960}° is not under the drift ${r.driftDeg}°`);
    assert.ok(close(r.driftDeg, pin.driftDeg), `${key} drift ${r.driftDeg.toExponential(4)}°, pinned ${pin.driftDeg}`);
    assert.ok(close(r.residual960, pin.residual960), `${key} residual at 960 Hz ${r.residual960.toExponential(4)}°, pinned ${pin.residual960}`);
    assert.ok(close(r.rippleAtGateSettle, pin.rippleAtGateSettle), `${key} ripple ${r.rippleAtGateSettle.toExponential(4)}°, pinned ${pin.rippleAtGateSettle}`);
    assert.ok(close(r.rippleAt2s, pin.rippleAt2s), `${key} ripple at 2 s ${r.rippleAt2s.toExponential(4)}°, pinned ${pin.rippleAt2s}`);
  }
});

test("three of the four held edges stand; 4 m/s at 30° is a skater on the way down", () => {
  // 4 m/s cannot balance 30°: the lean wants r = v²/(g tan φ) = 2.82 m and the
  // edge is tracing about 2.27 m. Inside the three windows it has not fallen and
  // its lean has moved only 0.2°, but it is down before the gate's steady window
  // would close at 6 s, so what it measures is a transient, not a held edge.
  // Left in the sweep and in the table, because the brief named it; left out of
  // the floor.
  for (const f of GATED) {
    assert.equal(f.steady, PINNED[`${f.speed}/${f.leanDeg}`].steady,
      `${f.speed} m/s at ${f.leanDeg}°: standing at ${GATE_WINDOW_END_S} s was ${f.steady}`);
  }
});

test("the step size is inside the gate's bands on every steady edge", () => {
  for (const f of GATED.filter((x) => x.steady)) {
    assert.ok(f.radiusRel[0] < GATE_RADIUS_BAND_REL,
      `${f.speed} m/s at ${f.leanDeg}°: radius moves ${f.radiusRel[0]} relative between 120 and 960 Hz`);
    assert.ok(f.residualDriftDeg[0] < GATE_RESIDUAL_BAND_DEG,
      `${f.speed} m/s at ${f.leanDeg}°: residual moves ${f.residualDriftDeg[0]}° between 120 and 960 Hz`);
  }
});

test("halving the step shrinks the error, at first order or better", () => {
  for (const f of GATED.filter((x) => x.steady)) {
    for (const series of [f.posErr, f.radiusRel, f.residualDriftDeg]) {
      assert.ok(series[0] > series[1] && series[1] > series[2],
        `${f.speed} m/s at ${f.leanDeg}°: error did not fall with the step: ${series.slice(0, 3).join(", ")}`);
    }
    for (const order of f.order) {
      assert.ok(order >= 1, `${f.speed} m/s at ${f.leanDeg}°: observed order ${order.toFixed(3)} is under 1`);
    }
  }
});

test("the measured floor is the pinned floor", () => {
  const close = (got: number, want: number): boolean => Math.abs(got - want) <= 0.005 * want;
  for (const f of GATED) {
    const pin = PINNED[`${f.speed}/${f.leanDeg}`];
    assert.ok(close(f.radiusRel[0], pin.radiusRel), `${f.speed}/${f.leanDeg} radius error ${f.radiusRel[0].toExponential(4)}, pinned ${pin.radiusRel}`);
    assert.ok(close(f.residualDriftDeg[0], pin.residualDriftDeg), `${f.speed}/${f.leanDeg} residual drift ${f.residualDriftDeg[0].toExponential(4)}°, pinned ${pin.residualDriftDeg}`);
    assert.ok(close(f.posErr[0], pin.posErr), `${f.speed}/${f.leanDeg} position error ${f.posErr[0].toExponential(4)} m, pinned ${pin.posErr}`);
  }
});

// The brief's expectation, from the review's single case (4 m/s, 20°): radius
// under 1e-4 relative and residual drift under 1e-3°. Measured here: the radius
// figure holds on that one case (5.1e-5) and not at 6 m/s (1.7e-4, 2.4e-4); the
// residual figure holds on none (1.5e-3° to 2.9e-3°). See
// docs/divergences/numerical-floor-vs-review.md. The thresholds are not
// widened to fit. This stays failing until the floor is at or under them, or the
// owner replaces the figures under fidelity-gate §5.
test("the review's floor figures hold on every steady case", {
  todo: "they do not: radius 2.4e-4 relative and residual 2.9e-3° at worst — docs/fidelity-gate.md §5.3",
}, () => {
  const over: string[] = [];
  for (const f of GATED.filter((x) => x.steady)) {
    if (!(f.radiusRel[0] < BRIEF_RADIUS_REL)) over.push(`${f.speed}/${f.leanDeg} radius ${f.radiusRel[0].toExponential(3)} ≥ ${BRIEF_RADIUS_REL}`);
    if (!(f.residualDriftDeg[0] < BRIEF_RESIDUAL_DEG)) over.push(`${f.speed}/${f.leanDeg} residual ${f.residualDriftDeg[0].toExponential(3)}° ≥ ${BRIEF_RESIDUAL_DEG}°`);
  }
  assert.deepEqual(over, []);
});
