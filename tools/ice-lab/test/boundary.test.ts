// The boundary between the simulation and everything that looks at it.
//
// Carried over from SONIC DRIFTER (test/boundary.test.ts), where the same
// pattern keeps a physics library from being tuned for playability. Here it
// enforces the rule the UE5 port depends on and that KOLD-007 asks for:
// KoLdSimCore may depend on nothing but Core. If the simulation ever reaches
// for the DOM, a canvas, a clock or a parameter panel, it stops being a pure
// function and every replay, ghost and server-side check goes with it.
//
// This reads the actual import statements. A comment saying the layers are
// separate is a hope; this is the separation.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

function sourcesIn(dir: string): Array<{ file: string; text: string }> {
  return readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ file: `${dir}/${f}`, text: readFileSync(join(root, dir, f), "utf8") }));
}

function importsOf(text: string): string[] {
  const out: string[] = [];
  const re = /(?:from|import)\s+["']([^"']+)["']/g;
  let m = re.exec(text);
  while (m) { out.push(m[1]); m = re.exec(text); }
  return out;
}

test("the simulation never imports the app", () => {
  for (const { file, text } of sourcesIn("sim")) {
    for (const spec of importsOf(text)) {
      assert.ok(!spec.includes("app/"),
        `${file} imports ${spec}: the solver must not know a renderer exists`);
      assert.ok(spec.startsWith("./") || spec.startsWith("node:"),
        `${file} imports ${spec}: sim/ may only import sim/`);
    }
  }
});

test("the simulation never touches the DOM, a clock, or the network", () => {
  // Everything here would break determinism, headless execution, or both.
  const banned = [
    /\bdocument\b/, /\bwindow\b/, /\bnavigator\b/, /\bfetch\s*\(/,
    /\brequestAnimationFrame\b/, /\blocalStorage\b/, /\bperformance\s*\.\s*now\b/,
    /\bDate\s*\.\s*now\b/, /\bnew\s+Date\b/, /\bMath\s*\.\s*random\b/,
  ];
  for (const { file, text } of sourcesIn("sim")) {
    // Strip comments first: these words are discussed in the prose.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const re of banned) {
      assert.ok(!re.test(code), `${file} uses ${re}: the solver must stay a pure function`);
    }
  }
});

test("the simulation allocates no engine types and declares no enums", () => {
  // `enum` is not erasable syntax, and this rig runs on Node's native type
  // stripping with zero dependencies. One enum and nothing runs at all.
  for (const { file, text } of sourcesIn("sim")) {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/\benum\s+\w/.test(code), `${file} declares an enum, which type stripping cannot emit`);
    assert.ok(!/\bnamespace\s+\w/.test(code), `${file} declares a namespace`);
  }
});

test("nothing anywhere uses syntax Node's type stripping cannot erase", () => {
  // The rig has zero dependencies because Node 26 strips types itself, and
  // strip-only mode refuses anything that would need to EMIT runtime code:
  // enums, namespaces, and constructor parameter properties. The last one is
  // easy to write by reflex and the failure arrives at build time, in the
  // browser, not here — so it is checked here.
  for (const dir of ["sim", "app"]) {
    for (const { file, text } of sourcesIn(dir)) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      assert.ok(!/\bconstructor\s*\([^)]*\b(private|public|protected|readonly)\s/s.test(code),
        `${file} uses a constructor parameter property, which strip-only mode refuses`);
      assert.ok(!/\benum\s+\w/.test(code), `${file} declares an enum`);
      assert.ok(!/\bnamespace\s+\w/.test(code), `${file} declares a namespace`);
    }
  }
});

test("the app may read the simulation, but only through sim/", () => {
  for (const { file, text } of sourcesIn("app")) {
    for (const spec of importsOf(text)) {
      const ok = spec.startsWith("./") || spec.startsWith("../sim/") || spec.startsWith("node:");
      assert.ok(ok, `${file} imports ${spec}: the app may only reach into sim/`);
    }
  }
});
