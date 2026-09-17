// The skater profile layer — sim/profile.ts.
//
// Two duties before it is allowed to change anything: leave the reference
// skater exactly where DEFAULT_PARAMS put them, so nothing recorded so far
// moves; and stay inside the envelope the rig already measured, so a maxed
// skater is a better skater and not a different model.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  STAT_NAMES, STAT_EFFECTS, SAMPLE_PROFILES, TIERS, REFERENCE_WEAR,
  applyProfile, curve, effectMultiplier, sharpnessOf, wearBlade, sharpen,
  xpToRaise, xpInvested, train, overall, tierOf, level, validateProfile, makeProfile,
} from "../sim/profile.ts";
import type { SkaterProfile, StatName } from "../sim/profile.ts";
import { DEFAULT_PARAMS, PRESETS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";

const deg = (d: number): number => (d * Math.PI) / 180;
const allStats = (v: number): SkaterProfile => makeProfile(`all ${v}`, {
  stats: { strength: v, spring: v, edgeControl: v, balance: v, stamina: v },
});

test("the reference skater bakes to the base preset, bit for bit", () => {
  for (const name of Object.keys(PRESETS)) {
    assert.deepEqual(applyProfile(PRESETS[name], SAMPLE_PROFILES[0]), PRESETS[name], name);
  }
  assert.deepEqual(applyProfile(DEFAULT_PARAMS, makeProfile("x")), DEFAULT_PARAMS);
});

test("the balance curve is 0 at 50, linear below, concave above, and bounded", () => {
  assert.equal(curve(50), 0);
  assert.equal(curve(0), -1);
  assert.equal(curve(100), 1);
  assert.ok(Math.abs(curve(25) + 0.5) < 1e-12, "the bottom half is linear");
  // Diminishing returns: each ten points above 50 buys less than the last.
  let prev = curve(50);
  let prevGain = Infinity;
  for (let s = 60; s <= 100; s += 10) {
    const gain = curve(s) - prev;
    assert.ok(gain > 0 && gain < prevGain, `gain ${s}: ${gain.toFixed(3)} after ${prevGain.toFixed(3)}`);
    prev = curve(s); prevGain = gain;
  }
  for (const n of STAT_NAMES) for (const e of STAT_EFFECTS[n]) {
    assert.equal(effectMultiplier(e, 50), 1, `${n}.${e.key} at 50`);
    assert.ok(Math.abs(effectMultiplier(e, 0) - e.atMin) < 1e-12, `${n}.${e.key} at 0`);
    assert.ok(Math.abs(effectMultiplier(e, 100) - e.atMax) < 1e-12, `${n}.${e.key} at 100`);
  }
});

test("every stat moves exactly the parameters STAT_EFFECTS says it does", () => {
  // Stamina bound to the Wind / Legs pools (bible §2.8) once sim/solver.ts
  // had them (staminaMode) — this used to special-case stamina as empty;
  // that reminder is gone now that the row is filled.
  for (const n of STAT_NAMES) {
    const p = applyProfile(DEFAULT_PARAMS, makeProfile("one", { stats: { [n]: 100 } }));
    const moved = (Object.keys(p) as Array<keyof Params>).filter((k) => p[k] !== DEFAULT_PARAMS[k]);
    assert.deepEqual(moved.sort(), STAT_EFFECTS[n].map((e) => e.key).sort(), n);
  }
});

test("the ends of every stat, and of the body, validate over every preset", () => {
  const corners: SkaterProfile[] = [allStats(0), allStats(100),
    makeProfile("light", { massKg: 30, heightM: 1.2 }),
    makeProfile("heavy", { massKg: 120, heightM: 2.1 }),
    makeProfile("dull", { bladeWear: 1 }), makeProfile("fresh", { bladeWear: 0 }),
    ...SAMPLE_PROFILES];
  for (const name of Object.keys(PRESETS)) for (const c of corners) {
    assert.deepEqual(validateProfile(c, PRESETS[name]), [], `${c.name} over ${name}`);
    assert.deepEqual(validate(applyProfile(PRESETS[name], c)), []);
  }
});

/** Deepest lean, in whole degrees, reachable from upright without going down. */
function entryLimit(p: Params, speed: number): number {
  let best = 0;
  for (let d = 2; d <= 60; d++) {
    const s = createState(p, speed, 0);
    let up = true;
    for (let i = 0; i < 720; i++) {
      step(s, { ...NEUTRAL_INPUT, lean: deg(d) / p.maxLean, weight: 1 }, p, SIM_DT, []);
      if (s.fallen) { up = false; break; }
    }
    if (up) best = d; else break;
  }
  return best;
}

test("a maxed skater still skates, and skates better than a floored one — by a bounded margin", () => {
  const base = PRESETS.responsive;
  const lo = entryLimit(applyProfile(base, allStats(0)), 4);
  const mid = entryLimit(base, 4);
  const hi = entryLimit(applyProfile(base, allStats(100)), 4);
  assert.ok(lo < mid && mid <= hi, `entry limit at 4 m/s: ${lo} / ${mid} / ${hi} deg`);
  assert.ok(lo >= 8, `a stat-0 skater must still be able to enter an edge: ${lo} deg`);
  assert.ok(hi <= mid + 25, `a stat-100 skater must not leave the model: ${hi} deg`);
});

test("strength is a bounded lever on speed built from a standing stroke", () => {
  const speedAfter = (p: Params): number => {
    const s = createState(p, 1.0, 0);
    for (let i = 0; i < 120 * 6; i++) {
      const push = i % 90 === 0;
      step(s, { ...NEUTRAL_INPUT, knee: 0.8, weight: 0.5, push }, p, SIM_DT, []);
    }
    return Math.hypot(s.vel.x, s.vel.y);
  };
  const weak = speedAfter(applyProfile(PRESETS.responsive, makeProfile("w", { stats: { strength: 0 } })));
  const ref = speedAfter(PRESETS.responsive);
  const strong = speedAfter(applyProfile(PRESETS.responsive, makeProfile("s", { stats: { strength: 100 } })));
  assert.ok(weak < ref && ref < strong, `six seconds of stroking: ${weak.toFixed(2)} / ${ref.toFixed(2)} / ${strong.toFixed(2)} m/s`);
  assert.ok(strong / weak < 2.0, `the span must stay a lever, not a different sport: ${(strong / weak).toFixed(2)}x`);
});

test("mass does what the model lets it: same lean, different drag and jump", () => {
  const heavy = applyProfile(DEFAULT_PARAMS, makeProfile("h", { massKg: 80 }));
  const light = applyProfile(DEFAULT_PARAMS, makeProfile("l", { massKg: 45 }));
  assert.equal(heavy.mass, 80);
  assert.ok(heavy.cdA > light.cdA && heavy.cdA / heavy.mass < light.cdA / light.mass,
    "a heavier skater has more area but less drag per kilogram");
  assert.ok(heavy.jumpImpulse < DEFAULT_PARAMS.jumpImpulse && light.jumpImpulse > DEFAULT_PARAMS.jumpImpulse);
  // Coasting: the heavier skater keeps more speed over ten seconds.
  const coast = (p: Params): number => {
    const s = createState(p, 6.0, 0);
    for (let i = 0; i < 1200; i++) step(s, { ...NEUTRAL_INPUT, weight: 1 }, p, SIM_DT, []);
    return Math.hypot(s.vel.x, s.vel.y);
  };
  assert.ok(coast(heavy) > coast(light), "drag costs the light skater more");
});

test("blade wear: fresh above reference, dull a quarter down, and time on the ice moves it", () => {
  assert.ok(Math.abs(sharpnessOf(REFERENCE_WEAR) - 1) < 1e-12);
  assert.equal(sharpnessOf(0), 1.05);
  assert.equal(sharpnessOf(1), 0.80);
  const p = makeProfile("b", { bladeWear: 0 });
  const worn = wearBlade(p, 10 * 3600);
  assert.ok(Math.abs(worn.bladeWear - 0.5) < 1e-12, "half a blade life is ten hours");
  assert.equal(wearBlade(worn, 1e9).bladeWear, 1, "it stops at dull");
  assert.equal(sharpen(worn).bladeWear, 0);
  assert.equal(p.bladeWear, 0, "wearBlade is pure");
  assert.ok(applyProfile(DEFAULT_PARAMS, worn).sharpness < applyProfile(DEFAULT_PARAMS, p).sharpness);
});

test("training: the price rises, the budget is respected, the cap holds, nothing is mutated", () => {
  assert.equal(xpToRaise(0), 10);
  assert.equal(xpToRaise(50), 110);
  assert.equal(xpToRaise(99), 402);
  assert.ok(xpInvested(100) > xpInvested(50) * 4, "the top half costs more than four bottom halves");
  const p = makeProfile("t", { xp: 500, stats: { strength: 50 } });
  const t = train(p, "strength");
  // 110 + 114 + 118 + 122 = 464 <= 500 < 464 + 127
  assert.equal(t.stats.strength, 54);
  assert.equal(t.xp, 36);
  assert.equal(p.stats.strength, 50, "train is pure");
  assert.equal(train(t, "strength").stats.strength, 54, "unaffordable: unchanged");
  const partial = train(p, "spring", 200);   // spend at most 200 of the 500
  assert.equal(partial.stats.spring, 51);
  assert.equal(partial.xp, 390);
  const capped = train(makeProfile("c", { xp: 1e6, stats: { balance: 98 } }), "balance");
  assert.equal(capped.stats.balance, 100);
  assert.equal(capped.xp, 1e6 - xpToRaise(98) - xpToRaise(99));
});

test("overall, tier and level: the samples climb the ladder in order", () => {
  const names = SAMPLE_PROFILES.map((p) => p.name);
  assert.deepEqual(names, ["reference", "club novice", "nationals senior", "worlds medallist"]);
  const [ref, novice, senior, medallist] = SAMPLE_PROFILES;
  assert.equal(overall(ref), 50);
  assert.ok(overall(novice) < overall(ref) && overall(ref) < overall(senior) && overall(senior) < overall(medallist));
  assert.equal(tierOf(novice), "club");
  assert.equal(tierOf(ref), "regionals");
  assert.equal(tierOf(senior), "nationals");
  assert.equal(tierOf(medallist), "worlds");
  assert.equal(tierOf(allStats(100)), TIERS[TIERS.length - 1].name);
  assert.ok(level(novice) < level(ref) && level(ref) < level(senior) && level(senior) < level(medallist));
  assert.equal(level(allStats(0)), 1);
  // Weights sum to one, so overall is a weighted mean and stays 0..100.
  const sum = STAT_NAMES.reduce((a, n: StatName) => a + (overall(makeProfile("w", { stats: { [n]: 100 } })) - 50) / 50, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}`);
});

test("validateProfile catches the obvious", () => {
  assert.ok(validateProfile(makeProfile("m", { massKg: 10 })).some((e) => e.includes("massKg")));
  assert.ok(validateProfile(makeProfile("s", { stats: { spring: 50.5 } })).some((e) => e.includes("spring")));
  assert.ok(validateProfile(makeProfile("s", { stats: { spring: 101 } })).some((e) => e.includes("spring")));
  assert.ok(validateProfile(makeProfile("b", { bladeWear: 2 })).some((e) => e.includes("bladeWear")));
});
