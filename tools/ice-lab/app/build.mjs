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

/**
 * Everything in one file, for hosts that cannot serve a module graph.
 *
 * The rig is ES modules and stays that way — `build/app/` is the real artifact
 * and what GitHub Pages serves. But a published Artifact page is a single
 * document, so the same code has to arrive as one script.
 *
 * This is a bundler in forty lines, and it is only that small because the
 * codebase is deliberately plain: named imports and exports, no default
 * exports, no re-exports, no circular dependencies. `test/boundary.test.ts`
 * keeps it that way for the UE5 port's sake, and this is the second thing that
 * discipline paid for.
 *
 * Modules are wrapped rather than concatenated. Two of them define a local
 * called `axis` and mean entirely different things by it, so a flat concat
 * would silently take one of them.
 */
function bundle(modules) {
  const IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)\.js["'];?/g;
  // The import regex eats the extension, so put it back: module names are keys.
  const key = (from, spec) => {
    const dir = from.split("/")[0];
    const bare = spec.startsWith("../")
      ? spec.replace("../", "")
      : `${dir}/${spec.replace(/^\.\//, "")}`;
    return `${bare}.js`;
  };

  const parsed = new Map();
  for (const [name, src] of modules) {
    const deps = [];
    const body = src.replace(IMPORT, (_m, names, spec) => {
      const target = key(name, spec);
      deps.push(target);
      // `a as b` is destructuring spelled differently.
      return `const {${names.replace(/\s+as\s+/g, ": ")}} = __m[${JSON.stringify(target)}];`;
    });
    const exports = [...body.matchAll(/^export\s+(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)]
      .map((m) => m[1]);
    parsed.set(name, { body: body.replace(/^export\s+/gm, ""), deps, exports });
  }

  // Depth-first, dependencies first. No cycles to worry about.
  const order = [];
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const d of parsed.get(name)?.deps ?? []) {
      if (!parsed.has(d)) throw new Error(`${name} imports ${d}, which is not in the bundle`);
      visit(d);
    }
    order.push(name);
  };
  for (const name of parsed.keys()) visit(name);

  return ["const __m = {};", ...order.map((name) => {
    const m = parsed.get(name);
    return `__m[${JSON.stringify(name)}] = (() => {\n${m.body}\n`
      + `return {${m.exports.join(", ")}};\n})();`;
  })].join("\n\n");
}

emit("sim");
emit("app");
emit("game");
for (const page of ["index.html", "controller.html"]) copyFileSync(join(root, "game", page), join(out, "game", page));
mkdirSync(join(out, "game/art"), { recursive: true });
for (const file of readdirSync(join(root, "game/art"))) {
  if (/\.(png|webp|jpg)$/.test(file)) copyFileSync(join(root, "game/art", file), join(out, "game/art", file));
}
copyFileSync(join(root, "app/index.html"), join(out, "app/index.html"));

// The rhythm layer's tracks (game/audio/README.md): media plus the manifest,
// not the README — served beside the page, never bundled into code.
mkdirSync(join(out, "game/audio"), { recursive: true });
for (const f of readdirSync(join(root, "game/audio"))) {
  if (f.endsWith(".md")) continue;
  copyFileSync(join(root, "game/audio", f), join(out, "game/audio", f));
}

// The scoring tables, as data beside the page rather than code inside it
// (convention 3.2). The lab fetches them to score a landed jump; a host that
// cannot serve them — the single-file bundle — simply shows no score.
mkdirSync(join(out, "data"), { recursive: true });
for (const f of ["scale-of-values.csv", "calls-and-deductions.csv", "spin-features.json", "step-features.json", "segment-rules.csv"]) {
  copyFileSync(join(root, "..", "..", "data", f), join(out, "data", f));
}

// A root entry point, because the page lives at build/app/ and its own script
// tag is `./lab.js`. Served at "/", that resolves to /lab.js and 404s, and the
// rink comes up blank with no error anywhere a user can see — which is exactly
// what happened. serve.mjs redirects; a static host like GitHub Pages cannot,
// so the redirect ships as a file.
writeFileSync(join(out, "index.html"), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Ice Lab</title>
<meta http-equiv="refresh" content="0; url=./app/">
<link rel="canonical" href="./app/">
</head>
<body style="background:#0b0f14;color:#c8d3dd;font:14px system-ui;margin:0;padding:2rem">
<p><a href="./app/" style="color:#e2a94e">Ice Lab &rarr;</a></p>
</body>
</html>
`);

// The single-file build. `app/lab.ts` boots itself off the DOM, so the bundle
// is the whole rig and the host page only has to provide #ice and #panel.
const single = [];
for (const dir of ["sim", "app"]) {
  for (const file of readdirSync(join(out, dir))) {
    if (!file.endsWith(".js")) continue;
    single.push([`${dir}/${file}`, readFileSync(join(out, dir, file), "utf8")]);
  }
}
writeFileSync(join(out, "ice-lab.bundle.js"), bundle(single));

console.log(`built -> ${out}/app/index.html`);
console.log(`bundle -> ${out}/ice-lab.bundle.js`);
