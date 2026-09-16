import type { SkaterState } from "../sim/types.ts";
import { REGIME } from "../sim/types.ts";
import { JUMP_CODE, JUMP_PHASE } from "../sim/jump.ts";
import type { RewardEvent, RewardEffect } from "./rewards.ts";

export interface IceParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number; size: number;
}
export interface LandingEffect {
  x: number; y: number; age: number; label: string; detail: string;
  clean: boolean;
}
export const MAX_ICE_PARTICLES = 220;

/** Cosmetic fixed-step state. Never writes to a skater, input or replay. */
export class IceEffects {
  particles: IceParticle[] = [];
  landing: LandingEffect | null = null;
  rewards: RewardEffect[] = [];
  reducedMotion = false;
  private landedTick = -1;
  private emission = [0, 0];
  private seed = 1;

  reset(s: SkaterState) {
    this.particles.length = 0; this.landing = null;
    this.rewards.length = 0;
    this.landedTick = s.landed.tick; this.emission = [0, 0]; this.seed = 1;
  }
  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  reward(event: RewardEvent) {
    // Retain simultaneous pickups, but bound work during long practice sessions.
    if (this.rewards.length >= 12) this.rewards.shift();
    this.rewards.push({ ...event, age: 0 });
  }
  private emit(x: number, y: number, vx: number, vy: number, lift: number) {
    if (this.particles.length >= MAX_ICE_PARTICLES) return;
    this.particles.push({ x, y, z: .025, vx, vy, vz: lift,
      age: 0, life: .35 + this.random() * .45, size: .014 + this.random() * .035 });
  }
  update(s: SkaterState, dt: number) {
    if (dt <= 0) return;
    for (const reward of this.rewards) reward.age += dt;
    this.rewards = this.rewards.filter(reward => reward.age < 1.4);
    for (const particle of this.particles) {
      particle.age += dt;
      particle.x += particle.vx * dt; particle.y += particle.vy * dt;
      particle.z = Math.max(0, particle.z + particle.vz * dt);
      particle.vz -= 5.5 * dt;
      const drag = Math.exp(-(particle.z > 0 ? 1.8 : 12) * dt);
      particle.vx *= drag; particle.vy *= drag;
    }
    this.particles = this.particles.filter(p => p.age < p.life);
    if (this.landing && (this.landing.age += dt) >= 1.8) this.landing = null;

    if (s.landed.tick >= 0 && s.landed.tick !== this.landedTick) {
      this.landedTick = s.landed.tick;
      const result = s.landed;
      const contact = s.blade[s.supportFoot].contact;
      this.landing = { ...contact, age: 0,
        label: result.fall ? "Fall" : result.stepOut ? "Step-out" : result.twoFoot ? "Two-foot landing" : "Landed",
        detail: `${JUMP_CODE[result.kind] ?? "Hop"} · ${result.turned.toFixed(2)} rev`,
        clean: !result.fall && !result.stepOut && !result.twoFoot,
      };
      const count = this.reducedMotion ? 8 : result.fall ? 48 : 32;
      const impact = .7 + Math.min(1.3, Math.sqrt(Math.max(0, result.height)));
      for (let i = 0; i < count; i++) {
        const angle = this.random() * Math.PI * 2, speed = (.5 + this.random() * 2) * impact;
        this.emit(contact.x, contact.y, Math.cos(angle) * speed + s.vel.x * .15,
          Math.sin(angle) * speed + s.vel.y * .15, (.4 + this.random() * 1.6) * impact);
      }
    }

    const speed = Math.hypot(s.vel.x, s.vel.y);
    s.blade.forEach((blade, i) => {
      if (s.fallen || s.jump.phase === JUMP_PHASE.Air || !blade.inContact || speed < .5) {
        this.emission[i] = 0; return;
      }
      const scraping = blade.regime === REGIME.Brake || blade.regime === REGIME.Skid;
      const carving = blade.regime === REGIME.Carve && Math.abs(blade.tilt) > .12;
      const strength = scraping ? Math.min(1, speed / 6) : carving ? Math.min(.45, Math.abs(blade.tilt) * speed * .12) : 0;
      if (!strength) { this.emission[i] = 0; return; }
      this.emission[i] += strength * (this.reducedMotion ? 12 : 90) * dt;
      while (this.emission[i] >= 1) {
        this.emission[i]--;
        // The outside of a cut, with some travel momentum retained in the ice dust.
        const side = -(Math.sign(blade.tilt) || (i ? -1 : 1));
        const spread = side * (.4 + this.random() * 1.8) * strength;
        this.emit(blade.contact.x, blade.contact.y,
          s.vel.x * .12 - blade.tangent.y * spread,
          s.vel.y * .12 + blade.tangent.x * spread,
          .25 + this.random() * strength * 1.5);
      }
    });
  }
}
