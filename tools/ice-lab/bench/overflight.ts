/** Report-only experiment. Run from any cwd: node tools/ice-lab/bench/overflight.ts */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BOOT_PRESET, PRESETS, SIM_DT, SIM_HZ } from '../sim/params.ts';
import { applyProfile, makeProfile } from '../sim/profile.ts';
import { createState, step } from '../sim/solver.ts';
import { EVENT, NEUTRAL_INPUT } from '../sim/types.ts';
import type { EdgeEvent, SkatingInput } from '../sim/types.ts';
import { AXEL_CASES } from '../test/axel-case-scripts.ts';

const root = new URL('../../../', import.meta.url);
const ids = Object.keys(AXEL_CASES);
const velocity = [[1.77, 0.46], [2.24, 0.42], [2.73, 0.31]];
const cases = ids.map(id => JSON.parse(readFileSync(new URL(`data/validation/cases/${id}.json`, root), 'utf8')));

// Fixed, already recorded case inputs: deliberately no retuning at other masses.
function measure(c: typeof cases[number], mass: number, exponent: number) {
  const p = applyProfile(PRESETS[BOOT_PRESET], makeProfile('overflight', { massKg: mass, heightM: c.skater.height_m }));
  // Authored counterfactual, local Params only; production code stays unchanged.
  p.jumpImpulse *= Math.pow(55 / mass, exponent - 0.5);
  Object.assign(p, c.inputs.modes);
  const s = createState(p, c.inputs.initial.speed_ms, c.inputs.initial.lean_rad);
  let takeoffTick: number | null = null, vz: number | null = null, apex = 0;
  for (const segment of c.inputs.script) {
    const input: SkatingInput = { ...NEUTRAL_INPUT, ...segment.input };
    for (let k = 0; k < Math.round(segment.seconds * SIM_HZ); k++) {
      const events: EdgeEvent[] = [];
      step(s, input, p, SIM_DT, events);
      const up = events.find(e => e.type === EVENT.Takeoff);
      if (up && takeoffTick === null) { takeoffTick = up.tick; vz = s.jump.vz; }
      if (takeoffTick !== null) apex = Math.max(apex, s.jump.z);
      const down = events.find(e => e.type === EVENT.Landing);
      if (down && takeoffTick !== null) {
        const flight = (down.tick - takeoffTick) * SIM_DT;
        const i = ids.indexOf(c.id), [mean, sd] = velocity[i];
        return { case: c.id, massKg: mass, heightM: c.skater.height_m, exponent,
          takeoffVz: vz!, flightSeconds: flight, apexMeters: apex,
          airborneRevolutions: s.landed.turned, kind: s.landed.kind,
          calledRevolutions: s.landed.revolutions, rotationCall: s.landed.rotationCall, fall: s.landed.fall, stepOut: s.landed.stepOut,
          takeoffQuality: s.landed.takeoffQuality,
          literature: { vzMean: mean, vzSD: sd, flightMean: c.expected.value, flightSD: c.expected.measurement_uncertainty },
          vzAboveMeanPlusSD: vz! > mean + sd,
          flightAboveMeanPlusSD: flight > c.expected.value + c.expected.measurement_uncertainty,
          currentCasePass: flight >= c.expected.value - c.expected.tolerance - 1e-12,
          proposedTwoSidedPass: Math.abs(flight - c.expected.value) <= c.expected.tolerance + 1e-12 };
      }
    }
  }
  throw new Error(`No complete flight: ${c.id}, ${mass} kg, exponent ${exponent}`);
}

export function overflight() {
  const rows = [37, 45, 55, 65, 75].flatMap(m => cases.map(c => measure(c, m, 0.5)));
  const flatExponentRows = [37, 45, 55, 65, 75].flatMap(m => cases.map(c => measure(c, m, 0)));
  const pinnedCases = [0.5, 0].flatMap(e => cases.map(c => measure(c, c.skater.mass_kg, e)));
  return { schema: 'overflight/1', preset: BOOT_PRESET, hz: SIM_HZ,
    method: 'Fixed recorded Koga scripts; cohort height held fixed; neutral stats; first takeoff/landing event pair. Apex is sampled z, rotation is landed.turned. Counterfactual exponent zero is authored.',
    rows, flatExponentRows, pinnedCases };
}

if (import.meta.main) {
  const result = overflight();
  const json = JSON.stringify(result, null, 2) + '\n';
  if (json !== JSON.stringify(overflight(), null, 2) + '\n') throw new Error('Non-deterministic benchmark');
  writeFileSync(fileURLToPath(new URL('docs/overflight-2026-11.json', root)), json);
  console.table(result.rows.map(({ case: id, massKg, takeoffVz, flightSeconds, apexMeters, airborneRevolutions, rotationCall, fall }) =>
    ({ jump: id.replace('air-time-', '').replace('-koga2025', ''), massKg, takeoffVz, flightSeconds, apexMeters, airborneRevolutions, rotationCall, fall })));
  console.log('Determinism: identical JSON from two independent runs.');
  console.log(JSON.stringify(result.pinnedCases, null, 2));
}
