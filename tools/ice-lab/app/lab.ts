// app/lab.ts — the Ice Lab.
//
// Wires the fixed-step clock to the solver, the solver to the overlay, and a
// panel of sliders to the parameters, so a tuning session is a thing you do
// with your hands instead of a rebuild. Everything here is presentation and
// glue; no physics is decided in this file.

import { PRESETS, SIM_DT, SIM_HZ } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step, checksum } from "../sim/solver.ts";
import { Telemetry } from "../sim/telemetry.ts";
import { SessionMeter } from "../sim/session.ts";
import type { SkaterState, EdgeEvent } from "../sim/types.ts";
import { Renderer, DEFAULT_OPTIONS } from "./draw.ts";
import type { DrawOptions } from "./draw.ts";
import { Panel } from "./panel.ts";
import { Pad } from "./pad.ts";
import { applyScheme, newSchemeState, SCHEME_LABEL } from "./schemes.ts";
import type { Scheme } from "./schemes.ts";
import { FixedStep } from "./loop.ts";

const PRESET_NAMES = Object.keys(PRESETS);

/**
 * What the lab boots on — `responsive`, not `spec`.
 *
 * `spec` is the baseline every measurement is taken against and it stays that,
 * but it cannot enter an edge deeper than 11 degrees at stroking pace, so
 * handing it to someone as their first thirty seconds of the model is not a
 * fair test of anything: it reads as a broken skater rather than as a recorded
 * defect. Press the preset button (T, or X on a pad) to cycle to it.
 */
const BOOT_PRESET = "responsive";

class Lab {
  private params: Params = { ...PRESETS[BOOT_PRESET] };
  private state: SkaterState;
  private pad = new Pad();
  private renderer: Renderer;
  private panel: Panel;
  private telemetry = new Telemetry(SIM_HZ * 20);   // 20 s in the browser
  private clock: FixedStep;
  private events: EdgeEvent[] = [];
  private options: DrawOptions = { ...DEFAULT_OPTIONS };
  private presetIndex = Math.max(0, PRESET_NAMES.indexOf(BOOT_PRESET));
  private scheme: Scheme = 0;
  private schemeState = newSchemeState();
  private meter = new SessionMeter();

  /**
   * `?playtest=1` hides everything a tester should not see: the sliders, the
   * preset name, the export buttons. What is left is a rink and a scheme
   * labelled A, B or C.
   *
   * pre-production-plan.md §7 is explicit that the labels are blind to the
   * testers AND to the observers, and that the facilitator never explains a
   * failure during a measured block. A panel showing `assisted` and a slider
   * called "internal authority" explains a great deal.
   */
  private playtest = typeof location !== "undefined"
    && new URLSearchParams(location.search).has("playtest");
  private startSpeed = 4.0;
  private checksums: number[] = [];

  constructor(canvas: HTMLCanvasElement, panelRoot: HTMLElement) {
    this.state = createState(this.params, this.startSpeed, 0);
    this.renderer = new Renderer(canvas);
    this.panel = new Panel(panelRoot, this.params, () => { /* live: nothing to rebake */ });
    this.clock = new FixedStep(() => this.tick(), () => this.render());

    const fit = (): void => {
      const r = canvas.parentElement!.getBoundingClientRect();
      canvas.width = Math.floor(r.width);
      canvas.height = Math.floor(r.height);
    };
    fit();
    window.addEventListener("resize", fit);
    this.wireButtons();
    if (this.playtest) this.hideEverythingATesterShouldNotSee();
    this.clock.start();
  }

  /**
   * A tester gets a rink and a letter. Nothing on screen names a preset, an
   * assist tier or a parameter, because §7's facilitator rules exist to stop
   * exactly that: a slider called "internal authority" is an explanation, and
   * explaining a failure during a measured block is the one thing a
   * facilitator may never do.
   */
  private hideEverythingATesterShouldNotSee(): void {
    // The send button stays: a tester who cannot send the session was not
    // playtested, they were just playing.
    for (const sel of ["aside", "#controls", "#keys"]) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) el.style.display = "none";
    }
    const stage = document.getElementById("stage");
    if (stage) stage.style.width = "100vw";
  }

  private tick(): void {
    const c = this.pad.read();
    if (c.reset) this.reset();
    if (c.pause) this.clock.paused = !this.clock.paused;
    if (c.cycleScheme) this.scheme = ((this.scheme + 1) % 3) as Scheme;
    if (c.cyclePreset && !this.playtest) {
      this.presetIndex = (this.presetIndex + 1) % PRESET_NAMES.length;
      this.panel.load(PRESETS[PRESET_NAMES[this.presetIndex]]);
    }

    // Hardware in, intent out. Which of the three schemes is doing that
    // translation is the question the whole exercise is asking.
    const it = applyScheme(this.scheme, c, this.state.heading, this.state.vel, this.state.yawRate,
      this.params, this.schemeState);

    this.events.length = 0;
    step(this.state, it, this.params, SIM_DT, this.events);
    this.meter.sample(this.state, it, this.events, SIM_DT);
    this.telemetry.capture(this.state);
    this.telemetry.pushEvents(this.events);
    this.renderer.recordTrace(this.state);
    this.checksums.push(checksum(this.state));
    if (this.checksums.length > SIM_HZ * 30) this.checksums.shift();
  }

  private render(): void {
    const log = this.telemetry.eventLog();
    const recent = log ? log.split("\n").slice(-6).reverse() : [];
    const info = this.playtest
      ? [`scheme ${SCHEME_LABEL[this.scheme]}` + (this.clock.paused ? "   PAUSED" : "")]
      : [
        `preset ${PRESET_NAMES[this.presetIndex]}   scheme ${SCHEME_LABEL[this.scheme]}   `
        + (this.clock.paused ? "PAUSED" : `${this.clock.lastSteps} steps/frame`),
        ...recent.map((line) => `· ${line}`),
      ];
    this.renderer.draw(this.state, this.params, this.options, info);
  }

  private reset(): void {
    // The meter is NOT reset here. A session is everything the tester did,
    // falls included; resetting the skater is part of playing, not a new run.
    this.state = createState(this.params, this.startSpeed, 0);
    this.telemetry.reset();
    this.renderer.clearTrace();
    this.checksums = [];
  }

  private wireButtons(): void {
    const on = (id: string, fn: () => void): void => {
      document.getElementById(id)?.addEventListener("click", fn);
    };
    on("reset", () => this.reset());
    on("clear-trace", () => this.renderer.clearTrace());
    on("export-csv", () => this.download("edgework-telemetry.csv", this.telemetry.toCsv()));
    on("export-events", () => this.download("edgework-events.txt", this.telemetry.eventLog()));
    on("export-params", () => this.download("edgework-params.json", this.panel.exportJson()));
    on("export-session", () => this.download("edgework-session.json", this.sessionCard()));
    on("send-session", () => { void this.sendSession(); });

    for (const key of Object.keys(this.options) as Array<keyof DrawOptions>) {
      const el = document.getElementById(`opt-${key}`) as HTMLInputElement | null;
      if (!el) continue;
      el.checked = this.options[key];
      el.addEventListener("change", () => { this.options[key] = el.checked; });
    }

    const speed = document.getElementById("start-speed") as HTMLInputElement | null;
    if (speed) {
      speed.value = String(this.startSpeed);
      speed.addEventListener("input", () => {
        this.startSpeed = Number(speed.value);
        const out = document.getElementById("start-speed-val");
        if (out) out.textContent = `${this.startSpeed.toFixed(1)} m/s`;
      });
    }
  }

  /**
   * What this session measured: the §6 metrics, the scheme that produced them,
   * and the parameters they were produced under.
   *
   * No names, no accounts, no free text, nothing about the person — the payload
   * is entirely numbers about a simulation. That is not only a privacy
   * position, it is what makes the data comparable between testers.
   */
  private sessionCard(): string {
    return JSON.stringify({
      schema: "edgework-session/1",
      scheme: SCHEME_LABEL[this.scheme],
      preset: PRESET_NAMES[this.presetIndex],
      params: JSON.parse(this.panel.exportJson()).changed,
      metrics: this.meter.summary(),
    }, null, 2);
  }

  /**
   * Post the session card to whatever is collecting, and say so plainly.
   *
   * Same origin by default, so a rig served from the collector needs no
   * configuration and no CORS. `?collect=<url>` points it somewhere else, which
   * is how a build hosted on GitHub Pages reports to a box that is not GitHub.
   * When there is nothing to post to, the file is handed over instead — an
   * offline session is still a session.
   */
  private async sendSession(): Promise<void> {
    const button = document.getElementById("send-session") as HTMLButtonElement | null;
    const say = (text: string, done = false): void => {
      if (!button) return;
      button.textContent = text;
      button.disabled = done;
    };
    const endpoint = new URLSearchParams(location.search).get("collect") ?? "/api/session";
    const card = this.sessionCard();
    say("sending…");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: card,
      });
      if (!res.ok) throw new Error(String(res.status));
      say("sent — thank you", true);
    } catch {
      say("saved to a file instead");
      this.download("edgework-session.json", card);
    }
  }

  /**
   * Hand the file over.
   *
   * A plain <a download> is inert inside a sandboxed viewer, so this is only
   * reliable when the page is served locally — which is how the rig is meant
   * to be used. The CSV is also on the clipboard path below for that reason.
   */
  private download(name: string, text: string): void {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    void navigator.clipboard?.writeText(text).catch(() => { /* no clipboard, no matter */ });
  }
}

const canvas = document.getElementById("ice") as HTMLCanvasElement | null;
const panel = document.getElementById("panel");
if (canvas && panel) new Lab(canvas, panel);
