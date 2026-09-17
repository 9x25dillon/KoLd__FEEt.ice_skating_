// app/edges.ts — the edge course: a slalom whose gates are named edges.
//
// A game layer like the Figure Eight (app/course.ts): it reads the state and
// never writes it, and ?playtest=1 never shows it.
//
// What it teaches is the edge NAMES. Each gate asks for one — "LFI, left
// forward inside" — and the name is checked against the support blade at the
// moment it crosses the gate line. The weave alternates turn direction, and
// each gate's edge is one that turns that way, so reading the name tells you
// what to do: RFO and LFI both turn right, LFO and RFI both turn left, and
// which one the gate wants decides the foot. Every forward edge appears twice.
// Backward edges are not here, because nothing short of a jump turns the
// skater round.
//
// The course runs along +x from the solver's start pose, so a reset puts the
// skater on the start line with no moving of anything.

import type { SkaterState } from "../sim/types.ts";
import { codeToString } from "../sim/types.ts";
import type { Camera } from "./camera.ts";
import type { Course, CourseResult, RunState, Best, PanelLine } from "./course.ts";
import { edgeWords, INK, DIM, GOLD, JADE, RED } from "./course.ts";

// ── balance levers ──────────────────────────────────────────────────────────
// Design decisions, not rules (hand-off §3.3), kept together.

/**
 * Metres between gates along the course. Chosen by driving the solver through
 * it (test/figurebot.ts, 2026-09-11): a steering bot that asks for each lean a
 * reaction time ahead finished 12 m with 6 of 8 clean and 14 m with 7, and
 * fell before the last gate of 16 m, where the course is long enough to bleed
 * speed to 2 m/s. The lean arrives about half a second after it is asked for,
 * and the blade carves the other way first — 14 m leaves time for both.
 */
export const GATE_SPACING = 14;
/** How far each gate sits off the centre line, alternating sides. m. */
export const WEAVE = 1.5;
/** Gate opening, m. */
export const GATE_WIDTH = 2.6;
/** Every run starts here, so two scores are the same task. m/s. */
export const START_SPEED = 5;
/** Pace is measured against the course skated at this speed. m/s. */
const PAR_SPEED = 4.5;
/**
 * A tracing this far off `guideY`, RMS, scores nothing for line — the same
 * idea as the Figure Eight's `RMS_ZERO` (app/figure8.ts), against this
 * course's own weave rather than a circle. Authored, not measured: a touch
 * under `WEAVE` itself, so drifting flat past the gate you are aiming for
 * already costs real accuracy rather than only a missed gate.
 */
const RMS_ZERO = 1.2;
const WEIGHT = { clean: 0.6, accuracy: 0.2, pace: 0.2 } as const;

/** Right turns at the +y gates, left turns at the -y gates: each edge turns its gate's way. */
export const EDGE_SEQUENCE = ["RFO", "LFO", "LFI", "RFI", "RFO", "LFO", "LFI", "RFI"] as const;

export interface Gate { x: number; y: number; edge: string }

export const GATES: Gate[] = EDGE_SEQUENCE.map((edge, i) => ({
  x: GATE_SPACING * (i + 0.5), y: (i % 2 === 0 ? 1 : -1) * WEAVE, edge,
}));

/** The line a skater would weave through the gates on: a sine through every apex. */
export const guideY = (x: number): number => WEAVE * Math.sin((Math.PI * x) / GATE_SPACING);

export const EDGES_BEST_KEY = "edgework-edges-best/1";

export type GateOutcome = "clean" | "wrong" | "missed";
export interface GateResult { gate: number; outcome: GateOutcome; code: string }

export interface EdgeResult extends CourseResult {
  clean: number;
  wrong: number;
  missed: number;
  pace: number;
  gates: GateResult[];
  /** RMS distance from `guideY`, m — the same measure figure8.ts's `deviation()` takes from a circle. */
  rms: number;
  accuracy: number;
}

/** Where the tracing is: the support blade on the ice, or the body above it. */
function tracePoint(s: SkaterState): { x: number; y: number } {
  const b = s.blade[s.supportFoot];
  return b.inContact ? b.contact : s.pos;
}

export class EdgeCourse implements Course {
  state: RunState = "running";
  ticks = 0;
  /** Index of the gate you are heading for. */
  next = 0;
  readonly gates: GateResult[] = [];
  private lastX: number;
  private dt = 0;
  private sq = 0;
  private samples = 0;

  constructor(s: SkaterState) { this.lastX = tracePoint(s).x; }

  get pastHalf(): boolean { return this.next >= GATES.length / 2; }

  sample(s: SkaterState, dt: number): void {
    if (this.state !== "running") return;
    this.ticks++;
    this.dt = dt;
    if (s.fallen) { this.state = "fell"; return; }
    const p = tracePoint(s);
    const dev = p.y - guideY(p.x);
    this.sq += dev * dev;
    this.samples++;
    const g = GATES[this.next];
    if (this.lastX < g.x && p.x >= g.x) {
      const b = s.blade[s.supportFoot];
      const code = b.inContact ? codeToString(b.code) : "---";
      const through = Math.abs(p.y - g.y) <= GATE_WIDTH / 2;
      this.gates.push({ gate: this.next, code, outcome: !through ? "missed" : code === g.edge ? "clean" : "wrong" });
      this.next++;
      if (this.next === GATES.length) this.state = "done";
    }
    this.lastX = p.x;
  }

  result(): EdgeResult {
    const seconds = this.ticks * this.dt;
    const count = (o: GateOutcome): number => this.gates.filter((g) => g.outcome === o).length;
    const clean = count("clean");
    const par = GATES[GATES.length - 1].x / PAR_SPEED;
    const pace = seconds > 0 ? 100 * Math.min(1, par / seconds) : 0;
    const from = this.next > 0 ? GATES[this.next - 1].x : 0;
    const to = this.next < GATES.length ? GATES[this.next].x : from;
    const along = this.state === "done" || to === from ? 0
      : Math.min(1, Math.max(0, (this.lastX - from) / (to - from)));
    const rms = this.samples > 0 ? Math.sqrt(this.sq / this.samples) : 0;
    const accuracy = 100 * Math.max(0, 1 - rms / RMS_ZERO);
    const total = WEIGHT.clean * (100 * clean) / GATES.length + WEIGHT.accuracy * accuracy + WEIGHT.pace * pace;
    return {
      state: this.state, seconds, progress: this.next + along,
      score: this.state === "done" ? Math.round(total) : 0,
      clean, wrong: count("wrong"), missed: count("missed"), pace, gates: this.gates.slice(), rms, accuracy,
    };
  }
}

// ── drawing ─────────────────────────────────────────────────────────────────

const colourOf = (course: EdgeCourse | null, i: number): string => {
  const r = course?.gates[i];
  if (r) return r.outcome === "clean" ? "rgba(125,255,196,0.85)" : r.outcome === "wrong" ? "rgba(255,77,109,0.85)"
    : "rgba(159,179,194,0.35)";
  return course?.state === "running" && course.next === i ? "rgba(255,201,74,0.95)" : "rgba(236,246,255,0.45)";
};

/** The weave and the gates, on the ice, in metres, under draw.ts's transform. */
export function drawGates(ctx: CanvasRenderingContext2D, px: number, course: EdgeCourse | null): void {
  const end = GATES[GATES.length - 1].x + GATE_SPACING / 2;
  ctx.strokeStyle = "rgba(236,246,255,0.14)";
  ctx.lineWidth = 2 / px;
  ctx.setLineDash([0.5, 0.4]);
  ctx.beginPath();
  for (let x = 0; x <= end; x += 0.25) {
    if (x === 0) ctx.moveTo(x, guideY(x)); else ctx.lineTo(x, guideY(x));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  GATES.forEach((g, i) => {
    const col = colourOf(course, i);
    ctx.strokeStyle = col;
    ctx.lineWidth = (course?.next === i ? 3 : 2) / px;
    ctx.beginPath(); ctx.moveTo(g.x, g.y - GATE_WIDTH / 2); ctx.lineTo(g.x, g.y + GATE_WIDTH / 2); ctx.stroke();
    ctx.fillStyle = col;
    for (const e of [-1, 1]) {
      ctx.beginPath(); ctx.arc(g.x, g.y + e * GATE_WIDTH / 2, 0.14, 0, Math.PI * 2); ctx.fill();
    }
  });
  // The finish: a line across the course after the last gate.
  ctx.strokeStyle = "rgba(236,246,255,0.5)";
  ctx.lineWidth = 2 / px;
  ctx.beginPath(); ctx.moveTo(end, -WEAVE - 2); ctx.lineTo(end, WEAVE + 2); ctx.stroke();
}

/** Each gate's edge, standing above it, in screen space so it reads upright. */
export function drawGateLabels(ctx: CanvasRenderingContext2D, cam: Camera, course: EdgeCourse | null): void {
  ctx.font = `bold ${Math.max(11, Math.round(0.7 * cam.px))}px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  GATES.forEach((g, i) => {
    const [x, y] = cam.project(g.x, g.y + Math.sign(g.y) * (GATE_WIDTH / 2 + 0.3), 1.1);
    ctx.fillStyle = colourOf(course, i);
    ctx.fillText(g.edge, x, y);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

/** The panel's course lines: the gate you are heading for, and the edge you are on. */
export function edgeLines(course: EdgeCourse | null, s: SkaterState, best: Best | null, newBest: boolean): PanelLine[] {
  const lines: PanelLine[] = [["EDGE COURSE (G) · the slalom", JADE]];
  const r = course?.result();
  if (course && r?.state === "running") {
    const g = GATES[course.next];
    const b = s.blade[s.supportFoot];
    const on = b.inContact ? codeToString(b.code) : "---";
    lines.push([`gate ${course.next + 1} of ${GATES.length}: ${g.edge} · ${edgeWords(g.edge)}`, GOLD]);
    lines.push([`you are on ${on} · ${edgeWords(on)}`, on === g.edge ? JADE : on[2] === "-" || on === "---" ? DIM : RED]);
    const last = course.gates[course.gates.length - 1];
    if (last) {
      const want = GATES[last.gate].edge;
      lines.push(last.outcome === "clean" ? [`gate ${last.gate + 1} clean on ${want}`, JADE]
        : last.outcome === "wrong" ? [`gate ${last.gate + 1} wanted ${want}, you were on ${last.code}`, RED]
          : [`gate ${last.gate + 1} missed`, DIM]);
    }
    lines.push([`clean ${r.clean} · wrong ${r.wrong} · missed ${r.missed} · off the line ${r.rms.toFixed(2)} m`, INK]);
  } else if (r?.state === "done") {
    lines.push([`SCORE ${r.score}${newBest ? "   NEW BEST" : ""}`, GOLD]);
    lines.push([`clean ${r.clean} of ${GATES.length} · line ${Math.round(r.accuracy)} · pace ${Math.round(r.pace)}`
      + ` · ${r.seconds.toFixed(1)} s · ${r.rms.toFixed(2)} m`, INK]);
  } else if (r?.state === "fell" && course) {
    lines.push([`down before gate ${course.next + 1} · R to go again`, RED]);
  }
  lines.push([best ? `best ${best.score} · ${best.seconds.toFixed(1)} s · ${best.clean ?? "?"} of ${GATES.length} clean`
    + (best.rms !== undefined ? ` · ${best.rms.toFixed(2)} m` : "") : "no best yet: finish one", DIM]);
  return lines;
}
