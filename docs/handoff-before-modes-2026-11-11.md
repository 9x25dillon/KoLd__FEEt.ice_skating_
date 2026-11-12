# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 11 November 2026, 15:20 PST · Claude Code, Opus 5.5 · session `73e1dc5d`
**Where things stand:** Everything from today is on `main` (`f0509db`, PRs #84–#90; CI green). The career has a **second season** (the Nationals season: Sectionals, Autumn Trophy, Northern Cup, Nationals, a gala) with Teodora Wynn joining the field. Five rivals exist as **models** (Ansa, Katya, Noor, Remi, Teodora). They skate a **warm-up group** with you before each career program and stand on a **podium** after it, in both Godot and Unreal. A **motion library** (`tools/ice-lab/game/motion/`) holds 350 clips: 108 falls, 81 expressions, 68 spin clips, 60 transitions, 24 free-leg lines. It also holds **18 dance styles**. Both clients play two kinds of clip: library falls, and a chosen dance style's arms. **None of today's work has been played on the pad.**
**Corrects the previous hand-off:** #81, #82 and #83 (another session's Power search) all merged on 10–11 November, so #73's Unreal work is on `main`. Its "Power lands no double loops" was a measurement artifact (#83).
**Decision needed:** none to start. Several owner calls are listed under Open questions.
**Start with:**
1. `git fetch origin; git log --oneline -3 origin/main`: expect `f0509db` or later.
2. Fresh worktree off `origin/main`, then `npm start`. On the pad:
   - play a career event: warm-up, program, podium;
   - fall once on purpose (a library fall plays);
   - in Settings choose a **Dance style** and skate a free run.
3. Then build next step 2: a dance style chosen per career event (owner liked it).

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-11 | Opus 5.5 `73e1dc5d` | PR #90 `a482442` | Unreal plays the motion library: library falls; a dance style's arms; Dance style setting |
| 2026-11-11 | Opus 5.5 `73e1dc5d` | PR #89 | Pose `twist`: the shoulders against the hips (±60°); turns and épaulement read |
| 2026-11-11 | Opus 5.5 `73e1dc5d` | PR #88 | Godot plays `frame.motion` (`game/motion/player.ts`); Dance style in Settings |
| 2026-11-11 | Opus 5.5 `73e1dc5d` | PR #87 | Motion library: 350 clips, 18 dance styles, `onIce()`, `chooseFall()`, `choreograph()`; renders in `docs/presentation/motion/` |
| 2026-11-11 | Opus 5.5 `73e1dc5d` | PR #86 | Unreal warm-up group and podium; `game/podium.ts` (podium skaters as sim standing states) |
| 2026-11-11 | Opus 5.5 `73e1dc5d` | PR #85 | Warm-up group (`game/warmup.ts`): rivals skated by the closed-loop pilot before a career program |
| 2026-11-11 | Opus 5.5 `73e1dc5d` | PR #84 | Season two (Nationals); five rival models (`build_athlete.py --rival=`); Godot podium; cast renders |
| 2026-11-10 | Opus 5.5 `33ad` | PR #81–#83 | 9 Nov hand-off; #73's Unreal work brought to `main`; Power's own entrance search |
| 2026-11-09 | Opus 5.5 `cd5d8f8d` | PR #75–#80 | JPSE, clockwise jumps, career styles, free-leg raise, custom style |
| earlier | — | — | `docs/handoff-before-motion-2026-11-11.md` and older archives |

## In flight
- Nothing from today: all merged. Worktrees left under no-deletes: `.delivery/story`, `warmup`, `ue-wp`, `motion`, `playback`, `twist`, `ue-motion`, `handoff-1111`. `.delivery/story` holds 3 untracked `bob01` hair files (tried and replaced by afro01); never commit them.
- **Jump lesson** in `.delivery/jumplesson` (branch `jump-lesson`): **uncommitted**, from session `33ad` (10 Nov). It touches `tutorial.ts`, `main.ts`, `engine.mjs` and `padcourse.ts`. It needs the owner's word to commit; expect conflicts with today's `engine.mjs` and `main.ts`.
- **Unreal director camera** on `unreal-choreo` (`b230393`, 6 Nov, local only, PUBLIC repo): not this session's. Push only on the owner's word.

## Decisions (why things are the way they are)
- 2026-11-11 **Season two = the Nationals season** (owner's pick of three):
  - 5 events at senior lengths (160 s short, 240 s free).
  - Floors sit just under what silver XP buys, measured as season one's were: 53.05–55.0.
  - The gala is an exhibition: it places nobody and stands no one on a podium.
- 2026-11-11 **Season two's routines use only the six elements the rival pilot can skate**, and every jump follows an edge. The baselines are measured by `rival_baseline.mjs --from=5 --wide`. Nationals had no clean run, so it **borrows** the Northern Cup's 32.0 (same free segment, all PCS). Spiral, step and combo wait on measured pads.
- 2026-11-11 **Rival models before Mara or render passes** (owner's pick):
  - Heights are solved in metres from the height target: 1.50 / 1.57 / 1.58 / 1.65 / 1.68.
  - Competition hair only: Noor's bob became afro01.
  - Lio Tarrant has no model (see Open questions).
- 2026-11-11 **The warm-up is a pre-phase, not part of the program.** When it ends or is skipped, the career start runs again fresh: no warm-up ticks in the replay, no warm-up marks on the PCS ice. It's opt-in in the bridge, on in the clients, and off in tests and stills.
- 2026-11-11 **Podium skaters are real sim standing states.** They're settled by the solver, then the whole stance, blades included, is turned to face the camera. They're not authored poses.
- 2026-11-11 **Motion library pose = segment directions + pelvis**, so one clip fits every model. `onIce()` is a contact constraint, also applied when sampling.
- 2026-11-11 **The sim decides the fall; the library decides how it looks.** `chooseFall()` reads the reason, side, speed and jump or spin cause. The side comes from `game/wear.ts` `fallSide` (+1 = her left), now the single rule. Don't write it a fourth time.
- 2026-11-11 **A dance style's arms play only while her arms are free**: never in the air, a jump load, a spin or a formal move, where arm carriage is physics. Routines are shown, not scored (since 2 Nov).
- 2026-11-11 **Twist is ±60°** (the shoulder line's reach against the hips). A turn's rotation of the whole body stays the sim's heading.
- Earlier, still in force: styles are measured Params multipliers; rust is never a menu lock; rivals never decide medals; replay stays at `/39` until the owner's canonicalisation.

## Dead ends (don't retry without new information)
- **A jump straight out of a crossover in a pilot program.** On today's engine the pilot falls; put an edge first.
- **Pilot elements after a spin without turning forward and rebuilding speed.** It falls; fixed in `rival_baseline.mjs` for every element but the pose.
- **Stills of a finished run with `-IceShots` all after the end.** The shot clock pauses when nothing is playing and no shot has been taken; take one before the end, or use `-IcePodiumPreview`.
- **Mirroring a symmetric fall for its twin.** It changes nothing; turn it 25° first (`turnPose`).
- **`Math.hypot(...) || 1` for a segment's horizontal length.** A vertical segment then keeps pointing down; check `h > 1e-6` instead.
- **Python `str.replace` on lines that occur twice** (the arms in both `apply_motion` branches). Target by index.
- From earlier: instant yaw rate as turn sense; spin probes with `kneeSplit = knee`; regenerating fixtures to pass tests.

## Open questions (settle these first)
- **Lio Tarrant** is written "him" in season one, in a women's field. Make him a woman, or a men's skater with his own model? He has no model; he's drawn in the athlete's model wearing his costume.
- **Warm-up falls cost career wear** (as real ones would). Keep it, or make them free? Also, is 45 s right (a real warm-up is six minutes)?
- **Season one's Championship baseline** was clean on 3 November, but on today's engine the pilot falls on its jump out of a crossover. Is that a pilot limit or an engine change since then? Measure before re-pinning anything.
- **Autumn Trophy's baseline** rests on 3 clean runs of 45 (thin), and **Teodora's level 1.7** is authored. Play will tell.
- **The motion library's shapes are authored by eye**, not measured or motion-captured. Mocap stays the investor case.
- Carried over: JPSE objective weights; style numbers; clockwise jumps and the free-leg raise unplayed; the fatigue wobble isn't mirrored.

## State (verified 15:16–15:20 PST)
- `main` `f0509db`; CI green on #89 and #90. Open PRs: none in this repo (`astro_caster` Dependabot PRs are another project's).
- Outer checkout `phase17-assurance`: old dirty work. Never sweep it.
- No game or Unreal instance left open.

## Project health
- Ice Lab 998/998 (on #89's tree) · Godot bridge 50/50 · typecheck clean · `pose_lab --check` passes · Godot smoke passes (career, podium, pairs) · Unreal project tests 8/8 (live smoke and menu walk).
- Fragile:
  - A fresh worktree needs `godot4 --headless --path games/ice-run-godot --import` before the smoke test (class cache), and `node games/ice-run-unreal/tools/prepare.mjs --content` before Unreal stills (rival models).
  - `prepare.mjs` copies `game/motion/` as its own folder; add any new subfolder there.

## Next steps, in order
1. **Play it on the pad**: career with warm-up and podium, a fall, a dance style. Write timestamped notes.
2. **A dance style per career event** (owner liked it):
   - a `styles` array on `CareerState`, saved like `plans` and migrated for older saves;
   - a style row on the briefing page in Godot and Unreal;
   - `suggestStyles()` ranking for the event's track;
   - `MotionPlayer` uses the event's style over the Settings one.
3. **Spin positions and moves in the field play during spins and spirals** (owner: "a great suggestion"). In `game/motion/player.ts`, while `s.move` is a spin, play the position's `SP_*` reference pose, chosen by `s.spin.position` and the declared variation; use the `.cw` twin for a clockwise spin. Play `move.spiral.*` in a spiral and `move.ina-bauer` in an Ina Bauer, as full-body clips.
   - Keep the skating leg the sim's support foot, or mirror the clip to match.
   - Check with `pose_lab --check`.
4. Answer the Open questions above (Lio, warm-up wear and length, the Championship baseline).
5. Measured pads for spiral, step and combo, so season two can require them.

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    (cd tools/ice-lab && node --test test/*.test.ts)
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    godot4 --headless --path games/ice-run-godot --import && godot4 --headless --path games/ice-run-godot -- --smoke-test
    node --test games/ice-run-unreal/tests/*.test.mjs

Typecheck: `npm install typescript @types/node` in a scratch directory, then from `tools/ice-lab` run `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types`.
Renders:
- `node games/ice-run-godot/tools/motion_dump.mjs > p.json && blender --background --python games/ice-run-godot/tools/render_motion.py -- p.json out/`
- the cast: `cast_looks.mjs` with `render_cast.py`
- Godot: `--capture --capture-podium` and `--capture --capture-warmup`
- Unreal: `-IceWarmup`, `-IcePodiumPreview`, `-IceDanceStyle=<id>`

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. Additive only.
- New work in a fresh worktree off `origin/main`. Never a broad process kill.
- New physics stays behind a mode or optional input, so off is byte-identical. Replay stays at `/39`.
- Measure before claiming. Re-pin a test only for a deliberate change, keep the old figure, and say why. Authored numbers say so.
- The owner decides gate policy: answer, then build. `gh pr merge` needs the owner's `!`. Check that every pushed commit is in a PR before it merges. If two open PRs touch the same file, merge one branch into the other and state the merge order.
- Browser checks in Firefox or Brave, never Chromium.
- Presentation (motion clips, podium, warm-up) never moves the sim or a score.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control, preregistration, stacked PR, attestation, opt-in, monotonic, triage, Goodhart's law, protocol deviation, chirality, Pareto front, squash merge, dangling commit, forward kinematics, contact constraint

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` in a fresh worktree off `origin/main` and run its one-shot check. Then [here are my play notes: … | build the per-event dance style | make spins and spirals play their library poses]. Owner calls: Lio is [a woman | a men's skater]; warm-up falls [cost wear | are free]; warm-up length [45 s | …]. Stipulate: live work. When we wrap up: /hanoffed.
