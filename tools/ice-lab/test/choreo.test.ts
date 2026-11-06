// The choreography layer (game/choreo.ts): which landing, fall, rise, phrase and bow it chooses from
// what the physics did, and the owner's rules it keeps. The poses are authored; these tests hold
// the choices and the rules, not the looks.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DEFAULT_PARAMS, SIM_DT } from "../sim/params.ts";
import { createState } from "../sim/solver.ts";
import { FALL, MOVE } from "../sim/types.ts";
import type { JumpResult, SkaterState } from "../sim/types.ts";
import { JUMP, JUMP_NONE, JUMP_PHASE, ROTATION_CALL, EDGE_CALL, noResult } from "../sim/jump.ts";
import { makeProfile, SAMPLE_PROFILES } from "../sim/profile.ts";
import {
  Choreographer, STYLES, STYLE_IDS, NEUTRAL_PHYSIQUE, REBOUND_WINDOW, fallKeys, fallVariant, landingPlanKeys, landingTier,
  physiqueOf, riseVariant, sample, styleOf, jumpName, bowKeys, phraseKeys, type FallVariant, type Key, type ChoreoContext,
} from "../game/choreo.ts";

const landed = (over: Partial<JumpResult> = {}): JumpResult => ({
  ...noResult(), tick: 100, kind: JUMP.Lutz, revolutions: 3, turned: 3, landingQuality: 0.9, takeoffQuality: 0.8, height: 0.3, airTime: 0.45, ...over,
});

const ctx = (over: Partial<ChoreoContext> = {}): ChoreoContext => ({ time: 0, beat: null, combo: "", expression: 1, finished: false, bows: true, ...over });

/** A gliding skater at speed: free to dance. */
function gliding(): SkaterState {
  const s = createState(DEFAULT_PARAMS, 4);
  s.strokeTime = 0;
  s.balanceError = 0;
  return s;
}

const numbers = (k: Key): number[] => JSON.stringify(k).match(/-?\d+(\.\d+)?(e-?\d+)?/g)!.map(Number);

test("a landing's look comes from the landing record: quality and calls choose the tier", () => {
  assert.equal(landingTier(landed()), "flow");
  assert.equal(landingTier(landed({ landingQuality: 0.7 })), "solid");
  assert.equal(landingTier(landed({ landingQuality: 0.4 })), "tight");
  assert.equal(landingTier(landed({ landingQuality: 0.3, stepOut: true })), "stepout");
  assert.equal(landingTier(landed({ twoFoot: true })), "twofoot");
  assert.equal(landingTier(landed({ rotationCall: ROTATION_CALL.UnderRotated })), "under");
  assert.equal(landingTier(landed({ fall: true })), "fall");
  // A quarter call or an edge call keeps a clean landing from flowing: accuracy shows.
  assert.equal(landingTier(landed({ rotationCall: ROTATION_CALL.Quarter })), "solid");
  assert.equal(landingTier(landed({ edgeCall: EDGE_CALL.Wrong })), "solid");
});

test("every jump has its own exit, named in the plan", () => {
  const style = styleOf("classical");
  const firstArms = new Set<string>();
  const labels = new Set<string>();
  for (const kind of [JUMP.Toeloop, JUMP.Salchow, JUMP.Loop, JUMP.Flip, JUMP.Lutz, JUMP.Axel]) {
    const plan = landingPlanKeys(landed({ kind }), { style, physique: NEUTRAL_PHYSIQUE, fatigue: 0, finale: false, combo: "" });
    assert.ok(plan.keys.length >= 4, `${kind} has a timeline`);
    assert.match(plan.label, new RegExp(jumpName(landed({ kind }))));
    labels.add(plan.label);
    firstArms.add(JSON.stringify([plan.keys[0].armB, plan.keys[0].leg, plan.keys[1].armB]));
  }
  assert.equal(labels.size, 6);
  assert.ok(firstArms.size >= 5, `the exits differ: ${firstArms.size} distinct openings`);
  // A loop keeps its crossed legs a moment; a salchow's arms come out of the wrap.
  const loop = landingPlanKeys(landed({ kind: JUMP.Loop }), { style, physique: NEUTRAL_PHYSIQUE, fatigue: 0, finale: false, combo: "" });
  assert.ok(loop.keys[0].leg![0] < 0, "the loop's free foot starts crossed in front");
});

test("better landings are held longer and finished by the style; more revolutions hold longer still", () => {
  const style = styleOf("classical");
  const base = { style, physique: NEUTRAL_PHYSIQUE, fatigue: 0, finale: false, combo: "" };
  const flow3 = landingPlanKeys(landed(), base), solid3 = landingPlanKeys(landed({ landingQuality: 0.6 }), base);
  const flow1 = landingPlanKeys(landed({ revolutions: 1 }), base), flow4 = landingPlanKeys(landed({ revolutions: 4 }), base);
  assert.ok(flow3.dur > solid3.dur, "a flowing exit outlasts a clean one");
  assert.ok(flow4.dur > flow3.dur && flow3.dur > flow1.dur, "a quad holds longer than a triple, a triple than a single");
  const tight = landingPlanKeys(landed({ landingQuality: 0.4 }), base);
  assert.ok(tight.dur < solid3.dur, "a tight landing is over quickly");
});

test("each style finishes a clean triple its own way", () => {
  const hands = (id: string) => {
    const plan = landingPlanKeys(landed(), { style: styleOf(id as never), physique: NEUTRAL_PHYSIQUE, fatigue: 0, finale: false, combo: "" });
    return plan.keys.map(k => [k.armA!.h, k.armB!.h]);
  };
  const highest = (id: string) => Math.max(...hands(id).flat().map(h => h[1]));
  // Classical lifts the free arm through fifth; Showman throws a V; both go above the head.
  assert.ok(highest("classical") > 0.35);
  assert.ok(highest("showman") > 0.35);
  // Athletic keeps it compact: no hand above the head on a double, a fist on a triple.
  const athletic2 = landingPlanKeys(landed({ revolutions: 2 }), { style: styleOf("athletic"), physique: NEUTRAL_PHYSIQUE, fatigue: 0, finale: false, combo: "" });
  assert.ok(Math.max(...athletic2.keys.flatMap(k => [k.armA!.h[1], k.armB!.h[1]])) < 0.2);
  assert.ok(Math.max(...hands("athletic").flat().map(h => h[1])) >= 0.1, "the fist rises on the triple");
});

test("a stronger body stays more upright through a rough landing; a steadier one flails less", () => {
  const style = styleOf("classical");
  const weak = physiqueOf(makeProfile("weak", { stats: { strength: 5, balance: 10 } }));
  const strong = physiqueOf(makeProfile("strong", { stats: { strength: 95, balance: 95 } }));
  const tight = (ph: typeof weak) => landingPlanKeys(landed({ landingQuality: 0.4 }), { style, physique: ph, fatigue: 0, finale: false, combo: "" });
  assert.ok(tight(weak).keys[0].trunk!.pitch > tight(strong).keys[0].trunk!.pitch);
  const stepout = (ph: typeof weak) => landingPlanKeys(landed({ landingQuality: 0.3, stepOut: true }), { style, physique: ph, fatigue: 0, finale: false, combo: "" });
  assert.ok(stepout(weak).keys[0].armB!.h[1] > stepout(strong).keys[0].armB!.h[1], "the unsteady arm flies higher");
  // A tired skater's arms sit lower than a fresh one's.
  const fresh = landingPlanKeys(landed(), { style, physique: NEUTRAL_PHYSIQUE, fatigue: 0, finale: false, combo: "" });
  const tired = landingPlanKeys(landed(), { style, physique: NEUTRAL_PHYSIQUE, fatigue: 0.9, finale: false, combo: "" });
  assert.ok(tired.keys[1].armA!.h[1] < fresh.keys[1].armA!.h[1]);
});

test("a combination: the first landing gathers for the next jump, the last is the finale", () => {
  const c = new Choreographer("classical");
  const s = gliding();
  s.landed = landed({ tick: 10 });
  c.sample(s, ctx({ time: 1 }));
  assert.equal(c.view(1).top?.kind, "landing");
  // The next takeoff loads within the window: the landing becomes a rebound.
  s.jump.phase = JUMP_PHASE.Load;
  c.sample(s, ctx({ time: 1 + REBOUND_WINDOW / 2 }));
  assert.equal(c.view(1.3).top?.kind, "rebound");
  // Airborne, the physics owns the arms: the rebound lets go at once.
  s.jump.phase = JUMP_PHASE.Air;
  c.sample(s, ctx({ time: 1.5 }));
  assert.ok((c.view(1.7).top?.dur ?? 0) <= 0.5 + 0.11, "cut to a 0.1 s fade at takeoff");
  // The second jump lands linked: the combination's finale, held longer than a solo landing.
  s.jump.phase = JUMP_PHASE.None;
  s.landed = landed({ tick: 200, kind: JUMP.Toeloop });
  c.sample(s, ctx({ time: 2, combo: "3Lz+3T" }));
  const top = c.view(2).top!;
  assert.equal(top.kind, "landing");
  assert.match(top.label, /^Combination finale · 3Lz\+3T/);
  const solo = landingPlanKeys(landed({ kind: JUMP.Toeloop }), { style: styleOf("classical"), physique: NEUTRAL_PHYSIQUE, fatigue: 0, finale: false, combo: "" });
  assert.ok(top.dur > solo.dur);
});

test("falls: the physics chooses the way down, and every way lands on the hip side, never the front", () => {
  const facts = { reason: FALL.LeanExceeded, speed: 4, yawRate: 0, spinning: false, landed: null, pitch: 0 };
  assert.equal(fallVariant(facts), "washout");
  assert.equal(fallVariant({ ...facts, speed: 1 }), "sitdown");
  assert.equal(fallVariant({ ...facts, reason: FALL.BalanceTimeout }), "sitdown");
  assert.equal(fallVariant({ ...facts, reason: FALL.ToePickTrip }), "toepick");
  assert.equal(fallVariant({ ...facts, reason: FALL.Pitched, pitch: 1 }), "toepick");
  assert.equal(fallVariant({ ...facts, reason: FALL.Pitched, pitch: -1 }), "sitdown");
  assert.equal(fallVariant({ ...facts, reason: FALL.Collision }), "boards");
  assert.equal(fallVariant({ ...facts, spinning: true }), "spinout");
  assert.equal(fallVariant({ ...facts, reason: FALL.Landing, landed: landed({ fall: true, shortBy: 0.6 }) }), "under");
  assert.equal(fallVariant({ ...facts, reason: FALL.Landing, landed: landed({ fall: true, twoFoot: true }) }), "collapse");
  assert.equal(fallVariant({ ...facts, reason: FALL.Landing, landed: landed({ fall: true, height: 0.5 }) }), "hard");
  const variants: FallVariant[] = ["washout", "sitdown", "spinout", "toepick", "hard", "under", "boards", "collapse"];
  for (const variant of variants) {
    const keys = fallKeys(variant, NEUTRAL_PHYSIQUE);
    assert.ok(keys.length >= 2, variant);
    for (let t = 0; t <= keys[keys.length - 1].t + 0.2; t += 0.05) {
      const f = sample(keys, t)!.fall!;
      // The hip is on the ice to the fall side, the trunk above it: sitting, leaning, or over on the forearm.
      assert.ok(f.hip[0] >= 0 && f.hip[1] < 0.2, `${variant}: the hip is down on its side at ${t.toFixed(2)}`);
      assert.ok(f.neck[1] > f.hip[1] + 0.1, `${variant}: the shoulders stay above the hip at ${t.toFixed(2)}`);
      // Never prone: the neck is never far forward of the hip and low.
      assert.ok(!(f.neck[2] < f.hip[2] - 0.25 && f.neck[1] < f.hip[1] + 0.2), `${variant}: not onto her front at ${t.toFixed(2)}`);
    }
  }
  // The washout is the Unreal port's own fall, its numbers unchanged.
  const washout = fallKeys("washout", NEUTRAL_PHYSIQUE);
  assert.deepEqual(washout[0].fall!.hip, [0.16, 0.13, 0.02]);
  assert.equal(washout[washout.length - 1].t, 0.62);
});

test("the choreographer goes down with the physics and gets up by the body", () => {
  const c = new Choreographer("classical");
  const s = gliding();
  s.fallen = true;
  s.fallReason = FALL.ToePickTrip;
  c.sample(s, ctx({ time: 5 }));
  assert.equal(c.view(5).top?.kind, "fall");
  assert.equal(c.lastFall, "toepick");
  s.fallen = false;
  c.sample(s, ctx({ time: 7 }));
  assert.equal(c.view(7).top?.kind, "rise");
  assert.equal(riseVariant(physiqueOf(SAMPLE_PROFILES[3]), 0), "pop", "a worlds medallist pops straight up");
  assert.equal(riseVariant(physiqueOf(SAMPLE_PROFILES[1]), 0), "kneel");
  assert.equal(riseVariant(NEUTRAL_PHYSIQUE, 0.8), "slow", "spent legs get up slowly");
});

test("nobody holds arms level for a program: gliding, the port de bras keeps moving on the beat", () => {
  for (const id of STYLE_IDS) {
    const c = new Choreographer(id);
    const s = gliding();
    const seen = new Set<string>();
    let phrases = 0, lastId = -1;
    for (let t = 0; t < 30; t += SIM_DT) {
      s.tick++;
      c.sample(s, ctx({ time: t, beat: { bpm: 100, offset: 0 } }));
      const base = c.view(t).base;
      if (base && base.id !== lastId) { phrases++; lastId = base.id; }
      if (base && Math.round(t * 120) % 30 === 0) {
        const k = sample(base.keys, base.at)!;
        seen.add(k.armA!.h.map(x => x.toFixed(1)).join(","));
      }
    }
    assert.ok(phrases >= 3, `${id}: ${phrases} phrases in 30 s`);
    assert.ok(seen.size >= 3, `${id}: the arms passed through ${seen.size} positions`);
  }
});

test("the port de bras gives way to balance, not to a push", () => {
  const c = new Choreographer("classical");
  const s = gliding();
  let t = 0;
  for (; t < 4; t += SIM_DT) c.sample(s, ctx({ time: t }));
  assert.equal(c.view(t).base?.kind, "phrase");
  // A push keeps the line: arms carry it through crossovers.
  s.strokeTime = 0.3;
  c.sample(s, ctx({ time: t }));
  assert.ok(c.view(t).base!.dur - c.view(t).base!.at > 0.36, "a push does not stop the phrase");
  // A balance near its limit takes the arms back.
  s.balanceError = 0.32;
  c.sample(s, ctx({ time: t }));
  const cut = c.view(t).base!;
  assert.ok(cut.dur - cut.at <= 0.36, "fading within 0.35 s of the balance catch");
  // A Function skater (game/armfocus.ts) keeps her arms for balance: no phrase at all.
  const f = new Choreographer("classical");
  const g = gliding();
  for (let u = 0; u < 4; u += SIM_DT) f.sample(g, ctx({ time: u, expression: 0 }));
  assert.equal(f.view(4).base, null);
});

test("spins, spirals and the Ina Bauer carry the style's line", () => {
  const c = new Choreographer("contemporary");
  const s = gliding();
  s.move = MOVE.Spin;
  s.spin.position = 0;
  c.sample(s, ctx({ time: 1 }));
  assert.match(c.view(1).base!.label, /Contemporary upright spin/);
  s.spin.position = 2;
  c.sample(s, ctx({ time: 2 }));
  assert.match(c.view(2).base!.label, /camel spin/);
  s.move = MOVE.InaBauer;
  c.sample(s, ctx({ time: 3 }));
  const ina = c.view(3).base!;
  assert.match(ina.label, /Ina Bauer/);
  assert.ok(ina.keys[0].trunk!.pitch < 0, "the Ina Bauer arches back");
});

test("the program ends in a bow, once, each style its own", () => {
  const c = new Choreographer("showman");
  const s = gliding();
  c.sample(s, ctx({ time: 70, finished: true }));
  assert.equal(c.view(70).top?.kind, "bow");
  const id = c.view(70).top!.id;
  c.sample(s, ctx({ time: 70.1, finished: true }));
  assert.equal(c.view(70.1).top?.id, id, "one bow");
  const deepest = new Map(STYLES.map(st => [st.id, Math.max(...bowKeys(st).map(k => k.trunk!.pitch))]));
  for (const [id2, pitch] of deepest) assert.ok(pitch > 0.2, `${id2} bows`);
  // A run that does not end in a program (free skate) does not bow.
  const free = new Choreographer("showman");
  free.sample(s, ctx({ time: 1, finished: true, bows: false }));
  assert.equal(free.view(1).top, null);
});

test("replays dance the same: the same states choose the same plans", () => {
  const run = () => {
    const c = new Choreographer("contemporary", physiqueOf(SAMPLE_PROFILES[2]));
    const s = gliding();
    const views: string[] = [];
    for (let i = 0; i < 2400; i++) {
      s.tick = i;
      if (i === 600) s.landed = landed({ tick: 600 });
      if (i === 1200) { s.fallen = true; s.fallReason = FALL.LeanExceeded; }
      if (i === 1500) s.fallen = false;
      c.sample(s, ctx({ time: i * SIM_DT, beat: { bpm: 112, offset: 0.4 } }));
      if (i % 60 === 0) views.push(JSON.stringify(c.view(i * SIM_DT)));
    }
    return views;
  };
  assert.deepEqual(run(), run());
});

test("every plan is finite, and every hand within an arm's reach of its shoulder", () => {
  const check = (keys: Key[], what: string) => {
    for (const k of keys) {
      for (const n of numbers(k)) assert.ok(Number.isFinite(n), what);
      for (const a of [k.armA, k.armB]) if (a && !a.ice) assert.ok(Math.hypot(...a.h) < 0.62, `${what}: hand ${a.h}`);
    }
  };
  for (const st of STYLES) {
    for (const kind of [JUMP.Toeloop, JUMP.Axel, JUMP_NONE]) {
      for (const over of [{}, { landingQuality: 0.6 }, { landingQuality: 0.4 }, { stepOut: true, landingQuality: 0.3 }, { twoFoot: true }, { rotationCall: ROTATION_CALL.UnderRotated }]) {
        check(landingPlanKeys(landed({ kind, ...over }), { style: st, physique: NEUTRAL_PHYSIQUE, fatigue: 0.5, finale: true, combo: "2A+3T" }).keys, `${st.id} landing`);
      }
    }
    check(bowKeys(st), `${st.id} bow`);
    for (const phrase of st.phrases) for (const fatigue of [0, 1]) check(phraseKeys(phrase, 0.6, st, fatigue), `${st.id} phrase`);
  }
});

test("in the air, a double or more wears the style's air position: a Rippon, a Tano, or the physics' own tuck", () => {
  for (const [id, want] of [["showman", "Rippon"], ["contemporary", "Tano"], ["classical", null], ["athletic", null]] as const) {
    const c = new Choreographer(id);
    const s = gliding();
    s.jump.phase = JUMP_PHASE.Air;
    s.jump.rotation = Math.PI;
    c.sample(s, ctx({ time: 1 }));
    assert.notEqual(c.view(1).base?.kind, "air", `${id}: not before three-quarters of a turn`);
    s.jump.rotation = 2 * Math.PI;
    c.sample(s, ctx({ time: 1.2 }));
    const base = c.view(1.2).base;
    if (want) assert.match(base!.label, new RegExp(want), id);
    else assert.equal(base, null, `${id} keeps the tuck`);
    // Overhead stays near the axis: the hand within a hand's breadth of the shoulder's line.
    if (want) for (const arm of [base!.keys[0].armA!, base!.keys[0].armB!]) assert.ok(Math.abs(arm.h[0]) < 0.15 && Math.abs(arm.h[2]) < 0.2);
    s.jump.phase = JUMP_PHASE.None;
    c.sample(s, ctx({ time: 1.6 }));
    if (want) assert.ok(c.view(1.6).base!.dur - c.view(1.6).base!.at <= 0.11, `${id}: let go at the landing`);
  }
});
