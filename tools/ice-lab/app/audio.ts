// app/audio.ts — the blade as the lead instrument, crudely. Bible §5.3.
//
// "Everything the player needs to know about edge quality should be audible
// with the screen off." pre-production-plan.md §1 builds the crude version on
// purpose — "one filtered noise bed plus one resonant partial is three days" —
// because testing feel in silence is testing the wrong thing. This is that
// version, plus the three one-shots a jump needs:
//
//   glide bed   filtered noise per foot; centre tracks speed, gain tracks load
//   edge tone   a partial that emerges above 25 degrees of blade tilt and rises
//               with depth; it chokes when the edge lets go
//   skid        broadband noise, gain from the acceleration the edge could not hold
//   toe pick    a sharp click on the strike
//   takeoff     a low swell
//   landing     a "chk" — louder and dirtier the worse the landing, so quality
//               is taught by timbre rather than by a number
//
// Presentation only: reads state, never writes it. Browsers will not start
// audio without a user gesture, and a gamepad press does not count as one, so
// sound begins on the first key or click. No AudioContext (the test DOM stub)
// means silence, not an error.

import type { SkaterState, SkatingInput, EdgeEvent } from "../sim/types.ts";
import { EVENT, REGIME } from "../sim/types.ts";
import type { Params } from "../sim/params.ts";
import { len } from "../sim/math.ts";

const DEG = Math.PI / 180;
const TONE_ONSET = 25 * DEG;
const TONE_FULL = 40 * DEG;
const TC = 0.03;                  // s, parameter smoothing

interface Bed { filter: BiquadFilterNode; gain: GainNode }

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class EdgeAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private beds: Bed[] = [];
  private tone: OscillatorNode | null = null;
  private toneGain: GainNode | null = null;
  private skid: GainNode | null = null;

  /** Call from a key or pointer handler. Idempotent. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const g = globalThis as unknown as { AudioContext?: typeof AudioContext };
    if (!g.AudioContext) return;
    const ctx = new g.AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // Two seconds of white noise, looped by every noise voice at its own offset.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    for (let i = 0; i < 2; i++) {
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass"; filter.Q.value = 1.4;
      const gain = ctx.createGain(); gain.gain.value = 0;
      this.loop(0.7 * i).connect(filter).connect(gain).connect(this.master);
      this.beds.push({ filter, gain });
    }

    this.tone = ctx.createOscillator();
    this.tone.type = "triangle";
    this.toneGain = ctx.createGain(); this.toneGain.gain.value = 0;
    this.tone.connect(this.toneGain).connect(this.master);
    this.tone.start();

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 1200;
    this.skid = ctx.createGain(); this.skid.gain.value = 0;
    this.loop(1.3).connect(hp).connect(this.skid).connect(this.master);
  }

  private loop(offset: number): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    src.start(0, offset);
    return src;
  }

  /** Once per frame: the continuous layers follow the state. */
  update(s: SkaterState, p: Params, on: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.tone || !this.toneGain || !this.skid) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.05);
    const speed = len(s.vel);
    const moving = Math.min(1, speed / 3);

    for (let i = 0; i < 2; i++) {
      const b = s.blade[i];
      this.beds[i].filter.frequency.setTargetAtTime(250 + 160 * speed, t, TC);
      this.beds[i].gain.gain.setTargetAtTime(b.inContact ? 0.10 * b.weight * moving : 0, t, TC);
    }

    const b = s.blade[s.supportFoot];
    const tilt = b.inContact ? Math.abs(b.tilt) : 0;
    const skidding = b.regime === REGIME.Skid;
    // Rises an octave over thirty degrees of tilt past the onset.
    this.tone.frequency.setTargetAtTime(480 * Math.pow(2, Math.max(0, tilt - TONE_ONSET) / (30 * DEG)), t, TC);
    this.toneGain.gain.setTargetAtTime(
      0.09 * smooth(TONE_ONSET, TONE_FULL, tilt) * (skidding ? 0.15 : 1) * moving, t, TC);

    const slip = Math.max(s.blade[0].latSlipAccel, s.blade[1].latSlipAccel);
    this.skid.gain.setTargetAtTime(0.12 * Math.min(1, slip / 5), t, TC);
    void p;
  }

  /** Once per tick: the one-shots. */
  onTick(input: SkatingInput | null, events: readonly EdgeEvent[], s: SkaterState): void {
    if (!this.ctx) return;
    if (input?.toe) this.click();
    for (const e of events) {
      if (e.type === EVENT.Takeoff) this.swell();
      if (e.type === EVENT.Landing) this.chk(s.landed.landingQuality);
    }
  }

  private envelope(peak: number, attack: number, decay: number): GainNode {
    const ctx = this.ctx!, g = ctx.createGain(), t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(1e-4, t + attack + decay);
    g.connect(this.master!);
    return g;
  }

  private click(): void {
    const ctx = this.ctx!, o = ctx.createOscillator();
    o.type = "square"; o.frequency.value = 2100;
    o.connect(this.envelope(0.12, 0.002, 0.03));
    o.start(); o.stop(ctx.currentTime + 0.05);
  }

  private swell(): void {
    const ctx = this.ctx!, o = ctx.createOscillator();
    o.type = "sine"; o.frequency.value = 55;
    o.connect(this.envelope(0.16, 0.25, 0.35));
    o.start(); o.stop(ctx.currentTime + 0.65);
  }

  private chk(quality: number): void {
    const ctx = this.ctx!, src = ctx.createBufferSource(), lp = ctx.createBiquadFilter();
    src.buffer = this.noise;
    lp.type = "lowpass"; lp.frequency.value = 1800 + 4000 * (1 - quality);
    src.connect(lp).connect(this.envelope(0.12 + 0.3 * (1 - quality), 0.004, 0.10 + 0.15 * (1 - quality)));
    src.start(0, Math.random()); src.stop(ctx.currentTime + 0.3);
  }
}
