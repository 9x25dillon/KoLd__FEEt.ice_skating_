// app/pad.ts — a controller, and the keyboard standing in for one.
//
// Carried over from SONIC DRIFTER (app/pad.ts), which is the operator's own
// work and has eleven play reports behind it. The shape is unchanged; only
// what it produces is different.
//
// THIS FILE READS HARDWARE AND NOTHING ELSE. What an axis MEANS belongs to
// app/schemes.ts, because pre-production-plan.md §3 requires three answers to
// that question and the entire point of the exercise is that nobody yet knows
// which one is right.
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

const DEADZONE = 0.22;
const CURVE = 1.35;
const TRIGGER = 0.35;

/**
 * With the moves on, LT is the bible's toe pick as a tap and still the brake
 * held: the pick strikes on the press, and the brake only bites once LT has
 * been held this long. Ticks at 120 Hz: 0.15 s.
 */
const LT_TAP_TICKS = 18;

/**
 * How far off horizontal the stick must be pushed before it reads as rocker,
 * in scheme A. Radians.
 *
 * Without it, a lean is never purely a lean: nobody pushes a stick along an
 * exact axis, so every edge came with a few degrees of unasked-for fore/aft and
 * the contact point wandered while you were trying to hold a curve. Fore/aft is
 * attenuated by tan(band) x |sideways| rather than gated, so it stays
 * continuous — a deliberate diagonal still pitches, a sloppy sideways push does
 * not.
 */
const PITCH_BAND = 0.44;          // 25 deg

const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, BACK = 8, START = 9, L3 = 10, R3 = 11,
  DPAD_UP = 12, DPAD_DOWN = 13, DPAD_LEFT = 14, DPAD_RIGHT = 15;

/**
 * Hardware state, with the sticks shaped but not yet interpreted.
 *
 * Both readings of the left stick are carried, because the schemes want
 * different ones: A wants the lean with the fore/aft bleed removed, B wants the
 * direction exactly as pushed, since "point where you want to go" is distorted
 * by any suppression at all.
 */
export interface Controls {
  /** Left stick, radial deadzone and curve applied, direction preserved. */
  lx: number;
  ly: number;
  /** Right stick, the same treatment. */
  rx: number;
  ry: number;
  /** Scheme A's reading of the left stick. */
  lean: number;
  pitch: number;
  /** Keyboard, A/D and W/S or the arrows: the axis every scheme can use. */
  kx: number;
  ky: number;
  /** A/D alone and the arrows alone, so ten fingers can drive two blades. */
  kPrimaryX: number;
  kAltX: number;
  knee: number;
  weight: number;
  push: boolean;
  brake: boolean;
  /**
   * Arms held out, from the keyboard (C). The pad's carriage is the right
   * stick, and which scheme may read it as carriage is schemes.ts's business.
   */
  carriage: number;
  /**
   * One-shot toe-pick strike: pad B, keyboard F. The bible puts the pick on an
   * LT tap, but LT is this rig's brake, and a tap/hold split on one trigger is
   * a second experiment nobody asked for.
   */
  toe: boolean;
  /**
   * The turn button, held (keyboard B; with the moves on, pad B, where the
   * bible puts it). The solver starts a turn on the press.
   */
  turn: boolean;
  /**
   * The bracket button, held: keyboard N; with the moves on, pad R3 — the
   * stick clicks were the pad's last free buttons, and the lab's own
   * cycleGhost does not exist in the game that reads this one.
   */
  bracket: boolean;
  /** The twizzle button, held (keyboard Z; with the moves on, pad X, where the bible puts it). */
  twizzle: boolean;
  /** The spin button, held (keyboard Y; with the moves on, pad Y, where the bible puts it). */
  spin: boolean;
  /**
   * The Ina Bauer, held: keyboard I; with the moves on, both bumpers at once —
   * both feet down and turned out, which is what the move is.
   */
  inaBauer: boolean;
  /** One-shot: true only on the frame the button went down. */
  reset: boolean;
  pause: boolean;
  cyclePreset: boolean;
  cycleScheme: boolean;
  /** Off -> hop -> full jumps. Keyboard J, pad D-pad up. */
  cycleJump: boolean;
  /** North up -> travel up. Keyboard V, pad D-pad down. Ignored in playtest. */
  cycleView: boolean;
  /** Zoom steps this frame: + and - on the keyboard. */
  zoom: number;
  /**
   * D-pad right (+1) or left (-1), one-shot. The lab decides what it means:
   * the next or previous jump in the jump challenge, a zoom step anywhere else.
   */
  dpadStep: number;
  /** Chase camera up (+1) or down (-1) a step: ] and [. Keyboard only. */
  tilt: number;
  /** Next course — off, Figure Eight, edge course, jumps: G, or click the left stick. Ignored in playtest. */
  toggleGame: boolean;
  /** Which ghost to race — best, last, a file, none: H, or click the right stick. */
  cycleGhost: boolean;
  /** The jump challenge's target, 0..5, from keys 1-6; -1 when none was pressed. */
  pickJump: number;
  /** Next sample skater (sim/profile.ts): K. Keyboard only. Ignored in playtest. */
  cycleProfile: boolean;
  /** The moves on or off (movesMode): L. The pad reaches them through D-pad up. Ignored in playtest. */
  cycleMoves: boolean;
}

const NOTHING: Controls = {
  lx: 0, ly: 0, rx: 0, ry: 0, lean: 0, pitch: 0,
  kx: 0, ky: 0, kPrimaryX: 0, kAltX: 0,
  knee: 0.35, weight: 0.5, push: false, brake: false, carriage: 0, toe: false, turn: false, bracket: false, twizzle: false, spin: false, inaBauer: false,
  reset: false, pause: false, cyclePreset: false, cycleScheme: false, cycleJump: false,
  cycleView: false, zoom: 0, tilt: 0, toggleGame: false, cycleGhost: false, pickJump: -1, dpadStep: 0, cycleProfile: false,
  cycleMoves: false,
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
 * Scheme A's left stick: a lean vector, with the fore/aft component relieved of
 * the bleed a sideways push carries with it.
 *
 * Exported and pure because this is where the deadzone bug lived, and because
 * a mapping is exactly the kind of thing that is easier to argue about than to
 * measure. `test/pad.test.ts` measures it.
 */
export function leanVector(rawX: number, rawY: number): { lean: number; pitch: number } {
  const l = stick(rawX, rawY);
  return { lean: l.x, pitch: relievedPitch(l.x, l.y) };
}

/**
 * The fore/aft of an already-shaped stick, relieved of the bleed its sideways
 * component carries. Scheme A applies it to the left stick through
 * `leanVector`; scheme C applies it to both sticks, since there each stick is a
 * blade and a sideways push on a blade is an edge and nothing else.
 */
export function relievedPitch(x: number, y: number): number {
  const bleed = Math.tan(PITCH_BAND) * Math.abs(x);
  return Math.sign(y) * Math.max(0, Math.abs(y) - bleed);
}

export class Pad {
  private keys = new Set<string>();
  private prevButtons = new Set<number>();
  private prevKeys = new Set<string>();
  private ltWasDown = false;
  private ltTicks = 0;

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

  /**
   * `moves`: the moves are on (never in playtest), so the face buttons take
   * the bible's §2.1 layout — B is the turn, and the toe pick moves to a tap
   * of LT, which held is still the brake.
   */
  read(moves = false): Controls {
    const out: Controls = { ...NOTHING };
    const gp = navigator.getGamepads?.().find((g) => g && g.connected) ?? null;

    if (gp) {
      const l = stick(gp.axes[0] ?? 0, -(gp.axes[1] ?? 0));
      const r = stick(gp.axes[2] ?? 0, -(gp.axes[3] ?? 0));
      out.lx = l.x; out.ly = l.y;
      out.rx = r.x; out.ry = r.y;
      const a = leanVector(gp.axes[0] ?? 0, -(gp.axes[1] ?? 0));
      out.lean = a.lean; out.pitch = a.pitch;

      out.knee = Math.max(0, Math.min(1, gp.buttons[RT]?.value ?? 0));
      const wl = gp.buttons[LB]?.pressed ? 1 : 0;
      const wr = gp.buttons[RB]?.pressed ? 1 : 0;
      out.weight = wl && !wr ? 0 : wr && !wl ? 1 : 0.5;
      if (moves && wl && wr) out.inaBauer = true;
      out.push = (gp.buttons[A]?.pressed ?? false) && !this.prevButtons.has(A);
      const ltDown = (gp.buttons[LT]?.value ?? 0) > TRIGGER;
      this.ltTicks = ltDown ? this.ltTicks + 1 : 0;
      out.brake = moves ? ltDown && this.ltTicks > LT_TAP_TICKS : ltDown;
      // With the moves on, Y is the bible's spin and reset moves to Back; the
      // scheme stays on M.
      if (moves) {
        out.spin = gp.buttons[Y]?.pressed ?? false;
        out.reset = (gp.buttons[BACK]?.pressed ?? false) && !this.prevButtons.has(BACK);
      } else {
        out.reset = (gp.buttons[Y]?.pressed ?? false) && !this.prevButtons.has(Y);
      }
      out.pause = (gp.buttons[START]?.pressed ?? false) && !this.prevButtons.has(START);
      // With the moves on, X is the bible's twizzle; the preset stays on T.
      if (moves) out.twizzle = gp.buttons[X]?.pressed ?? false;
      else out.cyclePreset = (gp.buttons[X]?.pressed ?? false) && !this.prevButtons.has(X);
      if (!moves) out.cycleScheme = (gp.buttons[BACK]?.pressed ?? false) && !this.prevButtons.has(BACK);
      if (moves) {
        out.toe = ltDown && !this.ltWasDown;
        out.turn = gp.buttons[B]?.pressed ?? false;
        out.bracket = gp.buttons[R3]?.pressed ?? false;
      } else {
        out.toe = (gp.buttons[B]?.pressed ?? false) && !this.prevButtons.has(B);
      }
      this.ltWasDown = ltDown;
      out.cycleJump = (gp.buttons[DPAD_UP]?.pressed ?? false) && !this.prevButtons.has(DPAD_UP);
      out.cycleView = (gp.buttons[DPAD_DOWN]?.pressed ?? false) && !this.prevButtons.has(DPAD_DOWN);
      if ((gp.buttons[DPAD_RIGHT]?.pressed ?? false) && !this.prevButtons.has(DPAD_RIGHT)) out.dpadStep += 1;
      if ((gp.buttons[DPAD_LEFT]?.pressed ?? false) && !this.prevButtons.has(DPAD_LEFT)) out.dpadStep -= 1;
      // The stick clicks were the pad's last free buttons: the lab's two
      // choices. With the moves on, the game reclaims R3 for bracket —
      // it has no course or ghost to read cycleGhost, so both readings coexist.
      out.toggleGame = (gp.buttons[L3]?.pressed ?? false) && !this.prevButtons.has(L3);
      if (!moves) out.cycleGhost = (gp.buttons[R3]?.pressed ?? false) && !this.prevButtons.has(R3);
      this.prevButtons = new Set(gp.buttons.flatMap((b, i) => (b.pressed ? [i] : [])));
    }

    // The keyboard is not a fallback, it is the same intent by other means.
    // A/D and the arrows are one axis for schemes A and B, and two separate
    // ones for C, which needs a control per blade.
    const primaryX = (this.held("d") ? 1 : 0) - (this.held("a") ? 1 : 0);
    const altX = (this.held("arrowright") ? 1 : 0) - (this.held("arrowleft") ? 1 : 0);
    out.kPrimaryX = primaryX;
    out.kAltX = altX;
    out.kx = primaryX !== 0 ? primaryX : altX;
    out.ky = (this.held("w", "arrowup") ? 1 : 0) - (this.held("s", "arrowdown") ? 1 : 0);

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
    if (this.held("c")) out.carriage = 1;
    if (this.pressed("f")) out.toe = true;
    if (this.held("b")) out.turn = true;
    if (this.held("n")) out.bracket = true;
    if (this.held("z")) out.twizzle = true;
    if (this.held("y")) out.spin = true;
    if (this.held("i")) out.inaBauer = true;
    if (this.pressed("j")) out.cycleJump = true;
    if (this.pressed("v")) out.cycleView = true;
    if (this.pressed("=") || this.pressed("+")) out.zoom += 1;
    if (this.pressed("-") || this.pressed("_")) out.zoom -= 1;
    if (this.pressed("]")) out.tilt += 1;
    if (this.pressed("[")) out.tilt -= 1;
    if (this.pressed("g")) out.toggleGame = true;
    if (this.pressed("h")) out.cycleGhost = true;
    if (this.pressed("k")) out.cycleProfile = true;
    if (this.pressed("l")) out.cycleMoves = true;
    for (let n = 1; n <= 6; n++) if (this.pressed(String(n))) out.pickJump = n - 1;

    this.prevKeys = new Set(this.keys);
    return out;
  }
}
