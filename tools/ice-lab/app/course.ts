// app/course.ts — what every game course on the rig shares.
//
// The Figure Eight and the edge course are both display-side game layers: they
// read the skater's state after each step and never write it, and ?playtest=1
// never shows them. This is the shape a course has so the lab, the ghost race
// and the panel can treat any of them alike.

import type { SkaterState } from "../sim/types.ts";

export type RunState = "running" | "done" | "fell";

export interface CourseResult {
  state: RunState;
  seconds: number;
  /** How far round the course, on the course's own scale. Only ever compared with itself. */
  progress: number;
  /** 0 until the course is done. */
  score: number;
}

export interface Course {
  readonly state: RunState;
  readonly ticks: number;
  /** Past the halfway mark: where a race takes its split. */
  readonly pastHalf: boolean;
  /** Once per simulation tick, after step. Reads the state; never writes it. */
  sample(s: SkaterState, dt: number): void;
  result(): CourseResult;
}

// ── the best run, kept ──────────────────────────────────────────────────────

/**
 * The best finished run, and its replay — the ghost is that replay, re-run. A
 * solver version bump (sim/replay.ts) orphans the clip: it no longer parses,
 * and there is simply no ghost rather than one skating physics that no longer
 * exist. The optional fields are per course, for the panel.
 */
export interface Best {
  score: number;
  seconds: number;
  clip: string;
  rms?: number;
  edgeShare?: number;
  clean?: number;
}

interface KeyValue { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function loadBest(store: KeyValue | undefined, key: string): Best | null {
  try {
    const raw = store?.getItem(key);
    if (!raw) return null;
    const b = JSON.parse(raw) as Partial<Best>;
    return typeof b.score === "number" && typeof b.seconds === "number" && typeof b.clip === "string"
      ? b as Best : null;
  } catch {
    return null;
  }
}

export function saveBest(store: KeyValue | undefined, key: string, best: Best): void {
  try { store?.setItem(key, JSON.stringify(best)); } catch { /* full or blocked: keep it for this session */ }
}

// ── words ───────────────────────────────────────────────────────────────────

/** RFO -> "right forward outside": the name the edge course is teaching. */
export function edgeWords(code: string): string {
  if (code.length !== 3 || code === "---") return "off the ice";
  const foot = code[0] === "R" ? "right" : "left";
  const dir = code[1] === "F" ? "forward" : code[1] === "B" ? "backward" : "stationary";
  const side = code[2] === "O" ? "outside" : code[2] === "I" ? "inside" : "flat";
  return `${foot} ${dir} ${side}`;
}

// ── the panel ───────────────────────────────────────────────────────────────

export type PanelLine = [text: string, colour: string];

export const INK = "#dce9f2", DIM = "#5b7386", GOLD = "#ffc94a", JADE = "#7dffc4", RED = "#ff4d6d";

/** Bottom left, narrow enough to clear the ribbon at bottom centre on a 1000 px window. */
export function drawPanel(ctx: CanvasRenderingContext2D, h: number, lines: PanelLine[]): void {
  const width = 360, height = 10 + lines.length * 17;
  const x = 8, y = h - 8 - height;
  ctx.fillStyle = "rgba(7,16,26,0.86)";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = GOLD;
  ctx.fillRect(x, y, 3, height);
  ctx.font = '12px "IBM Plex Mono", ui-monospace, Menlo, monospace';
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  lines.forEach(([text, col], i) => { ctx.fillStyle = col; ctx.fillText(text, x + 10, y + 6 + i * 17); });
}
