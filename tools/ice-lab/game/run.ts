// Game rules read skating state; all movement remains in sim/solver.ts.
import type { SkaterState } from "../sim/types.ts";

export const RUN_SECONDS = 90;
export const LIGHT_RADIUS = 3.5;
export const LIGHTS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i + 1) * Math.PI / 6;
  return { x: 18 * Math.sin(angle), y: 18 - 18 * Math.cos(angle) };
});

export class IceRun {
  seconds = RUN_SECONDS;
  score = 0;
  collected = 0;
  combo = 0;
  falls = 0;
  private sincePickup = 0;
  private wasFallen = false;
  get done(): boolean { return this.seconds <= 0; }
  get target() { return LIGHTS[this.collected % LIGHTS.length]; }
  get multiplier(): number { return Math.min(5, 1 + Math.floor(this.combo / 3)); }

  sample(s: SkaterState, dt: number): boolean {
    if (this.done || !Number.isFinite(dt) || dt <= 0) return false;
    this.seconds = Math.max(0, this.seconds - dt);
    this.sincePickup += dt;
    if (this.sincePickup > 8) this.combo = 0;
    if (s.fallen && !this.wasFallen) { this.falls++; this.combo = 0; }
    this.wasFallen = s.fallen;
    if (this.done || s.fallen) return false;
    if (Math.hypot(s.pos.x - this.target.x, s.pos.y - this.target.y) > LIGHT_RADIUS) return false;
    this.score += 100 * this.multiplier;
    this.collected++;
    this.combo++;
    this.sincePickup = 0;
    return true;
  }
}
