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
// It said that from the first commit and did not do it — `curve()` was applied
// per axis, which is the squared-off behaviour the paragraph above describes as
// the thing to avoid. Fixed 2026-09-09 after a play report that the stick was
// hard to steer. The comment was right; the code was not.
//
// WHY THERE IS A CURVE ON IT. The stick sets a lean, and the interesting part
// of that lean is the first third — a shallow edge is a slow, precise thing.
// A mild exponential gives that back at no cost to full deflection.
//
// ── two schemes, deliberately ───────────────────────────────────────────────
//
// design-bible.md §2.1 gives the LEFT STICK the whole lean vector — sideways is
// which edge and how deep, fore/aft is over the toe or the heel — and reserves
// the RIGHT STICK for carriage. That is the scheme the game ships with, so it
// is the default here.
//
// It is also the scheme the bible's own risk 1 says to keep a fallback for:
// "no shipped game has used analog lean plus analog knee as its primary verb …
// keep two fallback schemes prototyped rather than one." So `split` puts lean
// on the left stick's X alone and the rocker on the right stick's Y, and M (or
// Back) switches between them mid-glide. Which scheme a tuning session ran is
// worth writing in the log next to the parameters.

import type { SkatingInput } from "../sim/types.ts";

const DEADZONE = 0.22;
const CURVE = 1.35;
const TRIGGER = 0.35;

/**
 * How far off horizontal the stick must be pushed before it reads as rocker,
 * in the unified scheme. Radians.
 *
 * Without it, a lean is never purely a lean: nobody pushes a stick along an
 * exact axis, so every edge came with a few degrees of unasked-for fore/aft and
 * the contact point wandered while you were trying to hold a curve. Fore/aft is
 * attenuated by tan(band) x |sideways| rather than gated, so it stays
 * continuous — a deliberate diagonal still pitches, a sloppy sideways push does
 * not.
 */
const PITCH_BAND = 0.44;          // 25 deg

export const SCHEME = { Unified: 0, Split: 1 } as const;
export type Scheme = 0 | 1;
export const SCHEME_NAME = ["unified · bible §2.1", "split sticks"] as const;

const A = 0, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, BACK = 8, START = 9;

export interface PadState extends SkatingInput {
  /** One-shot: true only on the frame the button went down. */
  reset: boolean;
  pause: boolean;
  cyclePreset: boolean;
  cycleScheme: boolean;
}

const NOTHING: PadState = {
  lean: 0, knee: 0.35, weight: 0.5, pitch: 0, push: false, brake: false,
  reset: false, pause: false, cyclePreset: false, cycleScheme: false,
};

/**
 * One stick, deadzoned and curved as a VECTOR: direction is preserved exactly,
 * and only the magnitude is rescaled and shaped. This is what the header has
 * always claimed and what a lean vector requires — the angle you push is the
 * edge you get.
 */
function stick(x: number, y: number): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return { x: 0, y: 0 };
  const t = Math.min(1, (m - DEADZONE) / (1 - DEADZONE));
  const scaled = Math.pow(t, CURVE) / m;
  return { x: x * scaled, y: y * scaled };
}

/**
 * The unified scheme's left stick: a lean vector, with the fore/aft component
 * relieved of the bleed a sideways push carries with it.
 *
 * Exported and pure because this is where the deadzone bug lived, and because
 * a mapping is exactly the kind of thing that is easier to argue about than to
 * measure. `test/pad.test.ts` measures it.
 */
export function leanVector(rawX: number, rawY: number): { lean: number; pitch: number } {
  const l = stick(rawX, rawY);
  const bleed = Math.tan(PITCH_BAND) * Math.abs(l.x);
  return { lean: l.x, pitch: Math.sign(l.y) * Math.max(0, Math.abs(l.y) - bleed) };
}

/** One axis on its own, for the split scheme's two half-sticks. */
function axis(v: number): number {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  return Math.sign(v) * Math.pow((a - DEADZONE) / (1 - DEADZONE), CURVE);
}

export class Pad {
  /** Which mapping is live. Cycled by M or Back; read by the HUD. */
  scheme: Scheme = SCHEME.Unified;

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
      if (this.scheme === SCHEME.Split) {
        // Lean is the left stick's X and nothing else; the rocker gets a stick
        // of its own. Costs the carriage stick, which is why it is not default.
        out.lean = axis(gp.axes[0] ?? 0);
        out.pitch = -axis(gp.axes[3] ?? gp.axes[1] ?? 0);
      } else {
        const l = leanVector(gp.axes[0] ?? 0, -(gp.axes[1] ?? 0));
        out.lean = l.lean;
        out.pitch = l.pitch;
      }
      out.knee = Math.max(0, Math.min(1, gp.buttons[RT]?.value ?? 0));
      const wl = gp.buttons[LB]?.pressed ? 1 : 0;
      const wr = gp.buttons[RB]?.pressed ? 1 : 0;
      out.weight = wl && !wr ? 0 : wr && !wl ? 1 : 0.5;
      out.push = (gp.buttons[A]?.pressed ?? false) && !this.prevButtons.has(A);
      out.brake = (gp.buttons[LT]?.value ?? 0) > TRIGGER;
      out.reset = (gp.buttons[Y]?.pressed ?? false) && !this.prevButtons.has(Y);
      out.pause = (gp.buttons[START]?.pressed ?? false) && !this.prevButtons.has(START);
      out.cyclePreset = (gp.buttons[X]?.pressed ?? false) && !this.prevButtons.has(X);
      out.cycleScheme = (gp.buttons[BACK]?.pressed ?? false) && !this.prevButtons.has(BACK);
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
    if (this.pressed("m")) out.cycleScheme = true;

    this.prevKeys = new Set(this.keys);
    if (out.cycleScheme) this.scheme = (1 - this.scheme) as Scheme;
    return out;
  }
}
