import { PRESETS } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import type { Controls } from "../app/pad.ts";
import type { SkaterState } from "../sim/types.ts";
import { GAME_PARAMS } from "./controls.ts";
import { fullInput } from "./full-controls.ts";
import type { ControllerProfile, GameControlState } from "./full-controls.ts";

export const SETUPS = [
  { id: "simulation", name: "Simulation", description: "One stick per blade, one trigger per knee, and the feet turn in the hips (feet layout in the controller profile). Blades scrape, dig and catch; the trunk twists; stops come from the feet and edges. Hold L3 for right-stick arms; the right blade retains its last command. Minimal added assistance." },
  { id: "explorer", name: "Blade Explorer", description: "Left stick controls lean and fore–aft pressure. Right stick controls arms, which twist the trunk. Blades stay parallel but scrape, dig and catch. Medium–high balance and speed-aware lean assistance; manual turn gestures and landings." },
  { id: "experimental", name: "Experimental", description: "The operator's experiment. Triggers are the legs: pull to bend that knee, pump (bend then snap straight) to push with that leg; load and release the standing leg to jump. Thumbsticks are the feet and blades as in Simulation — side to side the edge, up/down heel/toe — and a quick bottom-to-top thumb stroke is that foot pushing too; a thumb stroke and a trigger pump of the same leg together push harder than either. Everything through the blades; minimal assistance." },
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
  if (setup !== "simulation" && setup !== "experimental") {
    for (const key of ["balanceKd", "controlLatency", "internalRateGain", "internalMax"] as const)
      p[key] += (PRESETS.assisted[key] - p[key]) * (setup === "repertoire" ? 1 : assistance);
  }
  if (setup === "repertoire") p.jumpAssist = PRESETS.assisted.jumpAssist;
  // Stages B/C. Simulation: everything through the blades — slip and the dig,
  // the trunk, the feet in the hips. Explorer: the same with the blades kept
  // parallel. Repertoire keeps its dedicated moves on the carve as it was.
  if (setup !== "repertoire") { p.slipMode = 1; p.torqueMode = 1; }
  if (setup === "simulation" || setup === "experimental") p.footMode = 1;
  return p;
}
export function setupInput(c: Controls, s: SkaterState, setup: Setup, st: GameControlState, p: Params, profile: ControllerProfile, assistance = 0.75) {
  return fullInput(c, s, st, p, profile, {
    manual: setup !== "repertoire", twoFoot: setup === "simulation" || setup === "experimental",
    feet: setup === "simulation" || setup === "experimental", pumps: setup === "experimental",
    leanAssist: setup === "explorer" ? assistance : 0,
    repeatPush: setup !== "simulation" && setup !== "experimental",
  });
}
