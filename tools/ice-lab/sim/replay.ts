// Exact solver inputs AFTER control-scheme mapping. Recording is separate
// from step(): instrumentation may allocate; physics need not know it exists.
import { DEFAULT_PARAMS, SIM_DT, SIM_HZ } from "./params.ts";
import type { Params } from "./params.ts";
import { createState, step } from "./solver.ts";
import { IceGrid } from "./ice.ts";
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
// Historical game branch (through 23e3e49):
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
// Historical fidelity branch (through a1b4278):
//   /7  The rink's shape (rinkRelief, rinkHalfLength, rinkHalfWidth): Params
//       gained them, SkaterState did not. rinkRelief is 0 in every preset and
//       the solver skips the rink at 0, so replayed through /6 and /7 the
//       fixture and four operator clips matched on every state field and
//       event on every tick; the fixture's digests are unchanged and it was
//       re-recorded from its own inputs only for the new keys. /6 clips no
//       longer load; verify one against a checkout of c926f39.
//   /8  The wind-up (SkatingInput `windup`) and the jump assist it arms
//       (jumpAssist, windupThreshold, windupWindow; JumpState
//       `windupTick`, `windupPeak`, `armed`, `target`; JumpResult `armed`).
//       With no wind-up nothing arms and the assist never runs, so replayed
//       through /7 and /8 with windup 0 the fixture and four operator clips,
//       jumps included, matched on every /7 state field and event on every
//       tick; the fixture was re-recorded from its own inputs. /7 clips no
//       longer load; verify one against a checkout of c0c6d96.
//   /9  Union of both /8 branches: rhythm, bracket, rink relief and wind-up.
//       Their /8 identities were ambiguous. Both older formats are rejected;
//       use the recorded branch commits to play those clips, not a relabel.
//       The fixture is re-recorded from its original inputs with neutral
//       values for the newly introduced controls and parameters.
//   /10 The ice grid (sim/ice.ts, `iceGridMode`): Params gained it and its
//       four levers. The grid itself is NOT part of the replay format — it
//       is an IceGrid, passed into step() as an explicit argument, never
//       serialized — because it is fully determined by the same recorded
//       inputs that already determine everything else a replay reproduces.
//       `iceGridMode` is 0 in every preset and step()'s own `ice` argument
//       is optional, so a clip recorded with no grid at all reads and writes
//       nothing new; replayed through /9 and /10 the fixture and three
//       operator play clips matched on every /9 state field and event on
//       every tick, and the fixture was re-recorded from its own inputs
//       only to carry the four new keys. /9 clips no longer load; verify one
//       against a checkout of 87bac5f.
//   /11 Stamina (design-bible.md §2.8, `staminaMode`): Params gained it and
//       fourteen levers, and SkaterState gained the two pools, `wind` and
//       `legs`. `staminaMode` is 0 in every preset and step()'s own fatigue
//       blend (`pFatigue`) is identical to `p` whenever it is, so a clip
//       recorded before this contract reads and writes nothing new when
//       replayed under it. Replayed through /10 and /11 with staminaMode 0,
//       the fixture and three operator play clips matched on every /10
//       state field and event on every tick; the fixture was re-recorded
//       from its own inputs only to carry the new keys. A fall now
//       preserves `wind`/`legs` rather than resetting them, found while
//       wiring the two pools through the same get-up path every other
//       per-session field already takes. /10 clips no longer load; verify
//       one against a checkout of 0bb3a53.
//   /12 Hype (the operator's own bridge, `hypeMode`): Params gained it and
//       eight levers, and SkaterState gained `hype` and `hypeStreak`.
//       `hypeMode` is 0 in every preset and step()'s own `pEff` blend is
//       identical to `pFatigue` whenever it is, so a clip recorded before
//       this contract reads and writes nothing new when replayed under it.
//       Found on the way: a landing resolves inside jumpAir, on step()'s
//       0b early-return path, which had always skipped music credit for a
//       landing (only a turn's cusp ever reached it) — real, silent, and
//       pre-existing. Fixed by factoring the event scan into
//       `landingAndTurnCredit` and calling it from both places; musicMode
//       is 0 in every preset, so no recorded measurement moved. Replayed
//       through /11 and /12 with hypeMode 0, the fixture and three
//       operator play clips matched on every /11 state field and event on
//       every tick; the fixture was re-recorded from its own inputs only
//       to carry the new keys. /11 clips no longer load; verify one
//       against a checkout of 68f6088.
//   /13 The flow scalar (bible §2.6, `flowMode`): Params gained it and eight
//       levers, and SkaterState gained `flow`. `flowMode` is 0 in every
//       preset and its own continuous update (§14) and beat bonus
//       (landingAndTurnCredit) are both gated on it, so a clip recorded
//       before this contract reads and writes nothing new when replayed
//       under it. Also gained: flow's own scale on Wind's drain in §12
//       (staminaMode's own section), gated the same way and 1x whenever
//       flowMode is off. Replayed through /12 and /13 with flowMode 0, the
//       fixture and three operator play clips matched on every /12 state
//       field and event on every tick; the fixture was re-recorded from
//       its own inputs only to carry the new keys. /12 clips no longer
//       load; verify one against a checkout of 8686590.
//   /14 Mid-spin direction reversal (data/spin-features.json's
//       both_directions, `sim/moves.ts` spinTick): Params gained four
//       levers, no SkaterState change. Unlike every bump above, this is not
//       guarded by a brand-new Mode flag at 0 — it lives under the existing
//       `movesMode`, which some clips (any live game session) already carry
//       at 1. A clip is only affected if it also drives an actual spin with
//       `input.lean` held opposite `Sp.dir` past `spinReverseStick`
//       (0.6) for long enough to check it — verified false for the
//       committed fixture directly (movesMode 0, and no frame ever presses
//       `spin` at all), so its 240 digests are byte-identical before and
//       after this bump; only `initial.params` grew the four new keys. A
//       clip that DOES do this will diverge under /14 and must be
//       re-recorded; there is no way to detect that case generically, the
//       same as every other kinematic change a version bump ever covers.
//   /15 Flow's "dead air between elements" (bible §2.6, `solver.ts` §14):
//       Params gained flowDeadAirTime/flowDeadAirLoss, no SkaterState
//       change. Lives under the existing `flowMode`, the same situation as
//       /14's `movesMode` — some clips already carry it at 1 — so this was
//       checked directly too: the committed fixture has flowMode 0, so the
//       whole of §14 (this term included) never executes for it, and its
//       240 digests are byte-identical before and after; only
//       `initial.params` grew the two new keys. A clip that has flowMode 1
//       and a completed element followed by an idle stretch will diverge
//       under /15 and must be re-recorded.
export const REPLAY_SOLVER = "ice-lab-f64/19";
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
  for (const key of Object.keys(DEFAULT_PARAMS)) {
    if (key !== "rinkRelief") number(obj[key], `${path}.${key}`, 0, 1e6);
  }
  // The one signed lever: a bowl is negative. Bounded as validate() bounds it.
  number(obj.rinkRelief, `${path}.rinkRelief`, -0.05, 0.05);
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
      ["lean", "knee", "weight", "pitch", "leanSplit", "push", "brake", "carriage", "windup", "toe", "turn", "bracket", "twizzle", "spin", "inaBauer"]);
    for (const key of ["lean", "pitch", "leanSplit", "windup"]) number(input[key], `${path}.input.${key}`, -1, 1);
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
  /**
   * Not part of the wire format, for the same reason it is never serialized
   * anywhere else: the grid is fully determined by the same recorded inputs
   * that determine everything else, so replaying them into a fresh sheet
   * reproduces it exactly. Sized from the INITIAL params only — a tuning
   * change mid-clip does not resize a sheet already being skated on.
   * Without this, a clip recorded with `iceGridMode` on (any live game
   * session, once GAME_PARAMS turns it on) would silently diverge on
   * replay: friction fed from an always-fresh sheet instead of the one the
   * original run actually chewed.
   */
  private readonly ice: IceGrid;

  constructor(clip: Replay) {
    this.clip = clip;
    this.params = { ...clip.initial.params };
    this.state = createState(this.params, clip.initial.speed, clip.initial.lean);
    this.ice = new IceGrid(clip.initial.params.rinkHalfLength, clip.initial.params.rinkHalfWidth);
  }

  /** For a renderer only — not part of the wire format, same reason as the field above. */
  get grid(): IceGrid { return this.ice; }

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
    step(this.state, frame.input, this.params, SIM_DT, this.events, this.ice);
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
