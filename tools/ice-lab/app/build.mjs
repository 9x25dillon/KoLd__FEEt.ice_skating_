// tools/ice-lab/app/build.mjs — TypeScript to browser JavaScript, no dependencies.
//
// Node 26 strips types natively, and exposes the same stripper as an API. That
// is the whole build: read each .ts, strip the annotations, rewrite the ".ts"
// in import specifiers to ".js" (Node resolves the former, browsers need the
// latter), and write it out. No bundler, no node_modules, nothing to install.
//
//   node app/build.mjs        ->  build/ , ready to serve
//
// Serve it WITH no-store headers. A plain http.server once let a browser cache
// a stale build and cost a whole play session in SONIC DRIFTER, debugging code
// that had already been fixed:
//
//   node app/build.mjs && node app/serve.mjs

import { stripTypeScriptTypes } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "build");

function emit(dir) {
  mkdirSync(join(out, dir), { recursive: true });
  for (const file of readdirSync(join(root, dir))) {
    if (!file.endsWith(".ts")) continue;
    const src = readFileSync(join(root, dir, file), "utf8");
    const js = stripTypeScriptTypes(src, { mode: "strip" })
      .replace(/(from\s*["'])(\.[^"']*?)\.ts(["'])/g, "$1$2.js$3")
      .replace(/(import\s*["'])(\.[^"']*?)\.ts(["'])/g, "$1$2.js$3");
    writeFileSync(join(out, dir, file.replace(/\.ts$/, ".js")), js);
  }
}

emit("sim");
emit("app");
copyFileSync(join(root, "app/index.html"), join(out, "app/index.html"));
console.log(`built -> ${out}/app/index.html`);
