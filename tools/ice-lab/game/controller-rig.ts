import { Pad } from "../app/pad.ts";
import type { ControllerHardware } from "../app/pad.ts";
import { newSchemeState } from "../app/schemes.ts";
import { createState, step } from "../sim/solver.ts";
import { SIM_DT } from "../sim/params.ts";
import { MOVE, TURN_NAME, codeToString } from "../sim/types.ts";
import type { EdgeEvent, SkatingInput } from "../sim/types.ts";
import { JUMP_PHASE, JUMP_CODE } from "../sim/jump.ts";
import { IceGrid } from "../sim/ice.ts";
import { ReplayRecorder } from "../sim/replay.ts";
import { SETUPS, SETUP_KEY, setupParams, setupInput } from "./setups.ts";
import type { Setup } from "./setups.ts";
import { manualAction, ACTIONS, BUTTON_NAMES, BINDABLE_BUTTONS, TUNING, PROFILE_KEY, FEET_LAYOUTS, defaultControllerProfile, loadControllerProfile, parseControllerProfile } from "./full-controls.ts";
import { PADDLE_ACTIONS, PADDLE_BUTTONS, PADDLE_POSITIONS, PADDLE_PRESETS, PADDLE_SETUPS, paddleActionAllowed, paddleLayer, paddlePreset } from "./full-controls.ts";
import type { FeetLayout, PaddleAction, PaddleSetup } from "./full-controls.ts";
import type { GameControlState } from "./full-controls.ts";
import { PadProbe, beyondStandard, describeChange, describeSlots } from "./pad-probe.ts";
import type { PadChange } from "./pad-probe.ts";
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const pad = new Pad();
let profile = loadControllerProfile();
let setup: Setup = "repertoire", assistance = 0.75;
let p = { ...setupParams(setup, assistance), musicMode: 0 };
let s = createState(p, 6.8), st: GameControlState = newSchemeState(), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
let recorder = new ReplayRecorder(p, 6.8), input: SkatingInput | null = null, low = false;
let running = true, time = 0, accumulator = 0;
let trace: { x: number; y: number }[] = [];
let hardware: ControllerHardware = { connected: false, axes: [0, 0, 0, 0], buttons: [], keys: [] };
// 22 buttons, as Firefox reports an Elite: 16 and 17 unused, 18–21 the paddles.
const virtual: ControllerHardware = { connected: true, axes: [0, 0, 0, 0], buttons: Array(22).fill(0), keys: [] };
const paddleName = (b: number) => `b${b} · ${PADDLE_POSITIONS[b as keyof typeof PADDLE_POSITIONS]}`;
/** The paddles as the operator sees them: top row first, left before right. */
const PADDLE_ORDER = [20, 18, 21, 19] as const;
let paddleSetup: PaddleSetup = "experimental";
const source = () => el<HTMLSelectElement>("source").value;
function status(text: string) { el("status").textContent = text; }
function reset(speed = 6.8) {
  p = { ...setupParams(setup, assistance), musicMode: 0 };
  s = createState(p, speed); st = newSchemeState(); ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  recorder = new ReplayRecorder(p, speed); trace = []; accumulator = 0; input = null;
}
function download(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderBindings() {
  el<HTMLSelectElement>("modifier").value = String(profile.modifier);
  el<HTMLSelectElement>("feet").value = profile.feet ?? "dpad";
  el("bindings").replaceChildren();
  for (const action of ACTIONS) {
    const row = document.createElement("tr"), name = document.createElement("td"), cell = document.createElement("td"), select = document.createElement("select");
    select.disabled = setup !== "repertoire" && !manualAction(action.id);
    name.textContent = `${select.disabled ? "Repertoire only: " : ""}${action.name} · ${action.key === " " ? "Space" : action.key.toUpperCase()}`;
    select.setAttribute("aria-label", `${action.name} binding`);
    for (const modified of [false, true]) for (const button of BINDABLE_BUTTONS.filter(b => b !== profile.modifier)) {
      const option = document.createElement("option"); option.value = `${button}:${Number(modified)}`;
      option.textContent = `${modified ? BUTTON_NAMES[profile.modifier] + " + " : ""}${BUTTON_NAMES[button]}`;
      select.append(option);
    }
    const b = profile.bindings[action.id]; select.value = `${b.button}:${Number(b.modified)}`;
    select.addEventListener("change", () => {
      const [button, modified] = select.value.split(":").map(Number);
      const other = ACTIONS.find(a => profile.bindings[a.id].button === button && Number(profile.bindings[a.id].modified) === modified);
      if (other) profile.bindings[other.id] = { ...profile.bindings[action.id] };
      profile.bindings[action.id] = { button, modified: Boolean(modified) };
      st = newSchemeState(); renderBindings(); status("Binding changed. Save to use it in the game.");
    });
    cell.append(select); row.append(name, cell); el("bindings").append(row);
  }
  renderVirtualButtons();
}
function renderPaddles() {
  el<HTMLSelectElement>("paddle-setup").value = paddleSetup;
  const layer = paddleLayer(profile, paddleSetup);
  const change = (next: typeof layer, what: string) => {
    profile.paddles = { ...profile.paddles, [paddleSetup]: next };
    st = newSchemeState(); renderPaddles(); status(`${what} Save to use it in the game.`);
  };
  el("paddle-presets").replaceChildren();
  for (const preset of PADDLE_PRESETS) {
    const button = document.createElement("button");
    button.textContent = preset.name;
    const layerOk = PADDLE_BUTTONS.every(b => paddleActionAllowed(paddleSetup, preset.layer[b]));
    button.disabled = !layerOk;
    if (!layerOk) button.title = "Simulation has no free leg";
    button.setAttribute("aria-pressed", String(PADDLE_BUTTONS.every(b => layer[b] === preset.layer[b])));
    button.addEventListener("click", () => change(paddlePreset(preset.id), `Paddles: ${preset.name}.`));
    el("paddle-presets").append(button);
  }
  el("paddles").replaceChildren();
  for (const b of PADDLE_ORDER) {
    const row = document.createElement("tr"), name = document.createElement("td"), cell = document.createElement("td"), select = document.createElement("select");
    row.dataset.button = String(b);
    name.textContent = paddleName(b);
    select.setAttribute("aria-label", `Paddle ${paddleName(b)} action`);
    for (const action of PADDLE_ACTIONS) {
      if (!paddleActionAllowed(paddleSetup, action.id)) continue;
      const option = document.createElement("option"); option.value = action.id; option.textContent = action.name; select.append(option);
    }
    select.value = layer[b];
    select.addEventListener("change", () => change({ ...layer, [b]: select.value as PaddleAction }, `Paddle ${paddleName(b)} changed.`));
    cell.append(select); row.append(name, cell); el("paddles").append(row);
  }
  el("paddle-note").textContent = setup === "experimental" || setup === "simulation" ? "" : `The paddles do nothing in ${SETUPS.find(x => x.id === setup)!.name}.`;
}
function syncPaddles() {
  for (const row of el("paddles").querySelectorAll<HTMLElement>("tr")) row.classList.toggle("on", (hardware.buttons[Number(row.dataset.button)] ?? 0) > 0.5);
}
function renderTuning() {
  el("tuning").replaceChildren();
  for (const t of TUNING) {
    const label = document.createElement("label"), range = document.createElement("input"), output = document.createElement("output");
    label.className = "range"; label.textContent = t.label;
    range.type = "range"; range.min = String(t.min); range.max = String(t.max); range.step = String(t.step); range.value = String(profile[t.key]);
    range.id = t.key; output.textContent = profile[t.key].toFixed(2); label.append(output, range);
    range.addEventListener("input", () => { profile[t.key] = Number(range.value); output.textContent = profile[t.key].toFixed(2); status("Previewing changes. Save when they feel right."); });
    el("tuning").append(label);
  }
}
function renderVirtualButtons() {
  el("virtual-buttons").replaceChildren();
  for (const index of BINDABLE_BUTTONS) {
    const button = document.createElement("button");
    const assigned = ACTIONS.filter(a => profile.bindings[a.id].button === index && (setup === "repertoire" || manualAction(a.id)));
    button.textContent = `${BUTTON_NAMES[index]} · ${index === profile.modifier ? "Hold for extra moves" : assigned.map(a => `${profile.bindings[a.id].modified ? "+ modifier: " : ""}${a.name}`).join(" / ") || "Unassigned"}`;
    button.dataset.button = String(index);
    const base = assigned.find(a => !profile.bindings[a.id].modified);
    if (base) button.dataset.action = base.id;
    button.addEventListener("click", () => { virtual.buttons[index] = virtual.buttons[index] > 0.5 ? 0 : 1; syncVirtualButtons(); });
    el("virtual-buttons").append(button);
  }
  for (const index of PADDLE_ORDER) {
    const button = document.createElement("button");
    button.textContent = `Paddle ${paddleName(index)}`;
    button.dataset.button = String(index);
    button.addEventListener("click", () => { virtual.buttons[index] = virtual.buttons[index] > 0.5 ? 0 : 1; syncVirtualButtons(); });
    el("virtual-buttons").append(button);
  }
  syncVirtualButtons();
}
function syncVirtualButtons() {
  for (const button of el("virtual-buttons").querySelectorAll("button")) button.setAttribute("aria-pressed", String(virtual.buttons[Number(button.dataset.button)] > 0.5));
}
for (const [index, name] of ["Left stick X", "Left stick Y", "Right stick X", "Right stick Y", "LT brake", "RT load", "LB left foot", "RB right foot"].entries()) {
  const label = document.createElement("label"), range = document.createElement("input"), out = document.createElement("output");
  label.className = "range"; label.textContent = name; range.type = "range"; range.min = index < 4 ? "-1" : "0"; range.max = "1"; range.step = "0.01"; range.value = "0"; range.id = `virtual-${index}`;
  out.textContent = "0.00"; range.addEventListener("input", () => { const value = Number(range.value); if (index < 4) virtual.axes[index] = value; else virtual.buttons[[6, 7, 4, 5][index - 4]] = value; out.textContent = value.toFixed(2); });
  label.append(out, range); el("virtual-axes").append(label);
}
el("neutral").onclick = () => {
  virtual.axes.fill(0); virtual.buttons.fill(0); syncVirtualButtons();
  for (const i of el("virtual-axes").querySelectorAll("input")) { i.value = "0"; i.dispatchEvent(new Event("input")); }
};
el("paddle-setup").onchange = () => {
  const value = el<HTMLSelectElement>("paddle-setup").value;
  if (PADDLE_SETUPS.includes(value as PaddleSetup)) { paddleSetup = value as PaddleSetup; renderPaddles(); }
};
el("setup").onchange = () => {
  setup = el<HTMLSelectElement>("setup").value as Setup;
  // The paddle layer shown follows the setup, when it is one that reads them.
  if (setup === "experimental" || setup === "simulation") paddleSetup = setup;
  renderPaddles();
  el("setup-description").textContent = SETUPS.find(s => s.id === setup)!.description;
  el<HTMLInputElement>("assist").disabled = setup !== "explorer";
  reset(); renderBindings();
};
el("assist").onchange = () => { assistance = Number(el<HTMLInputElement>("assist").value); reset(); };
el("source").onchange = () => { el("virtual").hidden = source() !== "virtual"; reset(); };
el("modifier").onchange = () => {
  const before = profile.modifier, after = Number(el<HTMLSelectElement>("modifier").value);
  for (const a of ACTIONS) if (profile.bindings[a.id].button === after) profile.bindings[a.id].button = before;
  profile.modifier = after; virtual.buttons.fill(0); st = newSchemeState(); renderBindings();
};
el("feet").onchange = () => {
  const value = el<HTMLSelectElement>("feet").value;
  if (FEET_LAYOUTS.includes(value as FeetLayout)) { profile.feet = value as FeetLayout; st = newSchemeState(); status("Feet layout changed for preview. Save to keep it."); }
};
el("run").onclick = () => { running = !running; el("run").textContent = running ? "Pause" : "Resume"; el("run").setAttribute("aria-pressed", String(running)); accumulator = 0; };
el("reset").onclick = () => reset(); el("backward").onclick = () => reset(-6.8);
el("defaults").onclick = () => { profile = defaultControllerProfile(); virtual.buttons.fill(0); reset(); renderTuning(); renderBindings(); renderPaddles(); status("Defaults restored for preview. Save to keep them."); };
el("save").onclick = () => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(parseControllerProfile(profile))); localStorage.setItem(SETUP_KEY, JSON.stringify({ setup, assistance })); status("Saved setup and sensitivity. Reload the game to apply them."); } catch (e) { status(String(e)); } };
el("export").onclick = () => download("edgework-controller.json", JSON.stringify(profile, null, 2));
el("replay").onclick = () => download("edgework-controller-replay.json", recorder.toJson());
el("import").onchange = async () => {
  const file = el<HTMLInputElement>("import").files?.[0]; if (!file) return;
  try { if (file.size > 65536) throw Error("Profile exceeds 64 KiB"); profile = parseControllerProfile(JSON.parse(await file.text())); reset(); renderTuning(); renderBindings(); renderPaddles(); status("Profile imported for preview. Save to use it in the game."); } catch (e) { status(String(e)); }
};
const canvas = el<HTMLCanvasElement>("ice"), ctx = canvas.getContext("2d")!;
const fmt = (n: number) => n.toFixed(2);
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2);
  const scale = 11; ctx.scale(scale, scale); ctx.strokeStyle = "#537b91"; ctx.lineWidth = 0.1;
  ctx.strokeRect(-p.rinkHalfLength, -p.rinkHalfWidth, p.rinkHalfLength * 2, p.rinkHalfWidth * 2);
  ctx.beginPath(); for (let i = 0; i < trace.length; i++) { const v = trace[i]; if (i === 0) ctx.moveTo(v.x, v.y); else ctx.lineTo(v.x, v.y); } ctx.stroke();
  ctx.translate(s.pos.x, s.pos.y); ctx.fillStyle = s.fallen ? "#a72e43" : "#16495b"; ctx.beginPath(); ctx.arc(0, 0, 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s.heading.x * 1.5, s.heading.y * 1.5); ctx.lineWidth = 0.2; ctx.stroke(); ctx.restore();
  const move = s.move === MOVE.Turn ? TURN_NAME[s.turn.kind] : ["Glide", "Turn", "Twizzle", "Spin", "Ina Bauer", "Spiral"][s.move] ?? "Glide";
  el("observed").textContent = s.fallen ? "Fall · push to recover" : s.jump.phase === JUMP_PHASE.Air ? `Airborne · ${JUMP_CODE[s.jump.kind] ?? "jump"}` : low ? "Cantilever" : move;
  el("requested").textContent = st.full?.request ?? "Glide";
  el("skating").textContent = `${fmt(Math.hypot(s.vel.x, s.vel.y))} m/s · ${fmt(s.tick * SIM_DT)} s\n${s.blade.map(b => codeToString(b.code)).join(" / ")}\nLast: ${s.moveDone.tick < 0 ? "—" : s.moveDone.kind === MOVE.Turn ? TURN_NAME[s.moveDone.detail] : "move completed"}`;
  el("raw").textContent = `Left: ${hardware.axes.slice(0, 2).map(fmt).join(" / ")}\nRight: ${hardware.axes.slice(2, 4).map(fmt).join(" / ")}\nLT / RT: ${fmt(hardware.buttons[6] ?? 0)} / ${fmt(hardware.buttons[7] ?? 0)}\nButtons: ${hardware.buttons.flatMap((v, i) => v > 0.5 ? [BUTTON_NAMES[i] ?? (i in PADDLE_POSITIONS ? `Paddle ${paddleName(i)}` : String(i))] : []).join(", ") || "—"}`;
  el("mapped").textContent = input ? `Lean: ${fmt(input.lean)} · split: ${fmt(input.leanSplit)} · pitch: ${fmt(input.pitch)}\nShaped L: ${fmt(st.full?.left.x ?? 0)} / ${fmt(st.full?.left.y ?? 0)}\nKnee: ${fmt(input.knee)} · weight R: ${fmt(input.weight)}\nArms: ${fmt(input.carriage)} · wind-up: ${fmt(input.windup)}\nReversal threshold: ${fmt(p.rockerCounterStick)}\n${["push", "brake", "toe", "turn", "bracket", "spin", "twizzle", "inaBauer"].filter(k => input![k as keyof SkatingInput] === true).join(" · ") || "No move buttons"}` : "Waiting for the first tick";
}
// The raw probe reads getGamepads() itself rather than through Pad, which only
// ever looks at the first connected pad and only at the indices it maps.
const probe = new PadProbe();
let probeShape = "";
function drawProbe(now: number) {
  const list = [...(navigator.getGamepads?.() ?? [])];
  const changes = probe.update(list, now / 1000);
  const shape = list.map((g, i) => g?.connected ? `${i}:${g.id}:${g.buttons.length}:${g.axes.length}` : "").join("|");
  if (shape !== probeShape) {
    // Rebuilt only when a pad arrives, leaves or changes size; every other
    // frame just rewrites the cells' text and classes.
    probeShape = shape;
    el("probe-pads").replaceChildren();
    list.forEach((g, slot) => {
      if (!g?.connected) return;
      const name = document.createElement("div"), cells = document.createElement("div");
      name.className = "pad-name"; name.textContent = `Slot ${slot} · ${g.mapping === "standard" ? "standard mapping" : "non-standard mapping"} · ${g.id}`;
      cells.className = "cells";
      const add = (kind: PadChange["kind"], index: number) => {
        const cell = document.createElement("span");
        cell.className = "cell"; cell.dataset.slot = String(slot); cell.dataset.kind = kind; cell.dataset.index = String(index);
        cells.append(cell);
      };
      g.buttons.forEach((_, i) => add("button", i));
      g.axes.forEach((_, i) => add("axis", i));
      el("probe-pads").append(name, cells);
    });
  }
  if (changes.length || !el("probe-slots").textContent) {
    el("probe-slots").textContent = describeSlots(list);
    el("probe-log").textContent = probe.log.map(describeChange).join("\n") || "No changes yet";
    if (probe.last) el("probe-last").textContent = describeChange(probe.last);
  }
  const last = probe.last;
  for (const cell of el("probe-pads").querySelectorAll<HTMLElement>(".cell")) {
    const slot = Number(cell.dataset.slot), index = Number(cell.dataset.index), kind = cell.dataset.kind as "button" | "axis", g = list[slot];
    if (!g) continue;
    const button = kind === "button" ? g.buttons[index] : null, value = button ? button.value : g.axes[index] ?? 0;
    cell.textContent = `${kind === "button" ? "b" : "a"}${index} ${fmt(value)}`;
    cell.classList.toggle("on", button?.pressed ?? false);
    cell.classList.toggle("extra", beyondStandard(g.mapping, kind, index));
    cell.classList.toggle("recent", last !== null && last.slot === slot && last.kind === kind && last.index === index);
  }
}
function frame(now: number) {
  const dt = Math.min(0.1, (now - (time || now)) / 1000); time = now;
  const controls = pad.read(true, ","); hardware = source() === "virtual" ? virtual : controls.hardware!;
  el("connection").textContent = source() === "virtual" ? "Virtual controller · changes below feed the same mapping as a real pad" : hardware.connected ? `Controller connected · ${SETUPS.find(s => s.id === setup)!.name}` : "Keyboard active · connect a controller or try the virtual controller";
  if (source() === "hardware") { if (controls.pause) el("run").click(); if (controls.reset) reset(); }
  if (running && !document.hidden) {
    accumulator += dt;
    while (accumulator >= SIM_DT) {
      const result = setupInput({ ...controls, hardware }, s, setup, st, p, profile, assistance); input = result.input; low = result.cantilever;
      const events: EdgeEvent[] = []; step(s, input, p, SIM_DT, events, ice); recorder.capture(input, p, s, events, "D");
      if (s.tick % 4 === 0) { trace.push({ ...s.pos }); if (trace.length > 7200) trace.shift(); }
      accumulator -= SIM_DT;
    }
  } else accumulator = 0;
  draw(); drawProbe(now); syncPaddles(); requestAnimationFrame(frame);
}
renderTuning(); renderBindings(); renderPaddles(); requestAnimationFrame(frame);
