// The comparison set every takeoff-physics candidate runs against: ordinary
// skating and the loop, good and bad, on the Experimental pad through its own
// mapping (and one over-torqued attempt straight into the solver).
//
//   node test/loop-comparison.ts            the table, one row per scenario
//   node test/loop-comparison.ts --json     the same as JSON, for diffing
//   node test/loop-comparison.ts --set pushOffMode=1 ...   a candidate's Params on the Experimental setup
//
// A candidate that lands the double and moves the glides, the single or the
// failures is rejected: compare its table with the one before it.

import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { EVENT, NEUTRAL_INPUT, REGIME } from "../sim/types.ts";
import type { EdgeEvent, SkatingInput } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { setupParams, setupInput } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";

/** A pad script: from `at` s for `for` s, these buttons held and these axes (the rest released). */
interface Hold { at: number; for: number; buttons?: number[]; axes?: [number, number, number, number]; trigger?: number }

export interface Scenario {
  name: string; speed: number; seconds: number;
  /** Before takeoff. */
  ground: Hold[];
  /** After takeoff: s into the air the arms open (B), and the landing's right trigger. */
  check?: number;
  /** Instead of the pad: SkatingInput by time. */
  direct?: (t: number, air: boolean, sinceTakeoff: number) => SkatingInput;
}

const B = 1, X = 2, RT = 7;
const edge = (depth: number, both = false): [number, number, number, number] => [both ? -depth : 0, 0, -depth, 0];

/**
 * The loop the pad search found (test/takeoff-budget.ts): wind with B, load
 * 0.5 s on RT, swing X 0.2 s in and keep it swinging until the blade leaves
 * (a push-off stays on the ice after the release; let go at the release, the
 * eased arms are asked back and the shoulders brake them against the ice).
 */
const loopHolds = (axes: [number, number, number, number], load = 0.5, at = 1): Hold[] => [
  { at: 0, for: 0.02, buttons: [B], axes },
  { at: 0.02, for: at - 0.02, axes },
  { at, for: 0.2, buttons: [B, RT], axes },
  { at: at + 0.2, for: load - 0.2, buttons: [X, RT], axes },
  { at: at + load, for: 0.3, buttons: [X], axes },
];

export const SCENARIOS: Scenario[] = [
  { name: "shallow-edge glide", speed: 6, seconds: 3, ground: [{ at: 0, for: 0.02, buttons: [B], axes: edge(0.5) }, { at: 0.02, for: 3, axes: edge(0.5) }] },
  { name: "deep-edge glide", speed: 6, seconds: 3, ground: [{ at: 0, for: 0.02, buttons: [B], axes: edge(1, true) }, { at: 0.02, for: 3, axes: edge(1, true) }] },
  { name: "single loop", speed: 6, seconds: 4, ground: loopHolds(edge(1)), check: 0.45 },
  { name: "aggressive single loop", speed: 6, seconds: 4, ground: loopHolds(edge(1, true), 0.6), check: 0.45 },
  { name: "attempted double loop", speed: 6, seconds: 4, ground: loopHolds(edge(1)), check: 0.6 },
  {
    name: "over-torqued loop (direct: whole swing at once)", speed: 6, seconds: 4, ground: [], check: 0.45,
    direct: (t, air, since) => air
      ? { ...NEUTRAL_INPUT, knee: 0.35, weight: 1, carriage: since >= 0.45 ? 1 : 0 }
      : { ...NEUTRAL_INPUT, lean: -0.8, weight: 1, knee: t >= 1 && t < 1.5 ? 1 : 0.35, windup: t >= 1 ? -1 : 0, carriage: t >= 1 ? 1 : 0 },
  },
  { name: "crossover into loop", speed: 6, seconds: 5, ground: [
    { at: 0, for: 0.02, buttons: [B], axes: edge(1, true) }, { at: 0.02, for: 1.98, axes: edge(1, true) },
    ...loopHolds(edge(1), 0.5, 2),
  ], check: 0.45 },
  { name: "loop, load held too long", speed: 6, seconds: 4, ground: loopHolds(edge(1), 0.95), check: 0.45 },
  { name: "loop off a flat blade", speed: 6, seconds: 4, ground: loopHolds([0, 0, 0, 0]), check: 0.45 },
];

export interface Row {
  name: string; fallen: boolean; tookOff: boolean; L: number; turned: number; revolutions: number; call: number;
  landed: boolean; skidTicks: number; maxYawSlip: number; tiltMean: number; tiltSd: number; speedEnd: number;
}

export function runScenario(sc: Scenario, p: Params = setupParams("experimental")): Row {
  const s = createState(p, -sc.speed), profile = defaultControllerProfile(), st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(22).fill(0), keys: [], connected: true };
  let takeoff = -1, landed = false, L = 0, skidTicks = 0, maxYawSlip = 0, tiltSum = 0, tiltSq = 0, n = 0;
  const ticks = Math.round(sc.seconds / SIM_DT);
  for (let i = 0; i < ticks && !s.fallen && !landed; i++) {
    const t = i * SIM_DT, air = takeoff >= 0, since = air ? t - takeoff : 0;
    let input: SkatingInput;
    if (sc.direct) input = sc.direct(t, air, since);
    else {
      h.buttons.fill(0); h.axes = [0, 0, 0, 0];
      if (!air) for (const hold of sc.ground) if (t >= hold.at && t < hold.at + hold.for) {
        if (hold.axes) h.axes = [...hold.axes];
        for (const b of hold.buttons ?? []) h.buttons[b] = 1;
      }
      if (air) { h.buttons[RT] = 0.7; h.buttons[B] = sc.check !== undefined && since >= sc.check ? 1 : 0; }
      input = setupInput({ hardware: h } as Controls, s, "experimental", st, p, profile).input;
    }
    const events: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, events);
    if (events.some(e => e.type === EVENT.Takeoff)) { takeoff = t; L = s.jump.angMomentum; }
    if (events.some(e => e.type === EVENT.Landing)) landed = true;
    if (s.jump.phase !== JUMP_PHASE.Air && takeoff < 0) {
      const b = s.blade[s.supportFoot];
      if (b.regime === REGIME.Skid) skidTicks++;
      maxYawSlip = Math.max(maxYawSlip, Math.abs(s.yawDev ?? 0));
      tiltSum += b.tilt; tiltSq += b.tilt * b.tilt; n++;
    }
  }
  const mean = tiltSum / Math.max(n, 1);
  return {
    name: sc.name, fallen: s.fallen, tookOff: takeoff >= 0, L, turned: s.landed.turned, revolutions: s.landed.revolutions,
    call: s.landed.rotationCall, landed, skidTicks, maxYawSlip, tiltMean: mean,
    tiltSd: Math.sqrt(Math.max(0, tiltSq / Math.max(n, 1) - mean * mean)), speedEnd: Math.hypot(s.vel.x, s.vel.y),
  };
}

export const comparison = (p?: Params): Row[] => SCENARIOS.map(sc => runScenario(sc, p));

/** The Experimental setup with `--set key=value` overrides from the command line. */
export function overridden(args: string[]): Params {
  const p = setupParams("experimental") as unknown as Record<string, number>;
  args.forEach((a, i) => {
    if (a !== "--set") return;
    const [key, value] = args[i + 1].split("=");
    if (!(key in p)) throw Error(`no such parameter: ${key}`);
    if (!Number.isFinite(Number(value))) throw Error(`not a number: ${a} ${args[i + 1]}`);
    p[key] = Number(value);
  });
  return p as unknown as Params;
}

if (import.meta.main) {
  const rows = comparison(overridden(process.argv.slice(2)));
  if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 1));
  else {
    console.log("scenario | result | takeoff L | turned | skid ticks | max yaw slip | tilt mean ± sd | speed end");
    for (const r of rows) {
      const result = r.fallen ? (r.tookOff ? "fell after takeoff" : "fell on the ice") : r.landed ? (r.call === 0 ? `clean ${r.revolutions}` : `${r.revolutions}, call ${r.call}`) : r.tookOff ? "in the air" : "no takeoff";
      console.log(`${r.name} | ${result} | ${r.L.toFixed(1)} | ${r.turned.toFixed(2)} | ${r.skidTicks} | ${r.maxYawSlip.toFixed(2)} | ${r.tiltMean.toFixed(2)} ± ${r.tiltSd.toFixed(2)} | ${r.speedEnd.toFixed(2)}`);
    }
  }
}
