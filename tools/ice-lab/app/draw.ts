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

const PX = 26;                    // pixels per metre at zoom 1

const INK = "#dce9f2";
const DIM = "#5b7386";
const FAINT = "#26323d";
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
}

export const DEFAULT_OPTIONS: DrawOptions = {
  blades: true, carveCircle: true, forces: true, balance: true, tracing: true, hud: true,
};

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

  draw(s: SkaterState, p: Params, opt: DrawOptions, info: string[]): void {
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
    if (opt.blades) this.blades(s);
    if (opt.forces) this.forces(s);
    if (opt.balance) this.balance(s);

    ctx.restore();
    if (opt.hud) this.hud(s, p, info);
  }

  // ── ice ───────────────────────────────────────────────────────────────────

  private grid(s: SkaterState, w: number, h: number): void {
    const ctx = this.ctx;
    const halfW = w / (2 * PX), halfH = h / (2 * PX);
    const x0 = Math.floor(s.pos.x - halfW), x1 = Math.ceil(s.pos.x + halfW);
    const y0 = Math.floor(s.pos.y - halfH), y1 = Math.ceil(s.pos.y + halfH);
    ctx.lineWidth = 1 / PX;
    for (let x = x0; x <= x1; x++) {
      ctx.strokeStyle = x % 5 === 0 ? "#1c2731" : FAINT;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    }
    for (let y = y0; y <= y1; y++) {
      ctx.strokeStyle = y % 5 === 0 ? "#1c2731" : FAINT;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }
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

  private blades(s: SkaterState): void {
    const ctx = this.ctx;
    for (let i = 0; i < 2; i++) {
      const b = s.blade[i];
      if (!b.inContact) continue;
      const t = b.tangent;
      const heel = { x: b.contact.x - t.x * 0.12, y: b.contact.y - t.y * 0.12 };
      const toe = { x: b.contact.x + t.x * 0.13, y: b.contact.y + t.y * 0.13 };
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
    const base = s.blade[s.supportFoot].contact;
    const right = perpLeft(s.heading);
    const L = s.legLength;
    // The COM, drawn where the pendulum actually puts it.
    const comx = base.x - right.x * (L * Math.sin(s.lean));
    const comy = base.y - right.y * (L * Math.sin(s.lean));
    ctx.strokeStyle = s.fallen ? "#ff4d6d" : "#d38bff";
    ctx.lineWidth = 2.4 / PX;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(comx, comy); ctx.stroke();
    ctx.fillStyle = s.fallen ? "#ff4d6d" : "#d38bff";
    ctx.beginPath(); ctx.arc(comx, comy, 0.075, 0, Math.PI * 2); ctx.fill();

    // Where the COM would have to be for the arc it is on. The gap between
    // this line and the last one is the whole balance problem.
    const eq = s.leanEq;
    const ex = base.x - right.x * (L * Math.sin(eq));
    const ey = base.y - right.y * (L * Math.sin(eq));
    ctx.strokeStyle = "rgba(255,201,74,0.85)";
    ctx.lineWidth = 1.4 / PX;
    ctx.setLineDash([0.12, 0.1]);
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(ex, ey); ctx.stroke();
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
    const b = s.blade[s.supportFoot];
    if (b.inContact && Math.abs(b.tilt) > p.flatThreshold) {
      const onset = skidOnsetSpeed(b.tilt, effectiveRocker(b.contactS, p), p);
      line(`SKIDS ABOVE  ${onset.toFixed(1)} m/s at this edge`, DIM);
    }
    if (s.fallen) line(`DOWN — ${FALL_NAME[s.fallReason]} · A / Space to stand up`, "#ff4d6d");

    y += 8;
    for (const t of info) line(t, DIM);
  }
}
