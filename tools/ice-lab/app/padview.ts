// app/padview.ts — what the hands are doing, and what the solver was told.
//
// Two rows of truth, deliberately side by side: the hardware as read (sticks,
// triggers, bumpers, buttons) and the SkatingInput the live scheme turned it
// into. The gap between them IS the control scheme — B's stick points one way
// and asks for a lean the other; C's two sticks become a mean and a split — so
// showing only one of the two would hide the thing being tested.
//
// Developer-facing. The stick captions say what each scheme does with a stick,
// which is exactly what pre-production-plan.md §7 forbids a tester or observer
// from being told, so the lab turns this overlay off under `?playtest=1`.
//
// Renders state it is handed; decides nothing. The only memory it keeps is how
// long a one-shot button stays lit, because a press that lasts one 120 Hz tick
// would otherwise never reach a 60 Hz frame.

import type { SkatingInput, SkaterState } from "../sim/types.ts";
import type { Controls } from "./pad.ts";

const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const INK = "#dce9f2";
const DIM = "#7b93a6";
const JADE = "#7dffc4";
const GOLD = "#ffc94a";
const RED = "#ff4d6d";
const WELL = "#16242f";

/** Advance of one 11 px Plex Mono glyph. Fixed rather than measured: the
 *  font is monospace, and the stub canvas in test/app-loads.test.ts has no
 *  measureText, which is how the chip row first failed. */
const CHAR_W = 6.6;

/** Ticks a one-shot press stays lit: 0.25 s at 120 Hz. */
const FLASH_TICKS = 30;

/** What each stick means under each scheme. Indexed by scheme, A B C. */
export const STICK_ROLE = [
  { left: "lean ↔ edge · ↕ rocker", right: "carriage · jumps" },
  { left: "point where to go", right: "carriage · jumps" },
  { left: "left blade · ↕ rocker", right: "right blade · ↕ rocker" },
] as const;

type Flash = "push" | "toe" | "reset" | "pause" | "cyclePreset" | "cycleScheme" | "cycleJump";
const FLASHES: Flash[] = ["push", "toe", "reset", "pause", "cyclePreset", "cycleScheme", "cycleJump"];

/**
 * The two sticks as a scheme reads them, with the keyboard folded in.
 *
 * The keyboard has no stick, so it is drawn as one: A/D and W/S deflect the
 * left stick fully, and under C the arrows are the right stick, because that is
 * the right blade there. Pure, so test/padview.test.ts can hold it to that.
 */
export function displaySticks(c: Controls, scheme: number): {
  left: { x: number; y: number }; right: { x: number; y: number };
} {
  const c2 = scheme === 2;
  return {
    left: {
      x: c.lx !== 0 ? c.lx : c2 ? c.kPrimaryX : c.kx,
      y: c.ly !== 0 ? c.ly : c.ky,
    },
    right: {
      x: c.rx !== 0 ? c.rx : c2 ? c.kAltX : 0,
      y: c.ry,
    },
  };
}

export class PadView {
  private controls: Controls | null = null;
  private input: SkatingInput | null = null;
  /** The moves are on, so the chips show the bible's layout: B turn, LT tap toe. */
  private moves = false;
  private turnLit = false;
  private flash: Record<Flash, number> = {
    push: 0, toe: 0, reset: 0, pause: 0, cyclePreset: 0, cycleScheme: 0, cycleJump: 0,
  };

  /**
   * Once per simulation tick. `controls` is null during replay playback: a
   * replay records what the solver was told, not what the hands did.
   */
  note(controls: Controls | null, input: SkatingInput | null, moves = false): void {
    this.controls = controls;
    this.input = input;
    this.moves = moves;
    this.turnLit = input?.turn ?? false;
    for (const k of FLASHES) {
      if (controls?.[k]) this.flash[k] = FLASH_TICKS;
      else if (this.flash[k] > 0) this.flash[k]--;
    }
    // A held push strokes on repeat, so it stays lit while held. A replay has
    // no controls, but its inputs still say when the pick went in.
    if (input?.push) this.flash.push = Math.max(this.flash.push, 1);
    if (input?.toe) this.flash.toe = FLASH_TICKS;
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, scheme: number, s: SkaterState): void {
    const W = 300, H = 244;
    const c = this.controls;
    const it = this.input;
    ctx.save();
    ctx.fillStyle = "rgba(7,16,26,0.86)";
    ctx.fillRect(x, y, W, H);
    ctx.fillStyle = JADE;
    ctx.fillRect(x + W - 3, y, 3, H);
    ctx.font = `11px ${MONO}`;
    ctx.textBaseline = "top";

    const text = (t: string, tx: number, ty: number, col = DIM): void => {
      ctx.fillStyle = col; ctx.fillText(t, tx, ty);
    };
    text(`INPUT · scheme ${"ABC"[scheme] ?? "?"}${c ? "" : " · replay"}`, x + 10, y + 8, INK);

    // ── sticks ──────────────────────────────────────────────────────────────
    const sticks = c ? displaySticks(c, scheme) : null;
    const role = STICK_ROLE[scheme] ?? STICK_ROLE[0];
    const stick = (cx: number, cy: number, v: { x: number; y: number } | null,
      label: string, caption: string): void => {
      const R = 30;
      ctx.strokeStyle = "#2b4152"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      if (v) {
        const live = Math.hypot(v.x, v.y) > 1e-3;
        const px = cx + v.x * R, py = cy - v.y * R;     // screen y is down
        ctx.strokeStyle = live ? JADE : "#3c5566"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
        ctx.fillStyle = live ? JADE : "#3c5566";
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
      }
      text(label, cx - R, cy - R - 2, INK);
      text(caption, cx - R - 6, cy + R + 5);
    };
    stick(x + 48, y + 66, sticks?.left ?? null, "LS", role.left);
    stick(x + 160, y + 66, sticks?.right ?? null, "RS", role.right);
    // Carriage: a gold ring as wide as the arms are held out.
    if (it && it.carriage > 0) {
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x + 160, y + 66, 30 * it.carriage, 0, Math.PI * 2); ctx.stroke();
    }

    // ── triggers: raw fill, and the knee the legs have actually reached ─────
    const trigger = (tx: number, frac: number, label: string, caption: string,
      col: string, reached?: number): void => {
      const top = y + 34, h = 62;
      ctx.fillStyle = WELL; ctx.fillRect(tx, top, 14, h);
      ctx.fillStyle = col; ctx.fillRect(tx, top + h * (1 - frac), 14, h * frac);
      if (reached !== undefined) {
        ctx.fillStyle = INK; ctx.fillRect(tx - 3, top + h * (1 - reached) - 1, 20, 2);
      }
      text(label, tx - 1, top - 14, INK);
      text(caption, tx - 6, top + h + 5);
    };
    trigger(x + 226, c?.brake ? 1 : 0, "LT", "brake", RED);
    trigger(x + 262, c ? c.knee : it?.knee ?? 0, "RT", "knee", GOLD, s.knee);

    // ── bumpers: where the weight is asked to be, and where it is ───────────
    const by = y + 128;
    text("LB", x + 10, by, it && it.weight < 0.5 ? JADE : DIM);
    text("RB", x + W - 30, by, it && it.weight > 0.5 ? JADE : DIM);
    const bx = x + 36, bw = W - 76;
    ctx.fillStyle = WELL; ctx.fillRect(bx, by + 3, bw, 6);
    ctx.fillStyle = DIM; ctx.fillRect(bx + bw / 2, by, 1, 12);
    if (it) {
      ctx.fillStyle = JADE;
      ctx.beginPath(); ctx.arc(bx + bw * it.weight, by + 6, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = INK;
    ctx.fillRect(bx + bw * s.blade[1].weight - 1, by - 1, 2, 14);
    text("weight: left foot ◂ ▸ right foot", bx + 14, by + 14);

    // ── buttons ─────────────────────────────────────────────────────────────
    const chips: Array<[string, string, boolean]> = [
      ["A", s.fallen ? "stand" : "stroke", this.flash.push > 0],
      ["B", this.moves ? "turn" : "toe", this.moves ? this.turnLit : this.flash.toe > 0],
      ...(this.moves ? [["LT tap", "toe", this.flash.toe > 0] as [string, string, boolean]] : []),
      ["Y", this.moves ? "spin" : "reset", this.moves ? (this.input?.spin ?? false) : this.flash.reset > 0],
      ["X", this.moves ? "twizzle" : "preset", this.moves ? (this.input?.twizzle ?? false) : this.flash.cyclePreset > 0],
      ["⧉", this.moves ? "reset" : "scheme", this.moves ? this.flash.reset > 0 : this.flash.cycleScheme > 0],
      ["☰", "pause", this.flash.pause > 0],
      ["▲", "jumps", this.flash.cycleJump > 0],
    ];
    // Five chips do not fit one 300 px row, so they wrap rather than run off
    // the panel.
    let cx = x + 10, cy = y + 158;
    for (const [key, what, lit] of chips) {
      const w = 12 + CHAR_W * `${key} ${what}`.length;
      if (cx + w > x + W - 10) { cx = x + 10; cy += 21; }
      ctx.fillStyle = lit ? JADE : WELL;
      ctx.fillRect(cx, cy, w, 17);
      text(`${key} ${what}`, cx + 6, cy + 3, lit ? "#07101a" : DIM);
      cx += w + 5;
    }

    // ── what the solver was actually told ───────────────────────────────────
    const sg = (v: number): string => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
    if (it) {
      text(`→ lean ${sg(it.lean)}  pitch ${sg(it.pitch)}  split ${sg(it.leanSplit)}`,
        x + 10, y + 204, INK);
      text(`  knee ${it.knee.toFixed(2)}  wt ${it.weight.toFixed(2)}  arms ${it.carriage.toFixed(2)}`
        + `${it.push ? " PUSH" : ""}${it.brake ? " BRK" : ""}${it.toe ? " TOE" : ""}${it.turn ? " TURN" : ""}${it.twizzle ? " TWZ" : ""}${it.spin ? " SPIN" : ""}`, x + 10, y + 220, INK);
    } else {
      text("→ waiting for the first tick", x + 10, y + 204);
    }
    ctx.restore();
  }
}
