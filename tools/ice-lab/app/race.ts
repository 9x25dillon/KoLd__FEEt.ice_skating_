// app/race.ts — racing a ghost round the Figure Eight.
//
// A ghost is a replay, and a replay verifies tick for tick, so the ghost is not
// an approximation of the run: it is the run, re-simulated. That also means its
// whole future is knowable the moment it is picked. `ghostRun` skates it once,
// through the same tracker the live run uses, and keeps how far round the
// figure it had got by every tick. The gap is then a lookup: find the tick the
// ghost reached where you are now, and subtract.
//
// Like the Figure Eight, a display-side layer: sim/ is only read, through the
// public replay player, and none of it shows under ?playtest=1.
//
// The ghost keeps its own tuning — a replay carries it — so racing a run
// recorded under different parameters is a race between tunings, not only
// between attempts. The panel says so, because that is the more useful race.

import { ReplayPlayer } from "../sim/replay.ts";
import type { Replay } from "../sim/replay.ts";
import { DEFAULT_PARAMS, SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { FigureEight } from "./figure8.ts";
import type { FigureResult } from "./figure8.ts";

/** Where the ghost comes from. H cycles through the ones that exist. */
export const GHOST_SOURCES = ["best", "last", "file", "off"] as const;
export type GhostSource = typeof GHOST_SOURCES[number];

export interface GhostRun {
  /** Furthest round the figure (0..2) by the end of each tick. Never falls back. */
  reach: Float64Array;
  /** Tick the ghost finished the figure, counted from 1 like the recorder; -1 if it never did. */
  finishTick: number;
  /** Tick it came back to the crossing and began the second lobe; -1 if never. */
  splitTick: number;
  result: FigureResult;
  /** A replay that stops verifying is not the run it claims to be. */
  diverged: boolean;
  params: Params;
}

const progressOf = (run: FigureEight): number =>
  (run.state === "done" ? 2 : run.lobe + Math.max(0, run.swept) / (2 * Math.PI));

/** Skate the clip once, now, through the tracker the live run uses. */
export function ghostRun(clip: Replay): GhostRun {
  const player = new ReplayPlayer(clip);
  const run = new FigureEight(player.state);
  const reach = new Float64Array(player.total);
  let furthest = 0, split = -1, finish = -1;
  while (!player.done) {
    player.advance();
    run.sample(player.state, SIM_DT);
    furthest = Math.max(furthest, progressOf(run));
    reach[player.index - 1] = furthest;
    if (split < 0 && run.lobe === 1) split = player.index;
    if (finish < 0 && run.state === "done") finish = player.index;
  }
  return {
    reach: reach.subarray(0, player.index), finishTick: finish, splitTick: split,
    result: run.result(), diverged: player.divergence !== null, params: clip.initial.params,
  };
}

/**
 * Seconds behind the ghost (+) or ahead of it (-): you are `progress` round
 * the figure at `tick`, and the ghost first got that far at some tick of its
 * own. Null when the ghost never got that far at all.
 */
export function timeGap(g: GhostRun, progress: number, tick: number, dt = SIM_DT): number | null {
  const r = g.reach;
  if (r.length === 0 || r[r.length - 1] < progress) return null;
  let lo = 0, hi = r.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r[mid] >= progress) hi = mid; else lo = mid + 1;
  }
  return (tick - (lo + 1)) * dt;
}

/** The tuning parameters the ghost was skated under that the live run is not. */
export function tuningDiffers(ghost: Params, live: Params): string[] {
  return (Object.keys(DEFAULT_PARAMS) as Array<keyof Params>).filter((k) => ghost[k] !== live[k]);
}

const BEHIND = "#ff4d6d", AHEAD = "#7dffc4", DIM = "#5b7386", GOLD = "#ffc94a";
const signed = (s: number): string => `${s >= 0 ? "+" : "−"}${Math.abs(s).toFixed(2)} s`;

/** The race, as panel lines: who the ghost is, the gap now, the split, the verdict. */
export function raceLines(g: GhostRun, label: string, live: FigureResult | null, liveTick: number,
  liveParams: Params, splitGap: number | null, dt = SIM_DT): Array<[string, string]> {
  const name = label.length > 18 ? `${label.slice(0, 17)}…` : label;
  const out: Array<[string, string]> = [[
    `ghost: ${name}` + (g.finishTick > 0
      ? ` · ${(g.finishTick * dt).toFixed(1)} s · ${g.result.score} pts` : " · never finished the eight")
      + (g.diverged ? " · DIVERGED" : ""), DIM]];
  const differs = tuningDiffers(g.params, liveParams);
  if (differs.length > 0) {
    out.push([`tuned differently: ${differs.slice(0, 2).join(", ")}${differs.length > 2 ? ` +${differs.length - 2}` : ""}`, GOLD]);
  }
  if (!live) return out;
  if (live.state === "running" && live.progress > 0.02) {
    const gap = timeGap(g, live.progress, liveTick, dt);
    out.push(gap === null ? ["past where the ghost ever got", AHEAD]
      : [`${signed(gap)} ${gap > 0 ? "behind" : "ahead of"} the ghost`, gap > 0 ? BEHIND : AHEAD]);
  }
  if (splitGap !== null) out.push([`at the crossing ${signed(splitGap)}`, splitGap > 0 ? BEHIND : AHEAD]);
  if (live.state === "done") {
    if (g.finishTick < 0) out.push([`the ghost never finished: you win · ${live.score} pts`, AHEAD]);
    else {
      const d = live.seconds - g.finishTick * dt;
      out.push([d < 0 ? `beat the ghost by ${Math.abs(d).toFixed(2)} s · ${live.score} v ${g.result.score}`
        : `ghost won by ${d.toFixed(2)} s · ${live.score} v ${g.result.score}`, d < 0 ? AHEAD : BEHIND]);
    }
  }
  return out;
}
