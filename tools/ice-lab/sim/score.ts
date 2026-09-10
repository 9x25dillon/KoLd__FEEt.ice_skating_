// tools/ice-lab/sim/score.ts — src/reference/ScoreCalculator.cs, for one jump,
// reading the data rather than carrying it.
//
// Convention 3.2: scoring is data, never code. Every base value, GOE step,
// base-value factor, mandatory GOE reduction and fall deduction here comes out
// of data/scale-of-values.csv and data/calls-and-deductions.csv, parsed from
// text the caller supplies — node:fs in the tests, fetch() in the lab — because
// sim/ must stay a pure module that runs in a browser and ports to C++.
//
// Where ScoreCalculator.cs and the data disagree, the data wins, because the
// data is what a rules change patches. The one place they do: the reference's
// JudgeGoe caps a wrong edge at min(v, -1), while the data file says an `e`
// carries a mandatory -3 to -4. This uses the data.
//
// Not a judging model. One jump, nine judges, a trimmed mean — enough to put a
// number under a landing in the rig, not a Kiss & Cry.

import type { JumpResult } from "./types.ts";
import { JUMP_CODE, JUMP_NONE, ROTATION_CALL, ROTATION_MARK, EDGE_CALL, EDGE_MARK } from "./jump.ts";
import { rng, clamp, lerp, saturate } from "./math.ts";

/** Fields in order, quoted fields and doubled quotes honoured. No type coercion. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => {
    if (r.length !== head.length) throw new Error(`CSV row has ${r.length} fields, header has ${head.length}`);
    return Object.fromEntries(head.map((h, i) => [h, r[i]]));
  });
}

export interface SovRow { code: string; revolutions: number; rotationsActual: number; baseValue: number; goeStep: number }

export interface CallRule {
  /** Multiplies base value; null where the data describes a rule rather than a factor. */
  bvFactor: number | null;
  /** Mandatory GOE reduction, the lesser end of the data's range, in whole steps. */
  goeReduction: number;
}

export interface ScoreTables {
  sov: Map<string, SovRow>;
  /** Keyed `${kind}:${code}` — rotation:q, edge:e, rotation: (clean). */
  calls: Map<string, CallRule>;
  /** GOE every judge must give a fall. */
  fallGoe: number;
  /** Deduction for the n-th fall (0-based), by the data's schedule. */
  fallDeductions: Array<{ from: number; to: number; each: number }>;
}

const num = (s: string, what: string): number => {
  const v = Number(s);
  if (!Number.isFinite(v)) throw new Error(`${what}: "${s}" is not a number`);
  return v;
};

export function loadTables(sovCsv: string, callsCsv: string): ScoreTables {
  const sov = new Map<string, SovRow>();
  for (const r of parseCsv(sovCsv)) {
    sov.set(r.code, {
      code: r.code, revolutions: num(r.revolutions, r.code), rotationsActual: num(r.rotations_actual, r.code),
      baseValue: num(r.base_value, r.code), goeStep: num(r.goe_step, r.code),
    });
  }

  const calls = new Map<string, CallRule>();
  let fallGoe = -5;
  const fallDeductions: ScoreTables["fallDeductions"] = [];
  for (const r of parseCsv(callsCsv)) {
    if (r.kind === "rotation" || r.kind === "edge") {
      const factor = Number(r.base_value_effect);
      const m = /mandatory\s+-(\d+)/.exec(r.goe_effect);
      calls.set(`${r.kind}:${r.code}`, {
        bvFactor: r.base_value_effect !== "" && Number.isFinite(factor) ? factor : null,
        goeReduction: m ? Number(m[1]) : 0,
      });
    } else if (r.kind === "deduction") {
      const fall = /^Fall \((\d+)\w*(?: and (\d+)\w*| onward)\)/.exec(r.name);
      if (!fall) continue;
      const each = /-(\d+(?:\.\d+)?) each/.exec(r.notes);
      if (!each) throw new Error(`fall deduction "${r.name}" has no amount`);
      fallDeductions.push({
        from: Number(fall[1]), to: fall[2] ? Number(fall[2]) : Infinity, each: Number(each[1]),
      });
      const forced = /GOE forced to (-\d+)/.exec(r.goe_effect);
      if (forced) fallGoe = Number(forced[1]);
    }
  }
  return { sov, calls, fallGoe, fallDeductions };
}

export const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Total deduction for `falls` falls in a segment. */
export function fallDeduction(t: ScoreTables, falls: number): number {
  let d = 0;
  for (let n = 1; n <= falls; n++) {
    const band = t.fallDeductions.find((b) => n >= b.from && n <= b.to);
    if (!band) throw new Error(`no fall deduction for fall ${n}`);
    d += band.each;
  }
  return round2(d);
}

/** Nine judges; drop the highest and lowest, average the remaining seven. */
export function trimmedMean(v: readonly number[]): number {
  if (v.length < 3) throw new Error("a trimmed mean needs at least three marks");
  const s = [...v].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 1; i < s.length - 1; i++) sum += s[i];
  return sum / (s.length - 2);
}

export interface JumpValue {
  /** As the protocol sheet writes it: the attempt, with its calls. "3Lz<e". */
  label: string;
  /** The SOV row actually scored: a downgraded 3Lz is scored as a 2Lz. */
  scoredAs: string;
  baseValue: number;
  goeStep: number;
}

/** Base value with the rotation and edge calls applied. Null for a hop. */
export function jumpValue(t: ScoreTables, r: JumpResult): JumpValue | null {
  if (r.kind === JUMP_NONE || r.revolutions < 1) return null;
  const code = JUMP_CODE[r.kind];
  const label = `${r.revolutions}${code}${ROTATION_MARK[r.rotationCall]}${EDGE_MARK[r.edgeCall]}`;
  let n = r.revolutions, factor = 1;
  if (r.rotationCall === ROTATION_CALL.Downgraded) n -= 1;
  else factor *= t.calls.get(`rotation:${ROTATION_MARK[r.rotationCall]}`)?.bvFactor ?? 1;
  if (r.edgeCall !== EDGE_CALL.Clean) factor *= t.calls.get(`edge:${EDGE_MARK[r.edgeCall]}`)?.bvFactor ?? 1;
  const scoredAs = n >= 1 ? `${n}${code}` : "";
  const row = t.sov.get(scoredAs);
  if (!row) return { label, scoredAs, baseValue: 0, goeStep: 0 };
  return { label, scoredAs, baseValue: round2(row.baseValue * factor), goeStep: round2(row.goeStep * factor) };
}

/** A standard normal from two uniforms, for judge noise. */
function gaussian(u: () => number): number {
  const a = Math.max(u(), 1e-12), b = u();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

/**
 * Nine GOE marks, seeded — ScoreCalculator.cs's JudgeGoe, cut to what the rig
 * has. A judge is a person, not a formula: each has a strictness about
 * blemishes and some noise, and the seed comes from the landing tick so a
 * replay always re-scores the same.
 */
export function judgePanel(t: ScoreTables, r: JumpResult, seed: number, judges = 9): number[] {
  const u = rng(seed);
  const quality = saturate(0.6 * r.landingQuality + 0.4 * r.takeoffQuality);
  let mandatory = 0;
  if (r.rotationCall !== ROTATION_CALL.Clean)
    mandatory += t.calls.get(`rotation:${ROTATION_MARK[r.rotationCall]}`)?.goeReduction ?? 0;
  if (r.edgeCall !== EDGE_CALL.Clean)
    mandatory += t.calls.get(`edge:${EDGE_MARK[r.edgeCall]}`)?.goeReduction ?? 0;
  const blemishes = (r.stepOut ? 1 : 0) + (r.twoFoot ? 1 : 0);
  const marks: number[] = [];
  for (let j = 0; j < judges; j++) {
    const strictness = 0.5 + 0.5 * u();
    let v = lerp(-5, 5, quality) - strictness * blemishes - mandatory + 0.5 * gaussian(u);
    if (r.fall) v = t.fallGoe;
    marks.push(clamp(Math.round(v), -5, 5));
  }
  return marks;
}

export interface JumpScore extends JumpValue { panel: number[]; goe: number; score: number }

export function scoreJump(t: ScoreTables, r: JumpResult, seed = r.tick): JumpScore | null {
  const v = jumpValue(t, r);
  if (!v) return null;
  const panel = judgePanel(t, r, seed >>> 0);
  const goe = trimmedMean(panel);
  return { ...v, panel, goe: round2(goe), score: round2(v.baseValue + goe * v.goeStep) };
}
