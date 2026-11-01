# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 1 November 2026, 00:40 PDT · Claude Code, Opus 5.5 · session `7d6a47c6`
**Where things stand:** The native Godot game is much further on. PR #56 merged it to `main` (physics-driven pose, CC0 athlete, Forward+, arm tiers, landing stamina). A second batch is pushed but **not merged**: branch `crowd-and-ice`, with real crowd seating, cleaner ice, the spin finish, relaxed arms, backward gaze, square shoulders, pointed free foot and a COIL bar. Nobody has played any of this on a physical pad. CI is red on 8 older tests.
**Corrects the previous hand-off:** pairs and Grand Prix are not the newest work; that hand-off is now in `Hand_off-archive.md`.
**Decision needed:** whether to open a PR for `crowd-and-ice` and merge it. Reply "open the PR" to start.
**Start with:**
1. `git fetch origin; git log --oneline origin/main..origin/crowd-and-ice`: confirms the unmerged batch.
2. Check for branch `grip-search` and `docs/grip-search.md`: the delegated research result (see In flight).
3. Play Experimental on the pad and note what feels wrong. Nothing else tells us how the camera, arms and landing stamina feel.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-01 | Opus 5.5 `7d6a47c6` | `crowd-and-ice` pushed, unmerged | Crowd in seats, clean ice, spin finish, relaxed arms, gaze, shoulders, COIL bar |
| 2026-10-31 | Opus 5.5 `7d6a47c6` | PR #56 merged, `e1c6d67` | Native game on `main`; README current; public browser build not deployed (tests gate it) |
| 2026-09-28 | Earlier | PR #54, #55, pairs mode | Pairs playable; see archive |
| 2026-09-27 | Earlier | Grand Prix, PR #52 | Northlight Arena; see archive |

## In flight
- **Grip search** on `grip-search` (delegated to a background agent at the close of this session): does a shoulder wind ever add takeoff momentum through a gripping edge? Output: `docs/grip-search.md`. Sim source must stay unchanged. Check the result before believing it.
- **`crowd-and-ice`** pushed: done and checked by script and render, not played. Verify with the One-shot check below.

## Decisions (why things are the way they are)
- 2026-10-31 **Forward+ over Compatibility**: ambient occlusion, haze, skin. Rejected keeping low-end and mobile GPUs. One line in `project.godot` reverts it, but the look would need retuning.
- 2026-10-31 **MakeHuman data, not code**: base mesh, skin, hair are CC0; its code is AGPL and is not used. Vendored in `games/ice-run-godot/assets/source/makehuman/`.
- 2026-10-31 **Fox Engine: public technique only**: no Konami code or data.
- 2026-10-31 **Difficulty is how much physics is live** (owner's direction, 2026-11-01): the setups already work this way. Not faster judges or harsher scores.
- 2026-10-31 **Career arm tiers**: Function, Shared, Expression, trained by drills; other modes get both. Numbers are authored and untuned.
- 2026-10-31 **Landing stamina settles at touchdown**: cheapening the takeoff moved the pinned 115.957 degree baseline, so the takeoff still pays in full. On in Experimental and Dig Gate only.
- 2026-10-31 **No Earth rotation model**: about 1.6e-6 of a 33 rad/s spin and 0.7 degrees over a program. The rink crown is the larger real effect, and it already exists, off.
- 2026-11-01 **No free momentum bonus for shoulder wind**: the sim's rule is that twist makes spin only while the ice holds the feet.
- 2026-11-01 **Career training that closes off elements**: owner's design, in `docs/open-decisions.md`, not built. No real athlete's name in the game (D6).
- 2026-11-01 **kgirl not used for the grip search**: it is an LLM harness, and the search is CPU arithmetic.

## Dead ends (don't retry without new information)
- Blaming screen-space reflections, then the probe, for the ice patches: both wrong. It was the roof-reflection term's hard limit, found with `pose_lab.gd --off=`.
- A scripted spin in `pose_clip.mjs` that never started: claims about spins from it were false. Check a clip contains the move.
- Shoulder wind in plain scripted takeoffs: the feet pivot against the shoulders (`twistRate` +5, `yawDev` -6) and momentum stays near zero.
- Regenerating fixtures or rewriting pinned numbers to pass tests: never.

## Open questions (settle these first)
- How do the camera moves, arm swing and landing stamina feel in play? Only a playtest settles this.
- Does a gripping takeoff exist where wind pays? `docs/grip-search.md`.
- Is leading-shoulder-first the right way round for the arms at a spin finish? A skater would know.
- Backward gaze along the blade is the owner's style choice; real skaters usually look over a shoulder. Blend them if skaters object.
- Is the name "Edgework" clear? The README says to resolve this before any public announcement. Was the Reddit post made?

## State (verified 00:36-00:45 PDT)
- `main` `e1c6d67`, PR #56 merged. CI red on the 8 older tests.
- `crowd-and-ice`, worktree `.delivery/crowd`. No PR yet.
- Outer checkout `phase17-assurance`: old dirty work, not this session's. Never sweep it into a commit.

## Project health
- `npm test`: 736 pass, 8 fail (two `backjump`, two ghost double-loop, v1 fixture, three turning-jump tutorial). Bridge 30/30. Godot smoke and capture pass. Pose lab passes on all four models, both spin directions.
- About 4.9 ms per frame at 1080p on an RTX 2080 Super, without the Node bridge. No sustained in-game benchmark.
- README image and clip predate `crowd-and-ice`; re-render when it is merged.
- Fragile: the crowd is the costliest thing added. Second-arm timing at a spin finish is now measured unreliably (98 and 25 degrees), so judge it by eye. Expression and Function arms look too alike.

## Next steps, in order
1. Decide on the PR, merge with `! gh pr merge <n> --merge`, re-render `docs/presentation/edgework-now.*`.
2. Playtest on the pad, with notes as a timestamped list.
3. Read the grip search result, then decide on the coil axis and difficulty tiers.
4. Give Expression arms a stronger identity; consider a stamina cost for holding arms out (physics change, ask first).
5. Try the rink crown in Experimental.

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    npm test
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    node games/ice-run-godot/tools/pose_clip.mjs /tmp/clip.json
    godot4 --headless --path games/ice-run-godot --script res://tools/pose_lab.gd -- --clip=/tmp/clip.json --check
    godot4 --headless --path games/ice-run-godot -- --smoke-test

Fresh worktrees need `node games/ice-run-godot/tools/prepare.mjs` and `godot4 --headless --path games/ice-run-godot --import` first. Run from a worktree, not the outer checkout. `npm start` launches the game. `pose_lab.gd` views: `--view=boots|face|stands|rink|broadcast`, `--off=probe,sun,fixtures,roof`, `--steps=4` for a faster display, `--shots=<dir> --ticks=...`.

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. Additive edits only.
- New work in a fresh worktree off `origin/main`. Another session may share the checkout. Never use a broad process kill.
- Do not change grip, hip ceiling, tuck or landing shock to disguise the contact problem. Keep new physics default-off. Replay stays at unfinished `/39`.
- Do not rewrite goldens or pinned numbers to pass tests. Compare failures by name.
- `pose_lab` proves agreement with the sim, not with real skaters; never present it as realism evidence.
- Judge renders by looking at them, with the costume on: the lab skips costumes.
- `gh pr merge` may be blocked for the assistant; ask the owner for `!`.
- The owner decides gate policy. Answer the question first, then build; "keep going" means the next grounded item.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` in `.delivery/crowd` and run its one-shot check. Then [open the PR for crowd-and-ice | read docs/grip-search.md | here are my playtest notes: ...]. Stipulate: live work. When we wrap up: /hanoffed [target].
