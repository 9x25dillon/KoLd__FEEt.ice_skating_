// tools/ice-lab/app/card.ts — the session card, rebuilt field by field.
//
// Moved out of collect.mjs so it can be tested without starting a server. The
// rule is the same as it always was: nothing reaches disk that this function
// did not put there. A field not named below does not survive, numbers are
// coerced and rounded, strings are cut to a safe alphabet.
//
// Formats, and `schema` is a FORMAT, not a session counter (a hand-edited card
// once arrived as /2 before /2 existed; number sessions in the filename):
//
//   /1  the five §6 metrics the rig computes, plus context. Edge changes
//       counted every EdgeChanged event, so they mostly counted strokes.
//   /2  edge changes count only what the skater chose (sim/session.ts); jump
//       counts, qualities and a list of landings; and `clip`, naming the
//       replay the card belongs with by its tick count and final digest.
//
// A card with no schema is taken as /1, which is what the collector always
// assumed. A schema it does not know is refused: better no card than one whose
// numbers are read under the wrong definitions.

/** 64 KB is about sixty times the size of an honest /1 card. */
export const MAX_BODY = 64 * 1024;
export const CARD_SCHEMAS = ["edgework-session/1", "edgework-session/2"] as const;
export const MAX_CARD_LANDINGS = 100;

const METRICS = [
  "freePlaySeconds", "skidRatio", "meanLeanDepth", "edgeChangesPerMinute",
  "medianTimeToRetrySeconds", "downSeconds", "falls", "strokes",
  "distanceMetres", "topSpeed", "deepestLean", "timeOnEdgeRatio", "ticks",
  "takeoffs", "jumps", "hops", "landingFalls", "meanTakeoffQuality", "meanLandingQuality",
];
const LANDING = [
  "second", "kind", "revolutions", "shortBy", "rotationCall", "edgeCall", "toe",
  "takeoffQuality", "landingQuality", "height", "airTime", "twoFoot", "stepOut", "fall",
];

export interface CleanCard {
  schema: string;
  at: string;
  scheme: string;
  preset: string;
  note: string;
  params: Record<string, number>;
  clip?: { ticks: number; digest: number };
  metrics: Record<string, number | Array<Record<string, number>>>;
}

const num = (v: unknown): number | null =>
  (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 40): string | null =>
  (typeof v === "string" ? v.slice(0, max).replace(/[^\w .:+-]/g, "") : null);
const round = (v: number): number => Math.round(v * 1e4) / 1e4;
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function clean(card: unknown, now: Date = new Date()): CleanCard | null {
  if (!isObject(card)) return null;
  const schema = card.schema === undefined ? CARD_SCHEMAS[0] : card.schema;
  if (!(CARD_SCHEMAS as readonly unknown[]).includes(schema)) return null;
  const m = card.metrics;
  if (!isObject(m)) return null;

  const metrics: CleanCard["metrics"] = {};
  for (const k of METRICS) {
    const v = num(m[k]);
    if (v !== null) metrics[k] = round(v);
  }
  if (metrics.ticks === undefined) return null;
  if (Array.isArray(m.landings)) {
    metrics.landings = m.landings.slice(0, MAX_CARD_LANDINGS).filter(isObject).map((l) => {
      const out: Record<string, number> = {};
      for (const k of LANDING) {
        const v = num(l[k]);
        if (v !== null) out[k] = round(v);
      }
      return out;
    });
  }

  const params: Record<string, number> = {};
  if (isObject(card.params)) {
    for (const [k, v] of Object.entries(card.params).slice(0, 60)) {
      const n = num(v);
      if (n !== null && /^[A-Za-z][\w]{0,40}$/.test(k)) params[k] = n;
    }
  }

  const out: CleanCard = {
    schema: schema as string,
    at: now.toISOString(),
    scheme: str(card.scheme, 2) ?? "?",
    preset: str(card.preset, 24) ?? "?",
    note: str(card.note, 280) ?? "",
    params,
    metrics,
  };
  if (isObject(card.clip)) {
    const ticks = num(card.clip.ticks), digest = num(card.clip.digest);
    if (ticks !== null && digest !== null && Number.isInteger(ticks) && Number.isInteger(digest)
      && ticks > 0 && ticks <= 36000 && digest >= 0 && digest <= 0xffffffff) {
      out.clip = { ticks, digest };
    }
  }
  return out;
}
