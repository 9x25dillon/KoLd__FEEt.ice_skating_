# Report: Two-sided Reporting & `takeoff_vz` Diagnostics (`two-sided-report`)

## What Changed

1. **`tools/ice-lab/validate.mjs`**
   - Added report-only `twoSided: { deviation, within }` for every `at_least` / `at_most` case with a finite `value` and `tolerance` (`within: |deviation| <= tolerance + 1e-12`). Never read by `verdict`, `summary`, `coverage`, or exit code.
   - Added a `Two-sided` column to `markdown()` (`✓` / `over by X` / `under by X` for excess beyond the two-sided tolerance band, or `—` for two-sided/categorical cases) and documented it in the Sourced cases legend.
   - Added `takeoff_vz` snapshot capture at `EVENT.Takeoff` (`s.jump.vz`), copying the method from `tools/ice-lab/bench/overflight.ts` (branch `overflight`), and `DIAGNOSTIC_EXTRACT.takeoff_vz`.
   - Added strict validation of the optional `diagnostics` array in `invalid(c, file)` so unknown keys, unknown diagnostic observables, invalid numbers/units, or `gated !== false` fail loudly as `invalid case: ...`.
   - Added a `Diagnostics (not gated)` table to both `human()` and `markdown()` outputs.

2. **Koga 2025 Case Files** (`data/validation/cases/air-time-*-koga2025.json`)
   - Added optional `diagnostics` entry for `takeoff_vz` (`gated: false`) using the Koga 2025 Table 2 mean ± SD already cited in each case's `source.notes`:
     - `air-time-waltz-jump-koga2025.json`: `1.77 ± 0.46 m/s`
     - `air-time-single-axel-koga2025.json`: `2.24 ± 0.42 m/s`
     - `air-time-double-axel-koga2025.json`: `2.73 ± 0.31 m/s`

3. **Documentation**
   - `docs/fidelity-gate.md` (§4.3 O5): Added the paragraph `"Two-sided columns and diagnostics are reported, not gated (owner, 2026-11-18)."`
   - `docs/fidelity-report.md`: Regenerated with `node tools/ice-lab/validate.mjs --report docs/fidelity-report.md`.

4. **Tests**
   - `tools/ice-lab/test/two-sided-report.test.ts`: Added tests verifying that verdicts, summary counts, coverage, and `spec` results are identical with and without `diagnostics`, that `twoSided` covers `at_least` and `at_most` without affecting verdicts or exit code, and that malformed `diagnostics` entries are rejected loudly.

## Verdict Table Comparison (Before vs. After)

All 11 sourced cases keep the exact same `Expected`, `Tolerance`, `Actual`, `Deviation`, `Verdict` (`pass`), and `spec` values. Summary counts remain:
`11 pass, 0 fail, 25 unsourced, 2 unmodelled, of 38 cases` (exit code `0`).

Diff of `docs/fidelity-report.md` sourced cases and diagnostics:

```diff
+**Two-sided** is a report-only diagnostic for `≥` / `≤` cases showing whether `|deviation| ≤ tolerance` (`✓`, or
+`over by X` / `under by X` for the excess beyond the two-sided band `|deviation| − tolerance`); it is not gated and never affects any verdict, count, or exit code.
+
+| Case | Source | Observable | Comparison | Expected | Tolerance | Actual | Deviation | Verdict | Two-sided | `spec` |
+| --- | --- | --- | :---: | ---: | ---: | ---: | ---: | --- | :---: | --- |
+| `air-time-double-axel-koga2025` | literature | `air_time_s` | ≥ | 0.5100 s | 0.0640 | 0.7250 | 0.2150 | pass | over by 0.1510 | pass 0.7333 |
+| `air-time-isolated-jumps-bruening2018` | literature | `air_time_s` | ≥ | 0.4400 s | 0.0781 | 0.5917 | 0.1517 | pass | over by 0.0736 | pass 0.5917 |
+| `air-time-single-axel-koga2025` | literature | `air_time_s` | ≥ | 0.4000 s | 0.0860 | 0.7250 | 0.3250 | pass | over by 0.2390 | pass 0.7333 |
+| `air-time-waltz-jump-koga2025` | literature | `air_time_s` | ≥ | 0.3600 s | 0.1118 | 0.7250 | 0.3650 | pass | over by 0.2532 | pass 0.7333 |
+| `carve-residual-fast-deep` | derived | `carve_lean_residual_deg` | ± | 0.0000 deg | 0.5000 | -0.0054 | -0.0054 | pass | — | fail 0.6109 |
+| `carve-residual-mid` | derived | `carve_lean_residual_deg` | ± | 0.0000 deg | 0.5000 | 0.0032 | 0.0032 | pass | — | fail 0.5313 |
+| `carve-residual-slow-shallow` | derived | `carve_lean_residual_deg` | ± | 0.0000 deg | 0.5000 | 0.0031 | 0.0031 | pass | — | fail (no steady window (fidelity-gate §4.4)) |
+| `carve-residual-two-foot` | derived | `carve_lean_residual_deg` | ± | 0.0000 deg | 0.5000 | 0.0517 | 0.0517 | pass | — | fail (no steady window (fidelity-gate §4.4)) |
+| `flight-residual-full-jump-moves` | derived | `air_time_height_residual_m` | ± | 0.0000 m | 0.0500 | -0.0010 | -0.0010 | pass | — | pass -0.0010 |
+| `flight-residual-hop` | derived | `air_time_height_residual_m` | ± | 0.0000 m | 0.0500 | -0.0010 | -0.0010 | pass | — | pass -0.0010 |
+| `glide-hockey-sled-federolf2008` | literature | `glide_decel_ms2` | ± | 0.0697 m/s^2 | 0.0181 | 0.0720 | 0.0024 | pass | — | pass 0.0720 |
+
+## Diagnostics (not gated)
+
+Report-only measurements attached to cases for inspection; never affects any verdict, coverage count, or exit code.
+
+| Case | Observable | Expected | SD | Actual | Deviation | Within ±SD | `spec` |
+| --- | --- | ---: | ---: | ---: | ---: | :---: | --- |
+| `air-time-double-axel-koga2025` | `takeoff_vz` | 2.7300 m/s | 0.3100 | 3.5754 | 0.8454 | over by 0.5354 | 3.6228 |
+| `air-time-single-axel-koga2025` | `takeoff_vz` | 2.2400 m/s | 0.4200 | 3.5754 | 1.3354 | over by 0.9154 | 3.6228 |
+| `air-time-waltz-jump-koga2025` | `takeoff_vz` | 1.7700 m/s | 0.4600 | 3.5754 | 1.8054 | over by 1.3454 | 3.6228 |
```

## Verification Commands & Outputs

- **Baseline** (commit `4aaf328`):
  - `tools/ice-lab`: `node --test test/*.test.ts` → 1095 tests: 1094 pass, 0 fail, 1 todo (`test/discretisation.test.ts:332:1` known floor todo)
  - `node replay/verify.ts test/fixtures/replay-v1.json` → `{"verified":true,"ticks":240}`
  - `games/ice-run-godot`: `node games/ice-run-godot/tools/prepare.mjs --engine-only && node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs` → 68 tests: 68 pass, 0 fail
  - `node tools/ice-lab/validate.mjs` → 11 pass, 0 fail, 25 unsourced, 2 unmodelled (exit 0)

- **Post-edit**:
  - `(cd tools/ice-lab && node --test test/*.test.ts && node replay/verify.ts test/fixtures/replay-v1.json)` → 1098 tests: 1097 pass, 0 fail, 1 todo (+3 new tests in `test/two-sided-report.test.ts`); replay `{"verified":true,"ticks":240}`
  - `node games/ice-run-godot/tools/prepare.mjs --engine-only && node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs` → 68 tests: 68 pass, 0 fail
  - `node tools/ice-lab/validate.mjs --report docs/fidelity-report.md` → 11 pass, 0 fail, 25 unsourced, 2 unmodelled (exit 0); rerun diff against `docs/fidelity-report.md` is empty (byte-identical).
  - `tsc --noEmit`: Passed with 0 errors (`/tmp/agy-tsc/node_modules/.bin/tsc --noEmit -p . --typeRoots /tmp/agy-tsc/node_modules/@types`, after adding `twoSided` and `diagnostics` types to `tools/ice-lab/validate.d.mts`).

## Open Questions for the Owner

- In `docs/fidelity-report.md`, `over by X` / `under by X` in the `Two-sided` and `Within ±SD` columns reports the excess beyond the tolerance / SD band (`|deviation| − tolerance` or `|deviation| − sd`) rather than raw `|deviation|`, since `Deviation` is already shown in its own column. Confirm if that convention is preferred.
- `README.md` was not modified (outside owned files); CI's `status.mjs` check may expect `README.md` test count to be updated when merging (1094 → 1097 passing tests).
- Commit on branch `two-sided-report` is pending owner confirmation per workspace git-commit approval rules.
