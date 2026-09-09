// app/panel.ts — the tuning surface.
//
// The whole reason the rig exists in a browser: a slider you can move while
// skating, against a solver that is otherwise exactly the one being ported.
// Every control writes straight into the live Params, and validate() runs on
// every change so an unskateable set says so rather than behaving strangely.

import { DEFAULT_PARAMS, PRESETS, validate, leanLoopResponse } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";

interface Slider {
  key: keyof Params;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Shown in degrees, stored in radians. */
  deg?: boolean;
  note?: string;
}

const GROUPS: Array<{ title: string; note: string; sliders: Slider[] }> = [
  {
    title: "Bite",
    note: "The first thing to tune, and the least defensible. c1 above ~1 is not friction — it is the edge cutting a groove and pushing on its wall.",
    sliders: [
      { key: "biteC0", label: "c0 · flat lateral μ", min: 0, max: 0.4, step: 0.005 },
      { key: "biteC1", label: "c1 · per sin|θ|", min: 0, max: 8, step: 0.05 },
      { key: "sharpness", label: "sharpness", min: 0.2, max: 1.5, step: 0.01 },
      { key: "iceHardness", label: "ice hardness", min: 0.3, max: 1.5, step: 0.01 },
    ],
  },
  {
    title: "Blade",
    note: "Rocker sets every arc: R = ρ / sin θ. The toe fraction is why turns happen 'on the rocker'.",
    sliders: [
      { key: "rocker", label: "rocker ρ (m)", min: 1.4, max: 3.0, step: 0.01 },
      { key: "rockerToeFraction", label: "toe fraction", min: 0.3, max: 1.0, step: 0.01 },
      { key: "maxTilt", label: "max blade tilt", min: 0.3, max: 1.4, step: 0.01, deg: true },
    ],
  },
  {
    title: "Balance",
    note: "Kp must exceed g. Damping and the angulation limit together decide whether a deep edge can be entered from upright at all.",
    sliders: [
      { key: "balanceKp", label: "Kp", min: 10, max: 90, step: 0.5 },
      { key: "balanceKd", label: "Kd", min: 0, max: 40, step: 0.5 },
      { key: "angulationLimit", label: "angulation limit", min: 0.05, max: 1.0, step: 0.01, deg: true },
      { key: "controlLatency", label: "control latency (s)", min: 0, max: 0.30, step: 0.005 },
      { key: "internalMax", label: "internal authority", min: 0, max: 3.0, step: 0.05,
        note: "Proportional only — turning this up past ~2 destabilizes the loop." },
      { key: "maxLean", label: "max body lean", min: 0.3, max: 1.4, step: 0.01, deg: true },
    ],
  },
  {
    title: "Ice and air",
    sliders: [
      { key: "muGlide", label: "μ glide", min: 0, max: 0.03, step: 0.0005 },
      { key: "muSkid", label: "μ skid", min: 0, max: 0.8, step: 0.005 },
      { key: "cdA", label: "CdA (m²)", min: 0, max: 1.0, step: 0.005 },
    ],
    note: "",
  },
  {
    title: "Stroke",
    sliders: [
      { key: "strokePower", label: "push power (m/s²)", min: 0, max: 8, step: 0.05 },
      { key: "strokeBeta", label: "splay β", min: 0.1, max: 1.4, step: 0.01, deg: true },
      { key: "strokeEdge", label: "push edge", min: 0.08, max: 0.9, step: 0.01, deg: true },
      { key: "strokeDuration", label: "push duration (s)", min: 0.05, max: 0.8, step: 0.01 },
    ],
    note: "",
  },
  {
    title: "Edge classification",
    note: "Scoring reads the ESTABLISHED timestamp, not the first tick over a threshold.",
    sliders: [
      { key: "flatThreshold", label: "flat threshold", min: 0.01, max: 0.3, step: 0.002, deg: true },
      { key: "flatHysteresis", label: "hysteresis", min: 0, max: 0.1, step: 0.001, deg: true },
      { key: "depthShallow", label: "shallow above", min: 0.05, max: 0.6, step: 0.005, deg: true },
      { key: "depthDeep", label: "deep above", min: 0.1, max: 1.0, step: 0.005, deg: true },
      { key: "minDwell", label: "min dwell (s)", min: 0.02, max: 0.5, step: 0.005 },
    ],
  },
];

export class Panel {
  private inputs: Array<{ s: Slider; el: HTMLInputElement; out: HTMLElement }> = [];
  private errorBox: HTMLElement;
  private statusBox: HTMLElement;

  private params: Params;
  private onChange: () => void;

  constructor(root: HTMLElement, params: Params, onChange: () => void) {
    this.params = params;
    this.onChange = onChange;
    root.innerHTML = "";

    const presets = document.createElement("div");
    presets.className = "presets";
    for (const name of Object.keys(PRESETS)) {
      const b = document.createElement("button");
      b.textContent = name;
      b.title = name === "spec"
        ? "Exactly what the engineering package and design bible specify, untuned."
        : "A tuning pass. See test/balance.test.ts for what it buys.";
      b.onclick = () => this.load(PRESETS[name]);
      presets.appendChild(b);
    }
    root.appendChild(presets);

    this.statusBox = document.createElement("div");
    this.statusBox.className = "status";
    root.appendChild(this.statusBox);

    this.errorBox = document.createElement("div");
    this.errorBox.className = "errors";
    root.appendChild(this.errorBox);

    for (const g of GROUPS) {
      const sec = document.createElement("section");
      const h = document.createElement("h3");
      h.textContent = g.title;
      sec.appendChild(h);
      if (g.note) {
        const n = document.createElement("p");
        n.className = "note";
        n.textContent = g.note;
        sec.appendChild(n);
      }
      for (const s of g.sliders) sec.appendChild(this.slider(s));
      root.appendChild(sec);
    }
    this.refresh();
  }

  private slider(s: Slider): HTMLElement {
    const row = document.createElement("label");
    row.className = "row";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = s.label;
    if (s.note) name.title = s.note;
    const el = document.createElement("input");
    el.type = "range";
    el.min = String(s.deg ? s.min * 180 / Math.PI : s.min);
    el.max = String(s.deg ? s.max * 180 / Math.PI : s.max);
    el.step = String(s.deg ? Math.max(0.1, s.step * 180 / Math.PI) : s.step);
    const out = document.createElement("span");
    out.className = "val";
    el.addEventListener("input", () => {
      const v = Number(el.value);
      (this.params[s.key] as number) = s.deg ? (v * Math.PI) / 180 : v;
      this.refresh();
      this.onChange();
    });
    row.append(name, el, out);
    this.inputs.push({ s, el, out });
    return row;
  }

  load(p: Params): void {
    Object.assign(this.params, p);
    this.refresh();
    this.onChange();
  }

  /** Redraw the control values from the params, e.g. after loading a preset. */
  refresh(): void {
    for (const { s, el, out } of this.inputs) {
      const raw = this.params[s.key] as number;
      const shown = s.deg ? (raw * 180) / Math.PI : raw;
      el.value = String(shown);
      out.textContent = s.deg
        ? `${shown.toFixed(1)}°`
        : shown < 0.01 ? shown.toExponential(1) : shown.toFixed(shown < 1 ? 3 : 1);
    }
    const r = leanLoopResponse(this.params);
    this.statusBox.textContent =
      `lean loop  ωn ${r.wn.toFixed(2)} rad/s   ζ ${r.zeta.toFixed(2)}`
      + (r.zeta < 0.5 ? "  — underdamped, expect wobble" : r.zeta > 2.5 ? "  — sluggish" : "");
    const errs = validate(this.params);
    this.errorBox.textContent = errs.join("  ·  ");
    this.errorBox.style.display = errs.length ? "block" : "none";
  }

  /** The current set as JSON, for pasting into a tuning log or a UE5 asset. */
  exportJson(): string {
    const diff: Record<string, number> = {};
    for (const k of Object.keys(this.params) as Array<keyof Params>) {
      if (this.params[k] !== DEFAULT_PARAMS[k]) diff[k] = this.params[k] as number;
    }
    return JSON.stringify({ base: "spec", changed: diff }, null, 2);
  }
}
