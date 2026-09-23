// Full repertoire is a game mapping, separate from the lab's blind A/B/C trial.
// It emits ordinary solver inputs. Recorded clips never need the mapping state.
import type { ControllerHardware, Controls } from "../app/pad.ts";
import { relievedPitch } from "../app/pad.ts";
import { schemeA, latchTurns, SCHEME } from "../app/schemes.ts";
import type { SchemeState } from "../app/schemes.ts";
import type { Params } from "../sim/params.ts";
import { SIM_DT } from "../sim/params.ts";
import { clamp, moveToward } from "../sim/math.ts";
import { MOVE } from "../sim/types.ts";
import type { SkaterState, SkatingInput } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { beatOffset } from "../sim/music.ts";
import { dot } from "../sim/math.ts";

export const FULL_SCHEME = 3;
export const PROFILE_KEY = "edgework-controller-v1";
export const BUTTON_NAMES = ["A / Cross", "B / Circle", "X / Square", "Y / Triangle", "LB / L1", "RB / R1", "LT / L2", "RT / R2", "Back", "Start", "L3", "R3", "D-pad ↑", "D-pad ↓", "D-pad ←", "D-pad →"];
export const BINDABLE_BUTTONS = [0, 1, 2, 3, 10, 11, 12, 13, 14, 15];
export const ACTIONS = [
  { id: "push", name: "Push / recover", key: " ", button: 0, modified: false },
  { id: "three", name: "Three-turn", key: "b", button: 1, modified: false },
  { id: "twizzle", name: "Twizzle", key: "z", button: 2, modified: false },
  { id: "spin", name: "Spin", key: "y", button: 3, modified: false },
  { id: "toe", name: "Toe pick / spin foot change", key: "f", button: 11, modified: false },
  { id: "loop", name: "Loop turn", key: "j", button: 12, modified: false },
  { id: "bracket", name: "Bracket", key: "n", button: 13, modified: false },
  { id: "counter", name: "Counter", key: "l", button: 14, modified: false },
  { id: "rocker", name: "Rocker turn", key: "k", button: 15, modified: false },
  { id: "mohawk", name: "Mohawk", key: "h", button: 1, modified: true },
  { id: "ina", name: "Ina Bauer", key: "i", button: 2, modified: true },
  { id: "spiral", name: "Spiral", key: "o", button: 3, modified: true },
  { id: "low", name: "Cantilever", key: "u", button: 0, modified: true },
  { id: "choctaw", name: "Choctaw", key: "g", button: 15, modified: true },
] as const;
/** Actions added after profile version 1 shipped: a saved profile without one takes its default slot. */
const LATER_ACTIONS: readonly string[] = ["choctaw"];
export type Action = typeof ACTIONS[number]["id"];
export interface Binding { button: number; modified: boolean }
/**
 * Where the feet (each turned in its hip, footMode) live on the pad, in a setup
 * that has them. dpad: nudged and left — D-pad left/right turn both feet
 * together, modifier + left/right toe them in/out, up straightens. stickY:
 * each stick's up/down turns its own foot (heel/toe moves under the modifier,
 * shared, on the left stick). modifier: hold the modifier and the left stick
 * nudges the feet (x turns both, y toes in/out) while the right stick is the
 * arms; the left blade keeps its last edge meanwhile.
 */
export const FEET_LAYOUTS = ["dpad", "stickY", "modifier"] as const;
export type FeetLayout = typeof FEET_LAYOUTS[number];
export interface ControllerProfile {
  version: 1;
  /** Absent in profiles saved before the feet existed: reads as "dpad". */
  feet?: FeetLayout;
  deadzone: number;
  curve: number;
  leanGain: number;
  keyboardLean: number;
  triggerDeadzone: number;
  modifier: number;
  bindings: Record<Action, Binding>;
}
export const TUNING = [
  { key: "deadzone", label: "Stick deadzone", min: 0, max: 0.4, step: 0.01 },
  { key: "curve", label: "Stick response curve", min: 0.5, max: 3, step: 0.05 },
  { key: "leanGain", label: "Lean sensitivity", min: 0.2, max: 1, step: 0.05 },
  { key: "keyboardLean", label: "Keyboard lean", min: 0.1, max: 0.6, step: 0.01 },
  { key: "triggerDeadzone", label: "Trigger deadzone", min: 0, max: 0.3, step: 0.01 },
] as const;
export function defaultControllerProfile(): ControllerProfile {
  return { version: 1, deadzone: 0.22, curve: 1.35, leanGain: 0.7, keyboardLean: 0.35,
    triggerDeadzone: 0.05, modifier: 10,
    bindings: Object.fromEntries(ACTIONS.map(a => [a.id, { button: a.button, modified: a.modified }])) as Record<Action, Binding> };
}
export function parseControllerProfile(value: unknown): ControllerProfile {
  if (!value || typeof value !== "object") throw Error("Expected a controller profile");
  const p = value as ControllerProfile;
  if (p.version !== 1) throw Error("Unsupported controller profile version");
  for (const t of TUNING) if (!Number.isFinite(p[t.key]) || p[t.key] < t.min || p[t.key] > t.max) throw Error(`${t.label} must be ${t.min}–${t.max}`);
  if (![10, 11].includes(p.modifier)) throw Error("Choose L3 or R3 as the modifier");
  const seen = new Set<string>();
  const bindings = {} as Record<Action, Binding>;
  // Later actions come last in ACTIONS, so every older binding is already in
  // `seen` when a missing one falls back — a taken default is still an error.
  for (const a of ACTIONS) {
    const b = p.bindings?.[a.id] ?? (LATER_ACTIONS.includes(a.id) ? { button: a.button, modified: a.modified } : undefined);
    if (!b || !BINDABLE_BUTTONS.includes(b.button) || b.button === p.modifier || typeof b.modified !== "boolean") throw Error(`Invalid binding for ${a.name}`);
    const key = `${b.button}:${b.modified}`;
    if (seen.has(key)) throw Error(`Two actions share ${b.modified ? "modifier + " : ""}${BUTTON_NAMES[b.button]}`);
    seen.add(key); bindings[a.id] = { button: b.button, modified: b.modified };
  }
  if (p.feet !== undefined && !FEET_LAYOUTS.includes(p.feet)) throw Error("Choose a feet layout: dpad, stickY or modifier");
  return { version: 1, deadzone: p.deadzone, curve: p.curve, leanGain: p.leanGain,
    keyboardLean: p.keyboardLean, triggerDeadzone: p.triggerDeadzone, modifier: p.modifier, bindings,
    ...(p.feet !== undefined ? { feet: p.feet } : {}) };
}
export function loadControllerProfile(): ControllerProfile {
  try { const saved = localStorage.getItem(PROFILE_KEY); if (saved) return parseControllerProfile(JSON.parse(saved)); } catch { /* A corrupt or unavailable save uses defaults. */ }
  return defaultControllerProfile();
}
export function bindingLabel(p: ControllerProfile, id: Action): string {
  const b = p.bindings[id];
  return `${b.modified ? BUTTON_NAMES[p.modifier] + " + " : ""}${BUTTON_NAMES[b.button]}`;
}
export function shapeStick(x: number, y: number, p: ControllerProfile): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m <= p.deadzone) return { x: 0, y: 0 };
  const scale = Math.pow(Math.min(1, (m - p.deadzone) / (1 - p.deadzone)), p.curve) / m;
  return { x: x * scale, y: y * scale };
}
export function validHardware(raw: unknown): raw is ControllerHardware {
  if (!raw || typeof raw !== "object") return false;
  const h = raw as ControllerHardware;
  return Array.isArray(h.axes) && h.axes.length >= 4 && h.axes.length <= 16 && h.axes.every(n => Number.isFinite(n) && Math.abs(n) <= 1)
    && Array.isArray(h.buttons) && h.buttons.length <= 32 && h.buttons.every(n => Number.isFinite(n) && n >= 0 && n <= 1)
    && Array.isArray(h.keys) && h.keys.length <= 64 && h.keys.every(k => typeof k === "string" && k.length <= 20) && typeof h.connected === "boolean";
}
export interface FullState {
  previous: Set<Action>;
  buttonBanks: Map<number, boolean>;
  feedbackUntil: number;
  turn: Action | null;
  turnStarted: boolean;
  foot: number;
  request: string;
  left: { x: number; y: number };
  right: { x: number; y: number };
  bladeRight?: { x: number; y: number };
  /** The modifier feet layout: the left blade's last command while the left stick is on the feet. */
  bladeLeft?: { x: number; y: number };
  /** The feet where the nudging layouts left them: toeOut and toeOutSplit, -1..1. */
  feet?: { out: number; split: number };
  /** Experimental: per leg, the tick each gesture was armed (trigger high, stick low) and completed (pump, stroke). */
  gestures?: {
    high: number[]; peak: number[]; pump: number[]; pumpPower: number[];
    low: number[]; lowY: number[]; sideSum: number[]; samples: number[]; stroke: number[]; strokePower: number[];
    extend: { tick: number; peak: number }[];
  };
  /** Experimental: the arms' swing, -1 (left, X) .. +1 (right, B), eased toward what is held. */
  arms?: number;
  /** Experimental: the tick an automatic crossover's push ends; both blades stay down until then. */
  crossUntil?: number;
}
export type GameControlState = SchemeState & { full?: FullState };
export const newFullState = (): FullState => ({ previous: new Set(), buttonBanks: new Map(), feedbackUntil: -1, turn: null, turnStarted: false, foot: 1, request: "Glide", left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
const TURNS: Action[] = ["three", "mohawk", "bracket", "loop", "rocker", "counter", "choctaw"];
export const manualAction = (action: Action): boolean => !TURNS.includes(action) || action === "three" || action === "bracket";

export interface MappingOptions { manual?: boolean; twoFoot?: boolean; feet?: boolean; pumps?: boolean; experimental?: boolean; leanAssist?: number; repeatPush?: boolean }
/**
 * The Experimental setup's pushes, per leg [left, right].
 *
 * A PUMP: that leg's trigger pulled past PUMP_HIGH, then let back under
 * PUMP_LOW within GESTURE_TICKS. Its strength is how deep the bend went times
 * how fast it snapped (full at SNAP_TICKS or quicker), and the push extends
 * the leg from that peak bend (SkatingInput.pushKnee) — the push is the leg
 * straightening, so it is the bend it came from that drives it. The body's
 * knee stays the trigger's, so a pump never reads as a jump's load.
 *
 * A THUMB STROKE: that stick pulled down past -STROKE_EDGE, then swept up past
 * +STROKE_EDGE within GESTURE_TICKS. Its strength is its accuracy: the range
 * swept (full from the bottom to the top), how straight (little side to side),
 * and how quick (full at SNAP_TICKS or quicker).
 *
 * A pump and a thumb stroke of the same leg within PAIR_TICKS add, to a full
 * push at most. Authored starting points; the operator's experiment.
 */
const PUMP_HIGH = 0.6, PUMP_LOW = 0.2, STROKE_EDGE = 0.6, GESTURE_TICKS = 30, PAIR_TICKS = 15, SNAP_TICKS = 6;
/**
 * Experimental's automatic back crossovers: skating backward at AUTO_CROSS_SPEED
 * or more, leaning at least the solver's crossoverLean, on the ice and in no
 * move, the skater strokes a crossover on every beat of the music (sim/music.ts)
 * — on the beat, so never the chopped off-beat push (bible §2.6) — as an
 * ordinary stroke from the pushing leg's knee (the triggers bent deeper push
 * harder), both blades down for the push. Pumps add on top.
 */
const AUTO_CROSS_SPEED = 1.5;
/** Experimental arms, X left / B right: how far they swing (wind-up) and how fast they get there, per second. */
const ARMS_SWING = 0.7, ARMS_RATE = 3;
/**
 * The Experimental setup's buttons. A and Y ask for a family of moves and the
 * held bumpers choose within it; the physics decides whether it happens. A:
 * the three-turn gesture, LB + A bracket, RB + A cantilever. Y: spin, LB + Y
 * twizzle, RB + Y spiral, LB + RB + Y Ina Bauer. L3 or R3: the toe pick.
 * X / B shift the weight and swing the arms (handled with the foot), and the
 * triggers and thumb strokes push, so A is not the push here.
 */
function experimentalPad(down: (b: number) => boolean): Set<Action> {
  const lb = down(4), rb = down(5), held = new Set<Action>();
  if (down(0)) held.add(lb && !rb ? "bracket" : rb && !lb ? "low" : "three");
  if (down(3)) held.add(lb && rb ? "ina" : lb ? "twizzle" : rb ? "spiral" : "spin");
  if (down(10) || down(11)) held.add("toe");
  return held;
}
/** Full travel of a nudged foot axis, per second held. */
const FEET_NUDGE_RATE = 1.5;
/**
 * The feet for a setup that has them (footMode), by the profile's layout.
 * Returns toeOut / toeOutSplit, and for stickY the heel/toe it displaces.
 * A binding the setup actually uses on a D-pad direction keeps that direction.
 */
function feetInput(
  f: FullState, layout: FeetLayout, h: ControllerHardware, key: (k: string) => boolean, down: (b: number) => boolean,
  modified: boolean, left: { x: number; y: number }, right: { x: number; y: number }, stick: { x: number; y: number },
  profile: ControllerProfile, options: MappingOptions,
): Partial<SkatingInput> {
  const feet = f.feet ??= { out: 0, split: 0 };
  const step = FEET_NUDGE_RATE * SIM_DT;
  const bound = (button: number) => ACTIONS.some(a => (!options.manual || manualAction(a.id))
    && profile.bindings[a.id].button === button && profile.bindings[a.id].modified === modified);
  const nudge = (axis: "out" | "split", by: number) => { feet[axis] = Math.max(-1, Math.min(1, feet[axis] + by * step)); };
  // Keyboard, every layout: [ ] turn both feet, - = toe in/out, backslash straightens.
  if (key("[")) nudge("split", -1);
  if (key("]")) nudge("split", 1);
  if (key("-")) nudge("out", -1);
  if (key("=")) nudge("out", 1);
  if (key("\\")) { feet.out = 0; feet.split = 0; }
  if (layout === "dpad" && h.connected) {
    const l = down(14) && !bound(14), r = down(15) && !bound(15);
    // Left is anticlockwise (split) or toes in (out); right the reverse.
    if (l !== r) nudge(modified ? "out" : "split", l ? -1 : 1);
    if (down(12) && !bound(12)) { feet.out = 0; feet.split = 0; }
  } else if (layout === "modifier" && h.connected && modified) {
    nudge("split", stick.x);
    nudge("out", stick.y);
  } else if (layout === "stickY" && h.connected) {
    // Up turns the toe out. The modifier puts heel/toe back on the left stick.
    const lf = modified ? feet.out - feet.split : left.y, rf = right.y;
    if (!modified) { feet.out = (lf + rf) / 2; feet.split = (rf - lf) / 2; }
    const pitch = modified ? relievedPitch(stick.x, stick.y) : 0;
    return { toeOut: clamp((lf + rf) / 2, -1, 1), toeOutSplit: clamp((rf - lf) / 2, -1, 1), pitch, pitchSplit: 0 };
  }
  return { toeOut: feet.out, toeOutSplit: feet.split };
}

/**
 * The Experimental setup's legs: a trigger pump or a thumb stroke pushes that
 * leg, scaled by how well it was done, and the two together add. A trigger let
 * go while a jump is loading is the jump's release, not a pump; in the air
 * nothing pushes.
 */
function pumpInput(f: FullState, s: SkaterState, triggers: number[], sticks: { x: number; y: number }[], connected: boolean, freeLeg = -1): Partial<SkatingInput> {
  const none = () => [-1e9, -1e9];
  const g = f.gestures ??= { high: none(), peak: [0, 0], pump: none(), pumpPower: [0, 0],
    low: none(), lowY: [0, 0], sideSum: [0, 0], samples: [0, 0], stroke: none(), strokePower: [0, 0],
    extend: [{ tick: -1e9, peak: 0 }, { tick: -1e9, peak: 0 }] };
  if (!connected) return {};
  const now = s.tick, ground = s.jump.phase === JUMP_PHASE.None;
  const quick = (ticks: number) => clamp(1 - Math.max(0, ticks - SNAP_TICKS) / (GESTURE_TICKS - SNAP_TICKS), 0.3, 1);
  let out: Partial<SkatingInput> = {};
  for (let i = 0; i < 2; i++) {
    let done = false;
    if (i === freeLeg) continue;   // off the ice: a swing, not a push
    // The pump.
    if (triggers[i] >= PUMP_HIGH) {
      if (now - g.high[i] > 1) g.peak[i] = 0;
      g.high[i] = now; g.peak[i] = Math.max(g.peak[i], triggers[i]);
    } else if (triggers[i] <= PUMP_LOW && now - g.high[i] <= GESTURE_TICKS && ground && s.jump.phase !== JUMP_PHASE.Load) {
      g.pump[i] = now; g.pumpPower[i] = g.peak[i] * quick(now - g.high[i]);
      g.extend[i] = { tick: now, peak: g.peak[i] };
      g.high[i] = -1e9; done = true;
    }
    // The thumb stroke.
    const st = sticks[i];
    if (st.y <= -STROKE_EDGE) {
      const continuing = now - g.low[i] <= 1;
      g.low[i] = now; g.lowY[i] = continuing ? Math.min(g.lowY[i], st.y) : st.y;
      g.sideSum[i] = 0; g.samples[i] = 0;
    }
    else if (now - g.low[i] <= GESTURE_TICKS) {
      g.sideSum[i] += Math.abs(st.x); g.samples[i]++;
      if (st.y >= STROKE_EDGE && ground) {
        const range = clamp((st.y - g.lowY[i]) / 2, 0, 1);
        const straight = clamp(1 - g.sideSum[i] / Math.max(1, g.samples[i]), 0, 1);
        g.stroke[i] = now; g.strokePower[i] = range * straight * quick(now - g.low[i]);
        g.low[i] = -1e9; done = true;
      }
    }
    if (done) {
      const pump = now - g.pump[i] <= PAIR_TICKS ? g.pumpPower[i] : 0;
      const stroke = now - g.stroke[i] <= PAIR_TICKS ? g.strokePower[i] : 0;
      // A pump extends the leg from its bend; a thumb stroke alone from the leg as it stands.
      const bend = now - g.pump[i] <= PAIR_TICKS ? g.extend[i].peak : triggers[i];
      out = { push: true, pushFoot: i, pushPower: clamp(pump + stroke, 0, 1), pushKnee: Math.max(bend, 0.35) };
    }
  }
  return out;
}

/** Experimental: a crossover stroke on the beat, when skating backward on a deep enough curve. */
function autoCrossover(f: FullState, s: SkaterState, p: Params): Partial<SkatingInput> | null {
  if (s.fallen || s.move !== MOVE.None || s.jump.phase !== JUMP_PHASE.None) return null;
  const back = dot(s.vel, s.heading) < -p.dirSpeedEps;
  if (!back || Math.hypot(s.vel.x, s.vel.y) < AUTO_CROSS_SPEED || Math.abs(s.lean) < p.crossoverLean) return null;
  const beat = beatOffset(p, s.tick);
  if (beat < 0 || beat >= SIM_DT) return null;
  f.crossUntil = s.tick + Math.round(p.strokeDuration / SIM_DT);
  return { push: true, weight: 0.5 };
}

export function fullInput(c: Controls, s: SkaterState, st: GameControlState, p: Params, profile: ControllerProfile, options: MappingOptions = {}) {
  const f = st.full ??= newFullState();
  const h = c.hardware;
  if (!validHardware(h)) throw Error("Full repertoire needs valid raw controller input");
  const key = (k: string) => h.keys.includes(k);
  const down = (b: number) => (h.buttons[b] ?? 0) > 0.5;
  // Experimental: the bumpers are the alteration and the stick clicks the toe picks.
  const modified = options.experimental ? down(4) || down(5) : down(profile.modifier);
  const expPad = options.experimental ? experimentalPad(down) : null;
  // Lock the bank on the physical press. Releasing a modifier first must not
  // turn a held Spiral into a fresh Spin, or a Mohawk into a fresh Three-turn.
  for (const b of BINDABLE_BUTTONS) {
    if (!down(b)) f.buttonBanks.delete(b);
    else if (!f.buttonBanks.has(b)) f.buttonBanks.set(b, modified);
  }
  const held = new Set<Action>(ACTIONS.filter(a => {
    if (options.manual && !manualAction(a.id)) return false;
    if (expPad) return key(a.key) || expPad.has(a.id);
    const b = profile.bindings[a.id];
    return key(a.key) || (f.buttonBanks.get(b.button) === b.modified && down(b.button));
  }).map(a => a.id));
  const fresh = (a: Action) => held.has(a) && !f.previous.has(a);
  const l = shapeStick(h.axes[0], -h.axes[1], profile), r = shapeStick(h.axes[2], -h.axes[3], profile);
  f.left = l; f.right = r;
  const trigger = (b: number) => Math.max(0, ((h.buttons[b] ?? 0) - profile.triggerDeadzone) / (1 - profile.triggerDeadzone));
  // Bumpers select and retain a foot — X and B in Experimental. Both explicitly select shared weight.
  const leftFoot = key("q") || down(options.experimental ? 2 : 4), rightFoot = key("e") || down(options.experimental ? 1 : 5);
  if (leftFoot || rightFoot) f.foot = leftFoot && rightFoot ? 0.5 : leftFoot ? 0 : 1;
  const kx = Number(key("d") || key("arrowright")) - Number(key("a") || key("arrowleft"));
  const ky = Number(key("w") || key("arrowup")) - Number(key("s") || key("arrowdown"));
  const raw = { ...c, kx: kx * profile.keyboardLean, ky, lean: l.x * profile.leanGain,
    pitch: Math.sign(l.y) * Math.max(0, Math.abs(l.y) - Math.tan(0.44) * Math.abs(l.x)), rx: r.x, ry: r.y,
    knee: key("shift") ? 0.95 : h.connected ? trigger(7) : 0.35, weight: f.foot,
    carriage: key("c") ? 1 : 0, windup: key(",") ? 1 : 0,
    push: fresh("push") || (!s.fallen && options.repeatPush !== false && ((held.has("push") && s.tick % 90 === 0) || c.autoPush === true)), brake: key("x") || trigger(6) > 0.1,
    toe: fresh("toe"), turn: options.manual === true && (held.has("three") || held.has("mohawk")), bracket: options.manual === true && held.has("bracket"), spin: held.has("spin"), twizzle: held.has("twizzle"), inaBauer: held.has("ina") || held.has("spiral") };
  const mapped = schemeA(raw);
  if (options.twoFoot) {
    // Hold the modifier for arms without dropping the right blade's last command.
    const arms = !options.experimental && (modified || key("c"));
    if (!arms) f.bladeRight = { ...r };
    const blade = f.bladeRight ?? { x: 0, y: 0 };
    // The modifier feet layout puts the left stick on the feet while held: the
    // left blade keeps its last command, as the right does for the arms.
    const layout: FeetLayout = profile.feet ?? "dpad";
    const leftOnFeet = options.feet === true && layout === "modifier" && modified;
    if (!leftOnFeet) f.bladeLeft = { ...l };
    const left = f.bladeLeft ?? { x: 0, y: 0 };
    const leftX = key("a") || key("d") ? (Number(key("d")) - Number(key("a"))) * profile.keyboardLean : left.x * profile.leanGain;
    const rightX = key("arrowleft") || key("arrowright") ? (Number(key("arrowright")) - Number(key("arrowleft"))) * profile.keyboardLean : blade.x * profile.leanGain;
    mapped.lean = (leftX + rightX) / 2;
    mapped.leanSplit = (rightX - leftX) / 2;
    const keyPitch = Number(key("w")) - Number(key("s"));
    const leftPitch = relievedPitch(left.x, left.y), rightPitch = relievedPitch(blade.x, blade.y);
    mapped.pitch = keyPitch || (leftPitch + rightPitch) / 2;
    // Each stick's fore–aft is its own blade's heel/toe. The keyboard's W/S stays shared.
    mapped.pitchSplit = keyPitch ? 0 : (rightPitch - leftPitch) / 2;
    // Experimental: with the weight on one foot the other leg is free — its
    // trigger swings it forward (released, it rests), and it does not pump.
    const freeLegIndex = options.pumps && f.foot !== 0.5 ? (f.foot === 1 ? 0 : 1) : -1;
    if (options.pumps) Object.assign(mapped, pumpInput(f, s, [trigger(6), trigger(7)], [l, arms ? f.bladeRight! : r], h.connected, freeLegIndex));
    if (freeLegIndex >= 0 && h.connected) mapped.freeLeg = 0.5 + 0.5 * trigger(freeLegIndex === 0 ? 6 : 7);
    if (options.pumps && !mapped.push) {
      const auto = autoCrossover(f, s, p);
      if (auto) Object.assign(mapped, auto);
    }
    // An automatic crossover keeps both blades down through its push, unless
    // X / B asks for a foot this tick.
    if (options.pumps && s.tick < (f.crossUntil ?? -1) && !down(1) && !down(2)) mapped.weight = 0.5;
    if (options.feet) Object.assign(mapped, feetInput(f, layout, h, key, down, modified, left, blade, l, profile, options));
    // A trigger per knee: LT the left leg, RT the right. The brake moves off LT
    // to D-pad ↑, free in this setup unless the profile has bound it, until
    // stops come from the blades themselves.
    if (h.connected && !key("shift")) {
      const kneeL = trigger(6), kneeR = trigger(7);
      mapped.knee = (kneeL + kneeR) / 2;
      mapped.kneeSplit = (kneeR - kneeL) / 2;
    }
    // With the feet, stops come from the blades: D-pad up is the feet's, and
    // only the keyboard's X still brakes.
    const dpadUpBound = ACTIONS.some(a => (!options.manual || manualAction(a.id))
      && profile.bindings[a.id].button === 12 && profile.bindings[a.id].modified === modified);
    mapped.brake = key("x") || (!options.feet && down(12) && !dpadUpBound);
    mapped.carriage = key("c") ? 1 : arms ? Math.min(1, Math.hypot(r.x, r.y)) : 0;
    mapped.windup = key(",") ? 1 : arms ? r.x : 0;
    if (options.experimental) {
      // X / B swing the arms toward their side, eased so a press is a swing
      // and not a flick (a flick twists the trunk hard enough to skid a foot).
      const want = h.connected ? Number(down(1)) - Number(down(2)) : 0;
      f.arms = moveToward(f.arms ?? 0, want, ARMS_RATE * SIM_DT);
      if (!key(",")) mapped.windup = f.arms * ARMS_SWING;
      if (!key("c")) mapped.carriage = Math.abs(f.arms);
    }
  }
  const input = latchTurns(SCHEME.A, mapped, st, s.flips, options.twoFoot === true);
  if ((input.spin || s.move === MOVE.Spin) && (!options.twoFoot || modified)) input.pitch = Math.max(input.pitch, r.y);
  f.request = ACTIONS.filter(a => held.has(a.id)).map(a => a.name).join(" + ") || "Glide";

  // A direct turn binding performs the existing hold/transfer/reversal gesture.
  // It never creates a turn, edge, speed, score or solver state itself.
  if (f.turnStarted && s.move !== MOVE.Turn) { f.turn = null; f.turnStarted = false; }
  if (s.fallen || s.jump.phase === JUMP_PHASE.Air) { f.turn = null; f.turnStarted = false; }
  const requested = options.manual ? undefined : TURNS.find(a => fresh(a));
  if (requested && !s.fallen && s.move === MOVE.None && s.jump.phase !== JUMP_PHASE.Air) {
    f.feedbackUntil = -1;
    f.turn = requested;
    f.turnStarted = false;
    f.foot = s.supportFoot;
    input.turn = requested !== "bracket" && requested !== "counter";
    input.bracket = !input.turn;
    // Keep the entry foot this tick; a mohawk transfers after the pivot starts.
    input.weight = f.foot;
    // The first tick already contributes to reverseHeld. Backward travel
    // reverses the curve's sign relative to the body-frame stick, so shape
    // this tick too, before the solver creates its TurnState.
    const blade = s.blade[s.supportFoot];
    const curve = Math.sign(blade.tilt) * Math.sign(blade.longSpeed);
    if (requested === "loop") input.lean = curve * Math.abs(input.lean);
    if (requested === "rocker" || requested === "counter" || requested === "choctaw") input.lean = -curve * Math.max(p.rockerCounterStick, Math.abs(input.lean));
  } else if (f.turn && s.move === MOVE.Turn) {
    f.turnStarted = true;
    const kind = f.turn;
    input.weight = kind === "mohawk" || kind === "choctaw" ? 1 - s.turn.foot : s.turn.foot;
    f.foot = input.weight;
    if (s.turn.cusps === 0) {
      input.turn = kind === "loop" || kind === "rocker" || kind === "choctaw";
      input.bracket = kind === "counter";
      const curve = s.turn.against ? -s.turn.dir : s.turn.dir;
      if (kind === "rocker" || kind === "counter" || kind === "choctaw") input.lean = -curve * Math.max(p.rockerCounterStick, Math.abs(input.lean));
      else if (kind === "loop") input.lean = curve * Math.abs(input.lean);
    }
  } else if (f.turn) { f.feedbackUntil = s.tick + 144; f.turn = null; }
  if (s.tick < f.feedbackUntil) f.request = "Turn needs speed and an established edge — release and retry";
  if (held.has("ina")) input.weight = 0.5;
  else if (held.has("spiral")) input.weight = f.foot === 0.5 ? s.supportFoot : f.foot;
  const cantilever = held.has("low") && !s.fallen && s.move === MOVE.None && s.jump.phase === JUMP_PHASE.None
    && Math.hypot(s.vel.x, s.vel.y) >= 1 && !input.turn && !input.bracket && !input.spin && !input.twizzle && !input.inaBauer;
  if (cantilever) Object.assign(input, { knee: 0.65, kneeSplit: 0, weight: 0.5, pitch: -0.25, pitchSplit: 0, push: false, toe: false, carriage: 1, windup: 0 });
  if (held.has("low")) input.windup = 0;
  // Assistance scales edge demand with available speed, preserving the stick's
  // side and analog depth. Do not rewrite turn gestures or airborne control.
  if (options.leanAssist && s.move === MOVE.None && s.jump.phase === JUMP_PHASE.None && !input.turn && !input.bracket) {
    const speed = Math.hypot(s.vel.x, s.vel.y);
    const limit = 0.75 * Math.atan2(speed * speed * Math.sin(p.maxTilt) / p.rocker, p.gravity) / p.maxLean;
    const safe = Math.max(-limit, Math.min(limit, input.lean));
    input.lean += (safe - input.lean) * options.leanAssist;
  }
  // A move request suppresses held auto-stroking; recovery still needs a fresh push.
  if (input.brake || [...held].some(a => a !== "push" && a !== "toe") || s.move !== MOVE.None) input.push = false;
  f.previous = held;
  return { input, cantilever };
}
