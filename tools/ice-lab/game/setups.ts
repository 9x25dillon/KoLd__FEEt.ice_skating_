import { PRESETS } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import type { Controls } from "../app/pad.ts";
import type { SkaterState, SkatingInput } from "../sim/types.ts";
import { MOVE } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { GAME_PARAMS } from "./controls.ts";
import { fullInput } from "./full-controls.ts";
import type { ControllerProfile, GameControlState } from "./full-controls.ts";

export const SETUPS = [
  { id: "simulation", name: "Simulation", description: "One stick per blade, one trigger per knee, and the feet turn in the hips (feet layout in the controller profile). Blades scrape, dig and catch; the trunk twists; stops come from the feet and edges. Hold L3 for right-stick arms; the right blade retains its last command. Minimal added assistance." },
  { id: "explorer", name: "Blade Explorer", description: "Left stick controls lean and fore–aft pressure. Right stick controls arms, which twist the trunk. Blades stay parallel but scrape, dig and catch. Medium–high balance and speed-aware lean assistance; manual turn gestures and landings." },
  { id: "experimental", name: "Experimental", description: "The operator's experiment. Triggers are the legs: pull to bend, pump (bend deep, snap straight) to push — deeper and quicker is stronger; load and release the standing leg to jump. Thumbsticks are the feet and blades — side to side the edge, up/down heel/toe — and a bottom-to-top thumb stroke pushes that foot, stronger the fuller, straighter and quicker it is; a stroke and a pump of the same leg add. X / B shift the weight and swing the arms left / right. L3 / R3 pick the toe. Hold a free leg's paddle and ease in its trigger to raise that leg — a spiral, an attitude, a standing split, as high as your range allows; its stick pulled back bends its knee. A asks for a turn, Y for rotation; held bumpers choose which (LB+A bracket, RB+A cantilever; LB+Y twizzle, RB+Y spiral, both+Y Ina Bauer). The physics decides. Minimal assistance." },
  { id: "diggate", name: "Dig Gate", description: "Experimental, with a phase-gated dig. Hold LB + RB (no A or Y) to dig: skating backward, the controller eases the ankle onto the toe, waits until the contact is really there, turns the feet across against the curve for half a second, then eases the lean back out. Going forward it waits for you to skate backward (forward, the dig throws the skater down). It only asks — the blades dig, or don't. Everything else is Experimental's." },
  { id: "repertoire", name: "Full Repertoire", description: "Dedicated turn and glide bindings, assisted balance and optional landing coaching. Entries, jumps and combinations still depend on your skating." },
] as const;
export type Setup = typeof SETUPS[number]["id"];
export const isSetup = (value: unknown): value is Setup => SETUPS.some(s => s.id === value);
export const SETUP_KEY = "edgework-skating-setup-v1";
export function setupParams(setup: Setup, assistance = 0.75): Params {
  if (!isSetup(setup) || !Number.isFinite(assistance) || assistance < 0.5 || assistance > 1) throw Error("Invalid skating setup or assistance (0.5–1)");
  // Keep the functioning athlete balance model; 'minimal' removes additional
  // aids, not the feedback controller that represents the skater's muscles.
  const p = { ...GAME_PARAMS, ...PRESETS.responsive, movesMode: 1, jumpMode: 2, musicMode: 1,
    staminaMode: 1, flowMode: 1, iceGridMode: 1, hypeMode: 0, jumpAssist: 0 };
  if (setup !== "simulation" && setup !== "experimental" && setup !== "diggate") {
    for (const key of ["balanceKd", "controlLatency", "internalRateGain", "internalMax"] as const)
      p[key] += (PRESETS.assisted[key] - p[key]) * (setup === "repertoire" ? 1 : assistance);
  }
  if (setup === "repertoire") p.jumpAssist = PRESETS.assisted.jumpAssist;
  // Stages B/C. Simulation: everything through the blades — slip and the dig,
  // the trunk, the feet in the hips. Explorer: the same with the blades kept
  // parallel. Repertoire keeps its dedicated moves on the carve as it was.
  if (setup !== "repertoire") { p.slipMode = 1; p.torqueMode = 1; }
  // The arms' whip through the edge (armsWhipMode), and the tucked inertia a
  // measured takeoff's angular momentum needs in the air (jumpInertiaTucked 0.5, the bible's
  // 0.95 elsewhere): the operator's choice, 2026-09-25. Every jump in these
  // setups now turns on what the ice gave it (docs/open-constants.md).
  if (setup !== "repertoire") { p.armsWhipMode = 1; p.jumpInertiaTucked = 0.5; }
  // The fore-aft pendulum (pitchMode) with the feet: the operator's choice, 2026-09-23.
  // The toe-pick trip (toePickMode) was on here from the morning of
  // 2026-09-24 and switched off that afternoon, on the operator's word after
  // play: "not working at all". No trick needs it — a toe jump's pick is
  // SkatingInput.toe, which is untouched.
  // Dig Gate is Experimental's athlete with a phase-gated dig (2026-09-24).
  const exp = setup === "experimental" || setup === "diggate";
  // The arms and trunk with it (pitchInternalMode), 2026-09-24: the operator's queue item.
  if (setup === "simulation" || exp) { p.footMode = 1; p.pitchMode = 1; p.pitchInternalMode = 1; }
  if (exp) p.freeLegMode = 1;
  // A landing pays for the energy the ice takes (staminaLandingMode): the operator's choice, 2026-10-31.
  if (exp) p.staminaLandingMode = 1;
  // A jump turns the way its entry turns it, clockwise or counter-clockwise
  // (jumpDirMode): the operator's choice, 2026-11-09 — "something you can
  // choose by using the skates, like how you enter the jump". Every setup.
  p.jumpDirMode = 1;
  return p;
}
/**
 * Blade Explorer: the knee a push bends to when RT asks for less (the owner's
 * pick, 2026-11-14: a cue and a default bend, "both"). A push's power is the
 * knee, and on a pad the knee is RT: the owner's first First ice on Explorer
 * (replay of 2026-11-11 17:55) pushed 120 times with RT at zero, averaged
 * 0.64 m/s, and never reached the event's 3 m/s. Only the floor moves: RT
 * deeper than it bends deeper and pushes harder, exactly as before.
 *
 * MEASURED, from a standstill on Explorer with RT released, tapping A every
 * 50 ticks (the owner's median gap in that replay): no floor reaches 2.69 m/s
 * in 8 s and never 3; 0.5 reaches 3 m/s at 5.7 s, 0.6 at 4.7 s, 0.65 at 4.2 s.
 * At 0.7 and above the skater hops at a standstill and falls: 0.7 is
 * jumpLoadKnee, so the push loads a jump and the stroke's end releases it.
 * 0.6 keeps a tenth clear of that, and RT full over it still reaches 3 m/s in
 * 2.3 s. Pinned in test/explorer-knee.test.ts.
 */
export const EXPLORER_PUSH_KNEE = 0.6;
/**
 * The default bend, on the ice and gliding only: while a push is asked for or
 * still under way (the same window the solver floors the knee at 0.35 in), never
 * in a jump's load or the air, a move, or a fall.
 */
export function explorerPushKnee(input: SkatingInput, s: SkaterState, p: Params, floor = EXPLORER_PUSH_KNEE): SkatingInput {
  if (s.fallen || s.jump.phase !== JUMP_PHASE.None || s.move !== MOVE.None || !(input.push || s.strokeTime > 0)) return input;
  // Never as deep as a jump's load: a push must not become a hop.
  const bend = Math.min(floor, p.jumpLoadKnee - 0.05);
  if ((input.knee ?? 0) >= bend) return input;
  input.knee = bend;
  return input;
}
export function setupInput(c: Controls, s: SkaterState, setup: Setup, st: GameControlState, p: Params, profile: ControllerProfile, assistance = 0.75) {
  const exp = setup === "experimental" || setup === "diggate";
  const mapped = fullInput(c, s, st, p, profile, {
    manual: setup !== "repertoire", twoFoot: setup === "simulation" || exp,
    feet: setup === "simulation" || exp, pumps: exp, experimental: exp,
    leanAssist: setup === "explorer" ? assistance : 0,
    repeatPush: setup !== "simulation" && !exp,
    digGate: setup === "diggate",
    standingPush: !exp,
    // The Elite paddles: Experimental and Simulation only, the operator's choice.
    paddles: setup === "experimental" || setup === "simulation" ? setup : undefined,
  });
  if (setup === "explorer") explorerPushKnee(mapped.input, s, p);
  return mapped;
}
