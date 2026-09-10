// app/draw.ts — the Ice Lab's picture of what the solver believes.
//
// Rule for everything in here: it renders state, it never computes physics.
// If a number has to be worked out to draw it, the solver should already have
// worked it out and put it on the state — otherwise the overlay and the
// simulation can disagree, and the overlay is the thing you are trusting.

import type { SkaterState, BladeState } from "../sim/types.ts";
import {
  EDGE, REGIME, REGIME_NAME, FALL_NAME, FOOT,
  codeToString, codeSide, EDGE_CODE_NONE,
} from "../sim/types.ts";
import type { Params } from "../sim/params.ts";
import { effectiveRocker, carveRadius, skidOnsetSpeed, equilibriumLean } from "../sim/blade.ts";
import { perpLeft, len } from "../sim/math.ts";
import type { Vec2 } from "../sim/math.ts";
import { PadView } from "./padview.ts";

const PX = 26;                    // pixels per metre at zoom 1

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
}

export const DEFAULT_OPTIONS: DrawOptions = {
  blades: true, carveCircle: true, forces: true, balance: true, tracing: true, hud: true,
  skater: true, pad: true,
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

const edgeColour = (b: BladeState): string => {
  if (b.regime === REGIME.Skid) return SKIDC;
  const side = b.code === EDGE_CODE_NONE ? EDGE.Flat : codeSide(b.code);
  return side === EDGE.Outside ? OUTSIDE : side === EDGE.Inside ? INSIDE : FLATC;
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  /** Persistent blade tracings. The ice keeps the record. */
  trace: TracePoint[][] = [[], []];
  private maxTrace = 4000;

  private canvas: HTMLCanvasElement;
  /** Fed once per tick by the lab; drawn when `opt.pad` is on. */
  readonly pad = new PadView();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
  }

  clearTrace(): void { this.trace = [[], []]; }

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

  draw(s: SkaterState, p: Params, opt: DrawOptions, info: string[], scheme = 0): void {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b1016";
    ctx.fillRect(0, 0, w, h);

    // Camera: centred on the skater, y up.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(PX, -PX);
    ctx.translate(-s.pos.x, -s.pos.y);
    ctx.lineWidth = 1 / PX;

    this.grid(s, w, h);
    if (opt.tracing) this.tracings();
    if (opt.carveCircle) this.carveCircles(s, p);
    if (opt.skater) this.skater(s, p);
    if (opt.blades) this.blades(s);
    if (opt.forces) this.forces(s);
    if (opt.balance) this.balance(s);

    ctx.restore();
    if (opt.hud) this.hud(s, p, info);
    if (opt.pad && w > 640) this.pad.draw(ctx, w - 312, 48, scheme, s);
  }

  // ── ice ───────────────────────────────────────────────────────────────────

  private grid(s: SkaterState, w: number, h: number): void {
    const ctx = this.ctx;
    const halfW = w / (2 * PX), halfH = h / (2 * PX);
    const x0 = Math.floor(s.pos.x - halfW), x1 = Math.ceil(s.pos.x + halfW);
    const y0 = Math.floor(s.pos.y - halfH), y1 = Math.ceil(s.pos.y + halfH);
    // World-anchored ice grain: stable under camera movement and replay.
    ctx.fillStyle = "#102330";
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // One path for the lot: a stroke per square metre is ~3000 draw calls a
    // frame on a wide window, for a texture nobody is reading.
    ctx.lineWidth = 0.6 / PX;
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
    // Training markings repeat across the unbounded simulation surface.
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1 / PX;
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
        ctx.lineWidth = (0.6 + 0.5 * b.depth) / PX;
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
    ctx.fillStyle = "rgba(0,5,15,0.35)";
    ctx.beginPath(); ctx.ellipse(-0.08, -0.10, 0.65, 0.39, 0, 0, Math.PI * 2); ctx.fill();

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

    const torsoX = 0.04 + 0.14 * s.knee;
    const beat = s.strokeTime > 0 ? Math.sin(Math.min(1, s.strokeTime / 0.3) * Math.PI) : 0;
    const braking = s.blade[0].regime === REGIME.Brake || s.blade[1].regime === REGIME.Brake;
    const support = local(s.blade[s.supportFoot].contact);

    for (let i = 0; i < 2; i++) {
      const b = s.blade[i];
      const side = i === FOOT.Left ? 1 : -1;
      let [fx, fy] = b.inContact ? local(b.contact) : [support[0] - 0.42, support[1] + side * 0.16];
      if (s.strokeFoot === i && beat > 0) { fx -= 0.25 * beat; fy += side * 0.35 * beat; }
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

    // Arms: swung fore and aft against each other by the save, like a skater
    // windmilling to stay up. Normalized by the ceiling, so full swing means
    // the arms have nothing left to give.
    const save = clampUnit(s.intAccel / Math.max(p.internalMax, 1e-3));
    const armCol = Math.abs(save) > 0.95 ? GOLD : "#60d9ce";
    stroke([torsoX, 0.18, torsoX - 0.05 + 0.3 * save, 0.48, torsoX + 0.1 + 0.45 * save, 0.66], armCol, 0.11);
    stroke([torsoX, -0.18, torsoX - 0.05 - 0.3 * save, -0.48, torsoX + 0.1 - 0.45 * save, -0.66], armCol, 0.11);

    ctx.fillStyle = "#69e3d3";
    ctx.beginPath(); ctx.ellipse(torsoX, 0, 0.28, 0.23, 0, 0, Math.PI * 2); ctx.fill();
    stroke([torsoX - 0.16, 0, torsoX + 0.18, 0], "#d4fff3", 0.04);
    ctx.fillStyle = "#ebbd9e";
    ctx.beginPath(); ctx.arc(torsoX + 0.3, 0, 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#17263b";
    ctx.beginPath(); ctx.arc(torsoX + 0.26, 0, 0.135, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
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
      ctx.lineWidth = (i === s.supportFoot ? 3.2 : 1.8) / PX;
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
    ctx.lineWidth = 1.2 / PX;
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
      ctx.strokeStyle = col; ctx.lineWidth = wpx / PX;
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
    ctx.lineWidth = 2.4 / PX;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(com.x, com.y); ctx.stroke();
    ctx.fillStyle = s.fallen ? "#ff4d6d" : "#d38bff";
    ctx.beginPath(); ctx.arc(com.x, com.y, 0.075, 0, Math.PI * 2); ctx.fill();

    // Where the COM would have to be for the arc it is on. The gap between
    // this line and the last one is the whole balance problem.
    ctx.strokeStyle = "rgba(255,201,74,0.85)";
    ctx.lineWidth = 1.4 / PX;
    ctx.setLineDash([0.12, 0.1]);
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(eq.x, eq.y); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── the numbers ───────────────────────────────────────────────────────────

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
    const height = 4 + 5 * 16 + 6 + 2 * 46 + 4 + (skidLine ? 16 : 0) + (s.fallen ? 16 : 0)
      + 8 + info.length * 16 + 6;
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

    y += 8;
    for (const t of info) line(t, DIM);
  }
}

const clampUnit = (x: number): number => (x < -1 ? -1 : x > 1 ? 1 : x);
