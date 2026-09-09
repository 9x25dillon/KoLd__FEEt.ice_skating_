// tools/ice-lab/app/serve.mjs — a static server that will not cache.
//
// The no-store headers are the entire reason this file exists rather than
// `python3 -m http.server`.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "build");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const port = Number(process.env.PORT ?? 8123);

createServer(async (req, res) => {
  const rel = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));

  // REDIRECT rather than serve the page at "/". The page is at build/app/, and
  // its own script tag is `./lab.js` — served at the root, that resolves to
  // /lab.js and 404s, so the rink comes up blank with no error anywhere the
  // user can see. Redirecting keeps every relative path in the page honest:
  // ./lab.js -> /app/lab.js, and lab.js's own ../sim/params.js -> /sim/params.js.
  if (rel === "/" || rel === "/app") {
    res.writeHead(302, { location: "/app/" }).end();
    return;
  }
  const path = join(root, rel.endsWith("/") ? join(rel, "index.html") : rel);
  if (!path.startsWith(root)) { res.writeHead(403).end("no"); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, {
      "content-type": TYPES[extname(path)] ?? "application/octet-stream",
      "cache-control": "no-store, no-cache, must-revalidate",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`ice lab -> http://localhost:${port}/`));
