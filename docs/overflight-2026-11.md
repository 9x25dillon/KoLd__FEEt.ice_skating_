# Jump over-flight measurement — November 2026

Measured on baseline `4aaf3280c01b7392d2f8442d1c43f24d820d7a45`, Node v26.13.1, responsive preset, 120 Hz. Report only: no production physics, cases, thresholds, or replay contract changed.

## Method and limits

Run `node tools/ice-lab/bench/overflight.ts`. It runs twice and requires identical JSON before writing `docs/overflight-2026-11.json`. The three fixed scripts are those recorded by `test/axel-case-scripts.ts`, replayed without retuning at each requested mass. Height stays at the Koga cohort value, 1.4682 m; stats stay neutral. This isolates a mass sweep, not realistic adult body proportions. It is not a search for the best achievable jump at each mass.

Takeoff velocity is sampled on the Takeoff event. Flight time is the Landing minus Takeoff event tick count, matching the validator. Apex is the maximum sampled jump z, not the stored analytic height. Rotation is `landed.turned`, airborne turns without takeoff credit. Integration is discrete, so these need not equal continuous ballistic predictions. Every completed attempt is retained, including falls and shorter inferred jump calls; a clean rotation call alone does not establish that the intended jump was completed.

## Literature comparison

Repository evidence: [ice-literature.md](ice-literature.md#L302) and the three `data/validation/cases/air-time-*-koga2025.json` source records cite Koga et al. (2025), Table 2, DOI 10.3389/fbioe.2025.1606817, PMC12434041. Reported mean ± SD: waltz 1.77 ± 0.46 m/s and 0.36 ± 0.10 s; single axel 2.24 ± 0.42 m/s and 0.40 ± 0.07 s; double axel 2.73 ± 0.31 m/s and 0.51 ± 0.04 s. The double subgroup has only three skaters. SD is population spread, not a hard physiological limit or a confidence interval. Comparisons at other masses are descriptive; these data do not establish a causal mass law.

The same repository literature notes cite Bruening 2018: pooled flight 0.44 ± 0.060 s, and Yamaguchi & Sakurai 2025: 0.443 s at 46.9 kg. The latter note provides no spread, so no interval is invented here. No external source was consulted. Confidence is high in deterministic simulation measurements, limited in generalizing the population comparison.

## Current model measurements

Calls: 0 clean, 1 q, 2 underrotated, 3 downgraded. `Called rev` is the solver-inferred revolution count, not the scripted target. `Above SD` compares vz/time respectively against the matching Koga mean + SD.

| kg | Script | vz m/s | Flight s | Apex m | Air rev | Called rev | Call | Fall | Above SD vz/time |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 37 | waltz-jump | 3.5764 | 0.7250 | 0.6371 | 0.6239 | 0 | 0 | False | True/True |
| 37 | single-axel | 3.5764 | 0.7250 | 0.6371 | 1.3561 | 1 | 1 | False | True/True |
| 37 | double-axel | 3.5764 | 0.7250 | 0.6371 | 2.4543 | 2 | 0 | False | True/True |
| 45 | waltz-jump | 3.2516 | 0.6583 | 0.5254 | 0.5497 | 0 | 0 | False | True/True |
| 45 | single-axel | 3.2516 | 0.6583 | 0.5254 | 1.1970 | 1 | 2 | True | True/True |
| 45 | double-axel | 3.2516 | 0.6583 | 0.5254 | 2.1679 | 2 | 2 | True | True/True |
| 55 | waltz-jump | 2.9486 | 0.6000 | 0.4309 | 0.4851 | 0 | 0 | False | True/True |
| 55 | single-axel | 2.9486 | 0.6000 | 0.4309 | 1.0581 | 1 | 2 | True | True/True |
| 55 | double-axel | 2.9486 | 0.6000 | 0.4309 | 1.9176 | 2 | 3 | True | False/True |
| 65 | waltz-jump | 2.7177 | 0.5500 | 0.3652 | 0.4301 | 0 | 0 | False | True/True |
| 65 | single-axel | 2.7177 | 0.5500 | 0.3652 | 0.9395 | 1 | 3 | True | True/True |
| 65 | double-axel | 2.7177 | 0.5500 | 0.3652 | 1.7035 | 2 | 3 | True | False/False |
| 75 | waltz-jump | 2.5314 | 0.5083 | 0.3161 | 0.3853 | 0 | 0 | False | True/True |
| 75 | single-axel | 2.5314 | 0.5083 | 0.3161 | 0.8416 | 0 | 0 | False | False/True |
| 75 | double-axel | 2.5314 | 0.5083 | 0.3161 | 1.5260 | 1 | 0 | False | False/False |

## Source of the excess

`tools/ice-lab/sim/params.ts:1090` authors the base `jumpImpulse` at 2.94. `sim/profile.ts:189` multiplies it by sqrt(55 / mass). `sim/jump.ts:387` multiplies lift by 0.62 + 0.38 × takeoff quality; measured quality is approximately 1 for these attempts. `sim/jump.ts:394`–407 mixes leg lift and approach-speed vault using `jumpSpeedShare` (0.2 at `sim/params.ts:1150`). Consequently takeoff velocity is not simply the scaled base impulse; approach speed also matters. `sim/jump.ts:524`–525 integrates gravity and height, explaining the sampled/analytic difference. Paths in this paragraph are under `tools/ice-lab/` unless fully stated.

At the exact pinned body (37.02 kg), measured vz is 3.575420 m/s, flight 0.725000 s, apex 0.636729 m. All three scripts share lift, while their whip changes rotation. The model does not reproduce the jump-specific lift differences in the cited sample.

## Owner options (authored proposals, not changes)

1. **Add two-sided reporting, then decide whether to gate.** Applying the existing time tolerances symmetrically to the three exact pinned Koga cases changes 3/3 from pass to fail. This is a computed counterfactual comparison, not a validator run. A proposed vz diagnostic using mean ± one SD flags 3/3; that interval is an authored diagnostic choice, not an approved gate tolerance. Physics and replay outputs would not move. A production observable needs a documented extraction method and tolerance.

2. **Remove the mass exponent (0.5 → 0).** The benchmark overrides only its local parameter object. At 37.02 kg this measures vz 2.933350 m/s, flight 0.591667 s, apex 0.426373 m. Rotation changes from 0.623924/1.356090/2.454340 to 0.479257/1.041657/1.885259 rev. The single and double axel attempts now fall (0 → 2 falls). Current one-sided Koga cases still pass 3/3; hypothetical symmetric time checks still fail 3/3. Thus reducing scaling alone neither matches all three flight distributions nor preserves scripted landings. The complete five-mass counterfactual is in JSON. Pinned test-suite breakage is **unmeasured**; no suites were run under the standing instruction. These counts cover only the three Koga cases, not the full corpus.

3. **Leave behavior unchanged and retain this diagnostic.** The three pinned Koga time comparisons remain 3/3 passes and the two-sided diagnostic remains 3/3 failures. No simulation or gate change is proposed in this option. Current regression status is unmeasured; source files are unchanged, but no full-suite or replay verification claim is made.

## Verification

The benchmark completed and its two independent full results were byte-identical. No optional test file was added: the executable enforces determinism itself. No suites, package installations, engine preparation, commits, or pushes were performed. Full test counts, whole-corpus option breakage, and replay /39 verification remain unmeasured, pending an explicit request for checks.
