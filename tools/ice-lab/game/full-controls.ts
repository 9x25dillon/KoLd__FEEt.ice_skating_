// Full repertoire is a game mapping, separate from the lab's blind A/B/C trial.
// It emits ordinary solver inputs. Recorded clips never need the mapping state.
import type { ControllerHardware, Controls } from "../app/pad.ts";
import { relievedPitch } from "../app/pad.ts";
import { schemeA, latchTurns, SCHEME } from "../app/schemes.ts";
import type { SchemeState } from "../app/schemes.ts";
import type { Params } from "../sim/params.ts";
import { MOVE } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";

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
export interface ControllerProfile {
  version: 1;
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
  return { version: 1, deadzone: p.deadzone, curve: p.curve, leanGain: p.leanGain,
    keyboardLean: p.keyboardLean, triggerDeadzone: p.triggerDeadzone, modifier: p.modifier, bindings };
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
}
export type GameControlState = SchemeState & { full?: FullState };
export const newFullState = (): FullState => ({ previous: new Set(), buttonBanks: new Map(), feedbackUntil: -1, turn: null, turnStarted: false, foot: 1, request: "Glide", left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
const TURNS: Action[] = ["three", "mohawk", "bracket", "loop", "rocker", "counter", "choctaw"];
export const manualAction = (action: Action): boolean => !TURNS.includes(action) || action === "three" || action === "bracket";

export interface MappingOptions { manual?: boolean; twoFoot?: boolean; leanAssist?: number; repeatPush?: boolean }
export function fullInput(c: Controls, s: SkaterState, st: GameControlState, p: Params, profile: ControllerProfile, options: MappingOptions = {}) {
  const f = st.full ??= newFullState();
  const h = c.hardware;
  if (!validHardware(h)) throw Error("Full repertoire needs valid raw controller input");
  const key = (k: string) => h.keys.includes(k);
  const down = (b: number) => (h.buttons[b] ?? 0) > 0.5;
  const modified = down(profile.modifier);
  // Lock the bank on the physical press. Releasing a modifier first must not
  // turn a held Spiral into a fresh Spin, or a Mohawk into a fresh Three-turn.
  for (const b of BINDABLE_BUTTONS) {
    if (!down(b)) f.buttonBanks.delete(b);
    else if (!f.buttonBanks.has(b)) f.buttonBanks.set(b, modified);
  }
  const held = new Set<Action>(ACTIONS.filter(a => {
    if (options.manual && !manualAction(a.id)) return false;
    const b = profile.bindings[a.id];
    return key(a.key) || (f.buttonBanks.get(b.button) === b.modified && down(b.button));
  }).map(a => a.id));
  const fresh = (a: Action) => held.has(a) && !f.previous.has(a);
  const l = shapeStick(h.axes[0], -h.axes[1], profile), r = shapeStick(h.axes[2], -h.axes[3], profile);
  f.left = l; f.right = r;
  const trigger = (b: number) => Math.max(0, ((h.buttons[b] ?? 0) - profile.triggerDeadzone) / (1 - profile.triggerDeadzone));
  const leftFoot = key("q") || down(4), rightFoot = key("e") || down(5);
  // Bumpers select and retain a foot. Both explicitly select shared weight.
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
    const arms = modified || key("c");
    if (!arms) f.bladeRight = { ...r };
    const blade = f.bladeRight ?? { x: 0, y: 0 };
    const leftX = key("a") || key("d") ? (Number(key("d")) - Number(key("a"))) * profile.keyboardLean : l.x * profile.leanGain;
    const rightX = key("arrowleft") || key("arrowright") ? (Number(key("arrowright")) - Number(key("arrowleft"))) * profile.keyboardLean : blade.x * profile.leanGain;
    mapped.lean = (leftX + rightX) / 2;
    mapped.leanSplit = (rightX - leftX) / 2;
    const keyPitch = Number(key("w")) - Number(key("s"));
    const leftPitch = relievedPitch(l.x, l.y), rightPitch = relievedPitch(blade.x, blade.y);
    mapped.pitch = keyPitch || (leftPitch + rightPitch) / 2;
    // Each stick's fore–aft is its own blade's heel/toe. The keyboard's W/S stays shared.
    mapped.pitchSplit = keyPitch ? 0 : (rightPitch - leftPitch) / 2;
    // A trigger per knee: LT the left leg, RT the right. The brake moves off LT
    // to D-pad ↑, free in this setup unless the profile has bound it, until
    // stops come from the blades themselves.
    if (h.connected && !key("shift")) {
      const kneeL = trigger(6), kneeR = trigger(7);
      mapped.knee = (kneeL + kneeR) / 2;
      mapped.kneeSplit = (kneeR - kneeL) / 2;
    }
    const dpadUpBound = ACTIONS.some(a => (!options.manual || manualAction(a.id))
      && profile.bindings[a.id].button === 12 && profile.bindings[a.id].modified === modified);
    mapped.brake = key("x") || (down(12) && !dpadUpBound);
    mapped.carriage = key("c") ? 1 : arms ? Math.min(1, Math.hypot(r.x, r.y)) : 0;
    mapped.windup = key(",") ? 1 : arms ? r.x : 0;
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
