// app/draw.ts — the Ice Lab's picture of what the solver believes.
//
// Rule for everything in here: it renders state, it never computes physics.
// If a number has to be worked out to draw it, the solver should already have
// worked it out and put it on the state — otherwise the overlay and the
// simulation can disagree, and the overlay is the thing you are trusting.

import type { SkaterState, BladeState } from "../sim/types.ts";
import type { IceGrid } from "../sim/ice.ts";
import {
  EDGE, REGIME, REGIME_NAME, FALL_NAME, FOOT, MOVE, TURN_NAME, SPIN_POSITION_NAME,
  codeToString, codeSide, EDGE_CODE_NONE,
} from "../sim/types.ts";
import type { Params } from "../sim/params.ts";
import { effectiveRocker, carveRadius, skidOnsetSpeed, equilibriumLean } from "../sim/blade.ts";
import { perpLeft, len } from "../sim/math.ts";
import type { Vec2 } from "../sim/math.ts";
import { PadView } from "./padview.ts";
import { drawRibbon } from "./ribbon.ts";
import { Camera, PX } from "./camera.ts";
import { JUMP_PHASE, JUMP_CODE, JUMP_NONE, ROTATION_MARK, EDGE_MARK } from "../sim/jump.ts";
import { SPIN_INERTIA_SCALE } from "../sim/moves.ts";
import { SPIN_POSITION } from "../sim/types.ts";

/**
 * How far out the arms and free leg are, 0 tucked .. 1 open, read back off the
 * moment of inertia the solver is using — in the air a jump's, in a spin the
 * spin's divided by its position's scale. -1 when neither applies.
 */
export function armsOpen(s: SkaterState, p: Params): number {
  const span = Math.max(p.inertiaOpen - p.inertiaTucked, 1e-3);
  if (s.jump.phase === JUMP_PHASE.Air) return clampUnit((s.jump.inertia - p.inertiaTucked) / span);
  if (s.move === MOVE.Spin) return clampUnit((s.spin.inertia / SPIN_INERTIA_SCALE[s.spin.position] - p.inertiaTucked) / span);
  return -1;
}

/** A camel: torso horizontal, free leg out behind at hip height. */
const camel = (s: SkaterState): boolean => s.move === MOVE.Spin && s.spin.position === SPIN_POSITION.Camel;


const INK = "#dce9f2";
const DIM = "#5b7386";
const FAINT = "#182e3d";
const OUTSIDE = "#5aa9ff";        // blue: outside edge
const INSIDE = "#ff5d7a";         // red: inside edge
const FLATC = "#9fb3c2";
const SKIDC = "#ffc94a";
const GOLD = "#ffc94a";
const JADE = "#7dffc4";
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

export interface TracePoint { x: number; y: number; side: number; depth: number; skid: boolean }

export interface DrawOptions {
  blades: boolean;
  carveCircle: boolean;
  forces: boolean;
  balance: boolean;
  tracing: boolean;
  hud: boolean;
  /** The overhead athlete. Off leaves the bare blades, as the rig began. */
  skater: boolean;
  /** Controller and solver-input panel. Developer-facing; off in playtest. */
  pad: boolean;
  /** The Edge Ribbon, bible §4.6. Under test, so it stays on in playtest. */
  ribbon: boolean;
}

/**
 * A game layer's hooks into the frame (app/figure8.ts). All optional; none of
 * them is handed anything it could use to change the state.
 */
export interface DrawExtras {
  /** On the ice, under the skater, in metres: the ice transform is current. */
  ground?: (ctx: CanvasRenderingContext2D, px: number) => void;
  /** Over everything, in screen pixels, with the camera to place things by. */
  screen?: (ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number) => void;
  /** A second skater, faint: a best run racing the live one. */
  ghost?: { s: SkaterState; p: Params } | null;
}

export const DEFAULT_OPTIONS: DrawOptions = {
  blades: true, carveCircle: true, forces: true, balance: true, tracing: true, hud: true,
  skater: true, pad: true, ribbon: true,
};

/**
 * The pendulum as the solver has it: the base the blades hang off, the centre
 * of mass above it, and where the COM would have to be for the arc it is on.
 *
 * Read off the state rather than recomputed — the COM is `pos`, and the base is
 * the midpoint of the blade contacts, which is where step() put them. An
 * earlier version drew the COM at base - perpLeft * L sin(lean): the mirror
 * image, outside the turn, so the one overlay meant to show the balance
 * problem showed it inverted. test/draw.test.ts holds it to the solver.
 */
export function pendulum(s: SkaterState): { base: Vec2; com: Vec2; eq: Vec2 } {
  const a = s.blade[0].contact, b = s.blade[1].contact;
  const base = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const left = perpLeft(s.heading);
  const r = s.legLength * Math.sin(s.leanEq);
  return {
    base,
    com: { x: s.pos.x, y: s.pos.y },
    eq: { x: base.x + left.x * r, y: base.y + left.y * r },
  };
}

export interface V3 { x: number; y: number; z: number }

const go = (o: V3, v: { x: number; y: number; z?: number }, k: number): V3 =>
  ({ x: o.x + v.x * k, y: o.y + v.y * k, z: o.z + (v.z ?? 0) * k });
const dist3 = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Thigh and shin, m. Two of them just outreach the hip of a skater standing
 * at comHeight, so the knee is soft even standing — as a skater's is.
 */
export const SEGMENT = 0.5;

/** Index 0 is the left foot, as everywhere in the solver. */
export interface Body {
  base: V3; com: V3; hip: V3; shoulder: V3; head: V3;
  feet: [V3, V3]; knees: [V3, V3]; hips: [V3, V3];
  shoulders: [V3, V3]; hands: [V3, V3];
  /** The save, -1..1: the arms swing by it, gold at the ceiling. */
  save: number;
}

/**
 * The skater in three dimensions, for a camera that is not straight overhead.
 *
 * Built on the pendulum, so it cannot disagree with the solver: the base is
 * the blade contacts' midpoint, the COM is `pos` at `comZ`, and the line
 * between them is the leg length at the lean — the body tips exactly as far as
 * the solver says it does. The rest hangs off that line. The knee is SOLVED,
 * not placed: two fixed segments between hip and foot, bending forward, so a
 * deep knee (RT, Shift) reads as a deep bend rather than a shorter stick.
 */
export function bodyPoints(s: SkaterState, p: Params): Body {
  // The body's own frame. Side-on in an Ina Bauer, chest away from the curve
  // it leans back into: the heading turned a quarter toward the trailing foot.
  const ina = s.move === MOVE.InaBauer;
  const leadLeft = s.inaBauer.lead === FOOT.Left;
  const t = !ina ? s.heading : leadLeft ? { x: s.heading.y, y: -s.heading.x } : perpLeft(s.heading);
  const n = perpLeft(t);
  const air = s.jump.phase === JUMP_PHASE.Air;
  const lift = air ? Math.max(0, s.jump.z) : 0;
  const { base } = pendulum(s);
  const B: V3 = { x: base.x, y: base.y, z: lift };
  const C: V3 = { x: s.pos.x, y: s.pos.y, z: s.comZ + lift };
  const L = dist3(C, B) || 1;
  const u: V3 = { x: (C.x - B.x) / L, y: (C.y - B.y) / L, z: (C.z - B.z) / L };

  // The COM sits just above the hips; the torso pitches forward as the knee
  // bends, which is how a skater keeps the COM over a bent leg.
  const hip = go(C, u, -0.08);
  const pitch = camel(s) ? 2.5 : 0.15 + 0.35 * s.knee;
  const dl = Math.hypot(u.x + t.x * pitch, u.y + t.y * pitch, u.z);
  const d: V3 = { x: (u.x + t.x * pitch) / dl, y: (u.y + t.y * pitch) / dl, z: u.z / dl };
  const shoulder = go(hip, d, 0.5);
  const head = go(shoulder, d, 0.22);

  const beat = s.strokeTime > 0 ? Math.sin(Math.min(1, s.strokeTime / 0.3) * Math.PI) : 0;
  const support = s.blade[s.supportFoot].contact;
  const side = (i: number): number => (i === FOOT.Left ? 1 : -1);
  const foot = (i: number): V3 => {
    const b = s.blade[i];
    let f: V3;
    if (air) f = go(B, n, side(i) * 0.08);
    else if (b.inContact) f = { x: b.contact.x, y: b.contact.y, z: 0 };
    else if (camel(s)) f = go({ x: support.x, y: support.y, z: 0.85 }, t, -0.95);  // a camel's free leg, out behind
    else f = go(go({ x: support.x, y: support.y, z: 0.28 }, t, -0.45), n, side(i) * 0.1);  // free leg, behind
    if (s.strokeFoot === i && beat > 0) f = go(go(f, n, (s.crossover ? -s.crossSide : side(i)) * 0.35 * beat), t, -0.2 * beat);
    return f;
  };
  const feet: [V3, V3] = [foot(0), foot(1)];
  const hips: [V3, V3] = [go(hip, n, 0.1), go(hip, n, -0.1)];
  const knee = (i: number): V3 => {
    const h = hips[i], f = feet[i], dd = dist3(h, f) || 1;
    const a: V3 = { x: (h.x - f.x) / dd, y: (h.y - f.y) / dd, z: (h.z - f.z) / dd };
    // Forward, made square to the leg, so both segments keep their length.
    const along = t.x * a.x + t.y * a.y;
    let k: V3 = { x: t.x - a.x * along, y: t.y - a.y * along, z: -a.z * along };
    const kl = Math.hypot(k.x, k.y, k.z);
    k = kl > 1e-6 ? { x: k.x / kl, y: k.y / kl, z: k.z / kl } : { x: 0, y: 0, z: 1 };
    const bend = Math.sqrt(Math.max(0, SEGMENT * SEGMENT - dd * dd / 4));
    return go({ x: (h.x + f.x) / 2, y: (h.y + f.y) / 2, z: (h.z + f.z) / 2 }, k, bend);
  };
  const knees: [V3, V3] = [knee(0), knee(1)];

  const save = air ? 0 : clampUnit(s.intAccel / Math.max(p.internalMax, 1e-3));
  const open = armsOpen(s, p);
  const reach = open < 0 ? 1 : 0.2 + 0.8 * open;
  const shoulders: [V3, V3] = [go(shoulder, n, 0.19), go(shoulder, n, -0.19)];
  const hand = (i: number): V3 =>
    go(go(go(shoulders[i], n, side(i) * (0.1 + 0.45 * reach)), t, side(i) * 0.35 * save), d, -(0.3 - 0.15 * reach));
  return {
    base: B, com: C, hip, shoulder, head, feet, knees, hips, shoulders,
    hands: [hand(0), hand(1)], save,
  };
}

const edgeColour = (b: BladeState): string => {
  if (b.regime === REGIME.Skid) return SKIDC;
  const side = b.code === EDGE_CODE_NONE ? EDGE.Flat : codeSide(b.code);
  return side === EDGE.Outside ? OUTSIDE : side === EDGE.Inside ? INSIDE : FLATC;
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  /** Persistent blade tracings, capped: roughly each foot's last 30 s. */
  trace: TracePoint[][] = [[], []];
  private maxTrace = 4000;
  /**
   * The whole run, uncapped: `sim/ice.ts`'s own `IceGrid`, read back rather
   * than re-accumulated — the bible's "one system, two payoffs" (§3.2). One
   * pixel per cell, painted from `condition()` at the blade's own contact
   * cell each tick (`paintWear`), so two skaters crossing the same ice read
   * the same wear the physics itself would give them. `null` until a grid
   * exists to size it from (`clearWear`); harmless and invisible until then.
   */
  private wear: HTMLCanvasElement | null = null;
  private wearCtx: CanvasRenderingContext2D | null = null;
  private wearHalfLength = 0;
  private wearHalfWidth = 0;
  private wearCell = 0;

  private canvas: HTMLCanvasElement;
  /** Pixels per metre this frame, so widths set as "n / px" stay n pixels. */
  private px = PX;
  /** The view when the caller brings none: the rig's original camera. */
  private still = new Camera();
  /** Fed once per tick by the lab; drawn when `opt.pad` is on. */
  readonly pad = new PadView();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
  }

  clearTrace(): void { this.trace = [[], []]; }

  /** A fresh sheet: size the wear canvas to this grid, one pixel per cell, and blank it. */
  clearWear(ice: IceGrid): void {
    this.wear = document.createElement("canvas");
    this.wear.width = ice.cols;
    this.wear.height = ice.rows;
    this.wearCtx = this.wear.getContext("2d");
    this.wearHalfLength = ice.halfLength;
    this.wearHalfWidth = ice.halfWidth;
    this.wearCell = ice.cell;
  }

  /**
   * Once per simulation tick: read `condition()` back at each blade in
   * contact and paint that one cell. `clearRect` first because `fillRect`
   * would otherwise blend onto whatever was already there — condition is a
   * saturating snapshot, not something to layer paint on top of.
   */
  paintWear(ice: IceGrid, s: SkaterState): void {
    if (!this.wearCtx) return;
    for (const b of s.blade) {
      if (!b.inContact) continue;
      const cell = ice.cellAt(b.contact);
      if (!cell) continue;
      const { damage, snow } = ice.sample(b.contact);
      const cond = Math.min(1, damage + snow);
      this.wearCtx.clearRect(cell.col, cell.row, 1, 1);
      if (cond <= 0) continue;
      this.wearCtx.fillStyle = `rgba(159,179,194,${(0.6 * cond).toFixed(3)})`;
      this.wearCtx.fillRect(cell.col, cell.row, 1, 1);
    }
  }

  /** The wear canvas, blitted into world space under the current ground transform. */
  private iceWear(): void {
    if (!this.wear) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(-this.wearHalfLength, -this.wearHalfWidth);
    ctx.scale(this.wearCell, this.wearCell);
    ctx.drawImage(this.wear, 0, 0);
    ctx.restore();
  }

  recordTrace(s: SkaterState): void {
    for (let i = 0; i < 2; i++) {
      const b = s.blade[i];
      if (!b.inContact) continue;
      const t = this.trace[i];
      const last = t[t.length - 1];
      // One point per centimetre of travel: enough to draw, cheap to keep.
      if (last && (last.x - b.contact.x) ** 2 + (last.y - b.contact.y) ** 2 < 1e-4) continue;
      t.push({
        x: b.contact.x, y: b.contact.y,
        side: b.code === EDGE_CODE_NONE ? EDGE.Flat : codeSide(b.code),
        depth: b.depth,
        skid: b.regime === REGIME.Skid,
      });
      if (t.length > this.maxTrace) t.shift();
    }
  }

  draw(s: SkaterState, p: Params, opt: DrawOptions, info: string[], scheme = 0,
    cam?: Camera, extras?: DrawExtras): void {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b1016";
    ctx.fillRect(0, 0, w, h);

    // Camera: app/camera.ts decides where we look from; everything below draws
    // in metres on the ice. Without one, the rig's original: north up, zoom 1.
    if (!cam) { cam = this.still; cam.snap(s); }
    ctx.save();
    const m = cam.groundMatrix(w, h);
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    // Line widths stay in screen pixels whatever the zoom.
    this.px = cam.px;
    ctx.lineWidth = 1 / this.px;

    // Tilted, the ice is still this transform but the body is not flat on it:
    // the figure and the balance lines go up in z, drawn after the ice in
    // screen space. A fallen skater IS flat on the ice, so they stay here.
    const tilted = cam.elevation < 89.5;
    this.grid(cam, w, h);
    if (opt.tracing) { this.iceWear(); this.tracings(); }
    if (opt.carveCircle) this.carveCircles(s, p);
    extras?.ground?.(ctx, this.px);
    const ghost = extras?.ghost;
    if (ghost && (!tilted || ghost.s.fallen)) {
      ctx.save(); ctx.globalAlpha = 0.35; this.skater(ghost.s, ghost.p); ctx.restore();
    }
    if (opt.skater && (!tilted || s.fallen)) this.skater(s, p);
    else if (opt.skater) this.shadow(s);
    if (opt.blades) this.blades(s);
    if (opt.forces) this.forces(s);
    if (opt.balance && !tilted) this.balance(s);

    ctx.restore();
    if (tilted && ghost && !ghost.s.fallen) {
      ctx.save(); ctx.globalAlpha = 0.35; this.skater3d(ghost.s, ghost.p, cam); ctx.restore();
    }
    if (tilted && opt.skater && !s.fallen) this.skater3d(s, p, cam);
    if (tilted && opt.balance) this.balance3d(s, cam);
    if (opt.hud) this.hud(s, p, info);
    if (opt.pad && w > 640) this.pad.draw(ctx, w - 312, 48, scheme, s);
    if (opt.ribbon) drawRibbon(ctx, w, h, s, p);
    extras?.screen?.(ctx, cam, w, h);
  }

  // ── ice ───────────────────────────────────────────────────────────────────

  private grid(cam: Camera, w: number, h: number): void {
    const ctx = this.ctx;
    // Everything the view can reach, whichever way it is turned.
    const r = cam.visibleRadius(w, h);
    const x0 = Math.floor(cam.cx - r), x1 = Math.ceil(cam.cx + r);
    const y0 = Math.floor(cam.cy - r), y1 = Math.ceil(cam.cy + r);
    // World-anchored ice grain: stable under camera movement and replay.
    ctx.fillStyle = "#102330";
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // One path for the lot: a stroke per square metre is ~3000 draw calls a
    // frame on a wide window, for a texture nobody is reading.
    // Zoomed far out the grain is sub-pixel and tens of thousands of strokes:
    // skip it, the markings still say where the ice is.
    if ((x1 - x0) * (y1 - y0) < 12000) {
      ctx.lineWidth = 0.6 / this.px;
      ctx.strokeStyle = "rgba(165,221,240,0.055)";
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const seed = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
          const f = seed - Math.floor(seed);
          ctx.moveTo(x + f, y + f);
          ctx.lineTo(x + f + 0.25, y + f + 0.06);
        }
      }
      ctx.stroke();
    }
    // Training markings repeat across the unbounded simulation surface.
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1 / this.px;
    for (let x = Math.floor(x0 / 10) * 10; x <= x1; x += 10) {
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      for (let y = Math.floor(y0 / 10) * 10; y <= y1; y += 10) {
        ctx.strokeStyle = "rgba(116,204,226,0.14)";
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 0.2, y); ctx.lineTo(x + 0.2, y);
        ctx.moveTo(x, y - 0.2); ctx.lineTo(x, y + 0.2); ctx.stroke();
        ctx.strokeStyle = FAINT;
      }
    }
    // Not red: red on this rink means an inside edge, and a red line under an
    // outside-edge tracing reads as a wrong call.
    ctx.strokeStyle = "rgba(116,204,226,0.20)";
    ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.stroke();
  }

  private tracings(): void {
    const ctx = this.ctx;
    for (let i = 0; i < 2; i++) {
      const t = this.trace[i];
      if (t.length < 2) continue;
      for (let k = 1; k < t.length; k++) {
        const a = t[k - 1], b = t[k];
        ctx.strokeStyle = b.skid ? "rgba(255,201,74,0.55)"
          : b.side === EDGE.Outside ? "rgba(90,169,255,0.42)"
            : b.side === EDGE.Inside ? "rgba(255,93,122,0.42)"
              : "rgba(159,179,194,0.20)";
        ctx.lineWidth = (0.6 + 0.5 * b.depth) / this.px;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  }

  // ── the skater ────────────────────────────────────────────────────────────

  /**
   * The overhead athlete. Every part of the pose is a field of the state, so
   * the figure is a reading of what the controls did rather than decoration:
   *
   *   feet     at the solver's own blade contacts — lean shows as the feet
   *            sliding out from under the body, which is what a lean IS
   *   legs     brightness is the weight share (LB / RB, Q / E)
   *   torso    moves forward as the knee bends (RT, Shift)
   *   arms     swing with the internal authority; gold when it saturates,
   *            which is the save the HUD's SAVE line is counting
   *   free leg the unloaded foot, lifted behind, in a one-foot glide
   *   stroke   the pushing foot reaching out for strokeTime (A, Space)
   *   brake    spray off the blades (LT, X)
   */
  private skater(s: SkaterState, p: Params): void {
    const ctx = this.ctx;
    const h = s.heading, left = perpLeft(h);
    const local = (v: Vec2): [number, number] => {
      const dx = v.x - s.pos.x, dy = v.y - s.pos.y;
      return [dx * h.x + dy * h.y, dx * left.x + dy * left.y];
    };
    ctx.save();
    ctx.translate(s.pos.x, s.pos.y);
    ctx.rotate(Math.atan2(h.y, h.x));
    ctx.lineCap = "round";
    const stroke = (pts: number[], color: string, width: number): void => {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.stroke();
    };
    // In the air the shadow stays on the ice and slides out from under the
    // body, and the body grows toward the camera: height, read from above.
    const air = s.jump.phase === JUMP_PHASE.Air;
    const lift = air ? Math.max(0, s.jump.z) : 0;
    ctx.fillStyle = `rgba(0,5,15,${(0.35 - 0.3 * Math.min(1, lift)).toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(-0.08 - 0.6 * lift, -0.10 - 0.6 * lift, 0.65, 0.39, 0, 0, Math.PI * 2); ctx.fill();
    if (lift > 0) ctx.scale(1 + 0.9 * lift, 1 + 0.9 * lift);

    if (s.fallen) {
      stroke([-0.65, -0.25, -0.25, 0, 0.30, 0.12], "#24384d", 0.22);
      stroke([-0.6, 0.35, -0.25, 0, 0.30, 0.12], "#24384d", 0.20);
      stroke([0.1, -0.45, 0.15, 0.04, 0.5, 0.40], "#ee7790", 0.14);
      ctx.fillStyle = "#ee7790";
      ctx.beginPath(); ctx.ellipse(0.08, 0, 0.30, 0.24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#17263b";
      ctx.beginPath(); ctx.arc(0.33, 0, 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }

    const torsoX = camel(s) ? 0.34 : 0.04 + 0.14 * s.knee;
    const beat = s.strokeTime > 0 ? Math.sin(Math.min(1, s.strokeTime / 0.3) * Math.PI) : 0;
    const braking = s.blade[0].regime === REGIME.Brake || s.blade[1].regime === REGIME.Brake;
    const support = local(s.blade[s.supportFoot].contact);

    for (let i = 0; i < 2; i++) {
      const b = s.blade[i];
      const side = i === FOOT.Left ? 1 : -1;
      let [fx, fy] = air ? [-0.02, side * 0.06]
        : b.inContact ? local(b.contact) : camel(s) ? [support[0] - 0.95, support[1]] : [support[0] - 0.42, support[1] + side * 0.16];
      // A crossover's push goes to the outside of the curve whichever foot
      // makes it: the inside foot's reaches under the body.
      if (s.strokeFoot === i && beat > 0) { fx -= 0.25 * beat; fy += (s.crossover ? -s.crossSide : side) * 0.35 * beat; }
      const load = b.inContact ? 0.35 + 0.65 * b.weight : 0.25;
      const leg = `rgba(84,124,160,${load.toFixed(2)})`;
      stroke([torsoX - 0.06, side * 0.11, (torsoX + fx) / 2 - 0.05 * s.knee, (side * 0.11 + fy) / 2, fx, fy],
        leg, 0.15);
      stroke([fx - 0.16, fy, fx + 0.14, fy], `rgba(238,248,255,${(0.35 + 0.65 * load).toFixed(2)})`, 0.09);
      if (braking && b.inContact) {
        ctx.fillStyle = "rgba(230,245,255,0.55)";
        for (let k = 0; k < 5; k++) {
          const jitter = Math.sin((s.tick + k * 7) * 12.9898 + i) * 0.5 + 0.5;
          ctx.beginPath();
          ctx.arc(fx + 0.18 + 0.1 * k, fy + side * (0.05 + 0.12 * jitter), 0.035, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Side-on in an Ina Bauer: the torso, arms and head turn a quarter toward
    // the trailing foot; the legs already reach to the blades ahead and behind.
    if (s.move === MOVE.InaBauer) ctx.rotate(s.inaBauer.lead === FOOT.Left ? -Math.PI / 2 : Math.PI / 2);

    // Arms: swung fore and aft against each other by the save, like a skater
    // windmilling to stay up. Normalized by the ceiling, so full swing means
    // the arms have nothing left to give.
    // In the air the arms are the moment of inertia: drawn in as it falls
    // toward the tucked value, which is the pull-in the whole jump rides on.
    const save = air ? 0 : clampUnit(s.intAccel / Math.max(p.internalMax, 1e-3));
    const open = armsOpen(s, p);
    const reach = open < 0 ? 1 : 0.2 + 0.8 * open;
    const armCol = Math.abs(save) > 0.95 ? GOLD : "#60d9ce";
    stroke([torsoX, 0.18, torsoX - 0.05 + 0.3 * save, 0.18 + 0.30 * reach,
      torsoX + 0.1 + 0.45 * save, 0.18 + 0.48 * reach], armCol, 0.11);
    stroke([torsoX, -0.18, torsoX - 0.05 - 0.3 * save, -0.18 - 0.30 * reach,
      torsoX + 0.1 - 0.45 * save, -0.18 - 0.48 * reach], armCol, 0.11);

    ctx.fillStyle = "#69e3d3";
    ctx.beginPath(); ctx.ellipse(torsoX, 0, 0.28, 0.23, 0, 0, Math.PI * 2); ctx.fill();
    stroke([torsoX - 0.16, 0, torsoX + 0.18, 0], "#d4fff3", 0.04);
    ctx.fillStyle = "#ebbd9e";
    ctx.beginPath(); ctx.arc(torsoX + 0.3, 0, 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#17263b";
    ctx.beginPath(); ctx.arc(torsoX + 0.26, 0, 0.135, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** Where the body is over the ice. In the air it stays down and fades. */
  private shadow(s: SkaterState): void {
    const ctx = this.ctx;
    const lift = s.jump.phase === JUMP_PHASE.Air ? Math.max(0, s.jump.z) : 0;
    ctx.fillStyle = `rgba(0,5,15,${(0.45 - 0.3 * Math.min(1, lift)).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(s.pos.x, s.pos.y, 0.5, 0.32, Math.atan2(s.heading.y, s.heading.x), 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * The body from a camera off the vertical. Screen space, through
   * `cam.project`; widths are metres times the zoom, so the figure scales
   * with the ice under it. Painter's order: the far leg and arm, the torso,
   * the head, the near leg and arm.
   */
  private skater3d(s: SkaterState, p: Params, cam: Camera): void {
    const ctx = this.ctx, px = cam.px, b = bodyPoints(s, p), t = s.heading;
    const line = (pts: V3[], col: string, metres: number): void => {
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, metres * px);
      ctx.beginPath();
      pts.forEach((q, i) => {
        const [x, y] = cam.project(q.x, q.y, q.z);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    ctx.lineCap = "round";
    const farFirst = (a: V3, c: V3): [number, number] =>
      (cam.depth(a.x, a.y) >= cam.depth(c.x, c.y) ? [0, 1] : [1, 0]);
    const legs = farFirst(b.feet[0], b.feet[1]), arms = farFirst(b.hands[0], b.hands[1]);
    const armCol = Math.abs(b.save) > 0.95 ? GOLD : "#60d9ce";
    const leg = (i: number): void => {
      const bl = s.blade[i];
      const load = bl.inContact ? 0.35 + 0.65 * bl.weight : 0.25;
      line([b.feet[i], b.knees[i], b.hips[i]], `rgba(96,140,180,${Math.max(0.55, load).toFixed(2)})`, 0.12);
      line([go(b.feet[i], t, -0.14), go(b.feet[i], t, 0.16)],
        `rgba(238,248,255,${(0.35 + 0.65 * load).toFixed(2)})`, 0.05);
    };
    const arm = (i: number): void => line([b.shoulders[i], b.hands[i]], armCol, 0.08);
    leg(legs[0]); arm(arms[0]);
    line([b.hips[0], b.hips[1]], "#69e3d3", 0.12);
    line([b.hip, b.shoulder], "#69e3d3", 0.3);
    line([b.shoulders[0], b.shoulders[1]], "#69e3d3", 0.12);
    const [hx, hy] = cam.project(b.head.x, b.head.y, b.head.z);
    ctx.fillStyle = "#ebbd9e";
    ctx.beginPath(); ctx.arc(hx, hy, Math.max(2, 0.12 * px), 0, Math.PI * 2); ctx.fill();
    leg(legs[1]); arm(arms[1]);
  }

  /**
   * The balance overlay with its height back: base to COM is the body as the
   * solver tilts it, and the amber line is where the arc it is on would need
   * the body to be. Seen from behind, the gap between them is a lean.
   */
  private balance3d(s: SkaterState, cam: Camera): void {
    const ctx = this.ctx;
    const lift = s.jump.phase === JUMP_PHASE.Air ? Math.max(0, s.jump.z) : 0;
    const { base, com } = pendulum(s);
    const n = perpLeft(s.heading), L = s.legLength;
    const P = (x: number, y: number, z: number): [number, number] => cam.project(x, y, z);
    const [bx, by] = P(base.x, base.y, lift);
    const [cx, cy] = P(com.x, com.y, s.comZ + lift);
    const r = L * Math.sin(s.leanEq);
    const [ex, ey] = P(base.x + n.x * r, base.y + n.y * r, lift + L * Math.cos(s.leanEq));
    const col = s.fallen ? "#ff4d6d" : "#d38bff";
    ctx.strokeStyle = col; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(2.5, 0.075 * cam.px), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,201,74,0.85)"; ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
  }

  private blades(s: SkaterState): void {
    const ctx = this.ctx;
    for (let i = 0; i < 2; i++) {
      const b = s.blade[i];
      if (!b.inContact) continue;
      // The blade is drawn around its contact, which pitch (W / S, or the
      // stick's fore/aft) walks from heel to toe — so the rocker input shows
      // as the pressure point moving along the steel.
      const t = b.tangent, BL = 0.28;
      const heel = { x: b.contact.x - t.x * BL * b.contactS, y: b.contact.y - t.y * BL * b.contactS };
      const toe = { x: b.contact.x + t.x * BL * (1 - b.contactS), y: b.contact.y + t.y * BL * (1 - b.contactS) };
      ctx.strokeStyle = edgeColour(b);
      ctx.lineWidth = (i === s.supportFoot ? 3.2 : 1.8) / this.px;
      ctx.beginPath(); ctx.moveTo(heel.x, heel.y); ctx.lineTo(toe.x, toe.y); ctx.stroke();

      // Contact point, sized by load.
      ctx.fillStyle = edgeColour(b);
      ctx.beginPath();
      ctx.arc(b.contact.x, b.contact.y, (0.03 + 0.05 * b.weight), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private carveCircles(s: SkaterState, p: Params): void {
    const ctx = this.ctx;
    const b = s.blade[s.supportFoot];
    if (!b.inContact || Math.abs(b.tilt) < p.flatThreshold) return;
    const r = carveRadius(b.tilt, effectiveRocker(b.contactS, p));
    if (!Number.isFinite(r) || r > 400) return;
    const n = perpLeft(b.tangent);
    const cx = b.contact.x + n.x * Math.sign(b.tilt) * r;
    const cy = b.contact.y + n.y * Math.sign(b.tilt) * r;
    ctx.strokeStyle = b.regime === REGIME.Skid ? "rgba(255,201,74,0.30)" : "rgba(125,255,196,0.28)";
    ctx.lineWidth = 1.2 / this.px;
    ctx.setLineDash([0.25, 0.2]);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // When the edge is letting go, the arc it is ACTUALLY tracing is wider.
    if (b.regime === REGIME.Skid && Number.isFinite(b.turnRadius) && b.turnRadius < 400) {
      const rx = b.contact.x + n.x * Math.sign(b.tilt) * b.turnRadius;
      const ry = b.contact.y + n.y * Math.sign(b.tilt) * b.turnRadius;
      ctx.strokeStyle = "rgba(255,201,74,0.5)";
      ctx.beginPath(); ctx.arc(rx, ry, b.turnRadius, 0, Math.PI * 2); ctx.stroke();
    }
  }

  private forces(s: SkaterState): void {
    const ctx = this.ctx;
    const arrow = (from: Vec2, dx: number, dy: number, col: string, wpx: number): void => {
      if (Math.abs(dx) + Math.abs(dy) < 1e-4) return;
      ctx.strokeStyle = col; ctx.lineWidth = wpx / this.px;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(from.x + dx, from.y + dy); ctx.stroke();
    };
    // Velocity, 1 m of arrow per 4 m/s.
    arrow(s.pos, s.vel.x / 4, s.vel.y / 4, "rgba(220,233,242,0.7)", 2);
    // Lateral edge force per blade, 1 m per 400 N.
    for (let i = 0; i < 2; i++) {
      const b = s.blade[i];
      if (!b.inContact) continue;
      const n = perpLeft(b.tangent);
      arrow(b.contact, n.x * b.latForce / 400, n.y * b.latForce / 400, JADE, 2);
    }
  }

  private balance(s: SkaterState): void {
    const ctx = this.ctx;
    const { base, com, eq } = pendulum(s);
    ctx.strokeStyle = s.fallen ? "#ff4d6d" : "#d38bff";
    ctx.lineWidth = 2.4 / this.px;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(com.x, com.y); ctx.stroke();
    ctx.fillStyle = s.fallen ? "#ff4d6d" : "#d38bff";
    ctx.beginPath(); ctx.arc(com.x, com.y, 0.075, 0, Math.PI * 2); ctx.fill();

    // Where the COM would have to be for the arc it is on. The gap between
    // this line and the last one is the whole balance problem.
    ctx.strokeStyle = "rgba(255,201,74,0.85)";
    ctx.lineWidth = 1.4 / this.px;
    ctx.setLineDash([0.12, 0.1]);
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(eq.x, eq.y); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── the numbers ───────────────────────────────────────────────────────────

  /** The jump in progress and the last one landed, while jumps are on. */
  private jumpLines(s: SkaterState, p: Params): Array<[string, string]> {
    if (p.jumpMode <= 0) return [];
    const J = s.jump;
    const mode = p.jumpMode >= 2 ? "full" : "hop";
    const out: Array<[string, string]> = [];
    if (J.phase === JUMP_PHASE.Load) {
      out.push([`JUMP ${mode}  LOAD ${J.t.toFixed(2)}s  knee ${s.knee.toFixed(2)}`
        + `${J.toeInLoad ? "  pick" : ""}${J.windupTick >= 0 ? "  WOUND" : ""}${J.preRotation > 0 ? "  PRE-ROTATING" : ""}`, GOLD]);
    } else if (J.phase === JUMP_PHASE.Air) {
      out.push([`JUMP ${mode}  AIR ${(J.rotation / (2 * Math.PI)).toFixed(2)} rev  `
        + `ω ${(J.angMomentum / J.inertia).toFixed(1)}  I ${J.inertia.toFixed(2)}  ${J.z.toFixed(2)} m`
        + (J.armed && J.target > 0 ? `  assist → ${(J.target / (2 * Math.PI)).toFixed(1)} rev` : ""), JADE]);
    } else {
      out.push([`JUMP ${mode}  deep knee, then release`, DIM]);
    }
    const L = s.landed;
    if (L.tick >= 0) {
      const name = L.kind === JUMP_NONE ? "hop"
        : `${L.revolutions}${JUMP_CODE[L.kind]}${ROTATION_MARK[L.rotationCall]}${EDGE_MARK[L.edgeCall]}`;
      out.push([`LAST  ${name}  ${L.turned.toFixed(2)} rev  TQ ${L.takeoffQuality.toFixed(2)}  `
        + `LQ ${L.landingQuality.toFixed(2)}${L.fall ? "  FALL" : L.stepOut ? "  step-out" : ""}`
        + `${L.twoFoot && L.kind !== JUMP_NONE ? "  two-foot" : ""}${L.armed ? "  wound" : ""}`, L.fall ? "#ff4d6d" : INK]);
    }
    return out;
  }

  /** The move under way and the last one finished, while the moves are on. */
  private movesLines(s: SkaterState, p: Params): Array<[string, string]> {
    if (p.movesMode <= 0) return [];
    const out: Array<[string, string]> = [];
    if (s.move === MOVE.Turn) {
      const T = s.turn;
      out.push([`TURN  ${codeToString(T.fromCode)} ${T.dir > 0 ? "↺" : "↻"} ${(T.swept * 180 / Math.PI).toFixed(0)}°`
        + `${T.cusps > 0 ? `  ${TURN_NAME[T.kind]}` : "  — weight to the other foot for a mohawk"}`, GOLD]);
    } else if (s.move === MOVE.Spin) {
      const S = s.spin;
      out.push([`SPIN  ${SPIN_POSITION_NAME[S.position]} ${S.dir > 0 ? "↺" : "↻"}  ${(S.omega / (2 * Math.PI)).toFixed(1)} rev/s`
        + `  ${(S.swept / (2 * Math.PI)).toFixed(1)} rev  drift ${S.travel.toFixed(2)} m`, GOLD]);
      out.push(["  knee deep: sit · stick forward: camel · arms in: faster · let go: check out", DIM]);
    } else if (s.move === MOVE.InaBauer) {
      const B = s.inaBauer;
      out.push([`INA BAUER  ${codeToString(s.blade[B.lead].code)} leads, ${codeToString(s.blade[1 - B.lead].code)} trails`
        + `  ${B.t.toFixed(1)} s${B.t < 1.8 ? " — the data holds one 1.8 s" : ""}`, GOLD]);
    } else if (s.move === MOVE.Spiral) {
      const Sp = s.spiral;
      out.push([`SPIRAL  ${codeToString(s.blade[Sp.foot].code)}, free leg extended`
        + `  ${Sp.t.toFixed(1)} s${Sp.t < 2.0 ? " — the data holds one 2.0 s" : ""}`, GOLD]);
    } else if (s.move === MOVE.Twizzle) {
      const T = s.turn;
      out.push([`TWIZZLE  ${(T.swept / (2 * Math.PI)).toFixed(2)} rev ${T.dir > 0 ? "↺" : "↻"}  ${(T.rate / (2 * Math.PI)).toFixed(1)} rev/s`
        + `${T.release ? "  finishing" : "  — let go to come out"}`, GOLD]);
    } else if (s.strokeTime > 0 && s.crossover) {
      const inside = s.crossSide > 0 ? FOOT.Left : FOOT.Right;
      out.push([`CROSSOVER  ${s.strokeFoot === inside
        ? "inside foot pushes under, on its outside edge" : "outside foot pushes out"}`, JADE]);
    } else {
      out.push(["MOVES  push on a curve: crossover · B turn · Z twizzle · Y spin · I Ina Bauer", DIM]);
    }
    const m = s.moveDone;
    if (m.tick >= 0 && m.kind !== MOVE.None) {
      const what = m.kind === MOVE.Turn ? TURN_NAME[m.detail]
        : m.kind === MOVE.Twizzle ? `twizzle ${m.revolutions.toFixed(2)} rev`
          : m.kind === MOVE.Spin ? `spin ${m.revolutions.toFixed(1)} rev, best ${m.bestSegRevs.toFixed(1)} in one position, drift ${m.travel.toFixed(2)} m`
            : `Ina Bauer ${m.seconds.toFixed(1)} s`;
      out.push([`LAST  ${codeToString(m.fromCode)} ${what} → ${codeToString(m.toCode)}`
        + `  −${m.speedLost.toFixed(2)} m/s${Math.abs(s.spinCarry) > 0.05 ? `  carry ${s.spinCarry.toFixed(1)} rad/s` : ""}`, INK]);
    }
    return out;
  }

  private hud(s: SkaterState, p: Params, info: string[]): void {
    const ctx = this.ctx;
    const d = (r: number): string => (r * 180 / Math.PI).toFixed(1);
    const bar = (x: number, y: number, wpx: number, frac: number, col: string): void => {
      ctx.fillStyle = "#1b2530"; ctx.fillRect(x, y, wpx, 6);
      ctx.fillStyle = col; ctx.fillRect(x, y, wpx * Math.max(0, Math.min(1.2, frac)) / 1.2, 6);
      ctx.fillStyle = DIM; ctx.fillRect(x + wpx / 1.2, y - 2, 1, 10);   // the 1.0 mark
    };

    const sb = s.blade[s.supportFoot];
    const skidLine = sb.inContact && Math.abs(sb.tilt) > p.flatThreshold;
    const jumpLines = this.jumpLines(s, p);
    const movesLines = this.movesLines(s, p);
    const height = 4 + 5 * 16 + 6 + 2 * 46 + 4 + (skidLine ? 16 : 0) + (s.fallen ? 16 : 0)
      + jumpLines.length * 16 + movesLines.length * 16 + 8 + info.length * 16 + 6;
    ctx.fillStyle = "rgba(7,16,26,0.86)";
    ctx.fillRect(8, 8, Math.min(480, this.canvas.width - 16), height);
    ctx.fillStyle = JADE;
    ctx.fillRect(8, 8, 3, height);
    ctx.font = `12px ${MONO}`;
    ctx.textBaseline = "top";
    let y = 12;
    const line = (text: string, col = INK): void => {
      ctx.fillStyle = col; ctx.fillText(text, 14, y); y += 16;
    };

    // The error the FALL TEST reads, which is the credited one — the plain
    // balance error is what the skater is solving, and past a credit of zero
    // the two are different numbers. Colouring the wrong one puts the HUD in
    // red while the skater is fine, and calm while they are going down.
    const supported = p.fallAuthorityCredit > 0
      ? equilibriumLean(s.latAccel + p.fallAuthorityCredit * s.intAccel, p.gravity)
      : s.leanEq;
    const residual = s.lean - supported;
    // The ceiling is the arms plus, two-footed, the centre-of-pressure shift
    // inside the stance — both are in intAccel, so both belong in the bound.
    const authorityMax = p.internalMax
      + (s.supportMode === 2 ? p.gravity * p.stanceHalfWidth / Math.max(s.legLength, 0.3) : 0);
    const saturated = Math.abs(s.intAccel) >= authorityMax - 1e-3;

    line(`SPEED   ${len(s.vel).toFixed(2)} m/s`, GOLD);
    line(`LEAN    ${d(s.lean)}°   eq ${d(s.leanEq)}°   err ${d(s.balanceError)}°`,
      Math.abs(residual) > p.fallError ? "#ff4d6d" : INK);
    line(`SAVE    ${s.intAccel >= 0 ? " " : ""}${s.intAccel.toFixed(2)} of `
      + `${authorityMax.toFixed(2)} m/s²${saturated ? "  SATURATED" : ""}`
      + (p.fallAuthorityCredit > 0 ? `   fall err ${d(residual)}°` : "   uncredited"),
      saturated ? GOLD : DIM);
    line(`TILT    ${d(s.tiltCmd)}°   angulation ${d(s.tiltCmd - s.lean)}°`);
    line(`KNEE    ${s.knee.toFixed(2)}   support ${s.supportMode === 2 ? "two-foot" : s.supportMode === 1 ? "one-foot" : "none"}`);
    y += 6;

    for (let i = 0; i < 2; i++) {
      const b = s.blade[i];
      const name = i === FOOT.Left ? "L" : "R";
      const mark = i === s.supportFoot ? "▸" : " ";
      line(`${mark}${name} ${codeToString(b.code).padEnd(4)} ${REGIME_NAME[b.regime].padEnd(8)} `
        + `${["flat", "shallow", "moderate", "deep"][b.depth].padEnd(9)} dwell ${b.dwell.toFixed(2)}s`,
        edgeColour(b));
      ctx.fillStyle = DIM;
      ctx.fillText(`   demand ${b.demandRatio.toFixed(2)}  R ${Number.isFinite(b.turnRadius) ? b.turnRadius.toFixed(1) + "m" : "straight"}  N ${b.normalLoad.toFixed(0)}N`, 14, y);
      y += 14;
      bar(20, y, 150, b.demandRatio, b.demandRatio > 1 ? SKIDC : JADE);
      y += 16;
    }

    y += 4;
    if (skidLine) {
      const onset = skidOnsetSpeed(sb.tilt, effectiveRocker(sb.contactS, p), p);
      line(`SKIDS ABOVE  ${onset.toFixed(1)} m/s at this edge`, DIM);
    }
    if (s.fallen) line(`DOWN — ${FALL_NAME[s.fallReason]} · A / Space to stand up`, "#ff4d6d");
    for (const [text, col] of jumpLines) line(text, col);
    for (const [text, col] of movesLines) line(text, col);

    y += 8;
    for (const t of info) line(t, DIM);
  }
}

const clampUnit = (x: number): number => (x < -1 ? -1 : x > 1 ? 1 : x);
