// app/lab.ts — the Ice Lab.
//
// Wires the fixed-step clock to the solver, the solver to the overlay, and a
// panel of sliders to the parameters, so a tuning session is a thing you do
// with your hands instead of a rebuild. Everything here is presentation and
// glue; no physics is decided in this file.

import { PRESETS, SIM_DT, SIM_HZ } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { ReplayRecorder, ReplayPlayer, parseReplay, MAX_REPLAY_BYTES } from "../sim/replay.ts";
import { Telemetry } from "../sim/telemetry.ts";
import { SessionMeter } from "../sim/session.ts";
import type { SkaterState, EdgeEvent } from "../sim/types.ts";
import { Renderer, DEFAULT_OPTIONS } from "./draw.ts";
import type { DrawOptions, DrawExtras } from "./draw.ts";
import { Camera, VIEW, VIEW_NAME } from "./camera.ts";
import {
  FigureEight, START_SPEED as FIGURE_SPEED, drawFigure, drawFigureLabels, drawFigurePanel,
  loadBest, saveBest,
} from "./figure8.ts";
import type { Best } from "./figure8.ts";
import { GHOST_SOURCES, ghostRun, timeGap, raceLines } from "./race.ts";
import type { GhostRun, GhostSource } from "./race.ts";

/** localStorage, or nothing: private windows and the test stub have none. */
const storage = (): Storage | undefined => {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
};
import { Panel } from "./panel.ts";
import { Pad } from "./pad.ts";
import { applyScheme, newSchemeState, SCHEME_LABEL } from "./schemes.ts";
import type { Scheme } from "./schemes.ts";
import { FixedStep } from "./loop.ts";
import { EdgeAudio } from "./audio.ts";
import { loadTables, scoreJump } from "../sim/score.ts";
import type { ScoreTables, JumpScore } from "../sim/score.ts";

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

export class Lab {
  private params: Params = { ...PRESETS[BOOT_PRESET] };
  private state: SkaterState;
  private pad = new Pad();
  private renderer: Renderer;
  private panel: Panel;
  private telemetry = new Telemetry(SIM_HZ * 20);   // 20 s in the browser
  private clock: FixedStep;
  private events: EdgeEvent[] = [];
  private options: DrawOptions = { ...DEFAULT_OPTIONS };
  private camera = new Camera();
  /**
   * The Figure Eight (G): a game on top of the rig, reading the state and never
   * writing it. Off in playtest, like jumps — the week-16 gate is about carving
   * with no score and no art.
   */
  private figureOn = false;
  private figure: FigureEight | null = null;
  private figureBest: Best | null = loadBest(storage());
  private figureNewBest = false;
  /** The ghost's replay, re-run beside the live one. Its own player. */
  private ghost: ReplayPlayer | null = null;
  /** The same replay skated once in advance, for the gap. See app/race.ts. */
  private ghostAhead: GhostRun | null = null;
  private ghostLabel = "";
  private ghostSource: GhostSource = "best";
  /** Clips a ghost can come from besides the best. */
  private lastClip: string | null = null;
  private fileClip: { name: string; clip: string } | null = null;
  /** One precomputed ghost, keyed by its clip, so R does not re-skate it. */
  private ghostCache: { clip: string; run: GhostRun } | null = null;
  /** Your gap at the crossing, once you have reached it. */
  private splitGap: number | null = null;
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
  private recorder = new ReplayRecorder(this.params, this.startSpeed);
  private player: ReplayPlayer | null = null;
  private replaySource: string | null = null;
  private replayMessage = "";
  private recordingError = "";
  private loadId = 0;
  private audio = new EdgeAudio();
  private sound = true;
  /** The SOV and calls tables, fetched beside the page. Null: no scores shown. */
  private tables: ScoreTables | null = null;
  private scored: JumpScore | null = null;
  private scoredTick = -1;

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
    // The wheel zooms. Line-mode wheels (Firefox) report about 3 per notch,
    // pixel-mode ones about 100; both come out near one step a notch.
    canvas.addEventListener("wheel", (e) => {
      if (this.playtest) return;
      const w = e as WheelEvent;
      w.preventDefault();
      this.camera.zoomBy(-(w.deltaMode === 1 ? w.deltaY * 33 : w.deltaY) / 100);
    }, { passive: false });
    if (this.playtest) this.hideEverythingATesterShouldNotSee();
    // The input panel captions what each scheme does with each stick, which
    // is an explanation; §7 keeps those from testers and observers alike.
    if (this.playtest) this.options.pad = false;
    // Jumps were added to the rig over pre-production-plan §1's refusal, on the
    // operator's say-so. They are contained: off in every preset, and off here
    // for certain, so no measured block can have a jump rescue the carve.
    if (this.playtest) this.params.jumpMode = 0;
    // Audio may only start from a gesture; a gamepad press is not one.
    window.addEventListener("keydown", () => { if (this.sound) this.audio.unlock(); });
    window.addEventListener("pointerdown", () => { if (this.sound) this.audio.unlock(); });
    void this.loadScoreTables();
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
    this.viewControls(c);
    if (c.pause) { this.clock.paused = true; return; }
    if (this.player) {
      if (!this.player.done) {
        try {
          this.player.advance();
          this.camera.update(this.player.state, SIM_DT);
          this.renderer.pad.note(null, this.player.input);
          this.audio.onTick(this.player.input, this.player.events, this.player.state);
          this.telemetry.capture(this.player.state);
          this.telemetry.pushEvents(this.player.events);
          this.renderer.recordTrace(this.player.state);
        } catch (error) {
          this.replayMessage = `Replay stopped: ${error instanceof Error ? error.message : String(error)}`;
          this.clock.paused = true;
          return;
        }
      }
      if (this.player.done) this.clock.paused = true;
      return; // Playback never contributes to live playtest metrics or capture.
    }
    if (c.cycleScheme) this.scheme = ((this.scheme + 1) % 3) as Scheme;
    if (c.toggleGame && !this.playtest) {
      this.figureOn = !this.figureOn;
      this.reset();   // on: a run starts from the crossing; off: back to the plain rink
    }
    if (c.cycleGhost && this.figureOn && !this.playtest) {
      this.cycleGhost();
      this.reset();   // a race starts level
    }
    if (c.cycleJump && !this.playtest) {
      this.params.jumpMode = (this.params.jumpMode + 1) % 3;
      this.panel.refresh();
    }
    if (c.cyclePreset && !this.playtest) {
      this.presetIndex = (this.presetIndex + 1) % PRESET_NAMES.length;
      this.panel.load(PRESETS[PRESET_NAMES[this.presetIndex]]);
    }

    // Hardware in, intent out. Which of the three schemes is doing that
    // translation is the question the whole exercise is asking.
    const it = applyScheme(this.scheme, c, this.state.heading, this.state.vel, this.state.yawRate,
      this.params, this.schemeState);

    this.renderer.pad.note(c, it);
    this.events.length = 0;
    step(this.state, it, this.params, SIM_DT, this.events);
    this.audio.onTick(it, this.events, this.state);
    this.meter.sample(this.state, it, this.events, SIM_DT);
    this.camera.update(this.state, SIM_DT);
    if (this.figure) this.figureTick();
    this.telemetry.capture(this.state);
    this.telemetry.pushEvents(this.events);
    this.renderer.recordTrace(this.state);
    if (!this.recordingError) {
      try {
        this.recorder.capture(it, this.params, this.state, this.events, SCHEME_LABEL[this.scheme]);
      } catch (error) {
        this.recordingError = `Recording stopped: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }

  /**
   * One tick of the game layer, after the solver's. The run reads the state;
   * the ghost is a separate replay player stepping its own copy. A finished
   * run that beats the best becomes the best, and its clip — the recorder has
   * held exactly this run since the reset that started it — the next ghost.
   */
  private figureTick(): void {
    const run = this.figure!;
    const was = run.state, wasLobe = run.lobe;
    run.sample(this.state, SIM_DT);
    if (this.ghost && !this.ghost.done) {
      try { this.ghost.advance(); } catch { this.ghost = null; }
    }
    if (wasLobe === 0 && run.lobe === 1 && this.ghostAhead) {
      this.splitGap = timeGap(this.ghostAhead, 1, run.ticks);
    }
    if (was !== "running" || run.state !== "done") return;
    const r = run.result();
    const clip = this.recorder.toJson();
    this.lastClip = clip;
    if (this.figureBest && r.score <= this.figureBest.score) return;
    this.figureBest = { score: r.score, seconds: r.seconds, rms: r.rms, edgeShare: r.edgeShare, clip };
    this.figureNewBest = true;
    saveBest(storage(), this.figureBest);
  }

  /** The clip the chosen source names, if it has one yet. */
  private ghostClip(source: GhostSource): { label: string; clip: string } | null {
    if (source === "best" && this.figureBest) return { label: "your best", clip: this.figureBest.clip };
    if (source === "last" && this.lastClip) return { label: "your last run", clip: this.lastClip };
    if (source === "file" && this.fileClip) return { label: this.fileClip.name, clip: this.fileClip.clip };
    return null;
  }

  /** H: the next source that has a clip, or none. */
  private cycleGhost(): void {
    let i = GHOST_SOURCES.indexOf(this.ghostSource);
    for (let n = 0; n < GHOST_SOURCES.length; n++) {
      i = (i + 1) % GHOST_SOURCES.length;
      if (GHOST_SOURCES[i] === "off" || this.ghostClip(GHOST_SOURCES[i])) break;
    }
    this.ghostSource = GHOST_SOURCES[i];
  }

  /** Put the chosen ghost on the start line beside a fresh run. */
  private startGhost(): void {
    this.ghost = null; this.ghostAhead = null; this.splitGap = null;
    const g = this.figureOn ? this.ghostClip(this.ghostSource) : null;
    if (!g) return;
    try {
      // A clip recorded under another solver version no longer parses: no ghost.
      const clip = parseReplay(g.clip);
      if (this.ghostCache?.clip !== g.clip) this.ghostCache = { clip: g.clip, run: ghostRun(clip) };
      this.ghost = new ReplayPlayer(clip);
      this.ghostAhead = this.ghostCache.run;
      this.ghostLabel = g.label;
    } catch {
      this.ghost = null; this.ghostAhead = null;
    }
  }

  /** "race a replay": any saved clip becomes the ghost, and the race starts. */
  private async loadRaceClip(file: File): Promise<void> {
    if (this.playtest) return;
    try {
      if (file.size > MAX_REPLAY_BYTES) throw new Error("Replay exceeds the 64 MiB file limit");
      const text = await file.text();
      parseReplay(text);
      this.fileClip = { name: file.name.replace(/\.json$/, ""), clip: text };
      this.ghostSource = "file";
      this.figureOn = true;
      this.replayMessage = "";
      this.reset();
    } catch (error) {
      this.replayMessage = `Could not race that replay: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private figureExtras(): DrawExtras {
    const run = this.figure;
    const ghost = this.ghost && !this.ghost.done ? this.ghost : null;
    const ahead = this.ghostAhead;
    return {
      ground: (ctx, px) => drawFigure(ctx, px, run),
      ghost: ghost ? { s: ghost.state, p: ghost.params } : null,
      screen: (ctx, cam, _w, h) => {
        drawFigureLabels(ctx, cam, run);
        const r = run?.result() ?? null;
        const race = ahead ? raceLines(ahead, this.ghostLabel, r, run?.ticks ?? 0, this.params, this.splitGap)
          : [[this.ghostSource === "off" ? "no ghost · H for one" : "no ghost yet: finish one", "#5b7386"] as [string, string]];
        drawFigurePanel(ctx, h, r, this.figureBest, this.figureNewBest, race);
      },
    };
  }

  /**
   * V / D-pad down cycles north up, travel up, chase; + / - / D-pad
   * left-right zoom; [ and ] lower and raise the chase camera. Locked in
   * playtest: the view is part of the stimulus, and every tester gets the one
   * the rig always had.
   */
  private viewControls(c: { cycleView: boolean; zoom: number; tilt: number }): void {
    if (this.playtest) return;
    if (c.cycleView) this.camera.cycleView();
    if (c.zoom !== 0) this.camera.zoomBy(c.zoom);
    if (c.tilt !== 0) this.camera.tiltBy(5 * c.tilt);
  }

  private render(): void {
    // Physics stops while paused; hardware must not. Otherwise P/Start can
    // enter pause but can never leave it. Discard skating inputs while paused.
    if (this.clock.paused) {
      const c = this.pad.read();
      if (c.reset) this.reset();
      else if (c.pause && !this.player?.done) this.clock.paused = false;
      this.viewControls(c);
    }
    const log = this.telemetry.eventLog();
    const recent = log ? log.split("\n").slice(-6).reverse() : [];
    const info = this.playtest
      ? [`scheme ${SCHEME_LABEL[this.scheme]}` + (this.clock.paused ? "   PAUSED" : "")]
      : [
        `preset ${PRESET_NAMES[this.presetIndex]}   scheme ${SCHEME_LABEL[this.scheme]}   `
        + (this.clock.paused ? "PAUSED" : `${this.clock.lastSteps} steps/frame`)
        + `   view ${VIEW_NAME[this.camera.view]}`
        + (this.camera.view === VIEW.Chase ? ` ${this.camera.chaseElevation}°` : "")
        + ` ${this.camera.zoom.toFixed(2)}×`,
        ...recent.map((line) => `· ${line}`),
      ];
    if (this.player) {
      const d = this.player.divergence;
      info.splice(0, info.length, `REPLAY   scheme ${this.player.scheme}   `
        + `${this.player.index}/${this.player.total} ticks`,
      d ? `DIVERGED at tick ${d.tick}: expected ${d.expected}, actual ${d.actual}`
        : this.player.done ? "VERIFIED — reset skater to return to live" : "P / Start: pause or resume");
    }
    const status = document.getElementById("replay-status");
    if (status) status.textContent = this.replayMessage || this.recordingError || (this.player
      ? this.player.divergence ? info[1]
        : this.player.done ? `Verified ${this.player.total} ticks. Reset returns to live.`
          : `Playing ${this.player.index} / ${this.player.total} ticks. Recorded tuning is in use.`
      : `Recorded ${(this.recorder.ticks / SIM_HZ).toFixed(1)} s / 300 s`
        + (this.recorder.full ? " — clip full; export, then reset for a new clip." : " since reset."));
    const shown = this.player?.state ?? this.state;
    const score = this.playtest ? "" : this.scoreLine(shown);
    if (score) info.splice(1, 0, score);
    this.audio.update(shown, this.player?.params ?? this.params, this.sound && !this.clock.paused);
    const scheme = this.player
      ? Math.max(0, SCHEME_LABEL.indexOf(this.player.scheme as "A" | "B" | "C"))
      : this.scheme;
    this.renderer.draw(this.player?.state ?? this.state, this.player?.params ?? this.params,
      this.options, info, scheme, this.camera,
      this.figureOn && !this.player ? this.figureExtras() : undefined);
  }

  /**
   * The last landed jump, scored from the data the way ScoreCalculator.cs
   * would score it. Seeded by the landing tick, so a replay shows the same.
   */
  private scoreLine(s: SkaterState): string {
    if (!this.tables || s.landed.tick < 0) return "";
    if (s.landed.tick !== this.scoredTick) {
      this.scored = scoreJump(this.tables, s.landed);
      this.scoredTick = s.landed.tick;
    }
    const j = this.scored;
    if (!j) return "";
    return `SCORE ${j.label}${j.scoredAs && !j.label.startsWith(j.scoredAs) ? ` (as ${j.scoredAs})` : ""}  `
      + `BV ${j.baseValue.toFixed(2)}  GOE ${j.goe >= 0 ? "+" : ""}${j.goe.toFixed(2)} × ${j.goeStep.toFixed(2)}`
      + `  → ${j.score.toFixed(2)}`;
  }

  /** Only over http: file:// and the test stub have nothing to fetch from. */
  private async loadScoreTables(): Promise<void> {
    if (typeof location === "undefined" || !/^https?:$/.test(location.protocol ?? "")) return;
    try {
      const get = async (f: string): Promise<string> => {
        const r = await fetch(`../data/${f}`);
        if (!r.ok) throw new Error(`${f}: ${r.status}`);
        return r.text();
      };
      const [sov, calls] = await Promise.all([get("scale-of-values.csv"), get("calls-and-deductions.csv")]);
      this.tables = loadTables(sov, calls);
    } catch {
      this.tables = null;   // no data beside the page: skate without scores
    }
  }

  private reset(): void {
    // The meter is NOT reset here. A session is everything the tester did,
    // falls included; resetting the skater is part of playing, not a new run.
    this.loadId++;
    this.player = null;
    this.replaySource = null;
    this.replayMessage = "";
    this.recordingError = "";
    this.clock.paused = false;
    const panel = document.getElementById("panel");
    if (panel) panel.style.display = "";
    // A figure run always starts at the course's own speed, so two scores are
    // two skaters on the same task — and the ghost started there too.
    const speed = this.figureOn ? FIGURE_SPEED : this.startSpeed;
    this.state = createState(this.params, speed, 0);
    this.camera.snap(this.state);
    this.schemeState = newSchemeState();
    this.recorder = new ReplayRecorder(this.params, speed);
    this.figure = this.figureOn ? new FigureEight(this.state) : null;
    this.figureNewBest = false;
    this.startGhost();
    this.telemetry.reset();
    this.renderer.clearTrace();
    this.scored = null;
    this.scoredTick = -1;
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
    on("export-both", () => this.exportBoth());
    on("export-replay", () => {
      if (this.replaySource || this.recorder.ticks > 0)
        this.download("edgework-replay.json", this.replaySource ?? this.recorder.toJson());
    });
    const file = document.getElementById("replay-file") as HTMLInputElement | null;
    on("import-replay", () => file?.click());
    file?.addEventListener("change", () => {
      const selected = file.files?.[0];
      if (selected) void this.loadReplay(selected);
      file.value = ""; // The same clip can be opened again after it ends.
    });
    on("send-session", () => { void this.sendSession(); });
    const raceFile = document.getElementById("race-file") as HTMLInputElement | null;
    on("race-replay", () => raceFile?.click());
    raceFile?.addEventListener("change", () => {
      const chosen = raceFile.files?.[0];
      if (chosen) void this.loadRaceClip(chosen);
      raceFile.value = "";
    });

    for (const key of Object.keys(this.options) as Array<keyof DrawOptions>) {
      const el = document.getElementById(`opt-${key}`) as HTMLInputElement | null;
      if (!el) continue;
      el.checked = this.options[key];
      el.addEventListener("change", () => { this.options[key] = el.checked; });
    }

    const snd = document.getElementById("opt-sound") as HTMLInputElement | null;
    if (snd) {
      snd.checked = this.sound;
      snd.addEventListener("change", () => {
        this.sound = snd.checked;
        if (snd.checked) this.audio.unlock();
      });
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

  private async loadReplay(file: File): Promise<void> {
    const id = ++this.loadId;
    const wasPaused = this.clock.paused;
    this.clock.paused = true;
    try {
      if (file.size > MAX_REPLAY_BYTES) throw new Error("Replay exceeds the 64 MiB file limit");
      const source = await file.text();
      if (id !== this.loadId) return; // A reset or a newer import won the race.
      const player = new ReplayPlayer(parseReplay(source));
      this.player = player;
      this.replaySource = source;
      this.replayMessage = "";
      this.recordingError = "";
      this.telemetry.reset();
      this.renderer.clearTrace();
      const panel = document.getElementById("panel");
      if (panel) panel.style.display = "none";
      this.clock.paused = false;
    } catch (error) {
      if (id !== this.loadId) return;
      this.replayMessage = `Could not open replay: ${error instanceof Error ? error.message : String(error)}`;
      this.clock.paused = wasPaused;
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
      schema: "edgework-session/2",
      scheme: SCHEME_LABEL[this.scheme],
      preset: PRESET_NAMES[this.presetIndex],
      params: JSON.parse(this.panel.exportJson()).changed,
      // The clip this card belongs with. A card covers the whole session and a
      // clip only the run since the last reset, so their tick counts match only
      // when nobody reset; the clip's final digest names it either way.
      clip: this.recorder.ticks > 0
        ? { ticks: this.recorder.ticks, digest: this.recorder.lastDigest } : null,
      metrics: this.meter.summary(),
    }, null, 2);
  }

  /**
   * The card and the clip in one press, under one name: the stamp is the
   * clip's final digest, so a pair is a pair by filename rather than by
   * someone checking tick counts. Staggered, because a browser handing over
   * two files from one click is the case most likely to ask permission.
   */
  private exportBoth(): void {
    const has = this.recorder.ticks > 0;
    const stamp = has ? (this.recorder.lastDigest >>> 0).toString(16).padStart(8, "0") : "noclip";
    this.download(`edgework-session-${stamp}.json`, this.sessionCard());
    if (has) {
      const clip = this.recorder.toJson();
      setTimeout(() => this.download(`edgework-replay-${stamp}.json`, clip), 300);
    }
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
