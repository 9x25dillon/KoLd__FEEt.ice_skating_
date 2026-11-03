// game/composer.ts — a program laid on its music, without any page attached.
//
// The bible's Composer v1 (§09 A), in the owner's terms of 2026-11-02: the
// player picks the event's music and anchors each element to a bar of it. The
// program then runs for the event's whole length, and the HUD cues each
// element as its bar comes round. Whether an element landed on its bar is
// SHOWN, NOT SCORED: no medal, XP, PCS or gate reads `cueResult`. The owner
// decides that later.
//
// The beat grid is tracks.json's own (bpm, offset, beatsPerBar), the same one
// sim/music.ts reads, and the music starts with the run, so bar k begins at
// offset + k bars on the routine's own clock.
import { ELEMENTS, PLAN_EXTRA, validPlan } from "./career.ts";
import type { CareerEvent, ElementId } from "./career.ts";

export interface BeatGrid { bpm: number; offset: number; beatsPerBar: number; barsPerPhrase: number }
export interface Cue { id: ElementId; bar: number }
/** A program on its music: `track` indexes tracks.json; cues in any order. */
export interface Timeline { track: number; cues: Cue[] }

/** Fewest bars between two cues' starts, so each has room to be skated. Authored. */
export const MIN_GAP_BARS = 2;
/** An element done this many bars before its cue starts reads "early". Authored. */
export const CUE_EARLY_BARS = 1;
/** And this many bars after its cue starts reads "late". Authored. */
export const CUE_LATE_BARS = 2;

export type CueResult = "early" | "on" | "late";

export const barSeconds = (g: BeatGrid): number => (60 / g.bpm) * g.beatsPerBar;
/** Seconds from the start of the run to the first beat of bar `bar`. */
export const barStart = (g: BeatGrid, bar: number): number => g.offset + bar * barSeconds(g);
/** Bars that start inside the event, each with a whole bar left to skate it in. */
export function barCount(g: BeatGrid, seconds: number): number {
  return Math.max(0, Math.floor((seconds - g.offset) / barSeconds(g)));
}
/** Whether a bar opens a musical phrase. */
export const phraseStart = (g: BeatGrid, bar: number): boolean => bar % g.barsPerPhrase === 0;

/** The cues by bar: the order the program is skated in. */
export const sortedCues = (t: Timeline): Cue[] => [...t.cues].sort((a, b) => a.bar - b.bar);
/** The program's element order, as career.ts's plans hold it. */
export const timelineOrder = (t: Timeline): ElementId[] => sortedCues(t).map(c => c.id);

/** How the run hears a cue: when its bar starts, and the window it reads "on" within. */
export interface CueTime { id: ElementId; bar: number; at: number; early: number; late: number }
export function cueTimes(g: BeatGrid, t: Timeline): CueTime[] {
  return sortedCues(t).map(c => ({
    id: c.id, bar: c.bar, at: barStart(g, c.bar),
    early: barStart(g, c.bar - CUE_EARLY_BARS), late: barStart(g, c.bar + CUE_LATE_BARS),
  }));
}
/** When an element was finished, against its cue. Shown, not scored. */
export function cueResult(cue: CueTime, finishedAt: number): CueResult {
  return finishedAt < cue.early ? "early" : finishedAt > cue.late ? "late" : "on";
}

export interface TimelineCheck {
  /** Whether it can be saved and skated. */
  ok: boolean;
  /** What stops it, in words. */
  problems: string[];
  /** What is worth knowing but changes nothing: second half, phrase starts. */
  notes: string[];
}

const title = (id: ElementId) => ELEMENTS[id].title;

/** Everything a page needs to say about a timeline before it is saved. */
export function checkTimeline(event: CareerEvent, g: BeatGrid, t: Timeline): TimelineCheck {
  const problems: string[] = [], notes: string[] = [];
  const bars = barCount(g, event.seconds);
  if (!Array.isArray(t.cues) || t.cues.length === 0) return { ok: false, problems: ["The program has no elements."], notes };
  for (const c of t.cues) {
    if (!Object.hasOwn(ELEMENTS, c.id)) problems.push(`Unknown element ${String(c.id)}.`);
    else if (!Number.isInteger(c.bar) || c.bar < 0 || c.bar >= bars)
      problems.push(`${title(c.id)} is off the music: bars run 1 to ${bars} at this event.`);
  }
  if (problems.length) return { ok: false, problems, notes };
  const cues = sortedCues(t);
  for (let i = 1; i < cues.length; i++) {
    const gap = cues[i].bar - cues[i - 1].bar;
    if (gap < MIN_GAP_BARS)
      problems.push(`${title(cues[i - 1].id)} and ${title(cues[i].id)} are ${gap === 0 ? "on the same bar" : `${gap} bar apart`}; leave at least ${MIN_GAP_BARS}.`);
  }
  const order = cues.map(c => c.id);
  if (order.length > event.routine.length + PLAN_EXTRA)
    problems.push(`At most ${PLAN_EXTRA} elements of your own; this has ${order.length - event.routine.length}.`);
  else if (!validPlan(event, order)) {
    const left: ElementId[] = [...(order as ElementId[])];
    const missing = event.routine.filter(need => { const at = left.indexOf(need); if (at < 0) return true; left.splice(at, 1); return false; });
    problems.push(`The event asks for ${missing.map(title).join(", ")}.`);
  }
  const half = event.seconds / 2;
  for (const c of cues) {
    const at = barStart(g, c.bar);
    if ((c.id === "jump" || c.id === "combo") && at >= half) notes.push(`${title(c.id)} at bar ${c.bar + 1} is in the second half.`);
    if (phraseStart(g, c.bar) && c.bar > 0) notes.push(`${title(c.id)} opens a phrase at bar ${c.bar + 1}.`);
  }
  return { ok: problems.length === 0, problems, notes };
}

/**
 * A first layout: the given elements spread evenly over the music, the first
 * on bar 1 and the last a bar before the end. Null when they cannot all fit
 * MIN_GAP_BARS apart.
 */
export function spreadTimeline(event: CareerEvent, g: BeatGrid, track: number, ids: readonly ElementId[]): Timeline | null {
  const bars = barCount(g, event.seconds), last = bars - 2;
  if (ids.length === 0 || last < 0 || (ids.length - 1) * MIN_GAP_BARS > last) return null;
  const step = ids.length > 1 ? last / (ids.length - 1) : 0;
  return { track, cues: ids.map((id, i) => ({ id, bar: Math.round(i * step) })) };
}

/** The same program on other music: each cue keeps its moment, rounded to the new bars. */
export function retime(event: CareerEvent, from: BeatGrid, to: BeatGrid, t: Timeline, track: number): Timeline {
  const bars = barCount(to, event.seconds);
  return {
    track,
    cues: sortedCues(t).map(c => ({
      id: c.id,
      bar: Math.min(Math.max(0, bars - 1), Math.max(0, Math.round((barStart(from, c.bar) - to.offset) / barSeconds(to)))),
    })),
  };
}

/** Cue `i` (by bar order) moved `by` bars. Null when that leaves the music; crowding is the check's to report. */
export function nudge(event: CareerEvent, g: BeatGrid, t: Timeline, i: number, by: number): Timeline | null {
  const cues = sortedCues(t), bars = barCount(g, event.seconds);
  if (!cues[i] || !Number.isInteger(by)) return null;
  const bar = cues[i].bar + by;
  if (bar < 0 || bar >= bars) return null;
  cues[i] = { ...cues[i], bar };
  return { track: t.track, cues };
}

/** Whether cue `i` (by bar order) fills something the event asks for; the earliest of a repeat does. */
export function requiredCues(event: CareerEvent, t: Timeline): boolean[] {
  const needed = [...event.routine];
  return sortedCues(t).map(c => {
    const at = needed.indexOf(c.id);
    if (at >= 0) needed.splice(at, 1);
    return at >= 0;
  });
}

/** One more element, on the first bar at least MIN_GAP_BARS past the last cue. Null when none is left. */
export function addCue(event: CareerEvent, g: BeatGrid, t: Timeline, id: ElementId): Timeline | null {
  if (!Object.hasOwn(ELEMENTS, id) || t.cues.length >= event.routine.length + PLAN_EXTRA) return null;
  const cues = sortedCues(t), bars = barCount(g, event.seconds);
  const bar = cues.length ? cues[cues.length - 1].bar + MIN_GAP_BARS : 0;
  if (bar >= bars) return null;
  return { track: t.track, cues: [...cues, { id, bar }] };
}

/** Cue `i` (by bar order) out. Refused for what the event asks for. */
export function removeCue(event: CareerEvent, t: Timeline, i: number): Timeline | null {
  const cues = sortedCues(t);
  if (!cues[i] || requiredCues(event, t)[i]) return null;
  cues.splice(i, 1);
  return { track: t.track, cues };
}

/** A timeline's shape, from a save or a page; the beat grid's checks are checkTimeline's. */
export function parseTimeline(value: unknown): Timeline | null {
  const v = value as Timeline | null;
  if (!v || typeof v !== "object" || !Number.isInteger(v.track) || v.track < 0 || !Array.isArray(v.cues) || v.cues.length > 16) return null;
  if (!v.cues.every(c => c && typeof c === "object" && typeof c.id === "string" && Object.hasOwn(ELEMENTS, c.id) && Number.isInteger(c.bar) && c.bar >= 0 && c.bar < 1000)) return null;
  return { track: v.track, cues: v.cues.map(c => ({ id: c.id, bar: c.bar })) };
}
