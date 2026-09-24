import { CareerState, Choreography, CAREER_EVENTS, ELEMENTS, MEDALS } from "./career.ts";
import { xpToRaise } from "../sim/profile.ts";
import { createState, step } from "../sim/solver.ts";
import { SIM_DT } from "../sim/params.ts";
import { Pad } from "../app/pad.ts";
import { newSchemeState, SCHEME } from "../app/schemes.ts";
import type { GameScheme as Scheme } from "./controls.ts";
import { FULL_SCHEME, ACTIONS, bindingLabel, loadControllerProfile, digStatus } from "./full-controls.ts";
import type { GameControlState } from "./full-controls.ts";
import { MOVE, TURN_KIND, FALL, codeToString } from "../sim/types.ts";
import { JUMP_PHASE, JUMP_CODE } from "../sim/jump.ts";
import { SETUPS, SETUP_KEY, isSetup, setupParams, setupInput } from "./setups.ts";
import type { Setup } from "./setups.ts";
import { GAME_PARAMS, CONTROL_NAMES, gameInput } from "./controls.ts";
import { IceRun } from "./run.ts";
import { SkateScene } from "./scene.ts";
import { SKINS, skinById, skinPreviewSvg } from "./appearance.ts";
import { Practice, LESSONS } from "./practice.ts";
import { BeginnerCoach, BEGINNER_PARAMS } from "./beginner.ts";
import { Playground } from "./playground.ts";
import { RookieCourse } from "./rookie.ts";
import { resolveRinkCollision } from "./rink.ts";
import { IceGrid } from "../sim/ice.ts";
let careerMode = false, careerEvent = 0, choreography: Choreography | null = null;
let career = new CareerState();
try { career = CareerState.restore(localStorage.getItem("edgework-career-v1")); } catch { /* Storage is optional. */ }
let courseMode = false, rookie: RookieCourse | null = null;
import { EdgeAudio } from "../app/audio.ts";
import type { EdgeEvent } from "../sim/types.ts";
import { SAMPLE_PROFILES, applyProfile, TIERS } from "../sim/profile.ts";
import { ReplayRecorder, ReplayPlayer, parseReplay, MAX_REPLAY_BYTES } from "../sim/replay.ts";
import { loadTables, scoreJump } from "../sim/score.ts";
import { ComboTracker } from "../sim/combo.ts";
import type { ScoreTables } from "../sim/score.ts";
import { SpinLevelTracker, loadSpinFeatureThresholds, scoreSpinLevel } from "../sim/spinLevel.ts";
import type { SpinFeatureThresholds } from "../sim/spinLevel.ts";
import { loadStepFeatureThresholds } from "../sim/stepLevel.ts";
import type { StepFeatureThresholds } from "../sim/stepLevel.ts";
import { loadSegmentRules } from "../sim/pcs.ts";
import type { SegmentRule } from "../sim/pcs.ts";

const el = (id: string) => document.getElementById(id)!;
const canvas = el("rink") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const pad = new Pad();
let profileIndex = 0;
let beginner = true;
let params = { ...BEGINNER_PARAMS };

// ── the rhythm layer's music (game/audio/README.md): presentation only. The
// selected track's bpm/offset/beatsPerBar/barsPerPhrase feed Params before a
// run starts; the decoded audio itself never reaches sim/ or a replay. ──────
interface Track { id: string; title: string; file: string; bpm: number; offset: number; beatsPerBar: number; barsPerPhrase: number }
let tracks: Track[] = [];
let trackIndex = 0;
const musicEl = el("music") as HTMLAudioElement;
void fetch("audio/tracks.json").then(r => r.json()).then((list: Track[]) => {
  tracks = list;
  const select = el("track-select") as HTMLSelectElement;
  tracks.forEach((track, index) => {
    const option = document.createElement("option");
    option.value = String(index); option.textContent = track.title;
    select.append(option);
  });
  // The fetch can resolve after the first run already started (start() found
  // `tracks` empty and left the beat grid on its placeholder). Catch up now,
  // rather than skate the whole first run in silence.
  if (mode !== "ready") {
    applyTrack(params);
    // Starting from 0 here is a known approximation for this one race: a run
    // already a few seconds in restarts the track's phase rather than the
    // skater's. Every later run is exact, from start()'s own reset.
    if (sound && mode === "playing") { musicEl.currentTime = 0; void musicEl.play().catch(() => { /* still locked */ }); }
  }
}).catch(() => { /* No manifest: the rhythm layer keeps its placeholder grid. */ });
function applyTrack(p: typeof params): void {
  const track = tracks[trackIndex];
  if (!track) return;
  p.musicBpm = track.bpm; p.musicOffset = track.offset;
  p.musicBeatsPerBar = track.beatsPerBar; p.musicBarsPerPhrase = track.barsPerPhrase;
  if (musicEl.src !== new URL(`audio/${track.file}`, location.href).href) musicEl.src = `audio/${track.file}`;
}
let coach = new BeginnerCoach(), playground = new Playground(), pendingTrick = false;
let recorder = new ReplayRecorder(params, 4.5), playback: ReplayPlayer | null = null;
let replayJson = "", technical = 0, scoredTick = -1, tables: ScoreTables | null = null;
let replayNotice = "Recording your skating · first five minutes";
let spinThresholds: SpinFeatureThresholds | null = null;
const spinTracker = new SpinLevelTracker();
let lastSpinLabel = "", wasSpinning = false;
void fetch("../data/spin-features.json").then(r => r.ok ? r.text() : Promise.reject(r.status))
  .then(json => { spinThresholds = loadSpinFeatureThresholds(json); }).catch(() => { /* Spin level stays unshown. */ });
let stepThresholds: StepFeatureThresholds | null = null;
void fetch("../data/step-features.json").then(r => r.ok ? r.text() : Promise.reject(r.status))
  .then(json => { stepThresholds = loadStepFeatureThresholds(json); }).catch(() => { /* Step level stays unscored. */ });
let segmentRules: SegmentRule[] | null = null;
void fetch("../data/segment-rules.csv").then(r => r.ok ? r.text() : Promise.reject(r.status))
  .then(csv => { segmentRules = loadSegmentRules(csv); }).catch(() => { /* PCS stays unscored. */ });
void Promise.all(["scale-of-values.csv", "calls-and-deductions.csv"].map(async file => {
  const response = await fetch(`../data/${file}`);
  if (!response.ok) throw new Error(`Scoring table ${response.status}`);
  return response.text();
})).then(([sov, calls]) => { tables = loadTables(sov, calls); }).catch(() => {
  el("technical").textContent = "Jump scoring unavailable: tables could not load";
});
const scene = new SkateScene(), audio = new EdgeAudio();
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
scene.effects.reducedMotion = motionPreference.matches;
motionPreference.addEventListener("change", () => { scene.effects.reducedMotion = motionPreference.matches; });
try { scene.skin = skinById(localStorage.getItem("edgework-skin")); } catch { /* Style works without storage. */ }
let practice = new Practice(), cruise = true, sound = false, pushHeld = false;
let controllerProfile = loadControllerProfile();
window.addEventListener("focus", () => { controllerProfile = loadControllerProfile(); renderFullBindings(); });
let scheme: Scheme = SCHEME.B;
try { const saved = Number(localStorage.getItem("edgework-control-scheme") ?? SCHEME.B); if ([0, 1, 2, 3].includes(saved)) scheme = saved as Scheme; } catch { /* Session controls work without storage. */ }
let setup: Setup | null = "explorer", assistance = 0.75;
try {
  const saved = JSON.parse(localStorage.getItem(SETUP_KEY) ?? "null");
  if (saved && (isSetup(saved.setup) || saved.setup === null)) {
    setup = saved.setup;
    if (Number.isFinite(saved.assistance) && saved.assistance >= 0.5 && saved.assistance <= 1) assistance = saved.assistance;
  }
} catch { /* Use the exploration starting point. */ }
if (setup) { scheme = FULL_SCHEME; beginner = setup === "repertoire"; cruise = false; }
let freeSkate = true, cantilever = false, lowHeld = false;
let elapsedSkate = 0, pendingToe = false;
const guide = el("guide") as HTMLDialogElement;
let resumeAfterGuide = false;
const wardrobe = el("wardrobe") as HTMLDialogElement;
let resumeAfterWardrobe = false;
let skater = createState(params, 4.5), steering = newSchemeState(), run = new IceRun();
/** A fresh sheet each run: resurfaced between skaters, the way a rink actually is. */
let ice = new IceGrid(params.rinkHalfLength, params.rinkHalfWidth);
let mode: "ready" | "playing" | "paused" | "done" = "ready";
let best = 0, accumulator = 0, last = 0, flash = 0;
/** Foot-change mid-spin (sim/moves.ts spinTick), never surfaced anywhere before: a toast the moment
 *  SpinState.changeCompletedTick advances, the same decaying-flash idiom `flash` already uses. */
let footChangeFlash = 0, lastChangeCompletedTick = -1;
/** sim/combo.ts: a jump taken straight off the last one's landing edge is a combination. */
const combo = new ComboTracker();
let comboFlash = 0, comboLabel = "";
let width = 0, height = 0;
const trail: Array<Array<{ x: number; y: number; contact: boolean }>> = [[], []];
function traceBlades() {
  if(skater.tick % 4) return;
  skater.blade.forEach((blade, i) => {
    trail[i].push({...blade.contact, contact: blade.inContact && skater.jump.phase !== JUMP_PHASE.Air});
    if(trail[i].length > 3000) trail[i].shift();
  });
}
try { best = Math.max(0, Number(localStorage.getItem("edgework-ice-run-best")) || 0); } catch { /* Storage is optional. */ }
el("record").textContent = `Personal best · ${best.toLocaleString()} pts`;

function start() {
  params = applyProfile(setup ? setupParams(setup, assistance) : beginner ? BEGINNER_PARAMS : GAME_PARAMS, careerMode ? career.profile : SAMPLE_PROFILES[profileIndex]);
  applyTrack(params);
  document.body.dataset.career = String(careerMode);
  el("coach-label").textContent = careerMode ? "CAREER / CHOREOGRAPHY" : "ON THE ICE / PRACTICE";
  coach = new BeginnerCoach(); playground = new Playground(); pendingTrick = false; rookie = courseMode ? new RookieCourse() : null;
  recorder = new ReplayRecorder(params, 4.5); playback = null; replayJson = "";
  technical = 0; scoredTick = -1; replayNotice = "Recording your skating · first five minutes";
  skater = createState(params, 4.5); steering = newSchemeState(); run = new IceRun();
  ice = new IceGrid(params.rinkHalfLength, params.rinkHalfWidth);
  // Choreography's own PCS scoring (sim/pcs.ts) reads `ice.coverage()` at the
  // end of the routine — it must hold the SAME grid instance play actually
  // uses, so it is built only after `ice` above is the fresh one for this run.
  choreography = careerMode
    ? new Choreography(CAREER_EVENTS[careerEvent], tables ?? undefined, spinThresholds ?? undefined, stepThresholds ?? undefined, segmentRules ?? undefined, ice)
    : null;
  renderRoutine();
  spinTracker.reset(); lastSpinLabel = ""; wasSpinning = false;
  lastChangeCompletedTick = -1; footChangeFlash = 0;
  combo.reset(); comboFlash = 0; comboLabel = "";
  trail.forEach(t => t.length = 0); accumulator = 0; flash = 0; pendingPush = false; mode = "playing";
  pendingToe = false; cantilever = false; elapsedSkate = 0;
  practice = new Practice(); scene.reset(skater);
  el("overlay").hidden = true; el("pause").hidden = false;
  // A run's tick zero is the beat grid's phase origin (sim/music.ts): the
  // track restarts from its own zero at the same moment, so the two stay in
  // phase for the run's length. Only once unlocked (the Sound button).
  musicEl.currentTime = 0;
  if (sound && musicEl.src) void musicEl.play().catch(() => { /* still locked; the Sound button retries */ });
}
function pause() {
  if (mode !== "playing") return;
  mode = "paused"; accumulator = 0;
  musicEl.pause();
  el("title").textContent = "Take a breath.";
  el("description").textContent = "Your run is paused. The clock will wait for you.";
  el("help").hidden = true; el("start").textContent = "Back to the ice →";
  el("overlay").hidden = false; el("pause").hidden = true;
  el("start").focus();
}
function resume() {
  mode = "playing"; accumulator = 0;
  if (sound && musicEl.src) void musicEl.play().catch(() => { /* still locked */ });
  el("overlay").hidden = true; el("pause").hidden = false;
}
function finish() {
  mode = "done";
  musicEl.pause();
  const record = run.score > best;
  best = Math.max(best, run.score);
  try { localStorage.setItem("edgework-ice-run-best", String(best)); } catch { /* Play without persistence. */ }
  el("title").textContent = run.score >= 3000 ? "Golden edges." : run.score >= 1500 ? "Finding flow." : "Your first lines.";
  el("description").textContent = `${run.score.toLocaleString()} points · ${run.collected} lights · ${run.falls} falls. ${record ? "A new personal best! " : ""}Next target: ${run.score < 1500 ? "1,500 points for silver" : run.score < 3000 ? "3,000 points for gold" : "beat your best"}.`;
  el("help").hidden = true; el("start").textContent = "Skate again →";
  el("record").textContent = `Personal best · ${best.toLocaleString()} pts`;
  el("overlay").hidden = false; el("pause").hidden = true;
  el("start").focus();
}
el("start").addEventListener("click", () => mode === "paused" && !playback?.done ? resume() : start());
el("pause").addEventListener("click", pause);
el("free").addEventListener("click", () => { careerMode = false; freeSkate = true; courseMode = false; cruise = setup === null; start(); });
el("rookie").addEventListener("click", () => { careerMode=false; freeSkate=true; courseMode=true; cruise=setup === null; start(); });
el("timed").addEventListener("click", () => { careerMode = false; freeSkate = false; courseMode = false; cruise = false; start(); });
el("controls").addEventListener("click", () => {
  resumeAfterGuide = mode === "playing"; pause(); guide.showModal();
});
// The wardrobe's own buttons, built from SKINS rather than hand-authored per
// costume (appearance.ts's own header explains why): a future costume is one
// entry there, nothing here or in index.html needs to change to show it.
for (const skin of SKINS) {
  const button = document.createElement("button");
  button.className = "skin-option"; button.id = `skin-${skin.id}`; button.setAttribute("aria-pressed", "false");
  button.style.setProperty("--accent", skin.bodice);
  button.style.setProperty("--accent-wash", `${skin.bodice}20`);
  button.innerHTML = `${skinPreviewSvg(skin)}<strong>${skin.name}</strong><span>${skin.description}</span><span class="skin-selected">Selected ✓</span>`;
  button.addEventListener("click", () => {
    scene.skin = skin;
    try { localStorage.setItem("edgework-skin", skin.id); } catch { /* Keep the choice for this session. */ }
    refreshWardrobe();
  });
  el("skin-options").appendChild(button);
}
function refreshWardrobe() {
  for (const skin of SKINS) el(`skin-${skin.id}`).setAttribute("aria-pressed", String(scene.skin.id === skin.id));
  el("skin-status").textContent = `${scene.skin.name} selected · ready for the ice`;
}
function openWardrobe() {
  resumeAfterWardrobe = mode === "playing"; pause(); refreshWardrobe(); wardrobe.showModal();
}
el("style").addEventListener("click", openWardrobe);
el("opening-style").addEventListener("click", openWardrobe);
el("close-wardrobe").addEventListener("click", () => wardrobe.close());
wardrobe.addEventListener("close", () => { if (resumeAfterWardrobe) resume(); });
(el("difficulty") as HTMLSelectElement).addEventListener("change", e => {
  beginner=(e.target as HTMLSelectElement).value==="beginner" && (setup === null || setup === "repertoire"); start(); pause();
});
el("trick").addEventListener("click", () => { pendingTrick=true; });
const schemeSelect = el("scheme-select") as HTMLSelectElement;
schemeSelect.value = String(scheme);
const profileSelect = el("profile-select") as HTMLSelectElement;
SAMPLE_PROFILES.forEach((profile, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = profile.name; profileSelect.append(option); });
function saveControlScheme() { try { localStorage.setItem("edgework-control-scheme", String(scheme)); } catch { /* Session-only selection. */ } }
function renderFullBindings() {
  el("full-bindings").innerHTML = ACTIONS.map(a => `<tr><td>${a.name}</td><td>${a.key === " " ? "Space" : a.key.toUpperCase()}</td><td>${bindingLabel(controllerProfile, a.id)}</td></tr>`).join("");
  el("full-guide").hidden = scheme !== FULL_SCHEME || (setup !== null && setup !== "repertoire");
  el("legacy-guide").hidden = scheme === FULL_SCHEME;
}
const setupSelect = el("setup-select") as HTMLSelectElement;
function saveSetup() { try { localStorage.setItem(SETUP_KEY, JSON.stringify({ setup, assistance })); } catch { /* Session only. */ } }
function renderSetup() {
  setupSelect.value = setup ?? "custom";
  el("setup-description").textContent = SETUPS.find(s => s.id === setup)?.description ?? "Custom legacy mapping and assists.";
  el("manual-guide").hidden = setup === null || setup === "repertoire";
  (el("assistance") as HTMLInputElement).value = String(assistance);
  (el("assistance") as HTMLInputElement).disabled = setup !== "explorer";
  el("assistance-value").textContent = `${Math.round(assistance * 100)}%`;
  (el("difficulty") as HTMLSelectElement).disabled = setup !== null && setup !== "repertoire";
  (el("difficulty") as HTMLSelectElement).value = beginner ? "beginner" : "simulation";
  (el("cruise") as HTMLButtonElement).disabled = setup === "simulation" || setup === "experimental" || setup === "diggate";
  renderFullBindings();
}
setupSelect.addEventListener("change", () => {
  setup = isSetup(setupSelect.value) ? setupSelect.value : null;
  if (setup) { scheme = FULL_SCHEME; beginner = setup === "repertoire"; cruise = false; }
  saveSetup(); saveControlScheme(); renderSetup(); start(); pause();
});
el("assistance").addEventListener("change", e => {
  assistance = Number((e.target as HTMLInputElement).value); saveSetup(); renderSetup(); start(); pause();
});
renderSetup();
schemeSelect.addEventListener("change", () => { setup = null; saveSetup(); scheme = Number(schemeSelect.value) as Scheme; steering = newSchemeState(); saveControlScheme(); renderFullBindings(); renderSetup(); start(); pause(); });
profileSelect.addEventListener("change", () => { profileIndex = Number(profileSelect.value); start(); pause(); });
el("save-replay").addEventListener("click", () => {
  const blob = new Blob([playback ? replayJson : recorder.toJson()], {type:"application/json"});
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = "edgework-replay.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
(el("open-replay") as HTMLInputElement).addEventListener("change", async e => {
  const input = e.target as HTMLInputElement, file = input.files?.[0];
  if(!file) return;
  try {
    if(file.size > MAX_REPLAY_BYTES) throw new Error("Replay exceeds the 64 MiB limit");
    const json = await file.text(), clip = parseReplay(json);
    careerMode = false; courseMode = false; start(); playback = new ReplayPlayer(clip); replayJson = json;
    skater = playback.state; params = playback.params; freeSkate = true;
    scene.reset(skater); resumeAfterGuide = false; guide.close();
    replayNotice = `Playing ${file.name} · inputs locked`;
  } catch(error) { replayNotice = error instanceof Error ? error.message : String(error); }
  input.value = "";
});
el("close-guide").addEventListener("click", () => guide.close());
guide.addEventListener("close", () => { if (resumeAfterGuide) resume(); });
el("camera").addEventListener("click", () => { scene.overview = !scene.overview; });
el("cruise").addEventListener("click", () => { cruise = !cruise; });
el("sound").addEventListener("click", () => {
  sound = !sound;
  if (sound) { audio.unlock(); if (mode === "playing" && musicEl.src) void musicEl.play().catch(() => { /* needs another gesture */ }); }
  else musicEl.pause();
});
const trackSelect = el("track-select") as HTMLSelectElement;
trackSelect.addEventListener("change", () => {
  trackIndex = Number(trackSelect.value);
  const wasPlaying = !musicEl.paused;
  applyTrack(params);
  if (wasPlaying) void musicEl.play().catch(() => { /* still locked */ });
});
canvas.addEventListener("wheel", e => { e.preventDefault(); scene.zoom = Math.max(0.65, Math.min(1.8, scene.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); }, { passive: false });
window.addEventListener("keydown", e => { if (e.key.toLowerCase() === "u") lowHeld = true; if(e.key === " ") pushHeld = true; });
window.addEventListener("keyup", e => { if (e.key.toLowerCase() === "u") lowHeld = false; if(e.key === " ") pushHeld = false; });
window.addEventListener("blur", () => { lowHeld = false; pushHeld = false; pause(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

function draw(_now: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (width !== innerWidth || height !== innerHeight || canvas.width !== Math.round(innerWidth * dpr)) {
    width = innerWidth; height = innerHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scene.draw(ctx, width, height, skater, params, trail, cantilever, freeSkate ? null : run.collected % 12, freeSkate && !playback && !courseMode && !careerMode ? playground : null, !playback ? rookie : null);
  const landingEffect = scene.effects.landing;
  el("jump-feedback").hidden = !landingEffect;
  if (landingEffect) {
    el("jump-feedback").dataset.outcome = landingEffect.clean ? "landed" : "rough";
    el("jump-feedback").style.opacity = String(Math.min(1, (1.8 - landingEffect.age) / .35));
    // Avoid re-announcing the same live-region text on every animation frame.
    if (el("jump-result").textContent !== landingEffect.label) el("jump-result").textContent = landingEffect.label;
    if (el("jump-detail").textContent !== landingEffect.detail) el("jump-detail").textContent = landingEffect.detail;
  }
  audio.update(skater, params, sound && mode === "playing");
  schemeSelect.value = String(scheme);
  el("replay-status").textContent = recorder.full && !playback ? "Five-minute recording full · export and reset for a new clip" : replayNotice;
  if(tables) el("technical").textContent = `Jump technical total · ${technical.toFixed(2)} (separate from practice points)`;
  el("music-credit").textContent = `Musical credit · ${skater.musicCredit.toFixed(0)}`;
  el("stamina-label").textContent = `Wind ${Math.round(skater.wind * 100)}% · Legs ${Math.round(skater.legs * 100)}%`;
  el("hype-label").textContent = `Hype ${Math.round(skater.hype * 100)}%${skater.hypeStreak > 1 ? ` · ${skater.hypeStreak} in a row` : ""}`;
  el("edge-fill").style.width = `${skater.flow * 100}%`;
  el("edge-label").textContent = `EDGE ${Math.round(skater.flow * 100)} · clean, unskidded edges build it`;
  el("time").textContent = freeSkate ? `${Math.floor(elapsedSkate / 60)}:${String(Math.floor(elapsedSkate % 60)).padStart(2, "0")}` : run.seconds.toFixed(1);
  el("time-label").textContent = playback ? "Replay" : freeSkate ? "Free skate" : "Time";
  el("score").textContent = (freeSkate ? practice.count * 250 + playground.score + (rookie?.score ?? 0) : run.score).toLocaleString();
  el("combo").textContent = freeSkate ? `${practice.count}/7` : `×${run.multiplier}`;
  el("combo-label").textContent = freeSkate ? "Moves learned" : "Chain";
  el("cruise").textContent = `Cruise ${cruise ? "on" : "off"}`;
  el("cruise").setAttribute("aria-pressed", String(cruise));
  el("camera").textContent = scene.overview ? "Close view" : "Rink view";
  el("sound").textContent = `Sound ${sound ? "on" : "off"}`;
  el("sound").setAttribute("aria-pressed", String(sound));
  const speed=Math.hypot(skater.vel.x,skater.vel.y);
  el("speed-value").textContent=`${(speed*3.6).toFixed(0)}`;
  el("flow-fill").style.width=`${playground.flow}%`;
  el("flow-label").textContent=`FLOW ${Math.round(playground.flow)} · stay upright to build speed`;
  (el("trick") as HTMLButtonElement).disabled=!beginner || !!playback || mode!=="playing" || speed<2.5 || skater.fallen || skater.jump.phase!==JUMP_PHASE.None;
  el("trick").textContent=beginner ? speed<2.5 ? "Build speed to spin jump" : "J · Launch a spin jump" : "Simulation · manual jumps";
  const next = practice.next;
  el("lesson-title").textContent = rookie && !playback ? rookie.title : beginner && freeSkate ? "Stay up. Get fast. Send it." : freeSkate ? next < 0 ? "You have the moves." : LESSONS[next][0] : "Chase the gold lights";
  el("lesson-tip").textContent = rookie && !playback ? rookie.hint : beginner && freeSkate ? "A / D to carve. Cruise builds speed as you stay upright. J / D-pad up launches a spin jump; Y holds a spin. Collect snowflakes and bump pucks into gold circles." : freeSkate ? next < 0 ? "Try linking back crossovers, a jump and a spin. Make it your own." : LESSONS[next][1] : "Start turning before each light. Keep pickups within 8 seconds to build your chain.";
  el("lesson-progress").textContent = rookie && !playback ? `${rookie.index}/8 gates · ${rookie.cleared} clean` : freeSkate ? practice.done.map(v => v ? "●" : "○").join("  ") : "90 SECOND TIME ATTACK";
  el("charge").style.width = `${skater.knee * 100}%`;
  el("charge-label").textContent = skater.jump.phase === JUMP_PHASE.Load ? skater.jump.t < 0.18 ? "Loading…" : skater.jump.t < 0.6 ? "Release to jump" : "Load held too long" : "Knee pressure";
  const backward = skater.vel.x * skater.heading.x + skater.vel.y * skater.heading.y < -0.1;
  const move = skater.jump.phase === JUMP_PHASE.Air ? `AIR · ${(skater.jump.rotation / (2 * Math.PI)).toFixed(1)} rev · ${skater.jump.z.toFixed(2)} m`
    : skater.move === MOVE.Spin ? `${["UPRIGHT", "SIT", "CAMEL"][skater.spin.position]} SPIN · ${(skater.spin.swept / (2 * Math.PI)).toFixed(1)} rev`
    : skater.move === MOVE.Turn ? (scheme === FULL_SCHEME ? ["THREE-TURN", "MOHAWK", "BRACKET", "LOOP", "ROCKER", "COUNTER", "CHOCTAW"][skater.turn.kind] : skater.turn.against
        ? (skater.turn.kind === TURN_KIND.Counter ? "COUNTER" : "BRACKET · hold through, stick reversed, for a counter")
        : skater.turn.kind === TURN_KIND.Mohawk ? "MOHAWK" : skater.turn.kind === TURN_KIND.Choctaw ? "CHOCTAW"
        : skater.turn.kind === TURN_KIND.Loop ? "LOOP" : skater.turn.kind === TURN_KIND.Rocker ? "ROCKER"
        : "THREE-TURN · shift weight for a mohawk, hold through for a loop or reversed for a rocker, both for a choctaw")
    : skater.move === MOVE.Twizzle ? "TWIZZLE" : skater.move === MOVE.InaBauer ? "INA BAUER"
    : skater.move === MOVE.Spiral ? "SPIRAL"
    : cantilever ? "CANTILEVER POSE" : skater.crossover && skater.strokeTime > 0 ? `${backward ? "BACK " : ""}CROSSOVER`
    : skater.jump.phase === JUMP_PHASE.Load ? "LOADING · release Shift / RT to jump" : backward ? "BACKWARD GLIDE" : "FORWARD GLIDE";
  el("move").textContent = skater.fallen
    ? skater.fallReason === FALL.Collision ? "HIT THE BOARDS · tap Space / A to get up" : "FALL · tap Space / A to get up"
    : move;
  const dig = digStatus((steering as GameControlState).full);
  el("stance").textContent = `${SETUPS.find(s => s.id === setup)?.name ?? CONTROL_NAMES[scheme]} · ${codeToString(skater.blade[0].code)} / ${codeToString(skater.blade[1].code)} · ${Math.hypot(skater.vel.x, skater.vel.y).toFixed(1)} m/s${dig ? " · " + dig : ""}`;
  el("landing").textContent = skater.landed.tick < 0 ? "" : `Last jump: ${JUMP_CODE[skater.landed.kind] ?? "hop"} · ${skater.landed.turned.toFixed(2)} rev · ${skater.landed.fall ? "fall" : skater.landed.stepOut ? "step-out" : "landed"}`;
  el("spin-level").textContent = lastSpinLabel;
  el("hint").textContent = skater.fallen ? "Down on the ice — tap Space / A to get up" : footChangeFlash > 0 ? "Foot change!" : comboFlash > 0 ? `Combination ${comboLabel}!` : rookie && rookie.toast>0 ? rookie.message : flash > 0 ? "Light caught. Keep the chain alive!" : freeSkate && playground.toast > 0 ? playground.message : freeSkate && beginner ? coach.message : freeSkate ? practice.toast > 0 ? `✓ ${practice.last} · +250 practice points` : "Hold Space / A to push · V changes the view" : "Follow the gold light · tap Space / A to keep your speed";
  drawCareer();
}
function frame(now: number) {
  const elapsed = Math.min((now - (last || now)) / 1000, 0.1); last = now;
  const controls = pad.read(true, ","); // U remains the game's low pose; comma winds up.
  if (guide.open || wardrobe.open || careerBoard.open) { pendingPush = false; pendingToe = false; pendingTrick=false; draw(now); requestAnimationFrame(frame); return; }
  if (controls.cycleView && !lowHeld && !(navigator.getGamepads?.().find(g => g?.connected)?.buttons[13]?.pressed)) scene.overview = !scene.overview;
  if (controls.zoom) scene.zoom = Math.max(0.65, Math.min(1.8, scene.zoom * Math.pow(1.15, controls.zoom)));
  if (controls.cycleScheme) { setup = null; saveSetup(); scheme = ((scheme + 1) % 4) as Scheme; steering = newSchemeState(); schemeSelect.value = String(scheme); saveControlScheme(); renderFullBindings(); renderSetup(); start(); }
  if (controls.pause) { if (mode === "playing") pause(); else if (mode === "paused") resume(); }
  if (controls.reset && mode !== "ready") start();
  if (mode === "ready" && controls.push) start();
  if (mode === "playing") {
    accumulator += elapsed;
    // A press lasts one simulation tick. Preserve it if this display frame has no tick.
    pendingPush ||= controls.push;
    pendingToe ||= controls.toe;
    if(beginner && scheme !== FULL_SCHEME) pendingTrick ||= controls.cycleJump;
    const lowPose = lowHeld || (navigator.getGamepads?.().find(g => g?.connected)?.buttons[13]?.pressed ?? false);
    while (accumulator >= SIM_DT && mode === "playing") {
      if(playback) {
        playback.advance(); skater = playback.state; params = playback.params;
        resolveRinkCollision(skater, playback.events);
        elapsedSkate += SIM_DT; scene.update(skater, SIM_DT);
        traceBlades();
        if(tables && skater.landed.tick >= 0 && scoredTick !== skater.landed.tick) {
          scoredTick = skater.landed.tick; technical += scoreJump(tables, skater.landed)?.score ?? 0;
        }
        accumulator -= SIM_DT;
        if(playback.done) {
          replayNotice = playback.divergence ? `Replay diverged at tick ${playback.divergence.tick}` : `Replay verified · ${playback.index} ticks`;
          pause(); el("title").textContent = playback.divergence ? "Replay mismatch." : "Every edge, replayed.";
          el("description").textContent = replayNotice; el("start").textContent = "New practice →";
        }
        continue;
      }
      const padPush = navigator.getGamepads?.().find(g => g?.connected)?.buttons[0]?.pressed ?? false;
      const canStroke = !skater.fallen && skater.move === MOVE.None && skater.jump.phase === JUMP_PHASE.None && !controls.brake && !controls.spin && !controls.turn && !controls.twizzle && !controls.inaBauer && !lowPose;
      const repeated = canStroke && skater.tick % 90 === 0 && ((scheme !== FULL_SCHEME && (pushHeld || padPush)) || (cruise && Math.hypot(skater.vel.x, skater.vel.y) < (courseMode ? 5.5 : beginner ? 5.5 + playground.flow * 0.035 : 5.5)));
      const aim = scene.worldAim(controls.lx, controls.ly);
      const aimed = scheme === SCHEME.B ? { ...controls, lx: aim.x, ly: aim.y } : controls;
      const liveControls = { ...aimed, push: pendingPush || repeated, autoPush: repeated, toe: pendingToe };
      const mapped = setup ? setupInput(liveControls, skater, setup, steering, params, controllerProfile, assistance)
        : gameInput(liveControls, skater, scheme, steering, lowPose, params, controllerProfile);
      const input = beginner ? coach.apply(mapped.input, skater, params, pendingTrick, SIM_DT) : mapped.input;
      pendingTrick = false; cantilever = mapped.cantilever;
      pendingPush = false; pendingToe = false;
      const events: EdgeEvent[] = [];
      step(skater, input, params, SIM_DT, events, ice);
      // sim/moves.ts spinTick's own foot change: changeCompletedTick advances
      // the instant a transfer resolves, mid-spin, well before the spin
      // itself ends — a toast now, not only ever reflected later in the
      // level `lastSpinLabel` shows once the whole spin is scored.
      if (skater.spin.changeCompletedTick >= 0 && skater.spin.changeCompletedTick !== lastChangeCompletedTick) {
        lastChangeCompletedTick = skater.spin.changeCompletedTick;
        footChangeFlash = 1.2;
      }
      const linked = combo.sample(skater);
      if (linked) { comboLabel = linked; comboFlash = 1.8; }
      // sim/spinLevel.ts: sample every tick a spin is live, score the moment
      // it ends (fallen or released — either way, s.move leaves MOVE.Spin).
      const spinning = skater.move === MOVE.Spin;
      if (spinning) spinTracker.sample(skater.spin);
      else if (wasSpinning) {
        const segments = spinTracker.finish();
        if (spinThresholds) {
          const result = scoreSpinLevel(segments, spinThresholds, spinTracker.footChanges);
          lastSpinLabel = `Last spin: level ${result.level > 0 ? result.level : "B"}`;
        }
        spinTracker.reset();
      }
      wasSpinning = spinning;
      if (sound) audio.onTick(input, events, skater);
      practice.sample(skater, cantilever, SIM_DT);
      if(freeSkate && !courseMode && !careerMode) {
        playground.sample(skater,SIM_DT);
        for (const reward of playground.rewards) scene.effects.reward(reward);
      }
      rookie?.sample(skater,SIM_DT);
      scene.update(skater, SIM_DT);
      recorder.capture(input, params, skater, events, (["A","B","C","D"] as const)[scheme]);
      const wasUp = !skater.fallen;
      resolveRinkCollision(skater, events);
      if (sound && wasUp && skater.fallReason === FALL.Collision) audio.crash();
      if(tables && skater.landed.tick >= 0 && scoredTick !== skater.landed.tick) {
        scoredTick = skater.landed.tick; technical += scoreJump(tables, skater.landed)?.score ?? 0;
      }
      elapsedSkate += SIM_DT;
      if (!freeSkate) {
        const target = run.target, previousScore = run.score;
        if (run.sample(skater, SIM_DT)) {
          flash = 1.2;
          scene.effects.reward({ ...target, kind: "light", points: run.score - previousScore });
        }
      }
      flash = Math.max(0, flash - SIM_DT);
      footChangeFlash = Math.max(0, footChangeFlash - SIM_DT);
      comboFlash = Math.max(0, comboFlash - SIM_DT);
      traceBlades();
      accumulator -= SIM_DT;
      if (!freeSkate && run.done) finish();
      if (choreography && !playback) {
        const previous = choreography.index;
        choreography.sample(skater, cantilever, SIM_DT, events);
        if (previous !== choreography.index) renderRoutine();
        if (choreography.done) finishCareer();
      }
    }
  } else { pendingPush = false; pendingToe = false; pendingTrick=false; }
  draw(now); requestAnimationFrame(frame);
}

const careerBoard = el("career-board") as HTMLDialogElement;
let resumeAfterCareer = false, saveNotice = "Progress saves automatically on this browser.";
function saveCareer() {
  try { localStorage.setItem("edgework-career-v1", career.serialize()); saveNotice = "Career saved on this browser."; }
  catch { saveNotice = "Storage is unavailable. Your career continues for this session only."; }
}
function refreshCareer() {
  el("career-summary").textContent = `${career.medals.filter(Boolean).length}/${CAREER_EVENTS.length} events completed · ${career.profile.xp} XP available`;
  const events = el("career-events"); events.replaceChildren();
  CAREER_EVENTS.forEach((event, i) => {
    const card = document.createElement("article"); card.className = "career-event";
    const title = document.createElement("h3"); title.textContent = `${String(i + 1).padStart(2, "0")} / ${event.title}`;
    const details = document.createElement("p"); details.textContent = `${event.venue} · ${event.seconds}s · ${MEDALS[career.medals[i]]}`;
    const routine = document.createElement("p"); routine.textContent = event.routine.map(id => ELEMENTS[id].title).join(" → ");
    const button = document.createElement("button"); button.disabled = i > career.unlocked;
    button.textContent = !button.disabled ? (career.medals[i] ? "Replay program →" : "Skate this program →")
      : i > career.medalCap ? "Complete the previous event to unlock"
      : `Train to ${TIERS[i].name} overall (${TIERS[i].floor}) to unlock`;
    button.addEventListener("click", () => {
      careerEvent = i; careerMode = true; courseMode = false; freeSkate = true; cruise = true;
      resumeAfterCareer = false; careerBoard.close(); start();
    });
    card.append(title, details, routine, button); events.append(card);
  });
  const training = el("career-training"); training.replaceChildren();
  for (const [stat, label] of [["strength", "Push power"], ["spring", "Jump spring"], ["edgeControl", "Edge control"], ["balance", "Balance"]] as const) {
    const value = career.profile.stats[stat], cost = xpToRaise(value), button = document.createElement("button");
    button.textContent = `${label} ${value} · ${value === 100 ? "Max" : `+1 / ${cost} XP`}`;
    button.disabled = value === 100 || career.profile.xp < cost;
    button.addEventListener("click", () => { career.train(stat); saveCareer(); refreshCareer(); });
    training.append(button);
  }
  el("career-save").textContent = saveNotice;
}
function openCareer() { resumeAfterCareer = mode === "playing"; pause(); refreshCareer(); careerBoard.showModal(); }
el("career-menu").addEventListener("click", openCareer);
el("career-open").addEventListener("click", openCareer);
el("career-close").addEventListener("click", () => careerBoard.close());
careerBoard.addEventListener("close", () => { if (resumeAfterCareer) resume(); });
function renderRoutine() {
  const list = el("routine-list"); list.replaceChildren();
  if (!choreography) return;
  choreography.event.routine.forEach((id, i) => {
    const item = document.createElement("li"); item.textContent = ELEMENTS[id].title;
    item.dataset.state = i < choreography!.index ? "done" : i === choreography!.index ? "current" : "next";
    if (i === choreography!.index) item.setAttribute("aria-current", "step");
    list.append(item);
  });
}
function drawCareer() {
  el("routine-hud").hidden = !choreography || !!playback;
  if (!choreography || playback) return;
  const c = choreography, element = ELEMENTS[c.current];
  el("time-label").textContent = "Program time"; el("time").textContent = c.seconds.toFixed(1);
  el("score").textContent = String(c.index * 250);
  el("combo-label").textContent = "Choreography"; el("combo").textContent = `${c.index}/${c.event.routine.length}`;
  el("lesson-title").textContent = element?.title ?? "Program complete";
  el("lesson-tip").textContent = element?.hint ?? "Your choreography is complete. See your result and next event.";
  el("lesson-progress").textContent = `${c.index}/${c.event.routine.length} elements`;
  const status = `${c.event.title} · ${c.falls} falls · ${c.complete ? MEDALS[c.medal] : "Finish to unlock the next event"}`;
  if (el("routine-status").textContent !== status) el("routine-status").textContent = status;
  (el("routine-meter") as HTMLProgressElement).value = c.complete ? 1 : element?.duration ? Math.min(1, c.held / element.duration) : 0;
  if (!skater.fallen) el("hint").textContent = `CHOREOGRAPHY · ${element?.title ?? "Complete"} · ${c.event.routine[c.index + 1] ? `Next: ${ELEMENTS[c.event.routine[c.index + 1]].title}` : "Final element"}`;
}
function finishCareer() {
  if (!choreography) return;
  mode = "done"; musicEl.pause();
  const c = choreography, xp = career.award(c); saveCareer();
  el("title").textContent = c.complete ? `${MEDALS[c.medal]} on ice.` : "One more rehearsal.";
  const next = careerEvent < CAREER_EVENTS.length - 1 ? `Next event: ${CAREER_EVENTS[careerEvent + 1].title}. Open Career to continue.` : "Season complete! Replay events to improve your medals.";
  // sim/pcs.ts's own score, never shown anywhere before this — silently absent (rather than a
  // misleading "0.00") whenever finalizePcs left it null (no segmentRules/ice at construction).
  const pcs = c.pcsScore ? ` · PCS ${c.pcsScore.total.toFixed(2)} (Comp ${c.pcsScore.composition.toFixed(2)} / Pres ${c.pcsScore.presentation.toFixed(2)} / Skills ${c.pcsScore.skatingSkills.toFixed(2)})` : "";
  // sim/sheet.ts's protocol: jump elements as called (a repeat marked *), then the segment total.
  const sheet = c.sheet ? ` · Jumps ${c.sheet.lines.join(", ") || "none"} · TES ${c.technicalScore.toFixed(2)}${pcs} · −${c.deductions.toFixed(2)} falls · Total ${c.segmentScore.toFixed(2)}` : pcs;
  el("description").textContent = `${c.index}/${c.event.routine.length} elements · ${c.falls} falls · +${xp} XP${sheet}. ${c.complete ? next : `Time ran out at ${ELEMENTS[c.current].title}. Follow the moves in order and try again.`} ${saveNotice}`;
  el("help").hidden = true; el("start").textContent = "Retry this program →";
  el("overlay").hidden = false; el("pause").hidden = true; el("start").focus();
}
let pendingPush = false;
requestAnimationFrame(frame);
