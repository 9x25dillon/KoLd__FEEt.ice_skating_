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
import type { Controls, Pad } from "../app/pad.ts";
import type { FixedStep } from "../app/loop.ts";
import type { ReplayRecorder, ReplayPlayer } from "../sim/replay.ts";
import type { SessionMeter } from "../sim/session.ts";
import type { SkaterState } from "../sim/types.ts";

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

test("every data/ file game/main.ts fetches is one app/build.mjs actually ships", () => {
  // Found the hard way: step-features.json was fetched by game/main.ts and
  // scored real routines against it, but build.mjs's copy list still only
  // had the three files spin scoring needed — a 404 in the actual served
  // build, invisible to every test that imports the module rather than
  // fetching it. The build's own list is now checked against the source
  // directly, so a new fetch() with no matching copy fails loudly here
  // instead of silently in a browser.
  const main = readFileSync(join(root, "game", "main.ts"), "utf8");
  const fetched = [...main.matchAll(/fetch\([`"]\.\.\/data\/([\w.-]+)/g)].map((m) => m[1]);
  assert.ok(fetched.length >= 2, "game/main.ts should fetch at least the jump and spin score data");
  const build = readFileSync(join(root, "app", "build.mjs"), "utf8");
  const shipped = new Set([...build.matchAll(/"([\w.-]+\.(?:csv|json))"/g)].map((m) => m[1]));
  for (const f of fetched) assert.ok(shipped.has(f), `game/main.ts fetches "${f}" but app/build.mjs never copies it into build/data/`);
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

interface LabHarness {
  tick(): void;
  render(): void;
  reset(): void;
  loadReplay(file: File): Promise<void>;
  clock: FixedStep;
  pad: Pad;
  state: SkaterState;
  recorder: ReplayRecorder;
  player: ReplayPlayer | null;
  meter: SessionMeter;
  replayMessage: string;
}

async function makeLab(): Promise<LabHarness> {
  installDom();
  const { Lab } = await import("../app/lab.ts");
  return new Lab(new El("canvas") as unknown as HTMLCanvasElement,
    new El("aside") as unknown as HTMLElement) as unknown as LabHarness;
}

test("pause and resume both read the controller, and reset starts a fresh replay", async () => {
  const lab = await makeLab();
  let controls: Controls = lab.pad.read();
  lab.pad.read = () => controls;
  lab.tick();
  assert.equal(lab.recorder.ticks, 1);
  controls = { ...controls, pause: true };
  lab.tick();
  assert.equal(lab.clock.paused, true);
  assert.equal(lab.state.tick, 1, "pausing must not advance physics");
  controls = { ...controls, pause: false }; lab.render();
  controls = { ...controls, pause: true }; lab.render();
  assert.equal(lab.clock.paused, false, "resume must be polled even when physics is stopped");
  controls = { ...controls, pause: false }; lab.tick();
  assert.equal(lab.recorder.ticks, 2);
  lab.reset();
  assert.equal(lab.state.tick, 0);
  assert.equal(lab.recorder.ticks, 0);
  assert.equal(lab.meter.summary().ticks, 2, "resetting a clip does not erase playtest history");
});

test("replay playback verifies without contaminating live session metrics or recording", async () => {
  const lab = await makeLab();
  for (let i = 0; i < 8; i++) lab.tick();
  const before = lab.meter.summary();
  await lab.loadReplay(new File([lab.recorder.toJson()], "clip.json"));
  assert.ok(lab.player);
  for (let i = 0; i < 12; i++) lab.tick();
  assert.equal(lab.player.index, 8);
  assert.equal(lab.player.divergence, null);
  assert.equal(lab.clock.paused, true);
  assert.deepEqual(lab.meter.summary(), before);
  assert.equal(lab.recorder.ticks, 8);
  lab.render();
  assert.match(document.getElementById("replay-status")!.textContent!, /Verified 8 ticks/);
  lab.reset(); lab.tick();
  assert.equal(lab.player, null);
  assert.equal(lab.recorder.ticks, 1);
  assert.equal(lab.meter.summary().ticks, 9);
});

test("an invalid replay leaves live recording usable and reports the error", async () => {
  const lab = await makeLab();
  lab.tick();
  await lab.loadReplay(new File(["{}"], "bad.json"));
  assert.equal(lab.player, null);
  assert.equal(lab.clock.paused, false);
  assert.match(lab.replayMessage, /Could not open replay/);
  lab.tick();
  assert.equal(lab.recorder.ticks, 2);
});

test("reset cancels a pending file read rather than entering stale playback", async () => {
  const lab = await makeLab(); lab.tick();
  const source = lab.recorder.toJson();
  let finish!: (text: string) => void;
  const pending = lab.loadReplay({ size: source.length,
    text: () => new Promise<string>(resolve => { finish = resolve; }) } as File);
  lab.reset(); finish(source); await pending;
  assert.equal(lab.player, null);
  assert.equal(lab.clock.paused, false);
  assert.equal(lab.recorder.ticks, 0);
});

test("in the lab, clicking L3 no longer changes the course; keyboard G still does", async () => {
  // L3 is held for scheme C's arms (app/schemes.ts). It used to be the next
  // course too, and a course change resets the skater — so a player holding
  // L3 into a jump would have been thrown back to a start line. The lab reads
  // a real Pad here, with a fake gamepad and a keyboard it can press.
  const lab = await makeLab() as LabHarness & { courseKind: string | null };
  const { Pad } = await import("../app/pad.ts");
  const keys = new Map<string, (e: unknown) => void>();
  const target = { addEventListener: (type: string, f: (e: unknown) => void) => keys.set(type, f) };
  let buttons: number[] = [];
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  Object.defineProperty(nav, "getGamepads", { configurable: true, value: () => [{
    connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })),
  }] });
  try {
    lab.pad = new Pad(target as unknown as HTMLElement);
    lab.tick();
    assert.equal(lab.courseKind, null, "no course to begin with");
    for (const held of [[10], [10], [], [10], []]) { buttons = held; lab.tick(); }
    assert.equal(lab.courseKind, null, "L3 pressed, held and pressed again: still no course");
    keys.get("keydown")!({ key: "G", preventDefault: () => undefined });
    lab.tick();
    assert.equal(lab.courseKind, "figure8", "G is the next course, as it always was");
    keys.get("keyup")!({ key: "G" });
    lab.tick();
    keys.get("keydown")!({ key: "g", preventDefault: () => undefined });
    lab.tick();
    assert.equal(lab.courseKind, "edges", "and the next one after that");
  } finally {
    // The other tests here run with no pad connected.
    Object.defineProperty(nav, "getGamepads", { configurable: true, value: () => [] });
  }
});
