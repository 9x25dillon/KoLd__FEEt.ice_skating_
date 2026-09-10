// app/ribbon.ts — the Edge Ribbon, bible §4.6: "the only permanent element".
//
// A thin arc at the lower edge of the screen, read peripherally rather than
// looked at. Four channels, each one field of the state:
//
//   curvature   the carve the support blade is actually tracing — drawn as
//               the next few metres of path, bending the way the skater turns
//   side        inside or outside edge, coded by SHAPE as well as colour so it
//               survives colour blindness: outside solid, inside dashed, flat
//               dotted, a skid short-broken and amber
//   thickness   lean depth
//   marker      knee pressure, as a bead that runs up the ribbon
//
// pre-production-plan.md §1 builds it because it is under test too, so unlike
// the input panel it stays on under ?playtest=1.

import type { SkaterState } from "../sim/types.ts";
import { EDGE, REGIME, EDGE_CODE_NONE, codeSide } from "../sim/types.ts";
import type { Params } from "../sim/params.ts";

const PX_PER_M = 32;
const AHEAD_M = 4.5;

/**
 * The next AHEAD_M metres of a path of constant curvature (1/m, + = turning
 * left), as screen offsets from the ribbon's base: x right, y DOWN, so the
 * path runs up the screen. Pure, so test/ribbon.test.ts can check its bend.
 */
export function ribbonPath(curvature: number, steps = 24): Array<[number, number]> {
  const ds = AHEAD_M / steps;
  const pts: Array<[number, number]> = [[0, 0]];
  let x = 0, y = 0, th = 0;
  for (let i = 0; i < steps; i++) {
    th -= curvature * ds;
    x += Math.sin(th) * ds * PX_PER_M;
    y -= Math.cos(th) * ds * PX_PER_M;
    pts.push([x, y]);
  }
  return pts;
}

export function drawRibbon(ctx: CanvasRenderingContext2D, w: number, h: number,
  s: SkaterState, p: Params): void {
  const b = s.blade[s.supportFoot];
  const cx = w / 2, by = h - 16;
  ctx.save();
  ctx.lineCap = "round";
  if (!b.inContact) {
    // In the air there is no edge to report. A faint stub says so.
    ctx.strokeStyle = "rgba(220,233,242,0.18)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, by); ctx.lineTo(cx, by - 30); ctx.stroke();
    ctx.restore();
    return;
  }
  const k = Number.isFinite(b.turnRadius) && b.turnRadius < 1e5 ? Math.sign(b.tilt) / b.turnRadius : 0;
  const side = b.code === EDGE_CODE_NONE ? EDGE.Flat : codeSide(b.code);
  const skid = b.regime === REGIME.Skid;
  const pts = ribbonPath(k);

  ctx.strokeStyle = skid ? "#ffc94a" : side === EDGE.Outside ? "#5aa9ff" : side === EDGE.Inside ? "#ff5d7a" : "#9fb3c2";
  ctx.lineWidth = 2 + 8 * Math.min(1, Math.abs(s.lean) / 0.7);
  ctx.setLineDash(skid ? [4, 3] : side === EDGE.Outside ? [] : side === EDGE.Inside ? [10, 6] : [2, 7]);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(cx + pts[0][0], by + pts[0][1]);
  for (const [x, y] of pts) ctx.lineTo(cx + x, by + y);
  ctx.stroke();
  ctx.setLineDash([]);

  // The knee: a bead that climbs the ribbon as the leg bends.
  const at = pts[Math.round(Math.max(0, Math.min(1, s.knee)) * (pts.length - 1))];
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#dce9f2";
  ctx.beginPath(); ctx.arc(cx + at[0], by + at[1], 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  void p;
}
