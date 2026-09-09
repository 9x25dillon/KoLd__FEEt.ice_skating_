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
import type { SkaterState, EdgeEvent } from "../sim/types.ts";
import { Renderer, DEFAULT_OPTIONS } from "./draw.ts";
import type { DrawOptions } from "./draw.ts";
import { Panel } from "./panel.ts";
import { Pad } from "./pad.ts";
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
    this.clock.start();
  }

  private tick(): void {
    const it = this.pad.read();
    if (it.reset) this.reset();
    if (it.pause) this.clock.paused = !this.clock.paused;
    if (it.cyclePreset) {
      this.presetIndex = (this.presetIndex + 1) % PRESET_NAMES.length;
      this.panel.load(PRESETS[PRESET_NAMES[this.presetIndex]]);
    }

    this.events.length = 0;
    step(this.state, it, this.params, SIM_DT, this.events);
    this.telemetry.capture(this.state);
    this.telemetry.pushEvents(this.events);
    this.renderer.recordTrace(this.state);
    this.checksums.push(checksum(this.state));
    if (this.checksums.length > SIM_HZ * 30) this.checksums.shift();
  }

  private render(): void {
    const log = this.telemetry.eventLog();
    const recent = log ? log.split("\n").slice(-6).reverse() : [];
    const info = [
      `preset ${PRESET_NAMES[this.presetIndex]}   `
      + (this.clock.paused ? "PAUSED" : `${this.clock.lastSteps} steps/frame`),
      ...recent.map((line) => `· ${line}`),
    ];
    this.renderer.draw(this.state, this.params, this.options, info);
  }

  private reset(): void {
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
