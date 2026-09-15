// Exact solver inputs AFTER control-scheme mapping. Recording is separate
// from step(): instrumentation may allocate; physics need not know it exists.
import { DEFAULT_PARAMS, SIM_DT, SIM_HZ } from "./params.ts";
import type { Params } from "./params.ts";
import { createState, step } from "./solver.ts";
import { crc32 } from "./math.ts";
import type { SkaterState, SkatingInput, EdgeEvent } from "./types.ts";

export const REPLAY_SCHEMA = "edgework-replay/1";
// Bump when input/state semantics or solver arithmetic change. This exact JS
// regression check does NOT promise float32 C++ or cross-engine parity.
//
//   /1  first contract.
//   /2  SkaterState gained `pushHeld` (standing up after a fall is
//       edge-triggered) and strokes floor the knee at the neutral stance.
//       Every digest moved because the state shape did; the fixture's
//       kinematics were replayed under both and matched exactly.
//   /3  Jumps (sim/jump.ts): SkaterState gained `jump` and `landed`, and
//       SkatingInput gained `carriage` and `toe`. With jumpMode 0 — every
//       preset — nothing kinematic changed; the fixture was replayed through
//       /2 and /3 and matched to the bit.
//   /4  Every transcendental through sim/math.ts's own sin/cos/tan/asin/atan2
//       (ADR-EDGE-007), so a clip verifies in any JS engine, not only the one
//       that recorded it — /3 clips from Firefox diverged in Node. Kinematics
//       moved by ulps, not by physics: replayed through /3 and /4, the
//       fixture's positions agree to 2.2e-16 m and a 4,742-tick play clip's to
//       6.5e-12 m, with the same falls on the same ticks.
//       /3 clips no longer load; verify one against a checkout of 34fecd8.
//   /5  The moves (movesMode): Params gained movesMode and the moves' levers,
//       and SkaterState gained what they carry: crossovers (`crossover`,
//       `crossSide`), turns, twizzles, spins and the Ina Bauer (`move`,
//       `turn`, `spin`, `inaBauer`, `moveDone`, `movesHeld`, `flips`,
//       `spinCarry`; SkatingInput `turn`, `twizzle`, `spin`, `inaBauer`). With movesMode 0 — every preset — nothing
//       moved at all: the fixture and three operator play clips, 22,184 ticks,
//       replayed through /4 and /5 with every /4 state field and event
//       identical on every tick. /4 clips no longer load; verify one against a
//       checkout of 9400137.
//   /6  The stance's rate term and aim (copRateGain, copCommandShare), both 0
//       in `spec` and on in the presets. Replayed through /5 and /6 with the
//       new levers at 0, the fixture and three operator clips matched on every
//       state field and event; the fixture was re-recorded from its own inputs.
//       /5 clips no longer load; verify one against a checkout of 8d89af2.
//   /7  The rhythm layer (sim/music.ts, musicMode): Params gained musicMode
//       and its levers, and SkaterState gained `strokeMusicScale` and
//       `musicCredit`. With musicMode 0 — every preset — `strokeMusicScale`
//       never leaves 1 and the accent scan never runs, so nothing kinematic
//       changed: the full existing suite, including the fixture and the
//       tick-for-tick move regressions, passed unchanged with the new fields
//       present but inert; the fixture was re-recorded from its own inputs
//       to carry them. /6 clips no longer load; verify one against a
//       checkout of 23e675b.
//   /8  The bracket (sim/moves.ts's `against`, TURN_KIND): Params gained
//       `againstTurnScrub`, SkatingInput gained `bracket`, and TurnState
//       gained `against`. Existing three-turns and mohawks always enter with
//       `against` false, so `T.dir` and every cost are unchanged from /7 on
//       every path that does not press the new button; the fixture, never
//       pressing it, was re-recorded to carry the field. Tried and rejected:
//       a foot-changing "choctaw" built the same way lands on the same
//       preserved edge a mohawk does (TURN_KIND's own comment), so weight
//       cannot move a bracket to the other foot at all. /7 clips no longer
//       load; verify one against a checkout of 3b93279.
export const REPLAY_SOLVER = "ice-lab-f64/8";
export const MAX_REPLAY_TICKS = SIM_HZ * 300;
export const MAX_REPLAY_BYTES = 64 * 1024 * 1024;

export interface ReplayFrame {
  input: SkatingInput;
  scheme: "A" | "B" | "C";
  /** Full tuning snapshot on changes, applied BEFORE this tick. */
  params?: Params;
  digest: number;
}

export interface Replay {
  schema: typeof REPLAY_SCHEMA;
  solver: typeof REPLAY_SOLVER;
  hz: typeof SIM_HZ;
  initial: { speed: number; lean: number; params: Params };
  frames: ReplayFrame[];
}

/**
 * CRC32 of canonical JSON: sorted object keys, ordered arrays, all state and
 * this tick's events. Infinity is the legitimate straight-blade radius; NaN
 * is a broken simulation, never a successful verification. The older HUD
 * checksum ignores fields this must cover: knee, leg spring, washout, dwell,
 * stroke phase, fall latch, and events. Not a cryptographic signature.
 */
export function replayDigest(state: SkaterState, events: EdgeEvent[]): number {
  const json = JSON.stringify([state, events], (key, value: unknown) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      if (value === Infinity && key === "turnRadius") return "+Infinity";
      throw new Error("Replay state contains a non-finite number");
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      return Object.fromEntries(Object.keys(obj).sort().map((key) => [key, obj[key]]));
    }
    return value;
  });
  return crc32(new TextEncoder().encode(json));
}

export class ReplayRecorder {
  private clip: Replay;
  private lastParams: Params;

  constructor(params: Params, speed = 0, lean = 0) {
    this.lastParams = { ...params };
    this.clip = {
      schema: REPLAY_SCHEMA, solver: REPLAY_SOLVER, hz: SIM_HZ,
      initial: { speed, lean, params: { ...params } }, frames: [],
    };
  }

  get ticks(): number { return this.clip.frames.length; }
  get full(): boolean { return this.ticks >= MAX_REPLAY_TICKS; }
  /** The last captured tick's digest, which names the clip; -1 before the first. */
  get lastDigest(): number {
    const f = this.clip.frames;
    return f.length > 0 ? f[f.length - 1].digest : -1;
  }

  /** Immediately after step, with ONLY that step's events. */
  capture(input: SkatingInput, params: Params, state: SkaterState,
    events: EdgeEvent[], scheme: ReplayFrame["scheme"] = "A"): void {
    if (this.full) return;
    if (state.tick !== this.ticks + 1) throw new Error("Reset the replay recorder with the skater");
    const frame: ReplayFrame = { input: { ...input }, scheme, digest: replayDigest(state, events) };
    if ((Object.keys(DEFAULT_PARAMS) as Array<keyof Params>)
      .some((key) => params[key] !== this.lastParams[key])) {
      this.lastParams = { ...params };
      frame.params = { ...params };
    }
    this.clip.frames.push(frame);
  }

  toJson(): string { return JSON.stringify(this.clip); }
}

function object(value: unknown, path: string, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected an object`);
  const obj = value as Record<string, unknown>;
  for (const key of required) {
    if (!Object.hasOwn(obj, key)) throw new Error(`${path}.${key}: missing field`);
  }
  for (const key of Object.keys(obj)) {
    if (!required.includes(key) && !optional.includes(key)) throw new Error(`${path}.${key}: unknown field`);
  }
  return obj;
}

function number(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`${path}: expected a finite number in [${min}, ${max}]`);
  return value;
}

function params(value: unknown, path: string): Params {
  const obj = object(value, path, Object.keys(DEFAULT_PARAMS));
  // Keep tunings the panel warns about: reproducing a BAD tuning is a reason
  // to record it. No substitution of current defaults or assist presets.
  for (const key of Object.keys(DEFAULT_PARAMS)) number(obj[key], `${path}.${key}`, 0, 1e6);
  for (const key of ["mass", "gravity", "comHeight", "rocker", "rockerToeFraction", "minSpeedForCurv"])
    number(obj[key], `${path}.${key}`, 1e-6, 1e6);
  for (const key of ["maxLean", "maxTilt", "fallLean"])
    number(obj[key], `${path}.${key}`, 0, 1.55);
  return obj as unknown as Params;
}

/** Imports are data. No defaults, coercion, dynamic imports, or eval. */
export function parseReplay(json: string): Replay {
  if (json.length > MAX_REPLAY_BYTES || new TextEncoder().encode(json).length > MAX_REPLAY_BYTES)
    throw new Error("Replay exceeds the 64 MiB file limit");
  const root = object(JSON.parse(json), "replay", ["schema", "solver", "hz", "initial", "frames"]);
  if (root.schema !== REPLAY_SCHEMA) throw new Error("Unsupported replay schema");
  if (root.solver !== REPLAY_SOLVER) throw new Error("Replay solver version does not match this build");
  if (root.hz !== SIM_HZ) throw new Error("Replay must run at 120 Hz");
  const initial = object(root.initial, "initial", ["speed", "lean", "params"]);
  number(initial.speed, "initial.speed", -100, 100);
  number(initial.lean, "initial.lean", -1.55, 1.55);
  params(initial.params, "initial.params");
  if (!Array.isArray(root.frames) || root.frames.length === 0 || root.frames.length > MAX_REPLAY_TICKS)
    throw new Error(`Replay must contain 1..${MAX_REPLAY_TICKS} ticks`);
  for (let i = 0; i < root.frames.length; i++) {
    const path = `frames[${i}]`;
    const frame = object(root.frames[i], path, ["input", "scheme", "digest"], ["params"]);
    const input = object(frame.input, `${path}.input`,
      ["lean", "knee", "weight", "pitch", "leanSplit", "push", "brake", "carriage", "toe", "turn", "bracket", "twizzle", "spin", "inaBauer"]);
    for (const key of ["lean", "pitch", "leanSplit"]) number(input[key], `${path}.input.${key}`, -1, 1);
    for (const key of ["knee", "weight", "carriage"]) number(input[key], `${path}.input.${key}`, 0, 1);
    for (const key of ["push", "brake", "toe", "turn", "bracket", "twizzle", "spin", "inaBauer"]) {
      if (typeof input[key] !== "boolean") throw new Error(`${path}.input.${key}: expected a boolean`);
    }
    if (!["A", "B", "C"].includes(frame.scheme as string)) throw new Error(`${path}.scheme: expected A, B, or C`);
    if (!Number.isInteger(number(frame.digest, `${path}.digest`, 0, 0xffffffff)))
      throw new Error(`${path}.digest: expected an unsigned 32-bit integer`);
    if (Object.hasOwn(frame, "params")) params(frame.params, `${path}.params`);
  }
  return root as unknown as Replay;
}

export interface ReplayDivergence { tick: number; expected: number; actual: number }

/** Shared by the browser player and the command-line verifier. */
export class ReplayPlayer {
  readonly state: SkaterState;
  params: Params;
  readonly events: EdgeEvent[] = [];
  index = 0;
  scheme: ReplayFrame["scheme"] = "A";
  divergence: ReplayDivergence | null = null;
  private readonly clip: Replay;

  constructor(clip: Replay) {
    this.clip = clip;
    this.params = { ...clip.initial.params };
    this.state = createState(this.params, clip.initial.speed, clip.initial.lean);
  }

  get total(): number { return this.clip.frames.length; }
  get done(): boolean { return this.index >= this.total || this.divergence !== null; }
  /** The input the last advanced frame fed the solver; null before the first. */
  get input(): SkatingInput | null { return this.index > 0 ? this.clip.frames[this.index - 1].input : null; }

  advance(): void {
    if (this.done) return;
    const frame = this.clip.frames[this.index];
    if (frame.params) this.params = { ...frame.params };
    this.scheme = frame.scheme;
    this.events.length = 0;
    step(this.state, frame.input, this.params, SIM_DT, this.events);
    const actual = replayDigest(this.state, this.events);
    this.index++;
    if (actual !== frame.digest) this.divergence = { tick: this.index, expected: frame.digest, actual };
  }
}

export function verifyReplay(clip: Replay): { ticks: number; divergence: ReplayDivergence | null } {
  const player = new ReplayPlayer(clip);
  while (!player.done) player.advance();
  return { ticks: player.index, divergence: player.divergence };
}
