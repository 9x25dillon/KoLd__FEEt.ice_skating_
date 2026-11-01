# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 1 November 2026, 09:15 PST · Claude Code, Opus 5.5 · session `6fc58871`
**Where things stand:** Three PRs merged today, so `main` has the crowd and ice batch, blink and gaze, the costume pass, the skirt slit fix and distinct Function and Expression arms. The hand-off's look list is finished. README media and this file are on branch `readme-media`, in a PR that may still be waiting to merge; check with the first command below. Nobody has played any of this on a physical pad. CI is red on the same 8 older tests.
**Corrects the previous hand-off:** `crowd-and-ice` is no longer unmerged; it merged as PR #57. **Corrects PR #58:** that PR did not fix the skirt's front slit. PR #59 did.
**Decision needed:** none to continue. Merge the README PR if it is still open: `! gh pr merge --merge readme-media`.
**Start with:**
1. `git fetch origin; gh pr list --head readme-media --state all; git log --oneline -3 origin/main`: confirms what merged.
2. Create a worktree off `origin/main` (see Rules), then `npm start`, and play Experimental on the pad. Note what feels wrong as a timestamped list.
3. Check free skate's arms first: PR #59 changed the look of every non-career mode, and only stills have judged it.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-01 | Opus 5.5 `6fc58871` | README media, this file (`readme-media`) | README shows the current build |
| 2026-11-01 | Opus 5.5 `6fc58871` | PR #59 `8c205ea` | Skirt slit fixed (55 to 3 mm, lab limit); Function and Expression differ in carriage, timing, line and wrists |
| 2026-11-01 | Opus 5.5 `6fc58871` | PR #58 `b2abf54` | No sleeve band; smooth waist; deliberate knife pleats; seat follows the pelvis; no armhole peaks |
| 2026-11-01 | Opus 5.5 `6fc58871` | PR #57 `3fa8871` | Crowd and ice batch on `main`; blink, gaze, brown irises, shorter matte lashes |
| 2026-10-31 | Opus 5.5 `7d6a47c6` | PR #56 `e1c6d67` | Native game on `main`; public browser build not deployed (tests gate it) |
| 2026-09-28 | Earlier | PR #54, #55, pairs mode | Pairs playable; see archive |
| 2026-09-27 | Earlier | Grand Prix, PR #52 | Northlight Arena; see archive |

## In flight
- **README media** on `readme-media` (pushed, PR open at close): done, waiting only on the merge. `edgework-now.png` and `.mp4` re-rendered, `edgework-closeup.png` new.
- **Grip search** on `grip-search` (`370dcb7`, pushed, no PR): `docs/grip-search.md` there. Shoulder wind adds about +5 kg m^2/s (best L 9.62 to 14.96, Experimental loop), only with arms in and leaving the ice while the shoulders still swing. It does not raise the best achievable jump, and the pad cannot reach it as mapped.

## Decisions (why things are the way they are)
- 2026-11-01 **Eyes lead the head, using its own lag**: gaze comes from the existing `looking` and `head_turn` values, not a canned animation. Fixations and blink timing are authored presentation.
- 2026-11-01 **Iris remapped in the shader**: the CC0 `brown.png` really is red-orange. The vendored file stays untouched.
- 2026-11-01 **Sleeve fades in, with no cord**: constant density made the band. A cord read as a wire hoop at game distance. Rejected: keeping a thinner cord.
- 2026-11-01 **Seat weights moved from thighs to pelvis**: the source weights swing the seat through a skirt that hangs from the hips. Rejected: a wider skirt alone, which made a bustle.
- 2026-11-01 **Knife pleats on purpose**: the old pleats were an accident of jagged radii, and smoothing erased them.
- 2026-11-01 **Arm tiers stay below the shoulder**: the owner's rule that nobody holds arms level for a program. Numbers are authored. No stamina cost added: that is a physics change for the owner to ask for.
- 2026-10-31 **Forward+ over Compatibility**: ambient occlusion, haze, skin. Rejected keeping low-end and mobile GPUs. One line in `project.godot` reverts it, but the look would need retuning.
- 2026-10-31 **MakeHuman data, not code**: base mesh, skin, hair are CC0; its code is AGPL and is not used.
- 2026-10-31 **Fox Engine: public technique only**: no Konami code or data.
- 2026-10-31 **Difficulty is how much physics is live** (owner, 2026-11-01): not faster judges or harsher scores.
- 2026-10-31 **Career arm tiers**: Function, Shared, Expression, trained by drills; other modes get both. Numbers are authored and untuned.
- 2026-10-31 **Landing stamina settles at touchdown**: cheapening the takeoff moved the pinned 115.957 degree baseline. On in Experimental and Dig Gate only.
- 2026-10-31 **No Earth rotation model**: about 1.6e-6 of a 33 rad/s spin. The rink crown is the larger real effect, and it already exists, off.
- 2026-11-01 **No free momentum bonus for shoulder wind**: twist makes spin only while the ice holds the feet.
- 2026-11-01 **Career training that closes off elements**: owner's design, in `docs/open-decisions.md`, not built. No real athlete's name in the game (D6).

## Dead ends (don't retry without new information)
- Calling the skirt slit fixed from stills: it only appears in motion, when a raised leg passes between panels. Use `skirt_pierce_m` and check several ticks.
- Seating the eye deeper to remove the pale band under the lid: it did not respond to 0.8 or 2.6 mm.
- Per-row skirt clearance: makes a bustle, and the panels' straight bones cannot carry one. Use one curve per panel.
- Giving the inner skirt layer its own clearance: it passes through the outer layer. It follows the outer layer at a growing gap.
- Blaming screen-space reflections, then the probe, for ice patches: it was the roof-reflection term's hard limit, found with `pose_lab.gd --off=`.
- A scripted spin in `pose_clip.mjs` that never started: check a clip contains the move.
- Shoulder wind in plain scripted takeoffs: the feet pivot against the shoulders and momentum stays near zero.
- Regenerating fixtures or rewriting pinned numbers to pass tests: never.

## Open questions (settle these first)
- **How do the arms, camera, blinks and landing stamina feel in play?** Only a playtest settles this.
- **Does the arm timing look right in motion?** Judged from stills; watch `docs/presentation/arm-tiers.mp4`.
- **Is the skirt too full near the hips?** A taste call by the owner. Less fullness may let the seat show. `OUTER_FLARE`, `PANEL_CURVE` and `SEAT_ROOM` in `build_athlete.py`.
- **Does the slit stay closed on other moves?** Measured on one test routine.
- **What causes the pale band at the lower-outer eyelid?** Not the dome's depth. Try hiding the lash card alone.
- **Is there a sliver at the armhole at tick 1600?** Compare with the old build.
- **Does pelvis weighting look wrong at the leg opening** with the thigh raised and the skirt lifted? Not specifically checked.
- **Possible free angular momentum:** stepping carriage 0 to 1 on the release tick reads L 41.43 instead of 14.96, because `bodyRate` (`sim/jump.ts`) reads that tick's carriage. Not fixed. It touches the takeoff research, so the owner decides.
- Should the pad be remapped so wind and arms separate? Only then is the shoulder effect reachable.
- Is leading-shoulder-first right for arms at a spin finish? Backward gaze along the blade is the owner's style; real skaters usually look over a shoulder. A skater would know.
- Is the name "Edgework" clear? The README says to resolve this before any public announcement. Was the Reddit post made?

## State (verified 09:00-09:15 PST)
- `main` `8c205ea`, PR #59 merged. CI red on the 8 older tests.
- `readme-media`, worktree `.delivery/readme`: README media and this file.
- Worktrees from today, all merged except the last: `.delivery/crowd`, `.delivery/costume`, `.delivery/arms`, `.delivery/readme`. Left in place under the no-deletes rule.
- Outer checkout `phase17-assurance`: old dirty work, not this session's. Never sweep it into a commit.

## Project health
- `npm test`: 736 pass, 8 fail (two `backjump`, two ghost double-loop, v1 fixture, three turning-jump tutorial). Bridge 30/30. Smoke passes. Pose lab passes on all four models. Run on PR #59's tree; the README change touches no code.
- `checks.sh --run` skips everything here because it assumes npm dependencies this project does not use. Use the commands below.
- About 4.27 ms GPU per frame at 1080p on an RTX 2080 Super, from `--gpu-time`, without the Node bridge. No sustained in-game benchmark.
- Fragile: the crowd is the costliest thing added. Second-arm timing at a spin finish measures unreliably, so judge it by eye. The model has no finger bones, so hands stay in a slightly stiff spread.

## Next steps, in order
1. Merge the README PR.
2. Playtest on the pad, with notes as a timestamped list. The look list is finished, so this is the most useful next input.
3. Decide on the skirt's fullness from the clips.
4. Read the grip search result, then decide on the coil axis, the pad remap and the free-momentum question.
5. Consider finger bones, if close-ups matter for the investor case. This needs new rigging.
6. Consider a stamina cost for holding arms out (physics change, ask first). Try the rink crown in Experimental.

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    npm test
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    node games/ice-run-godot/tools/pose_clip.mjs /tmp/clip.json
    godot4 --headless --path games/ice-run-godot --script res://tools/pose_lab.gd -- --clip=/tmp/clip.json --check
    godot4 --headless --path games/ice-run-godot -- --smoke-test

Fresh worktrees need `node games/ice-run-godot/tools/prepare.mjs` and `godot4 --headless --path games/ice-run-godot --import` first. Run from a worktree, not the outer checkout. `npm start` launches the game.

`pose_lab.gd` views: `--view=boots|face|eyes|torso|body|stands|rink|broadcast`, `--off=probe,sun,fixtures,roof`, `--steps=4`, `--shots=<dir> --ticks=...`, `--gaze=x,y --lid=0..1`, `--arm-style=0..1`, `--gpu-time`, `--no-costume`. Rebuild the athlete with `blender --background --python tools/build_athlete.py`, then re-import. Record clips with `--write-movie <file> --fixed-fps 60 ... --movie`; the lab steps at 60 fps, so 30 plays at half speed.

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. Additive edits only.
- New work in a fresh worktree off `origin/main`. Another session may share the checkout. Never use a broad process kill.
- Do not change grip, hip ceiling, tuck or landing shock to disguise the contact problem. Keep new physics default-off. Replay stays at unfinished `/39`.
- Do not rewrite goldens or pinned numbers to pass tests. Compare failures by name.
- `pose_lab` proves agreement with the sim, not with real skaters; never present it as realism evidence.
- Judge renders by looking at them, close up **and** at game distance, against the old build, at several moments. A close-up fix can damage the distant read, and some flaws only exist in motion.
- `gh pr merge` may be blocked for the assistant; ask the owner for `!`.
- The owner decides gate policy. Answer the question first, then build; "keep going" means the next grounded item.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` in a fresh worktree off `origin/main` and run its one-shot check. Then [here are my playtest notes: ... | settle the skirt's fullness | read docs/grip-search.md on branch grip-search]. Stipulate: live work. When we wrap up: /hanoffed [target].
