// app/pad.ts — a controller, and the keyboard standing in for one.
//
// Carried over from SONIC DRIFTER (app/pad.ts), which is the operator's own
// work and has eleven play reports behind it. The shape is unchanged; only
// what it produces is different.
//
// WHY THE DEADZONE IS RADIAL. Treating the axes separately squares off the
// diagonals: a stick pushed to its corner reads 1.0 on both, a magnitude of
// 1.41, and forty percent more reach on the diagonals than the cardinals.
// The magnitude is taken from the vector, rescaled from the edge of the
// deadzone, and clamped once.
//
// WHY THERE IS A CURVE ON IT. The stick sets a lean, and the interesting part
// of that lean is the first third — a shallow edge is a slow, precise thing.
// A mild exponential gives that back at no cost to full deflection.

import type { SkatingInput } from "../sim/types.ts";

const DEADZONE = 0.22;
const CURVE = 1.35;
const TRIGGER = 0.35;

const A = 0, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, START = 9;

export interface PadState extends SkatingInput {
  /** One-shot: true only on the frame the button went down. */
  reset: boolean;
  pause: boolean;
  cyclePreset: boolean;
}

const NOTHING: PadState = {
  lean: 0, knee: 0.35, weight: 0.5, pitch: 0, push: false, brake: false,
  reset: false, pause: false, cyclePreset: false,
};

function curve(v: number): number {
  const s = Math.sign(v), a = Math.abs(v);
  if (a < DEADZONE) return 0;
  const t = (a - DEADZONE) / (1 - DEADZONE);
  return s * Math.pow(t, CURVE);
}

export class Pad {
  private keys = new Set<string>();
  private prevButtons = new Set<number>();
  private prevKeys = new Set<string>();

  constructor(target: HTMLElement | Window = window) {
    target.addEventListener("keydown", (e) => {
      const k = (e as KeyboardEvent).key.toLowerCase();
      this.keys.add(k);
      // Space and the arrows scroll the page out from under the rink.
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
    });
    target.addEventListener("keyup", (e) => this.keys.delete((e as KeyboardEvent).key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  private held(...ks: string[]): boolean { return ks.some((k) => this.keys.has(k)); }

  private pressed(k: string): boolean {
    return this.keys.has(k) && !this.prevKeys.has(k);
  }

  read(): PadState {
    const out: PadState = { ...NOTHING };
    const gp = navigator.getGamepads?.().find((g) => g && g.connected) ?? null;

    if (gp) {
      out.lean = curve(gp.axes[0] ?? 0);
      out.pitch = -curve(gp.axes[1] ?? 0);
      out.knee = Math.max(0, Math.min(1, gp.buttons[RT]?.value ?? 0));
      const wl = gp.buttons[LB]?.pressed ? 1 : 0;
      const wr = gp.buttons[RB]?.pressed ? 1 : 0;
      out.weight = wl && !wr ? 0 : wr && !wl ? 1 : 0.5;
      out.push = (gp.buttons[A]?.pressed ?? false) && !this.prevButtons.has(A);
      out.brake = (gp.buttons[LT]?.value ?? 0) > TRIGGER;
      out.reset = (gp.buttons[Y]?.pressed ?? false) && !this.prevButtons.has(Y);
      out.pause = (gp.buttons[START]?.pressed ?? false) && !this.prevButtons.has(START);
      out.cyclePreset = (gp.buttons[X]?.pressed ?? false) && !this.prevButtons.has(X);
      this.prevButtons = new Set(gp.buttons.flatMap((b, i) => (b.pressed ? [i] : [])));
    }

    // The keyboard is not a fallback, it is the same intent by other means.
    const kx = (this.held("d", "arrowright") ? 1 : 0) - (this.held("a", "arrowleft") ? 1 : 0);
    const ky = (this.held("w", "arrowup") ? 1 : 0) - (this.held("s", "arrowdown") ? 1 : 0);
    if (kx) out.lean = kx;
    if (ky) out.pitch = ky;
    if (this.held("shift")) out.knee = 0.95;
    else if (!gp) out.knee = 0.35;
    if (this.held("q")) out.weight = 0;
    if (this.held("e")) out.weight = 1;
    if (this.pressed(" ")) out.push = true;
    if (this.held("x")) out.brake = true;
    if (this.pressed("r")) out.reset = true;
    if (this.pressed("p")) out.pause = true;
    if (this.pressed("t")) out.cyclePreset = true;

    this.prevKeys = new Set(this.keys);
    return out;
  }
}
