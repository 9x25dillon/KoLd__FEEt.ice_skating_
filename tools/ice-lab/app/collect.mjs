// tools/ice-lab/app/collect.mjs — serve the rig, and collect what it measures.
//
// One file, zero dependencies, meant to run on a small box behind Caddy or
// nginx. It does three things:
//
//   GET  /                serve the built rig (same origin, so no CORS games)
//   POST /api/session     accept one session card, append it to a JSONL file
//   GET  /api/sessions    hand the whole file back, if you know the token
//
//   node app/collect.mjs                    -> http://localhost:8124/
//   COLLECT_TOKEN=... PORT=8124 node app/collect.mjs
//
// WHAT IT DELIBERATELY DOES NOT DO.
//
// No accounts, no cookies, no sessions, no analytics, no IP logging. The
// payload is numbers about a simulation — how long someone played, how deep
// they leaned, how often the edge let go — and nothing about the person. That
// matters most for the people most likely to be handed a controller first,
// which in this project's case is somebody's nephew, and the cheapest way to
// comply with every rule about children's data is to hold none of it.
//
// The body is size-capped, shape-checked and rewritten before it is stored, so
// what lands on disk is the fields this project defined and not whatever was
// posted. A field that is not in the schema below does not survive.

import { createServer } from "node:http";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { join, extname, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "build");
const dataDir = process.env.COLLECT_DIR ?? join(here, "..", "sessions");
const dataFile = join(dataDir, "sessions.jsonl");
const token = process.env.COLLECT_TOKEN ?? "";
const port = Number(process.env.PORT ?? 8124);

const TYPES = {
  ".html": "text/html", ".js": "text/javascript",
  ".css": "text/css", ".json": "application/json",
};

/** 64 KB is about sixty times the size of an honest session card. */
const MAX_BODY = 64 * 1024;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v, max = 40) =>
  (typeof v === "string" ? v.slice(0, max).replace(/[^\w .:+-]/g, "") : null);

/**
 * Rebuild the card from scratch. Nothing reaches disk that this function did
 * not put there, which is the only input-validation strategy worth trusting.
 */
function clean(card) {
  if (!card || typeof card !== "object") return null;
  const m = card.metrics;
  if (!m || typeof m !== "object") return null;
  const metrics = {};
  for (const k of [
    "freePlaySeconds", "skidRatio", "meanLeanDepth", "edgeChangesPerMinute",
    "medianTimeToRetrySeconds", "downSeconds", "falls", "strokes",
    "distanceMetres", "topSpeed", "deepestLean", "timeOnEdgeRatio", "ticks",
  ]) {
    const v = num(m[k]);
    if (v !== null) metrics[k] = Math.round(v * 1e4) / 1e4;
  }
  if (metrics.ticks === undefined) return null;

  const params = {};
  if (card.params && typeof card.params === "object") {
    for (const [k, v] of Object.entries(card.params).slice(0, 60)) {
      const n = num(v);
      if (n !== null && /^[A-Za-z][\w]{0,40}$/.test(k)) params[k] = n;
    }
  }
  return {
    schema: "edgework-session/1",
    at: new Date().toISOString(),
    scheme: str(card.scheme, 2) ?? "?",
    preset: str(card.preset, 24) ?? "?",
    note: str(card.note, 280) ?? "",
    params,
    metrics,
  };
}

function send(res, code, body, type = "application/json") {
  res.writeHead(code, {
    "content-type": type,
    "cache-control": "no-store",
    // The rig may be served from somewhere else (GitHub Pages, say) and still
    // post here. Same origin is tidier; both are supported.
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, GET, OPTIONS",
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("too big");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

createServer(async (req, res) => {
  const url = (req.url ?? "/").split("?")[0];

  if (req.method === "OPTIONS") return send(res, 204, "");

  if (req.method === "POST" && url === "/api/session") {
    try {
      const card = clean(JSON.parse(await readBody(req)));
      if (!card) return send(res, 400, JSON.stringify({ error: "not a session card" }));
      await mkdir(dataDir, { recursive: true });
      await appendFile(dataFile, JSON.stringify(card) + "\n");
      console.log(`session: scheme ${card.scheme} preset ${card.preset} `
        + `${card.metrics.freePlaySeconds?.toFixed(0)}s ${card.metrics.falls} falls`);
      return send(res, 200, JSON.stringify({ ok: true }));
    } catch {
      return send(res, 400, JSON.stringify({ error: "bad body" }));
    }
  }

  if (req.method === "GET" && url === "/api/sessions") {
    const given = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!token || given !== token) return send(res, 404, JSON.stringify({ error: "not found" }));
    try {
      return send(res, 200, await readFile(dataFile, "utf8"), "application/x-ndjson");
    } catch {
      return send(res, 200, "", "application/x-ndjson");
    }
  }

  // Everything else is the rig itself.
  if (req.method !== "GET") return send(res, 405, JSON.stringify({ error: "no" }));
  const rel = normalize(decodeURIComponent(url));
  if (rel === "/" || rel === "/app") {
    res.writeHead(302, { location: "/app/" });
    return res.end();
  }
  const path = join(root, rel.endsWith("/") ? join(rel, "index.html") : rel);
  if (!path.startsWith(root)) return send(res, 403, "no", "text/plain");
  try {
    const body = await readFile(path);
    res.writeHead(200, {
      "content-type": TYPES[extname(path)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    send(res, 404, "not found", "text/plain");
  }
}).listen(port, () => {
  console.log(`ice lab + collector -> http://localhost:${port}/`);
  console.log(`sessions -> ${dataFile}`);
  if (!token) console.log("COLLECT_TOKEN is unset, so /api/sessions stays closed.");
});
