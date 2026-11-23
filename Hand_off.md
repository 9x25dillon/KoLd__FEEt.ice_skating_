# Hand-off — EDGEWORK / native game & video-motion pipeline

## Resume here
**Newest close:** 23 November 2026, 14:01 PST · Antigravity (Gemini 4 Neon) · session `antigravity-client-00fd`

**Where things stand:**
- `origin/main` is `e120f21` (#132 merged, correcting the 2026-11-20 hand-off which listed #132 as open).
- **Owner-prep & r4 docs audit done:** Delivered Elite 2 desk session sheet, docs audit (`A1–A9`), commit-authorization packet (`~/work/edgework-review-snapshot/edgework-owner-prep-agy-2026-11-23.md`), and verified `proposed-fix-docs-A1-A8.patch` (`git apply --check` exit 0 on r4).
- **Video translator engine started on `feat/edgework-video`** (`.delivery/edgework-video`, off `e120f21`, uncommitted): built M0 schemas + pure-stdlib Python CLI `tools/edgework-video/` (`intake`, `shots`, `annotate`, `calibrate`, `metrics` for O2/O4/O5/O6/O7, `export` wireframe→Clip/Track/QA with all 6 blueprint §3.3 fixes, `preview` HTML with `exportSha256`, `verify`). All **25 / 25** Gate A unit tests pass (`2.77 s`).
- **Parallel LIVE sessions in this repo:** `claude-code-5b4e` (`~/work/edgework-vertical-slice`: r5 boot cover, career balance, README rewrite) and `qwen-code-74d5` + `codex-ff46` (Stage A TS `wireframe.ts` + Python `tools/video-pose/reader.py` parity).

**Decision needed:** Commit `feat/edgework-video` locally now (`tools/edgework-video/` + `Hand_off.md`), or hold uncommitted until Stage A cross-language parity with `codex-ff46`/`qwen-code-74d5` is reconciled?

**Start with:**
1. `python3 -m unittest discover -s .delivery/edgework-video/tools/edgework-video/tests -v` — expect **25 / 25 PASS**.
2. Check Porter (`porter_checkin` with cwd `~/work/edgework-vertical-slice`) for `claude-code-5b4e`, `codex-ff46`, and `qwen-code-74d5` status before touching any shared file.
3. Wire a cross-language parity test between `tools/edgework-video/edgework_video/wireframe.py` and `codex-ff46`'s TypeScript `wireframe.ts` fixtures (or run `edgework-video intake` on one real authorized clip).

## Progress track (newest first)
| Date | Session | Shipped (hash / PR) | State after |
|---|---|---|---|
| 2026-11-23 | Antigravity `00fd` / `2eed` / `feb7` | `edgework-owner-prep-agy-2026-11-23.md`, `proposed-fix-docs-A1-A8.patch`, `tools/edgework-video/` (uncommitted on `feat/edgework-video`) | Owner-prep packet delivered; video pipeline M0 + M1 stdlib stages built & 25/25 passing |
| 2026-11-20 eve | Opus 5.5 `67eeee86` | #132 `e120f21` (`handoff-2026-11-20-blueprint`); blueprint page; porter note 931 | Video pipeline planned; archived at `docs/handoff-before-edgework-video-2026-11-23.md` |
| 2026-11-20 | Codex `01a1faea` | #130 `49849f2`, #128 `4b05863` | Unreal director camera; jump lesson port |
| 2026-11-20 | Opus 5.5 `42712937` | #126 `57a6907`, #127 `f10b12d`, #129 `38c5146`, #131 `1d7ca40` | `crossPlaceMode` on in Sim/Exp/DigGate; `comSwayMode` merged, off |
| 2026-11-19 | Opus 5.5 `374084d9` + team | PR #114–#124 | main `cf0ad40` |

## In flight
- **`feat/edgework-video`** (`.delivery/edgework-video`, local only, uncommitted):
  - Done: 4 M0 JSON schemas (`tools/edgework-video/schemas/`), stdlib CLI (`intake`, `shots`, `annotate`, `calibrate`, `metrics` O2/O4/O5/O6/O7, `export`, `preview`, `verify`), 25/25 Gate A tests passing.
  - Left: reconcile Python wireframe reader (`edgework_video/wireframe.py`) with `qwen-code-74d5`/`codex-ff46` shared parity fixtures; add O1 (perpendicular 2D lean) & O3 (turn angles/twizzles); test on a real authorized clip; later M1 3D backend benchmark (GVHMR/WHAM on RTX 2080 SUPER).
  - Verify: `python3 -m unittest discover -s .delivery/edgework-video/tools/edgework-video/tests -v`.
- **`feat/edgework-vertical-slice`** (`~/work/edgework-vertical-slice`, owned by `claude-code-5b4e`, LIVE): r4 verified green by `qwen-code`; r5 boot-cover + career tuning + README rewrite in progress. Owner hands-on Elite 2 desk session + commit authorization still pending.
- **Stage A wireframe parity** (`codex-ff46` TS `wireframe.ts`, `qwen-code-74d5` Python `tools/video-pose/reader.py`, LIVE): do not edit their claimed paths.
- **`.delivery/tiers-and-blueprint`:** parked untouched as reference per owner decision (2026-11-23).
- **`comSwayMode`:** merged (#129), still off everywhere pending pad feel at 0.35 s + JPSE re-search.

## Decisions (why things are the way they are)
- 2026-11-23 **Fresh `tools/edgework-video/` worktree off `origin/main`:** Owner chose clean build per blueprint over patching `.delivery/tiers-and-blueprint` in place; old draft kept untouched as reference.
- 2026-11-23 **Research-only licensing posture for 3D pose backends:** Owner approved internal measurement & prototype animation with GVHMR/WHAM/SMPL/YOLOv8; legal review required before shipping any 3D-backend-derived asset.
- 2026-11-23 **Pure-stdlib Python for M0/M1 intake, calibration, evidence, export & preview:** Zero pip installs, zero GPU/network use, deterministic byte-for-byte JSON outputs (run logs isolated in `logs/`).
- 2026-11-20 **Cosmetic video motion owns only `arms` + `head`** (`player.ts:131`); `upper-body` mask rejected because trunk lean and twist are physics. Evidence never comes from 3D pose-model root trajectories until measured on skating.

## Dead ends (don't retry without new information)
- **FFmpeg 9.1 deprecated `-vsync vfr` and output `-display_rotation`:** Use `-fps_mode vfr` and input-side `-display_rotation:v:0 90 -i raw.mp4 -c copy` for test fixtures.
- **4-point homography calibration or hardcoded 3.0 m centre circle:** Yields fake 0.00 m RMSE by construction; require `>= 6` surveyed landmarks (`4` fit + `>= 2` held-out) and Gate B `<= 0.10 m` max held-out residual.
- **Copying draft `tools/video-pose/` numbers into `data/validation/cases`:** Unapplied homography, `t = i / fps`, non-gate O2/O6 definitions.

## Open questions (settle these first)
1. **Two Python wireframe readers exist in parallel:** `tools/edgework-video/edgework_video/wireframe.py` (this branch) vs `qwen-code-74d5`'s `tools/video-pose/reader.py` (`stage-a-wireframe-reader`). Decide which single Python reader becomes canonical once `codex-ff46`'s TS parity fixtures land.
2. **Footage source & consent** for the first real M1 clip (own filmed skater vs broadcast internal-only) and **GPU benchmark authorization** (RTX 2080 SUPER VRAM sharing with Ollama).
3. **Owner Elite 2 desk session + commit authorization** for `feat/edgework-vertical-slice` (packet at `~/work/edgework-review-snapshot/edgework-owner-prep-agy-2026-11-23.md`).

## State (verified 14:00 PST)
- **`KoLd__FEEt.ice_skating_` (`.delivery/edgework-video`)** `feat/edgework-video`: 0 commits ahead of `origin/main` (`e120f21`), 15 new files under `tools/edgework-video/` + updated `Hand_off.md` + archived `docs/handoff-before-edgework-video-2026-11-23.md`. Public repo (`9x25dillon/KoLd__FEEt.ice_skating_`); nothing pushed.

## Project health
- Checks: `python3 -m unittest discover -s .delivery/edgework-video/tools/edgework-video/tests -v` → **25 PASS · 0 FAIL · 0 ERROR** (`2.77 s`, 13:59 PST). Ice Lab / Godot / Unreal suites untouched by this branch.
- TODO/FIXME added: none. No `__pycache__` should be committed (ensure `.gitignore` or stage explicit files only).

## Next steps, in order
1. Decide commit vs hold on `feat/edgework-video` (once other live agents settle or on your explicit commit word).
2. Reconcile Stage A Python wireframe reader with `codex-ff46` / `qwen-code-74d5` shared parity fixtures.
3. Run `edgework-video intake` + `shots` + `annotate` + `metrics` on one real authorized skating clip (outside the repo).
4. Complete owner Elite 2 desk session from `~/work/edgework-review-snapshot/edgework-owner-prep-agy-2026-11-23.md`.

## One-shot check
    python3 -m unittest discover -s .delivery/edgework-video/tools/edgework-video/tests -v
    git -C .delivery/edgework-video status -sb

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites; commit with `196308352+9x25dillon@users.noreply.github.com` only when explicitly asked; never push/merge without explicit approval.
- Source video never enters the repo (`--takes-root` must stay outside any git worktree); evidence enters `data/validation/cases` only after human review.
- One agent lands PRs at a time; check Porter before touching shared paths.

## Vocabulary so far
referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control, preregistration, stacked PR, attestation, opt-in, monotonic, triage, Goodhart's law, protocol deviation, chirality, Pareto front, squash merge, dangling commit, forward kinematics, contact constraint, false negative, affordance, juice, vertical slice, superseded, calibration, degenerate strategy, thermal throttling, counterfactual, bake, centre of pressure, knife-edge result, data contract, flaky test, consolidation, smoke test, fail-closed, least privilege, throttle, graceful degradation, defense in depth, false positive, lookahead, latch, superset, addressee, seam, test double, headroom, jerk, quorum, fail-open, pseudoreplication, homography, debounce, fixed timestep, holdout validation (Antigravity Gemini 4 Neon, 2026-11-23), direct linear transform (Antigravity Gemini 4 Neon, 2026-11-23)

## Opening prompt for next session (edit the brackets)
> Read `.delivery/edgework-video/Hand_off.md` and run its one-shot check. Then [reconcile Stage A wireframe parity with codex/qwen | run intake+metrics on a real clip | add O1/O3 evidence metrics]. Stipulate: live work; run only the new tests unless I ask; do not commit/push/merge until I say so. When we wrap up: /hanoffed.
