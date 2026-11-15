// tools/ice-lab/game/elementstats.ts — the telemetry card for every element.
//
// A TV broadcast puts a graphic up after a jump: how high, how long in the
// air, how fast it turned. This reads the same things from the solver, tick by
// tick, and when an element finishes it hands back one card.
//
// DISPLAY ONLY. A card never feeds a score, a GOE, the career or an unlock.
// The owner decides gate policy; this only shows what the physics did.
//
// MEASURED vs AUTHORED. Every number in a card's `stats` is read from the
// SkaterState (or the support signal) and nothing else. The `style` line is
// the one authored thing: STYLE_RULES below is the whole table, every
// threshold in it is authored (not measured, not from data/), in one place so
// the owner can tune it. docs/element-telemetry.md lists every field.
//
// PURE AND DETERMINISTIC. The recorder holds only what it has seen; the same
// replay fed tick by tick gives the same cards.

import type { EdgeEvent, SkaterState } from "../sim/types.ts";
import { EVENT, MOVE, SPIN_POSITION_NAME, codeToString } from "../sim/types.ts";
import { JUMP_NONE, JUMP_PHASE, ROTATION_MARK, EDGE_MARK } from "../sim/jump.ts";
import type { SupportSignal } from "../sim/support.ts";

export type ElementKind = "jump" | "spin" | "turn" | "twizzle" | "spiral" | "inaBauer";

export type StatValue = number | string | boolean;

export interface ElementCard {
  /** Counts up from 1 within a recorder. */
  id: number;
  kind: ElementKind;
  /** The sim's name for it: "DOUBLE LOOP", "CAMEL SPIN", "THREE TURN". */
  name: string;
  /** Tick the element finished. */
  tick: number;
  /** What the sim already said of it: the landing's call, a spin's positions. Short. */
  call: string;
  /** Every measured number, keyed. Units are in docs/element-telemetry.md. */
  stats: Record<string, StatValue>;
  /** The same, laid out for a broadcast card: [label, text]. Both clients draw these as given. */
  rows: [string, string][];
  /** Style words from STYLE_RULES. Authored. */
  style: string[];
}

// ── the style table ────────────────────────────────────────────────────────
// ALL THRESHOLDS HERE ARE AUTHORED, not measured. Each rule reads one measured
// stat of one kind of element: when `stat` `op` `value` holds, the word shows.

export interface StyleRule {
  kind: ElementKind;
  stat: string;
  op: ">=" | "<=";
  value: number;
  label: string;
  /** Why the number, in a line. */
  note: string;
}

export const STYLE_RULES: readonly StyleRule[] = [
  { kind: "jump", stat: "height", op: ">=", value: 0.45, label: "BIG AIR", note: "peak height, m" },
  { kind: "jump", stat: "height", op: "<=", value: 0.20, label: "LOW FLIGHT", note: "peak height, m" },
  { kind: "jump", stat: "peakRate", op: ">=", value: 3.0, label: "FAST ROTATION", note: "peak rev/s" },
  { kind: "jump", stat: "peakAt", op: ">=", value: 0.60, label: "DELAYED ROTATION", note: "fraction of the flight at which the rotation rate peaked" },
  { kind: "jump", stat: "peakAt", op: "<=", value: 0.25, label: "EARLY ROTATION", note: "same fraction" },
  { kind: "jump", stat: "inertiaRatio", op: "<=", value: 0.40, label: "TIGHT TUCK", note: "least inertia over the takeoff's (1 = never pulled in)" },
  { kind: "jump", stat: "speedKept", op: ">=", value: 85, label: "FLOWING EXIT", note: "% of entry speed at touchdown" },
  { kind: "jump", stat: "speedKept", op: "<=", value: 50, label: "SCRUBBED LANDING", note: "same" },
  { kind: "jump", stat: "distance", op: ">=", value: 3.5, label: "LONG JUMP", note: "ground distance takeoff to landing, m" },
  { kind: "spin", stat: "meanRate", op: ">=", value: 4.0, label: "FAST SPIN", note: "mean rev/s" },
  { kind: "spin", stat: "travel", op: "<=", value: 0.25, label: "CENTRED", note: "furthest drift of the centre, m" },
  { kind: "spin", stat: "travel", op: ">=", value: 1.0, label: "TRAVELLING", note: "same" },
  { kind: "spin", stat: "revolutions", op: ">=", value: 8, label: "LONG SPIN", note: "revolutions" },
  { kind: "turn", stat: "speedKept", op: ">=", value: 90, label: "FLOWING", note: "% of entry speed kept" },
  { kind: "twizzle", stat: "speedKept", op: ">=", value: 80, label: "FLOWING", note: "% of entry speed kept" },
  { kind: "spiral", stat: "seconds", op: ">=", value: 3.0, label: "LONG HOLD", note: "seconds held" },
  { kind: "spiral", stat: "aboveHip", op: ">=", value: 1.5, label: "ABOVE THE HIP", note: "seconds with the free leg at or above the hip" },
  { kind: "inaBauer", stat: "seconds", op: ">=", value: 2.5, label: "LONG HOLD", note: "seconds held" },
];

export function styleOf(kind: ElementKind, stats: Record<string, StatValue>): string[] {
  const out: string[] = [];
  for (const r of STYLE_RULES) {
    if (r.kind !== kind) continue;
    const v = stats[r.stat];
    if (typeof v !== "number") continue;
    if (r.op === ">=" ? v >= r.value : v <= r.value) out.push(r.label);
  }
  return out;
}

// ── names ──────────────────────────────────────────────────────────────────

const JUMP_FULL = ["TOE LOOP", "SALCHOW", "LOOP", "FLIP", "LUTZ", "AXEL"] as const;
const REV_NAME = ["", "SINGLE", "DOUBLE", "TRIPLE", "QUADRUPLE"] as const;
const TURN_NAME = ["THREE TURN", "MOHAWK", "BRACKET", "LOOP", "ROCKER", "COUNTER", "CHOCTAW"] as const;
const DEPTH_NAME = ["FLAT", "SHALLOW", "MODERATE", "DEEP"] as const;
const TAU = 2 * Math.PI;

const speedOf = (s: SkaterState): number => Math.hypot(s.vel.x, s.vel.y);
const r2 = (x: number): number => Math.round(x * 100) / 100;
const f = (x: number, d = 2): string => x.toFixed(d);

function positionsNames(bits: number): string {
  const out: string[] = [];
  SPIN_POSITION_NAME.forEach((n, i) => { if (bits & (1 << i)) out.push(n); });
  return out.length ? out.join(" + ") : "none held";
}

/** Time spent with two blades carrying, from the support signal's phase. */
const isDouble = (g: SupportSignal): boolean => g.phase === "both" || g.phase === "shift";

// ── the recorder ───────────────────────────────────────────────────────────

interface JumpRun {
  loadTicks: number; loadOneFoot: number; loadDouble: number;
  entrySpeed: number; takeoffEdge: string;
  takeoffPos: { x: number; y: number };
  takeoffVz: number; open: number;
  airTicks: number; maxZ: number; peakOmega: number; peakTick: number; minInertia: number;
  omegaSum: number;
}
interface MoveRun {
  kind: number; startTick: number; entrySpeed: number; ticks: number; doubleTicks: number;
  peakOmega: number;
}

export class ElementRecorder {
  readonly cards: ElementCard[] = [];
  private nextId = 1;
  private lastTick = -1;
  private lastLanded = -1;
  private prevAir = false;
  private prevLoad = false;
  private prevSpeed = 0;
  private prevMove = 0;
  private loadTicks = 0; private loadOne = 0; private loadDouble = 0;
  private jump: JumpRun | null = null;
  private run: MoveRun | null = null;

  /** Feed every tick, after the solver's step. */
  sample(s: SkaterState, events: readonly EdgeEvent[], g: SupportSignal, dt: number): ElementCard | null {
    if (s.tick < this.lastTick) this.reset();
    this.lastTick = s.tick;
    let out: ElementCard | null = null;
    const J = s.jump, air = J.phase === JUMP_PHASE.Air, load = J.phase === JUMP_PHASE.Load;
    const speed = speedOf(s);

    // the jump's load: how long it stood on one foot
    if (load) {
      if (!this.prevLoad) { this.loadTicks = 0; this.loadOne = 0; this.loadDouble = 0; }
      this.loadTicks++;
      if (g.phase === "one") this.loadOne++;
      else if (isDouble(g)) this.loadDouble++;
    }
    // takeoff: the first air tick
    if (air && !this.prevAir) {
      this.jump = {
        loadTicks: this.loadTicks, loadOneFoot: this.loadOne, loadDouble: this.loadDouble,
        entrySpeed: this.prevSpeed, takeoffEdge: codeToString(J.takeoffCode),
        takeoffPos: { x: s.pos.x, y: s.pos.y }, takeoffVz: J.vz, open: J.inertia,
        airTicks: 0, maxZ: 0, peakOmega: 0, peakTick: 0, minInertia: J.inertia, omegaSum: 0,
      };
      this.loadTicks = this.loadOne = this.loadDouble = 0;
    }
    if (air && this.jump) {
      const j = this.jump;
      j.airTicks++;
      j.maxZ = Math.max(j.maxZ, J.z);
      const om = Math.abs(J.angMomentum / Math.max(J.inertia, 1e-6)) / TAU;
      j.omegaSum += om;
      if (om > j.peakOmega) { j.peakOmega = om; j.peakTick = j.airTicks; }
      j.minInertia = Math.min(j.minInertia, J.inertia);
    }
    // landing: the solver wrote it this tick
    if (s.landed.tick >= 0 && s.landed.tick === s.tick && s.landed.tick !== this.lastLanded) {
      this.lastLanded = s.landed.tick;
      if (this.jump) out = this.finishJump(s, events, dt);
      this.jump = null;
    }

    // the moves: turn, twizzle, spin, spiral, Ina Bauer
    if (s.move !== MOVE.None) {
      if (!this.run || this.run.kind !== s.move) {
        this.run = { kind: s.move, startTick: s.tick, entrySpeed: this.prevMove === 0 ? this.prevSpeed : speed, ticks: 0, doubleTicks: 0, peakOmega: 0 };
      }
      this.run.ticks++;
      if (isDouble(g)) this.run.doubleTicks++;
      if (s.move === MOVE.Spin) this.run.peakOmega = Math.max(this.run.peakOmega, Math.abs(s.spin.omega) / TAU);
    }
    if (this.run && (s.move === MOVE.None || s.move !== this.run.kind)) {
      if (s.moveDone.tick === s.tick && s.moveDone.kind === this.run.kind) out = this.finishMove(s, dt) ?? out;
      this.run = null;
    }
    this.prevAir = air; this.prevLoad = load; this.prevSpeed = speed; this.prevMove = s.move;
    return out;
  }

  reset(): void {
    this.prevAir = this.prevLoad = false; this.jump = null; this.run = null;
    this.lastLanded = -1; this.prevMove = 0; this.prevSpeed = 0;
    this.loadTicks = this.loadOne = this.loadDouble = 0;
  }

  /** The last n cards, newest last. */
  recent(n: number): ElementCard[] { return this.cards.slice(-n); }

  private push(c: Omit<ElementCard, "id" | "style">): ElementCard {
    const card: ElementCard = { ...c, id: this.nextId++, style: styleOf(c.kind, c.stats) };
    this.cards.push(card);
    return card;
  }

  private finishJump(s: SkaterState, events: readonly EdgeEvent[], dt: number): ElementCard {
    const j = this.jump!, r = s.landed;
    const ev = events.find((e) => e.type === EVENT.Landing && e.tick === s.tick);
    const landEdge = ev ? codeToString(ev.newCode) : codeToString(s.blade[s.supportFoot].code);
    const exit = speedOf(s);
    const air = j.airTicks * dt;
    const dist = Math.hypot(s.pos.x - j.takeoffPos.x, s.pos.y - j.takeoffPos.y);
    const kept = j.entrySpeed > 0.05 ? 100 * exit / j.entrySpeed : 0;
    const name = r.kind === JUMP_NONE || r.revolutions <= 0 ? "HOP"
      : `${REV_NAME[r.revolutions] ?? `${r.revolutions}x`} ${JUMP_FULL[r.kind] ?? "JUMP"}`.trim();
    const mark = r.kind === JUMP_NONE ? "" : ROTATION_MARK[r.rotationCall] + EDGE_MARK[r.edgeCall];
    const call = r.fall ? "FALL" : r.stepOut ? "STEP OUT" + (mark ? " " + mark : "") : r.twoFoot ? "TWO-FOOT" + (mark ? " " + mark : "") : mark ? mark : "CLEAN";
    const stats: Record<string, StatValue> = {
      revolutions: r.revolutions, turned: r2(r.turned), shortBy: r2(r.shortBy),
      takeoffEdge: j.takeoffEdge, landingEdge: landEdge,
      entrySpeed: r2(j.entrySpeed), takeoffVz: r2(j.takeoffVz),
      height: r2(j.maxZ), airTime: r2(air), distance: r2(dist),
      peakRate: r2(j.peakOmega), meanRate: r2(air > 0 ? r.turned / air : 0),
      peakAt: r2(j.airTicks > 0 ? j.peakTick / j.airTicks : 0),
      inertiaRatio: r2(j.open > 0 ? j.minInertia / j.open : 1),
      exitSpeed: r2(exit), speedKept: Math.round(kept),
      loadSeconds: r2(j.loadTicks * dt), loadOneFootSeconds: r2(j.loadOneFoot * dt), loadDoubleSeconds: r2(j.loadDouble * dt),
      takeoffQuality: r2(r.takeoffQuality), landingQuality: r2(r.landingQuality),
      fall: r.fall, stepOut: r.stepOut,
    };
    const rows: [string, string][] = [
      ["TAKEOFF / LANDING", `${j.takeoffEdge}  >  ${landEdge}`],
      ["ENTRY SPEED", `${f(j.entrySpeed * 3.6, 1)} km/h`],
      ["TAKEOFF VERTICAL", `${f(j.takeoffVz)} m/s`],
      ["HEIGHT", `${f(j.maxZ)} m`],
      ["AIR TIME", `${f(air)} s`],
      ["DISTANCE", `${f(dist)} m`],
      ["ROTATION", `peak ${f(j.peakOmega, 1)} / mean ${f(air > 0 ? r.turned / air : 0, 1)} rev/s`],
      ["TUCK", `${Math.round(100 * (1 - (j.open > 0 ? j.minInertia / j.open : 1)))}% pulled in`],
      ["TURNED", `${f(r.turned)} rev` + (r.shortBy > 0.005 ? `  (${f(r.shortBy)} short)` : "")],
      ["EXIT SPEED", `${f(exit * 3.6, 1)} km/h  /  ${Math.round(kept)}% kept`],
      ["LOAD ON ONE FOOT", `${f(j.loadOneFoot * dt)} of ${f(j.loadTicks * dt)} s`],
    ];
    return this.push({ kind: "jump", name, tick: s.tick, call, stats, rows });
  }

  private finishMove(s: SkaterState, dt: number): ElementCard | null {
    const run = this.run!, r = s.moveDone;
    const exit = speedOf(s);
    const entry = run.entrySpeed;
    const kept = entry > 0.05 ? 100 * exit / entry : 0;
    const secs = r.seconds;
    const dbl = run.doubleTicks * dt;
    const common: Record<string, StatValue> = {
      seconds: r2(secs), entrySpeed: r2(entry), exitSpeed: r2(exit), speedKept: Math.round(kept),
      speedLost: r2(r.speedLost), doubleSupportSeconds: r2(dbl),
      fromEdge: codeToString(r.fromCode), toEdge: codeToString(r.toCode),
    };
    const speedRow: [string, string] = ["SPEED", `${f(entry * 3.6, 1)} > ${f(exit * 3.6, 1)} km/h  /  ${Math.round(kept)}% kept`];
    const edgeRow: [string, string] = ["EDGES", `${codeToString(r.fromCode)}  >  ${codeToString(r.toCode)}`];
    const dblRow: [string, string] = ["TWO-FOOT TIME", `${f(dbl)} s`];
    const depthNow = DEPTH_NAME[s.blade[s.supportFoot].depth] ?? "";
    switch (r.kind) {
      case MOVE.Spin: {
        const mean = secs > 0 ? r.revolutions / secs : 0;
        const stats = { ...common, revolutions: r2(r.revolutions), meanRate: r2(mean), peakRate: r2(run.peakOmega),
          positions: positionsNames(r.positions), bestSegRevs: r2(r.bestSegRevs), travel: r2(r.travel), position: r.detail };
        const rows: [string, string][] = [
          ["REVOLUTIONS", f(r.revolutions, 1)],
          ["SPEED", `mean ${f(mean, 1)} / peak ${f(run.peakOmega, 1)} rev/s`],
          ["POSITIONS HELD", positionsNames(r.positions)],
          ["CENTERING", `${f(r.travel)} m of travel`],
          ["ENTRY / EXIT", `${f(entry * 3.6, 1)} > ${f(exit * 3.6, 1)} km/h`],
          ["DURATION", `${f(secs)} s`],
        ];
        return this.push({ kind: "spin", name: `${(SPIN_POSITION_NAME[r.detail] ?? "").toUpperCase()} SPIN`.trim(), tick: s.tick, call: positionsNames(r.positions).toUpperCase(), stats, rows });
      }
      case MOVE.Turn:
        return this.push({ kind: "turn", name: TURN_NAME[r.detail] ?? "TURN", tick: s.tick, call: depthNow, stats: { ...common, depth: depthNow, turnKind: r.detail },
          rows: [edgeRow, ["EXIT DEPTH", depthNow], speedRow, ["DWELL", `${f(secs)} s`], dblRow] });
      case MOVE.Twizzle:
        return this.push({ kind: "twizzle", name: "TWIZZLE", tick: s.tick, call: `${f(r.revolutions, 1)} REV`, stats: { ...common, revolutions: r2(r.revolutions), depth: depthNow },
          rows: [["REVOLUTIONS", f(r.revolutions, 1)], edgeRow, ["EXIT DEPTH", depthNow], speedRow, ["DWELL", `${f(secs)} s`], dblRow] });
      case MOVE.Spiral: {
        const stats: Record<string, StatValue> = { ...common };
        const rows: [string, string][] = [edgeRow, ["HELD", `${f(secs)} s`], speedRow];
        if (r.peakRaise !== undefined) {
          stats.peakRaise = r2(r.peakRaise); stats.aboveHip = r2(r.aboveHip ?? 0);
          rows.splice(2, 0, ["FREE LEG", `peak ${Math.round(100 * r.peakRaise)}% / ${f(r.aboveHip ?? 0)} s above hip`]);
        }
        return this.push({ kind: "spiral", name: "SPIRAL", tick: s.tick, call: `${f(secs, 1)} S`, stats, rows });
      }
      case MOVE.InaBauer:
        return this.push({ kind: "inaBauer", name: "INA BAUER", tick: s.tick, call: `${f(secs, 1)} S`, stats: { ...common },
          rows: [edgeRow, ["HELD", `${f(secs)} s`], speedRow, dblRow] });
    }
    return null;
  }
}
