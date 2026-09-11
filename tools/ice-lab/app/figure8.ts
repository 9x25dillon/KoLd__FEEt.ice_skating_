// app/figure8.ts — the Figure Eight, as a game on top of the rig.
//
// A game LAYER: it reads the skater's state and never writes it. sim/ does
// not know this file exists, and ?playtest=1 never shows it — the week-16 gate
// asks whether carving is fun with no score and no art, so a measured block
// can contain neither.
//
// It is the design bible's The Patch in miniature: compulsory school figures,
// "you trace a figure eight and are scored on the tracing itself". And it is
// the pre-production plan's skill metric, figure-eight deviation, under that
// document's definition: RMS distance of the tracing from the reference curve,
// in metres (§6). The tracing is the support blade's contact; the reference is
// the whole figure, both circles, so the distance is to whichever is nearer.
//
// The figure is the outside eight: a right forward outside circle clockwise,
// then a left forward outside circle anticlockwise, meeting where the skater
// starts. Outside edges on both feet, so it cannot be done on a flat blade or
// on the edges a stroke gives you for free.
//
// The course sits at the solver's start pose — (0, 0), facing +x — because
// that is where a reset puts the skater; it never has to be moved to them.

import type { SkaterState } from "../sim/types.ts";
import { codeToString } from "../sim/types.ts";
import type { Camera } from "./camera.ts";

// ── balance levers ──────────────────────────────────────────────────────────
// Every number below is a design decision, not a rule (hand-off §3.3). They
// are here, together, so a change to one is a change you can see.

/**
 * Circle radius, m. Chosen by driving the solver round it (test/figure8.test.ts):
 * at 5 m from 5 m/s a steering bot falls on the second lobe, at 6 m it finishes.
 * A school-figure circle is nearer 3 m, but that asks for a lean the solver
 * cannot enter from upright at these speeds — hand-off finding 4.
 */
export const RADIUS = 6;
/** Every run starts here, so two scores are two skaters on the same task. m/s. */
export const START_SPEED = 5;
/** Required edge per lobe. */
export const LOBE_EDGE = ["RFO", "LFO"] as const;
/** Direction round each circle: -1 clockwise, +1 anticlockwise. */
const LOBE_DIR = [-1, 1] as const;
/** A tracing this far off, RMS, scores nothing for accuracy. m. */
const RMS_ZERO = 1.5;
/** Pace is measured against the figure skated at this speed. m/s. */
const PAR_SPEED = 4;
const WEIGHT = { accuracy: 0.45, edge: 0.40, pace: 0.15 } as const;

export const CENTRES = [{ x: 0, y: -RADIUS }, { x: 0, y: RADIUS }] as const;

export type RunState = "running" | "done" | "fell";

export interface FigureResult {
  state: RunState;
  seconds: number;
  /** §6's figure-eight deviation: RMS of the tracing from the figure, m. */
  rms: number;
  /** Share of on-ice ticks spent on the edge the lobe asks for, 0..1. */
  edgeShare: number;
  /** 0..2: lobes completed plus the fraction of the one under way. */
  progress: number;
  /** Each part 0..100, and the total. The total is 0 until the figure is done. */
  accuracy: number;
  edge: number;
  pace: number;
  score: number;
}

/** Distance from a point to the nearer circle: the figure's distance field. */
export function deviation(x: number, y: number): number {
  const a = Math.abs(Math.hypot(x - CENTRES[0].x, y - CENTRES[0].y) - RADIUS);
  const b = Math.abs(Math.hypot(x - CENTRES[1].x, y - CENTRES[1].y) - RADIUS);
  return Math.min(a, b);
}

const angleAt = (x: number, y: number, lobe: number): number =>
  Math.atan2(y - CENTRES[lobe].y, x - CENTRES[lobe].x);

const wrap = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
};

export class FigureEight {
  state: RunState = "running";
  lobe = 0;
  /** Radians round the current lobe, in its direction. Backwards unwinds. */
  swept = 0;
  ticks = 0;
  private prev: number;
  private sq = 0;
  private samples = 0;
  private onEdge = 0;
  private dt = 0;

  constructor(s: SkaterState) { this.prev = angleAt(s.pos.x, s.pos.y, 0); }

  /** Once per simulation tick, after step. Reads the state; never writes it. */
  sample(s: SkaterState, dt: number): void {
    if (this.state !== "running") return;
    this.ticks++;
    this.dt = dt;
    if (s.fallen) { this.state = "fell"; return; }

    const a = angleAt(s.pos.x, s.pos.y, this.lobe);
    this.swept += wrap(a - this.prev) * LOBE_DIR[this.lobe];
    this.prev = a;

    const b = s.blade[s.supportFoot];
    if (b.inContact) {
      const e = deviation(b.contact.x, b.contact.y);
      this.sq += e * e;
      this.samples++;
      if (codeToString(b.code) === LOBE_EDGE[this.lobe]) this.onEdge++;
    }

    if (this.swept >= 2 * Math.PI) {
      if (this.lobe === 1) { this.state = "done"; this.swept = 2 * Math.PI; return; }
      this.lobe = 1;
      this.swept = 0;
      this.prev = angleAt(s.pos.x, s.pos.y, 1);
    }
  }

  result(): FigureResult {
    const seconds = this.ticks * this.dt;
    const rms = this.samples > 0 ? Math.sqrt(this.sq / this.samples) : 0;
    const edgeShare = this.samples > 0 ? this.onEdge / this.samples : 0;
    const par = (4 * Math.PI * RADIUS) / PAR_SPEED;
    const accuracy = 100 * Math.max(0, 1 - rms / RMS_ZERO);
    const edge = 100 * edgeShare;
    const pace = seconds > 0 ? 100 * Math.min(1, par / seconds) : 0;
    const progress = (this.state === "done" ? 2 : this.lobe + Math.max(0, this.swept) / (2 * Math.PI));
    const total = WEIGHT.accuracy * accuracy + WEIGHT.edge * edge + WEIGHT.pace * pace;
    return {
      state: this.state, seconds, rms, edgeShare, progress, accuracy, edge, pace,
      score: this.state === "done" ? Math.round(total) : 0,
    };
  }
}

// ── the best run, kept ──────────────────────────────────────────────────────

/** The best finished run, and its replay: the ghost is that replay, re-run. */
export interface Best { score: number; seconds: number; rms: number; edgeShare: number; clip: string }

/**
 * Per browser, per course version. A ghost is a replay, so a solver bump
 * (sim/replay.ts) orphans it — the clip no longer parses and there is simply
 * no ghost, rather than one skating somewhere the new physics would not go.
 */
export const BEST_KEY = "edgework-figure8-best/1";

interface KeyValue { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function loadBest(store: KeyValue | undefined): Best | null {
  try {
    const raw = store?.getItem(BEST_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Partial<Best>;
    const ok = typeof b.score === "number" && typeof b.seconds === "number" && typeof b.rms === "number"
      && typeof b.edgeShare === "number" && typeof b.clip === "string";
    return ok ? b as Best : null;
  } catch {
    return null;
  }
}

export function saveBest(store: KeyValue | undefined, best: Best): void {
  try { store?.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* full or blocked: keep it for this session */ }
}

// ── drawing ─────────────────────────────────────────────────────────────────

/** The figure on the ice, in metres, under the transform draw.ts sets. */
export function drawFigure(ctx: CanvasRenderingContext2D, px: number, run: FigureEight | null): void {
  for (let k = 0; k < 2; k++) {
    const active = run?.state === "running" && run.lobe === k;
    ctx.strokeStyle = active ? "rgba(236,246,255,0.60)" : "rgba(236,246,255,0.22)";
    ctx.lineWidth = (active ? 3 : 2) / px;
    ctx.beginPath(); ctx.arc(CENTRES[k].x, CENTRES[k].y, RADIUS, 0, Math.PI * 2); ctx.stroke();
  }
  // What of the lobe under way has been skated, from the crossing, in amber.
  if (run && run.state === "running" && run.swept > 0) {
    const k = run.lobe, from = angleAt(0, 0, k);
    ctx.strokeStyle = "rgba(255,201,74,0.85)";
    ctx.lineWidth = 3.5 / px;
    ctx.beginPath();
    ctx.arc(CENTRES[k].x, CENTRES[k].y, RADIUS, from, from + LOBE_DIR[k] * Math.min(run.swept, 2 * Math.PI),
      LOBE_DIR[k] < 0);
    ctx.stroke();
  }
  // The crossing: where a run starts, and where the second lobe begins.
  ctx.strokeStyle = "rgba(236,246,255,0.7)";
  ctx.lineWidth = 2 / px;
  ctx.beginPath(); ctx.moveTo(0, -0.7); ctx.lineTo(0, 0.7); ctx.stroke();
}

/** Each circle's edge, written in its middle, in screen space so it reads upright. */
export function drawFigureLabels(ctx: CanvasRenderingContext2D, cam: Camera, run: FigureEight | null): void {
  ctx.font = `bold ${Math.max(12, Math.round(0.9 * cam.px))}px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let k = 0; k < 2; k++) {
    const active = run?.state === "running" && run.lobe === k;
    const [x, y] = cam.project(CENTRES[k].x, CENTRES[k].y, 0);
    ctx.fillStyle = active ? "rgba(255,201,74,0.95)" : "rgba(236,246,255,0.35)";
    ctx.fillText(`${LOBE_EDGE[k]} ${LOBE_DIR[k] < 0 ? "↻" : "↺"}`, x, y);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

/** The run, and the best, bottom left. */
export function drawFigurePanel(ctx: CanvasRenderingContext2D, h: number, r: FigureResult | null,
  best: Best | null, newBest: boolean, race: Array<[string, string]> = []): void {
  const lines: Array<[string, string]> = [["FIGURE EIGHT (G) · the outside eight", "#7dffc4"]];
  if (r?.state === "running") {
    const lobe = Math.min(1, Math.floor(r.progress));
    lines.push([`lobe ${lobe + 1} of 2 · hold ${LOBE_EDGE[lobe]} · ${r.seconds.toFixed(1)} s`, "#dce9f2"]);
    lines.push([`off the line ${r.rms.toFixed(2)} m · on the edge ${Math.round(100 * r.edgeShare)}%`, "#dce9f2"]);
  } else if (r?.state === "done") {
    lines.push([`SCORE ${r.score}${newBest ? "   NEW BEST" : ""}`, "#ffc94a"]);
    lines.push([`line ${Math.round(r.accuracy)} · edge ${Math.round(r.edge)} · pace ${Math.round(r.pace)}`
      + ` · ${r.seconds.toFixed(1)} s · ${r.rms.toFixed(2)} m`, "#dce9f2"]);
  } else if (r?.state === "fell") {
    lines.push([`down on lobe ${Math.min(2, Math.floor(r.progress) + 1)} · R to go again`, "#ff4d6d"]);
    lines.push([`off the line ${r.rms.toFixed(2)} m · on the edge ${Math.round(100 * r.edgeShare)}%`, "#5b7386"]);
  }
  lines.push([best ? `best ${best.score} · ${best.seconds.toFixed(1)} s · ${best.rms.toFixed(2)} m`
    : "no best yet: finish one", "#5b7386"]);
  lines.push(...race);
  lines.push(["E/Q foot · Space push · R again · H ghost", "#5b7386"]);
  // Narrow enough to clear the ribbon at bottom centre on a 1000 px window.
  const width = 360, height = 10 + lines.length * 17;
  const x = 8, y = h - 8 - height;
  ctx.fillStyle = "rgba(7,16,26,0.86)";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#ffc94a";
  ctx.fillRect(x, y, 3, height);
  ctx.font = '12px "IBM Plex Mono", ui-monospace, Menlo, monospace';
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  lines.forEach(([text, col], i) => { ctx.fillStyle = col; ctx.fillText(text, x + 10, y + 6 + i * 17); });
}
