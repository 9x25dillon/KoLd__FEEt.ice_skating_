# Hand-off — EDGEWORK / Pairs skating

## Newest close: 28 September 2026 (pairs)

Read [the pairs session review](docs/session-review-2026-09-28-pairs.md) first;
the Grand Prix hand-off below it remains authoritative for build and repository
mechanics.

### State

- Branch `pairs-skating` (worktree `/home/kill/KoLd__FEEt.ice_skating_/.delivery/pairs`),
  based on main `6154e62` (PR #52). Pairs work: `dfcfeb2` plus the docs commit.
- Delivered: partner sim (`tools/ice-lab/game/pairs.ts`), bridge mode `pairs`
  (+ `pairsChallenge`, replay `edgework-pairs/1`), Godot menu/controls/HUD,
  `games/ice-run-godot/tests/pairs.test.mjs`. Bridge 28/28, Godot smoke passes.
- Verify publication before assuming anything:
  `git fetch origin; gh pr list --head pairs-skating --state all; git log -3 origin/main`.

### Next steps, in order

1. **Playtest pairs** (operator plays; Firefox for browser, Godot for native).
   Record notes as timestamped list: hold, lift, spin, drift, fall recovery.
2. Check G/T and D-pad left/right against Full-repertoire and Experimental
   bindings; move them if they collide.
3. Look at the partner: model choice (currently Berserker glb), spacing, lift
   height. Capture a screenshot or replay clip; do not judge by tests alone.
4. ~~Add a pairs stage to the Godot `--smoke-test`~~ **Done** (PR #54, `089d7ac`): partner presented and hand offer reaches the bridge; lift deliberately not covered (needs a steady glide, would be flaky).
5. Draw partner traces on the rink with their own `previous` state in `arena.gd`.
6. Run `npm test` and compare the eight inherited failures.

### Rules that still apply

- No deletes, resets, cleans, force pushes or overwrites. Additive edits only.
- Keep pairs points separate from ISU protocol scoring; the lift is assisted, not
  a validated two-body model — do not claim otherwise.
- New worktree shortcuts: fresh worktrees need `node games/ice-run-godot/tools/prepare.mjs`
  and `godot4 --headless --path games/ice-run-godot --import` before any smoke run.
- Codex's own history/goals live in `~/.codex` (`history.jsonl`, `goals_1.sqlite`);
  check them first when asked to continue its work.
- `gh pr merge` may be blocked for the assistant; ask the operator for `!`.

---

# Hand-off — EDGEWORK / Grand Prix

## Authoritative close: 27 September 2026

Read this page first, then [the session review](docs/session-review-2026-09-27-grand-prix.md)
and [build notes](docs/grand-prix-build.md). The previous handoff, including the
landing investigation and earlier history, is preserved in
[the archived handoff](docs/handoff-before-grand-prix-2026-09-27.md). Its relative
links were written from the repository root; resolve them there.

## Objective and delivered work

Continue a professional figure-skating game using the existing simulation, with
Xbox Elite Series 2 as the primary input and a PS3-inspired native presentation.
Northlight Arena, competition athlete, shaders, broadcast HUD, four cameras,
audio, optional vibration and controller menus are implemented. Career, Composer,
scoring protocols and replay support remain. This is a playable development build;
the physical double loop is still unresolved.

## Repository and publication

- Repository: `9x25dillon/KoLd__FEEt.ice_skating_`.
- Integration branch: `grand-prix-presentation`, based on verified main `0392bf0`
  (PR #51). The user explicitly authorized commit, push and merge.
- Authoritative delivery worktree on this machine:
  `/home/kill/KoLd__FEEt.ice_skating_/.delivery/grand-prix`.
- The outer checkout remains on `phase17-assurance` at `a3c942e`, with older game
  edits and unrelated work. Do not mistake it for the delivered source or reset it.
- Preserve `E_W_replays_sessions_eng_bld/`, `session-notes/`, saved root HTML,
  nested research worktrees, phase17 notes and the unrelated turns-test edit.
- Verify publication rather than assuming this pre-commit document knows its own
  eventual commit hash:

```sh
git fetch origin
git status --short --branch
git log -5 --oneline origin/main
gh pr list --head grand-prix-presentation --state all
git diff origin/main --stat
```

If this branch is merged, start the next change in a clean worktree from verified
current main. Inspect ownership and changes before editing. Never sweep nested
research checkouts into a commit.

## Run and verify

From the delivery worktree (not the older outer checkout):

```sh
npm start                       # Godot source launch; Node, Godot, FFmpeg needed
npm run start:browser            # browser game and workshop
npm run build:native             # Linux export; templates must be installed
npm test                         # currently eight inherited failures
node games/ice-run-godot/tools/prepare.mjs --engine-only
node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
./games/ice-run-godot/exports/linux/ice-run.x86_64 --headless -- --smoke-test
```

The exported executable is `games/ice-run-godot/exports/linux/ice-run.x86_64`.
Keep its PCK, bridge and runtime adjacent. Node 24.19+ or 26 is required; the
runtime is not bundled. Exports are ignored build products. Editable athlete:
`games/ice-run-godot/assets/source/skater-competition.blend`; builder:
`games/ice-run-godot/tools/build_competition_skater.py`. Do not regenerate the
model unless changing it.

`-- --capture` on the executable renders gameplay, four cameras and menus into
`/tmp/edgework-godot-*.png`. Smoke/capture use isolated save paths. Checked-in
screenshots live in `docs/presentation/`. Browser integration was checked on
port 8124; existing outer-checkout and research servers may use 8123/8130.
Identify the owner before stopping a server; never use a broad process kill.

Controller: A selects, B returns, D-pad navigates, Menu pauses. Native View cycles
camera (blocked while airborne); browser View restarts a run. Start with Blade
Explorer. Native has Simulation, Explorer, Experimental and Repertoire. Browser
also exposes Dig Gate, the tutorial, ghost and workshop. Native separate-paddle
presets require driver exposure; duplicate-button profiles work through ordinary
button mappings. No physical Elite 2 validation has been completed.

## Evidence and known failures

- Baseline current main: 737 tests, 729 pass / eight fail.
- Integrated suite: 741 tests, 733 pass / the same eight fail.
- Native bridge/host: 22 pass after regeneration. An earlier manifest mismatch
  was caused by edits after preparation; refresh runtime after source edits.
- Simulated Xbox browser checks cover tutorial shortcut, ghost checkbox, menus,
  settings, disconnect/reconnect and career, without page exceptions.
- Linux export, exported career/protocol smoke and actual renderer captures were
  checked. No sustained FPS benchmark or physical-controller feel test was done.
- Older 613/613 results describe the `/35` development checkout only.

Inherited failures: two `backjump.test.ts`, two ghost double-loop assertions,
one committed replay fixture, three turning-jump tutorial assertions. Logs are
`/tmp/grand-prix-main-baseline.log`, `grand-prix-integrated-tests.log`,
`grand-prix-integrated-native.log`, `grand-prix-integrated-smoke.log` and
`grand-prix-integrated-capture.log` (all under `/tmp`). Compare names, not just counts.
Do not call the whole suite green or regenerate fixture goldens to conceal drift.

## Physics constraints to preserve

Read [takeoff-orientation.md](docs/takeoff-orientation.md) and the archived handoff
before touching mechanics. The current research contract remains unfinished `/39`;
`/40` canonicalization is a separate task. Physical double-loop landings are not
solved. Keep experimental behavior default-off. Do not change grip, hip ceiling,
tuck or landing shock to disguise the contact problem. Shoulder rotation from a
paper is not automatically blade rotation on ice.

The measured prior baseline is 87.151 degrees of body AND travel rotation before
blade-off, 475.957 airborne body degrees, and 115.957 degrees off backward at first
contact. Verify the named experiment before treating those numbers as current.
No physics solver source was changed for this presentation integration.

## Next session: three priorities

1. **Physical controller acceptance.** Record OS, connection, controller profile,
   exposed button IDs and selected setup. Play launch → free skate → pause →
   setup change → career without mouse input; check reconnect, triggers, paddle
   mappings and vibration. Fix concrete failures with reproducible steps.
2. **Visual and performance review.** Agree on a reference screenshot and target
   resolution/frame rate. Inspect athlete close-ups and moving knees/shoulders,
   backward travel, jumps, all cameras and menu readability. Capture frame times;
   optimize measured costs. The current animation is procedural, not mocap.
3. **Choose one next workstream explicitly.** Either continue native feature
   parity/polish or resume the unresolved landing mechanism. For physics, reproduce
   the eight failures and isolate one physical cause; keep presentation changes
   separate. For product work, decide whether native Dig Gate/tutorial/ghost is
   the next priority rather than assuming prepared modules mean complete parity.

## Work habits that will improve the next session

Fetch and map worktrees first. Define an observable acceptance sequence. Capture
real gameplay early. Finish source edits before generating bridge modules, then
run targeted checks and one final export. Preserve historical notes and data.
Keep the user informed of concrete findings and limitations. The user authorizes
routine implementation choices and dislikes repeated confirmation requests;
ask only for missing decisions that materially block useful work.
