import { createState, step } from "../sim/solver.ts";
import { SIM_DT } from "../sim/params.ts";
import { Pad } from "../app/pad.ts";
import { newSchemeState, SCHEME } from "../app/schemes.ts";
import type { Scheme } from "../app/schemes.ts";
import { MOVE, TURN_KIND, FALL, codeToString } from "../sim/types.ts";
import { JUMP_PHASE, JUMP_CODE } from "../sim/jump.ts";
import { GAME_PARAMS, CONTROL_NAMES, gameInput } from "./controls.ts";
import { IceRun } from "./run.ts";
import { SkateScene } from "./scene.ts";
import { SKINS, skinById } from "./appearance.ts";
import { Practice, LESSONS } from "./practice.ts";
import { BeginnerCoach, BEGINNER_PARAMS } from "./beginner.ts";
import { Playground } from "./playground.ts";
import { RookieCourse } from "./rookie.ts";
import { resolveRinkCollision } from "./rink.ts";
let courseMode = false, rookie: RookieCourse | null = null;
import { EdgeAudio } from "../app/audio.ts";
import type { EdgeEvent } from "../sim/types.ts";
import { SAMPLE_PROFILES, applyProfile } from "../sim/profile.ts";
import { ReplayRecorder, ReplayPlayer, parseReplay, MAX_REPLAY_BYTES } from "../sim/replay.ts";
import { loadTables, scoreJump } from "../sim/score.ts";
import type { ScoreTables } from "../sim/score.ts";

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
let scheme: Scheme = SCHEME.B, freeSkate = true, cantilever = false, lowHeld = false;
let elapsedSkate = 0, pendingToe = false;
const guide = el("guide") as HTMLDialogElement;
let resumeAfterGuide = false;
const wardrobe = el("wardrobe") as HTMLDialogElement;
let resumeAfterWardrobe = false;
let skater = createState(params, 4.5), steering = newSchemeState(), run = new IceRun();
let mode: "ready" | "playing" | "paused" | "done" = "ready";
let best = 0, accumulator = 0, last = 0, flash = 0;
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
  params = applyProfile(beginner ? BEGINNER_PARAMS : GAME_PARAMS, SAMPLE_PROFILES[profileIndex]);
  applyTrack(params);
  coach = new BeginnerCoach(); playground = new Playground(); pendingTrick = false; rookie = courseMode ? new RookieCourse() : null;
  recorder = new ReplayRecorder(params, 4.5); playback = null; replayJson = "";
  technical = 0; scoredTick = -1; replayNotice = "Recording your skating · first five minutes";
  skater = createState(params, 4.5); steering = newSchemeState(); run = new IceRun();
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
el("free").addEventListener("click", () => { freeSkate = true; courseMode = false; cruise = true; start(); });
el("rookie").addEventListener("click", () => { freeSkate=true; courseMode=true; cruise=true; start(); });
el("timed").addEventListener("click", () => { freeSkate = false; courseMode = false; cruise = false; start(); });
el("controls").addEventListener("click", () => {
  resumeAfterGuide = mode === "playing"; pause(); guide.showModal();
});
function refreshWardrobe() {
  for (const skin of SKINS) el(`skin-${skin.id}`).setAttribute("aria-pressed", String(scene.skin.id === skin.id));
  el("skin-status").textContent = `${scene.skin.name} selected · ready for the ice`;
}
for (const skin of SKINS) el(`skin-${skin.id}`).addEventListener("click", () => {
  scene.skin = skin;
  try { localStorage.setItem("edgework-skin", skin.id); } catch { /* Keep the choice for this session. */ }
  refreshWardrobe();
});
function openWardrobe() {
  resumeAfterWardrobe = mode === "playing"; pause(); refreshWardrobe(); wardrobe.showModal();
}
el("style").addEventListener("click", openWardrobe);
el("opening-style").addEventListener("click", openWardrobe);
el("close-wardrobe").addEventListener("click", () => wardrobe.close());
wardrobe.addEventListener("close", () => { if (resumeAfterWardrobe) resume(); });
(el("difficulty") as HTMLSelectElement).addEventListener("change", e => {
  beginner=(e.target as HTMLSelectElement).value==="beginner"; start(); pause();
});
el("trick").addEventListener("click", () => { pendingTrick=true; });
const schemeSelect = el("scheme-select") as HTMLSelectElement;
const profileSelect = el("profile-select") as HTMLSelectElement;
SAMPLE_PROFILES.forEach((profile, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = profile.name; profileSelect.append(option); });
schemeSelect.addEventListener("change", () => { scheme = Number(schemeSelect.value) as Scheme; steering = newSchemeState(); });
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
    start(); playback = new ReplayPlayer(clip); replayJson = json;
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
  scene.draw(ctx, width, height, skater, params, trail, cantilever, freeSkate ? null : run.collected % 12, freeSkate && !playback && !courseMode ? playground : null, !playback ? rookie : null);
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
    : skater.move === MOVE.Turn ? (skater.turn.against ? "BRACKET"
        : skater.turn.kind === TURN_KIND.Mohawk ? "MOHAWK" : "THREE-TURN · shift weight for a mohawk")
    : skater.move === MOVE.Twizzle ? "TWIZZLE" : skater.move === MOVE.InaBauer ? "INA BAUER"
    : cantilever ? "CANTILEVER POSE" : skater.crossover && skater.strokeTime > 0 ? `${backward ? "BACK " : ""}CROSSOVER`
    : skater.jump.phase === JUMP_PHASE.Load ? "LOADING · release Shift / RT to jump" : backward ? "BACKWARD GLIDE" : "FORWARD GLIDE";
  el("move").textContent = skater.fallen
    ? skater.fallReason === FALL.Collision ? "HIT THE BOARDS · tap Space / A to get up" : "FALL · tap Space / A to get up"
    : move;
  el("stance").textContent = `${CONTROL_NAMES[scheme]} · ${codeToString(skater.blade[0].code)} / ${codeToString(skater.blade[1].code)} · ${Math.hypot(skater.vel.x, skater.vel.y).toFixed(1)} m/s`;
  el("landing").textContent = skater.landed.tick < 0 ? "" : `Last jump: ${JUMP_CODE[skater.landed.kind] ?? "hop"} · ${skater.landed.turned.toFixed(2)} rev · ${skater.landed.fall ? "fall" : skater.landed.stepOut ? "step-out" : "landed"}`;
  el("hint").textContent = skater.fallen ? "Down on the ice — tap Space / A to get up" : rookie && rookie.toast>0 ? rookie.message : flash > 0 ? "Light caught. Keep the chain alive!" : freeSkate && playground.toast > 0 ? playground.message : freeSkate && beginner ? coach.message : freeSkate ? practice.toast > 0 ? `✓ ${practice.last} · +250 practice points` : "Hold Space / A to push · V changes the view" : "Follow the gold light · tap Space / A to keep your speed";
}
function frame(now: number) {
  const elapsed = Math.min((now - (last || now)) / 1000, 0.1); last = now;
  const controls = pad.read(true);
  if (guide.open || wardrobe.open) { pendingPush = false; pendingToe = false; pendingTrick=false; draw(now); requestAnimationFrame(frame); return; }
  if (controls.cycleView && !lowHeld && !(navigator.getGamepads?.().find(g => g?.connected)?.buttons[13]?.pressed)) scene.overview = !scene.overview;
  if (controls.zoom) scene.zoom = Math.max(0.65, Math.min(1.8, scene.zoom * Math.pow(1.15, controls.zoom)));
  if (controls.cycleScheme) { scheme = ((scheme + 1) % 3) as Scheme; steering = newSchemeState(); }
  if (controls.pause) { if (mode === "playing") pause(); else if (mode === "paused") resume(); }
  if (controls.reset && mode !== "ready") start();
  if (mode === "ready" && controls.push) start();
  if (mode === "playing") {
    accumulator += elapsed;
    // A press lasts one simulation tick. Preserve it if this display frame has no tick.
    pendingPush ||= controls.push;
    pendingToe ||= controls.toe;
    if(beginner) pendingTrick ||= controls.cycleJump;
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
      const repeated = canStroke && skater.tick % 90 === 0 && (pushHeld || padPush || (cruise && Math.hypot(skater.vel.x, skater.vel.y) < (courseMode ? 5.5 : beginner ? 5.5 + playground.flow * 0.035 : 5.5)));
      const aim = scene.worldAim(controls.lx, controls.ly);
      const aimed = scheme === SCHEME.B ? { ...controls, lx: aim.x, ly: aim.y } : controls;
      const mapped = gameInput({ ...aimed, push: pendingPush || repeated, toe: pendingToe }, skater, scheme, steering, lowPose, params);
      const input = beginner ? coach.apply(mapped.input, skater, params, pendingTrick, SIM_DT) : mapped.input;
      pendingTrick = false; cantilever = mapped.cantilever;
      pendingPush = false; pendingToe = false;
      const events: EdgeEvent[] = [];
      step(skater, input, params, SIM_DT, events);
      if (sound) audio.onTick(input, events, skater);
      practice.sample(skater, cantilever, SIM_DT);
      if(freeSkate && !courseMode) {
        playground.sample(skater,SIM_DT);
        for (const reward of playground.rewards) scene.effects.reward(reward);
      }
      rookie?.sample(skater,SIM_DT);
      scene.update(skater, SIM_DT);
      recorder.capture(input, params, skater, events, (["A","B","C"] as const)[scheme]);
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
      traceBlades();
      accumulator -= SIM_DT;
      if (!freeSkate && run.done) finish();
    }
  } else { pendingPush = false; pendingToe = false; pendingTrick=false; }
  draw(now); requestAnimationFrame(frame);
}
let pendingPush = false;
requestAnimationFrame(frame);
