# Overflight report

Implemented the deterministic benchmark and generated JSON/Markdown measurements in the four claimed files. No sim, case, threshold, or replay file changed.

Commands: `pwd`, `git status -sb`, `git rev-parse HEAD`, targeted source reads/searches, `node --version`, `node tools/ice-lab/bench/overflight.ts` (also rerun after including called revolutions), `git diff --check`.

Baseline: clean branch overflight at 4aaf3280c01b7392d2f8442d1c43f24d820d7a45; Node v26.13.1. Baseline suites were not run, following the user's standing no-suite instruction.

Output: 15 baseline mass/jump rows, 15 exponent-zero counterfactual rows, 6 exact-cohort rows. Every benchmark execution independently computes the complete result twice and asserts byte equality. At 37.02 kg, 0.725 s current flight versus 0.591667 s with exponent zero. Both axel attempts fall with exponent zero. All three one-sided time cases still pass; all three would fail symmetric current tolerances.

Test counts: not measured. No suites, replay verification, typecheck install, engine preparation, commit, push, or PR. Whole-suite effects remain unmeasured. No tuning or gate decision made.

Owner questions: whether to introduce two-sided diagnostics/gates; whether effort-specific lift should precede a mass-law change; whether to authorize full verification and wider counterfactual regression measurements.
