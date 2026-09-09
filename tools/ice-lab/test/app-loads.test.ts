// Does the browser half of the rig actually load?
//
// The tests next door prove the simulation is right. Nothing proved the page
// runs at all — and it twice did not, in one session: once because the server
// served index.html at a URL where its own `./lab.js` resolved to a 404, and
// once because a renamed export left `import { SCHEME_NAME }` pointing at
// nothing. An ES module that fails to link takes the WHOLE page with it, in
// silence, and the rink comes up blank with no error a user can see.
//
// There is no `tsc` in this environment (see the hand-off, §5.9), so this is
// the substitute: import every app module against a DOM stub thin enough to
// write in thirty lines, and assert the things a type checker would have.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

/** A canvas context whose every method is a no-op and every property a number. */
function fakeContext(): unknown {
  return new Proxy({}, {
    get: (_t, prop) => (prop === "canvas" ? {} : () => undefined),
    set: () => true,
  });
}

class El {
  tag: string;
  children: El[] = [];
  style: Record<string, string> = {};
  width = 900;
  height = 600;
  checked = false;
  value = "";
  private text = "";
  constructor(tag: string) { this.tag = tag; }
  appendChild(c: El): El { this.children.push(c); return c; }
  append(...cs: El[]): void { this.children.push(...cs); }
  addEventListener(): void { /* nothing to dispatch */ }
  getContext(): unknown { return fakeContext(); }
  getBoundingClientRect(): { width: number; height: number } { return { width: 900, height: 600 }; }
  get parentElement(): El { return this; }
  set innerHTML(_v: string) { this.children = []; }
  set textContent(v: string) { this.text = v; }
  get textContent(): string { return this.text; }
}

/**
 * Node 26 already defines some of these as getter-only globals — `navigator`
 * is one — so each is installed defensively and skipped where the runtime has
 * its own. `pad.ts` reaches for `navigator.getGamepads?.()` optionally, which
 * is exactly why that call is written that way.
 */
function put(name: string, value: unknown): void {
  const g = globalThis as Record<string, unknown>;
  if (name in g) return;
  try {
    g[name] = value;
  } catch {
    Object.defineProperty(g, name, { value, configurable: true, writable: true });
  }
}

function installDom(): void {
  const made = new Map<string, El>();
  const byId = (id: string): El => {
    if (!made.has(id)) made.set(id, new El(`#${id}`));
    return made.get(id)!;
  };
  put("document", {
    createElement: (t: string) => new El(t),
    getElementById: byId,
    querySelector: (sel: string) => byId(sel),
    body: new El("body"),
  });
  put("window", { addEventListener: () => { /* nothing to dispatch */ } });
  put("location", { search: "" });
  put("performance", { now: () => 0 });
  // The clock must not actually start: one frame is enough to prove the wiring.
  put("requestAnimationFrame", () => 0);
}

test("the lab constructs against a stub DOM", async () => {
  // Importing a module proves its imports RESOLVE. It does not prove the code
  // runs: `newSchemeState()` in a class field was simply never imported, so
  // the module linked cleanly and the constructor threw `ReferenceError` in the
  // browser, blanking the page. A type checker would have said so; there is
  // none here, so the test constructs the thing.
  //
  // getElementById hands back an element for every id, so `new Lab(...)` at the
  // foot of lab.ts actually runs.
  installDom();
  await import(join(root, "app", "lab.ts"));
});

test("every app module links and evaluates", async () => {
  installDom();
  const files = readdirSync(join(root, "app")).filter((f) => f.endsWith(".ts"));
  assert.ok(files.length >= 6, `expected the app to have modules: ${files.join(", ")}`);
  for (const f of files) {
    // A missing or renamed export throws here, exactly as it would in a
    // browser — except here it names the file.
    await import(join(root, "app", f));
  }
});

test("every slider names a parameter that exists", async () => {
  installDom();
  const { Panel } = await import(join(root, "app", "panel.ts"));
  const { DEFAULT_PARAMS } = await import(join(root, "sim", "params.ts"));

  const keys = new Set(Object.keys(DEFAULT_PARAMS));
  const src = readFileSync(join(root, "app", "panel.ts"), "utf8");
  const named = [...src.matchAll(/\{\s*key:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(named.length > 10, "the panel should have sliders");
  for (const k of named) {
    assert.ok(keys.has(k), `slider "${k}" is not a field of Params`);
  }

  // And it builds without throwing, which is the other half of what a browser
  // would have told us the slow way.
  const root_ = new El("div");
  const panel = new Panel(root_ as unknown as HTMLElement, { ...DEFAULT_PARAMS }, () => { /* no-op */ });
  panel.refresh();
});

test("the three control schemes are labelled A, B and C and nothing else", async () => {
  installDom();
  const { SCHEME_LABEL, SCHEME } = await import(join(root, "app", "schemes.ts"));
  // pre-production-plan.md §7: "Schemes are labelled A/B/C to the testers AND
  // to the observers." A label naming the bible's proposal is not blind, and
  // this rig shipped one for an hour, so it is asserted rather than trusted.
  assert.deepEqual([...SCHEME_LABEL], ["A", "B", "C"]);
  assert.deepEqual(Object.keys(SCHEME), ["A", "B", "C"]);
});
