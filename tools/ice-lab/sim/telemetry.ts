// tools/ice-lab/sim/telemetry.ts — a fixed ring, and a CSV that answers
// "exactly when and why did this edge flatten?"
//
// Fixed size, allocated once, never grown. The UE5 budget for this is 128 B a
// frame and about two seconds of history per skater; the shape is kept the
// same here so the exported columns and the C++ struct can be the same list.

import type { SkaterState, EdgeEvent } from "./types.ts";
import { codeToString, REGIME_NAME, EVENT_NAME, FALL_NAME } from "./types.ts";
import { SIM_HZ } from "./params.ts";
import { len } from "./math.ts";

export interface Frame {
  tick: number; speed: number; lean: number; leanEq: number; balanceError: number;
  latAccel: number; tiltCmd: number; supportFoot: number; supportMode: number;
  code: [number, number]; tilt: [number, number]; load: [number, number];
  latForce: [number, number]; demand: [number, number]; regime: [number, number];
  dwell: [number, number];
}

export class Telemetry {
  private buf: Frame[] = [];
  private head = 0;
  private filled = 0;
  events: EdgeEvent[] = [];
  private maxEvents = 512;

  private capacity: number;

  /** Two seconds by default, which is what the fall dump needs. */
  constructor(capacity = SIM_HZ * 2) {
    this.capacity = capacity;
    for (let i = 0; i < capacity; i++) this.buf.push(blank());
  }

  capture(s: SkaterState): void {
    const f = this.buf[this.head];
    f.tick = s.tick; f.speed = len(s.vel); f.lean = s.lean; f.leanEq = s.leanEq;
    f.balanceError = s.balanceError; f.latAccel = s.latAccel; f.tiltCmd = s.tiltCmd;
    f.supportFoot = s.supportFoot; f.supportMode = s.supportMode;
    for (let i = 0; i < 2; i++) {
      const b = s.blade[i];
      f.code[i] = b.code; f.tilt[i] = b.tilt; f.load[i] = b.normalLoad;
      f.latForce[i] = b.latForce; f.demand[i] = b.demandRatio;
      f.regime[i] = b.regime; f.dwell[i] = b.dwell;
    }
    this.head = (this.head + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  pushEvents(evs: EdgeEvent[]): void {
    for (const e of evs) {
      this.events.push(e);
      if (this.events.length > this.maxEvents) this.events.shift();
    }
  }

  reset(): void { this.head = 0; this.filled = 0; this.events = []; }

  /** Oldest first. */
  frames(): Frame[] {
    const out: Frame[] = [];
    const start = this.filled < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.filled; i++) out.push(this.buf[(start + i) % this.capacity]);
    return out;
  }

  toCsv(): string {
    const head = [
      "tick", "time_s", "speed_mps", "lean_deg", "lean_eq_deg", "balance_err_deg",
      "lat_accel", "tilt_cmd_deg", "support_foot", "support_mode",
      "L_code", "L_tilt_deg", "L_load_N", "L_lat_force_N", "L_demand", "L_regime", "L_dwell_s",
      "R_code", "R_tilt_deg", "R_load_N", "R_lat_force_N", "R_demand", "R_regime", "R_dwell_s",
    ].join(",");
    const d = (r: number): string => ((r * 180) / Math.PI).toFixed(3);
    const rows = this.frames().map((f) => [
      f.tick, (f.tick / SIM_HZ).toFixed(4), f.speed.toFixed(4),
      d(f.lean), d(f.leanEq), d(f.balanceError),
      f.latAccel.toFixed(4), d(f.tiltCmd), f.supportFoot, f.supportMode,
      codeToString(f.code[0]), d(f.tilt[0]), f.load[0].toFixed(1), f.latForce[0].toFixed(1),
      f.demand[0].toFixed(3), REGIME_NAME[f.regime[0]], f.dwell[0].toFixed(3),
      codeToString(f.code[1]), d(f.tilt[1]), f.load[1].toFixed(1), f.latForce[1].toFixed(1),
      f.demand[1].toFixed(3), REGIME_NAME[f.regime[1]], f.dwell[1].toFixed(3),
    ].join(","));
    return [head, ...rows].join("\n");
  }

  eventLog(): string {
    return this.events.map((e) =>
      `${(e.tick / SIM_HZ).toFixed(3)}s  ${EVENT_NAME[e.type].padEnd(17)} `
      + `${e.foot === 0 ? "L" : "R"}  ${codeToString(e.prevCode)} -> `
      + `${e.type === 6 ? FALL_NAME[e.newCode] : codeToString(e.newCode)}`
      + `  (held ${e.prevDwell.toFixed(2)}s)`).join("\n");
  }
}

function blank(): Frame {
  return {
    tick: 0, speed: 0, lean: 0, leanEq: 0, balanceError: 0, latAccel: 0, tiltCmd: 0,
    supportFoot: 0, supportMode: 0,
    code: [0xff, 0xff], tilt: [0, 0], load: [0, 0], latForce: [0, 0],
    demand: [0, 0], regime: [0, 0], dwell: [0, 0],
  };
}
