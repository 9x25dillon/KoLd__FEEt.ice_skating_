// Native pairs gameplay. The lead keeps the existing solver and controls;
// a second solver follows with bounded edge, stroke and brake commands.
// Handholds are reach-limited. The supported lift is an assisted attachment,
// not a claim of a coupled two-body or biomechanically validated lift solver.
import { step } from "../sim/solver.ts";
import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { IceGrid } from "../sim/ice.ts";
import { MOVE, NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkaterState, SkatingInput, EdgeEvent } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { clamp } from "../sim/math.ts";
import type { Vec2 } from "../sim/math.ts";
import { resolveRinkCollision, rinkHit } from "./rink.ts";

export const PAIRS_SECONDS = 90;
export const PAIRS_PHRASES = [
  { id: "edges", title: "Matching edges", hint: "Skate smooth curves together. Build six seconds of unison.", target: 6 },
  { id: "hold", title: "Hand in hand", hint: "Tap G / D-pad left to offer a hand. Hold a steady line together.", target: 4 },
  { id: "spin", title: "Side-by-side spin", hint: "Release hands with G / left. Set an edge, then hold your usual spin control.", target: 1.5 },
  { id: "lift", title: "Supported lift", hint: "Join hands, glide at 2–6 m/s, then tap T / D-pad right. Keep a gentle edge.", target: 1 },
  { id: "finish", title: "One final line", hint: "Finish together with four seconds of smooth, matched skating.", target: 4 },
] as const;

const speed = (s: SkaterState) => Math.hypot(s.vel.x, s.vel.y);
const ground = (s: SkaterState) => !s.fallen && s.jump.phase === JUMP_PHASE.None && s.move === MOVE.None;
const angle = (a: Vec2, b: Vec2) => Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

export class PairsSession {
  partner: SkaterState;
  readonly params: Params;
  readonly ice: IceGrid;
  readonly challenge: boolean;
  events: EdgeEvent[] = [];
  direction: Vec2;
  side = 1;
  gap = 1.9;
  distance = 1.9;
  sync = 1;
  holdRequested = false;
  holding = false;
  holdTime = 0;
  liftPhase: "none" | "rising" | "carrying" | "lowering" = "none";
  liftHeight = 0;
  liftTime = 0;
  liftBalance = 1;
  liftClean = false;
  private lowerFrom = 0;
  private cooldown = 0;
  private previousActions = 0;
  private wasFallen = [false, false];
  private fallWait = 0;
  private lastLandings = [-1, -1];
  private jumpPending = false;
  private matchedJump = false;
  elapsed = 0;
  unison = 0;
  heldSeconds = 0;
  spinSeconds = 0;
  jumps = 0;
  lifts = 0;
  falls = 0;
  phrase = 0;
  progress = 0;
  score = 0;
  message = "You lead. Your partner follows your edges and moves.";
  private messageTime = 4;

  constructor(lead: SkaterState, params: Params, challenge = false) {
    this.params = { ...params };
    this.challenge = challenge;
    this.ice = new IceGrid(params.rinkHalfLength, params.rinkHalfWidth);
    this.partner = structuredClone(lead);
    this.direction = { ...lead.heading };
    if (rinkHit(lead.pos.x + lead.heading.y * this.gap, lead.pos.y - lead.heading.x * this.gap)) this.side = -1;
    this.translate(this.direction.y * this.gap * this.side, -this.direction.x * this.gap * this.side);
  }

  private translate(x: number, y: number): void {
    this.partner.pos.x += x; this.partner.pos.y += y;
    for (const b of this.partner.blade) { b.contact.x += x; b.contact.y += y; }
  }

  private say(message: string): void { this.message = message; this.messageTime = 3; }

  get done(): boolean { return this.challenge && this.elapsed >= PAIRS_SECONDS - SIM_DT / 2; }

  tick(lead: SkaterState, input: SkatingInput, actions = 0): void {
    if (this.done) return;
    const s = this.partner, dt = SIM_DT, fresh = actions & ~this.previousActions;
    this.previousActions = actions;
    this.events = [];
    this.elapsed += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.messageTime = Math.max(0, this.messageTime - dt);
    this.distance = Math.hypot(s.pos.x - lead.pos.x, s.pos.y - lead.pos.y);
    if (fresh & 1) {
      this.holdRequested = !this.holdRequested;
      this.say(this.holdRequested ? "Hand offered · keep a steady line" : "Hands released · skate side by side");
    }
    if (!this.holdRequested) this.holding = false;
    if (ground(lead) && speed(lead) > .6) {
      const travel = { x: lead.vel.x / speed(lead), y: lead.vel.y / speed(lead) };
      // Never sweep the formation through the lead during a turn, spin or jump.
      const turn = clamp(angle(this.direction, travel), -1.8 * dt, 1.8 * dt);
      const c = Math.cos(turn), sn = Math.sin(turn);
      this.direction = { x: this.direction.x * c - this.direction.y * sn, y: this.direction.x * sn + this.direction.y * c };
    }
    if (this.liftPhase === "none") {
      const reachable = ground(lead) && ground(s) && this.distance < 1.36 && this.distance > .65
        && Math.abs(angle(lead.heading, s.heading)) < .45 && Math.abs(speed(lead) - speed(s)) < .8;
      if (this.holdRequested && reachable) this.holding = true;
      if (!ground(lead) || !ground(s) || this.distance > 1.65 || Math.abs(angle(lead.heading, s.heading)) > .7) this.holding = false;
      this.holdTime = this.holding ? this.holdTime + dt : 0;
    }
    if (fresh & 2) {
      if (this.liftPhase !== "none") this.lower(false);
      else if (this.holding && this.holdTime > .6 && speed(lead) >= 2 && speed(lead) <= 6
        && Math.abs(lead.lean) < .35 && this.cooldown === 0) {
        this.liftPhase = "rising"; this.liftTime = 0; this.liftBalance = 1; this.liftClean = true;
        this.say("Lift together · keep a gentle edge");
      } else this.say("Lift needs a steady handhold and a 2–6 m/s glide");
    }

    if (this.liftPhase !== "none") this.support(lead);
    else {
      this.gap += ((this.holdRequested && ground(lead) ? 1.12 : 1.9) - this.gap) * dt * 1.8;
      const target = { x: lead.pos.x + this.direction.y * this.gap * this.side,
        y: lead.pos.y - this.direction.x * this.gap * this.side };
      // Inset the target from the boards. The partner still reaches it by skating.
      const hit = rinkHit(target.x, target.y);
      if (hit) { target.x -= hit.nx * (hit.penetration + .5); target.y -= hit.ny * (hit.penetration + .5); }
      const command = this.follow(lead, input, target);
      step(s, command, this.params, dt, this.events, this.ice);
      resolveRinkCollision(s, this.events);
    }
    this.distance = Math.hypot(s.pos.x - lead.pos.x, s.pos.y - lead.pos.y);
    this.measure(lead);
  }

  private follow(lead: SkaterState, input: SkatingInput, target: Vec2): SkatingInput {
    const s = this.partner, v = speed(s), lv = speed(lead);
    this.fallWait = s.fallen ? this.fallWait + SIM_DT : 0;
    if (s.fallen) return { ...NEUTRAL_INPUT, push: this.fallWait > 1.2 && s.tick % 90 === 0 };
    // Both skaters use the actual move inputs. Corrections stop during elements:
    // there is no artificial air rotation, landing correction or copied success.
    const element = lead.move !== MOVE.None || s.move !== MOVE.None || lead.jump.phase !== JUMP_PHASE.None
      || s.jump.phase !== JUMP_PHASE.None || input.knee > .7 || input.spin || input.turn || input.bracket || input.twizzle || input.inaBauer;
    if (element && !lead.fallen && this.distance < 4) return { ...input };
    const ex = target.x - s.pos.x, ey = target.y - s.pos.y;
    const backwards = s.vel.x * s.heading.x + s.vel.y * s.heading.y < -.1 ? -1 : 1;
    const travel = { x: s.heading.x * backwards, y: s.heading.y * backwards };
    const along = ex * travel.x + ey * travel.y;
    const across = -travel.y * ex + travel.x * ey;
    const headingError = angle(travel, this.direction);
    const lateralSpeed = -(s.vel.x - lead.vel.x) * travel.y + (s.vel.y - lead.vel.y) * travel.x;
    const curvatureSpeed = lv + lead.yawRate * this.gap * this.side;
    const desiredSpeed = lead.fallen ? 0 : clamp(curvatureSpeed + along * .8, 0, 9);
    const correction = clamp(across * .065 + headingError * .32 - lateralSpeed * .07, -.24, .24);
    const maxLean = Math.min(.6, Math.atan2(v * v * Math.sin(this.params.maxTilt) / this.params.rocker, this.params.gravity) * .8 / this.params.maxLean);
    const lean = clamp((lead.fallen ? 0 : input.lean) + correction * backwards, -maxLean, maxLean);
    const pushing = !lead.fallen && desiredSpeed > .5 && (v < desiredSpeed - .15 || (input.push && v < desiredSpeed + .35));
    return { ...NEUTRAL_INPUT, lean, knee: .35, weight: input.weight,
      carriage: input.carriage, push: pushing && (input.push || s.tick % 72 === 0),
      pushPower: clamp((desiredSpeed - v) * .65, .18, .8),
      brake: v > desiredSpeed + .35 || input.brake || lead.fallen };
  }

  private lower(clean: boolean): void {
    if (this.liftPhase === "none" || this.liftPhase === "lowering") return;
    this.liftClean &&= clean;
    this.lowerFrom = this.liftHeight;
    this.liftPhase = "lowering"; this.liftTime = 0;
  }

  private support(lead: SkaterState): void {
    const s = this.partner, dt = SIM_DT;
    this.liftTime += dt;
    const strain = Math.max(0, Math.abs(lead.lean) - .23) * 1.8 + Math.max(0, speed(lead) - 6) * .35;
    this.liftBalance = clamp(this.liftBalance + (.12 - strain) * dt, 0, 1);
    if (!ground(lead) || !this.holdRequested || speed(lead) < 1.1 || this.liftBalance < .15) this.lower(false);
    if (this.liftPhase === "rising") {
      this.liftHeight = 1.55 * smooth(this.liftTime / 1.1);
      if (this.liftTime >= 1.1) { this.liftPhase = "carrying"; this.liftTime = 0; }
    } else if (this.liftPhase === "carrying") {
      this.liftHeight = 1.55;
      if (this.liftTime >= 2.8) this.lower(true);
    } else if (this.liftPhase === "lowering") {
      this.liftHeight = this.lowerFrom * (1 - smooth(this.liftTime / 1.1));
      if (this.liftTime >= 1.1) {
        this.liftHeight = 0; this.liftPhase = "none"; this.cooldown = 3;
        if (this.liftClean && !lead.fallen) { this.lifts++; this.say("Lift complete · back on the edge"); }
        else this.say("Safely down · rebuild your glide");
      }
    }
    const reach = 1.12 - .64 * (this.liftHeight / 1.55);
    const x = lead.pos.x + this.direction.y * reach * this.side;
    const y = lead.pos.y - this.direction.x * reach * this.side;
    this.translate(x - s.pos.x, y - s.pos.y);
    s.vel = { ...lead.vel }; s.heading = { ...lead.heading }; s.lean = lead.lean;
    s.leanRate = lead.leanRate; s.knee = .35; s.yawRate = lead.yawRate;
    s.tick = lead.tick; s.strokeTime = 0;
    for (const b of s.blade) { b.inContact = false; b.tangent = { ...s.heading }; }
    this.gap = reach;
    this.holding = !lead.fallen && this.holdRequested;
  }

  private measure(lead: SkaterState): void {
    const s = this.partner, dt = SIM_DT, lifted = this.liftPhase !== "none";
    for (const [i, skater] of [lead, s].entries()) {
      if (skater.fallen && !this.wasFallen[i]) this.falls++;
      this.wasFallen[i] = skater.fallen;
    }
    const aligned = Math.abs(angle(lead.heading, s.heading));
    const gapQuality = clamp(1 - Math.abs(this.distance - this.gap) / 1.4, 0, 1);
    const velocityQuality = clamp(1 - Math.hypot(lead.vel.x - s.vel.x, lead.vel.y - s.vel.y) / 3, 0, 1);
    const target = lead.fallen || s.fallen ? 0 : gapQuality * velocityQuality * clamp(1 - aligned / 1.2, 0, 1);
    this.sync += (target - this.sync) * Math.min(1, dt * 3);
    const skating = speed(lead) > 1.2 && speed(s) > 1.2 && !lead.fallen && !s.fallen;
    const unison = skating && this.sync >= .68 && !lifted;
    const spinning = lead.move === MOVE.Spin && s.move === MOVE.Spin && this.distance < 3.5 && !lead.fallen && !s.fallen;
    if (unison) this.unison += dt;
    if (this.holding && skating && !lifted) this.heldSeconds += dt;
    if (spinning) this.spinSeconds += dt;
    if (lead.jump.phase === JUMP_PHASE.Air && s.jump.phase === JUMP_PHASE.Air && this.distance < 3.5) {
      this.jumpPending = true; this.matchedJump = true;
    }
    if (this.jumpPending && lead.jump.phase !== JUMP_PHASE.Air && s.jump.phase !== JUMP_PHASE.Air) {
      if (this.matchedJump && lead.landed.tick > this.lastLandings[0] && s.landed.tick > this.lastLandings[1]
        && Math.abs(lead.landed.tick - s.landed.tick) <= 24 && !lead.landed.fall && !s.landed.fall
        && !lead.landed.stepOut && !s.landed.stepOut) { this.jumps++; this.say("Together in the air · matched landing"); }
      this.lastLandings = [lead.landed.tick, s.landed.tick]; this.jumpPending = false; this.matchedJump = false;
    }
    const phrase = PAIRS_PHRASES[this.phrase];
    if (phrase) {
      if (phrase.id === "lift") this.progress = this.lifts > 0 ? 1 : 0;
      else if ((phrase.id === "edges" || phrase.id === "finish") ? unison && ground(lead) && ground(s)
        : phrase.id === "hold" ? this.holding && skating && !lifted : spinning) this.progress += dt;
      if (this.progress >= phrase.target - 1e-6) { this.phrase++; this.progress = 0; this.say(phrase.title + " · complete"); }
    }
    // Game points, deliberately separate from the singles ISU protocol.
    this.score = Math.max(0, Math.round(this.unison * 8 + this.heldSeconds * 5 + this.spinSeconds * 20
      + this.jumps * 120 + this.lifts * 180 + this.phrase * 100 - this.falls * 60));
  }

  snapshot() {
    const phrase = PAIRS_PHRASES[this.phrase];
    return { state: this.partner, low: false, challenge: this.challenge, seconds: Math.max(0, PAIRS_SECONDS - this.elapsed),
      distance: this.distance, sync: this.sync, holding: this.holding, holdRequested: this.holdRequested,
      status: this.liftPhase !== "none" ? "Supported lift" : this.holding ? "Hand in hand" : this.partner.fallen ? "Partner recovering"
        : this.holdRequested ? "Closing for a handhold" : this.distance > 4 ? "Regrouping" : "Side by side",
      lift: { phase: this.liftPhase, height: this.liftHeight, balance: this.liftBalance }, side: this.side,
      message: this.messageTime > 0 ? this.message : "G / ←  join or release hands    T / →  lift or lower",
      score: this.score, phrase: this.phrase, phrases: PAIRS_PHRASES.length, progress: this.progress,
      title: phrase?.title ?? "Make it your own", hint: phrase?.hint ?? "All five phrases complete. Keep skating together to the music.", target: phrase?.target ?? 1,
      unison: this.unison, heldSeconds: this.heldSeconds, spinSeconds: this.spinSeconds, jumps: this.jumps, lifts: this.lifts, falls: this.falls };
  }

  result() {
    const medal = this.phrase === PAIRS_PHRASES.length && this.falls === 0 ? "Gold" : this.phrase >= 3 ? "Silver" : this.phrase >= 1 ? "Bronze" : "First rehearsal";
    return { title: medal + " · Together on ice", detail: `${this.score} pairs points · ${this.phrase}/${PAIRS_PHRASES.length} phrases · ${this.falls} falls`,
      complete: true, pairs: { unison: this.unison, holds: this.heldSeconds, spins: this.spinSeconds, jumps: this.jumps, lifts: this.lifts, falls: this.falls, score: this.score } };
  }
}
