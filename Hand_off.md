# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 1 November 2026, 18:50 PST · Claude Code, Opus 5.5 · session `5d8349e8`
**Where things stand:** The career can now be finished and has training weeks, rusty jump families, rivals with standings, and program planning. Every setup has its own controls course, and the Elite 2's paddles work in the native game for the first time. All of it is on `main` (PRs #61, #62). The owner played the paddle course, the Experimental course, First ice, and the planning page on a wired Elite 2. Nobody has played a full season or judged rust's feel or rival balance. CI is red on 5 older tests, down from 8, so the public browser build still does not deploy.
**Corrects the previous hand-off:** "Nobody has played any of this on a physical pad" is no longer true of today's work. Its 8 failures are now 5. "No physical Elite 2 validation" in the archived Grand Prix notes is also out of date.
**Corrects PR #61:** it said "Turn in the air" may not land. That was true only of the old wording, on a straight glide. See Decisions.
**Decision needed:** none to continue.
**Start with:**
1. `git fetch origin; git log --oneline -3 origin/main`: confirms what merged.
2. Create a worktree off `origin/main` (see Rules), run `npm start`, and play a season from First ice on the pad. Note what feels wrong as a timestamped list.
3. Retune from those notes: `EVENT_FLOORS` and the week constants in `tools/ice-lab/game/career.ts`, the rust rates in `game/training.ts`, and `BASELINE` and levels in `game/rivals.ts`.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-01 eve | Opus 5.5 `5d8349e8` | PR #62 `0612c18` | Weeks, rust, rivals, planning; air step re-scripted; browser courses and Firefox paddles; link timeout fixed; 5 failures |
| 2026-11-01 eve | Opus 5.5 `5d8349e8` | PR #61 `b4b5e70` | Career finishable; save wipe fixed; per-setup courses; native Tutorial; native paddles through SDL |
| 2026-11-01 | Opus 5.5 `6fc58871` | PR #60 `6f9c35b` | README shows the current build |
| 2026-11-01 | Opus 5.5 `6fc58871` | PR #59 `8c205ea` | Skirt slit fixed (55 to 3 mm); Function and Expression arms differ |
| 2026-11-01 | Opus 5.5 `6fc58871` | PR #58 `b2abf54` | Costume: no sleeve band, smooth waist, knife pleats |
| 2026-11-01 | Opus 5.5 `6fc58871` | PR #57 `3fa8871` | Crowd and ice batch; blink, gaze, irises |
| 2026-10-31 | Opus 5.5 `7d6a47c6` | PR #56 `e1c6d67` | Native game on `main` |
| 2026-09-28 | Earlier | PR #54, #55 | Pairs playable; see archive |
| 2026-09-27 | Earlier | PR #52 | Northlight Arena; see archive |

## In flight
- **Grip search** on `grip-search` (`370dcb7`, pushed, no PR): `docs/grip-search.md` there. Shoulder wind adds about +5 kg m^2/s only with arms in and leaving the ice while the shoulders still swing. The pad cannot reach it as mapped.
- Nothing from today is in flight. Worktrees `.delivery/career` and `.delivery/season` are merged and left in place under the no-deletes rule.

## Decisions (why things are the way they are)
- 2026-11-01 **Rust can be won back, never a menu lock** (owner): a neglected family is harder to land, and drilling restores it at a cost in weeks. Rejected: losing it for the career. Career only, applied to recorded input, no solver change.
- 2026-11-01 **Edge rust crosses onto the wrong edge**: chosen by measurement, Simulation, 324 takeoffs, clean with half a turn: rust 0, 22; 0.25, 16; 0.5, 14; 0.75, 7; 1, 7. Rejected: easing the lean (22 to 15, half rust turned more) and a weaker spring (got easier).
- 2026-11-01 **Rivals never decide medals, XP or unlocks**: the owner's rule that difficulty is how much physics is live. Names are invented (D6).
- 2026-11-01 **Reachable event floors replace TIERS as the gate**: 0, 0, 51, 51.5, 52. The old floors needed about 15,000 and 34,000 XP against a season's few thousand. Silver alone reaches every floor and bronze alone does not. Authored; `career.test.ts` pins the property.
- 2026-11-01 **Training weeks layered on XP, not replacing it**: a stat costs XP and a week. Start 4, plus 2 per improved medal tier. Authored.
- 2026-11-01 **Turning jumps start on an edge**: since `armsWhipMode` (2026-09-25) arms make spin only through a gripping edge. Simulation lands half a turn from a curve at 3 to 5.5 m/s; Experimental only near 4.5 m/s (3 of 1,080, and a test pins the narrowness); Full Repertoire 14 of 324; Blade Explorer best 0.03 rev in 4,320, so its step carries a note. `AIR_TURN` unchanged.
- 2026-11-01 **Native paddles through an SDL config at launch**: Godot 4.7 reads SDL's gamepad layer, which has no paddles for this GUID. `scripts/pad_map.gd` relaunches once with `SDL_GAMECONTROLLERCONFIG`. Wired Elite 2 on Linux only; Bluetooth closed by the owner as USB only.
- 2026-11-01 **Paddle slots stay 18-21 in the sim**: each front end maps by measured position (`LAYER_BUTTON` native, `canonicalPaddles` browser). No saved profile moved.
- 2026-11-01 **Lesson step pays 25 XP once, by step id; a skip pays nothing**. Authored.
- 2026-11-01 **Eyes lead the head, using its own lag**; **iris remapped in the shader**; **sleeve fades in, no cord**; **seat weights moved to the pelvis**; **knife pleats on purpose**. Details in the archive.
- 2026-11-01 **Arm tiers stay below the shoulder**: the owner's rule. No stamina cost added.
- 2026-11-01 **No free momentum bonus for shoulder wind**: twist makes spin only while the ice holds the feet.
- 2026-10-31 **Forward+ over Compatibility**; **MakeHuman data, not code**; **Fox Engine: public technique only**.
- 2026-10-31 **Landing stamina settles at touchdown**: on in Experimental and Dig Gate only.
- 2026-10-31 **No Earth rotation model**: about 1.6e-6 of a 33 rad/s spin.

## Dead ends (don't retry without new information)
- `Input.add_joy_mapping` for paddles: it applies on top of SDL's output, and it turned LB and RB into stick clicks. Use the SDL config.
- Judging a takeoff sweep from a straight glide: under `armsWhipMode` it proves nothing about turning jumps. Sweep from a curve.
- A headless smoke run as proof of a timing bug: replies beat the next frame, so the race never shows. Send and call `link._process` in the same instant.
- Assuming a penalty makes things harder: easing the takeoff lean made a half-rusty jump turn more. Measure success rate over a grid.
- `tail` on `/proc/<pid>/fd/2`: it hung for 120 s on a live pipe.
- Calling the skirt slit fixed from stills. Use `skirt_pierce_m` over several ticks.
- Seating the eye deeper for the lower-lid band; per-row skirt clearance; own clearance for the inner skirt layer.
- Blaming screen-space reflections, then the probe, for ice patches: it was the roof-reflection term's hard limit.
- Shoulder wind in plain scripted takeoffs: the feet pivot against the shoulders.
- Regenerating fixtures or rewriting pinned numbers just to pass tests: never. Re-pinning is fine when the script or words deliberately changed, with the reason stated.

## Open questions (settle these first)
- **How do weeks, rust and the field feel over a season?** Only play settles it. All rates are authored.
- **Do rival scores hold up?** `BASELINE` came from a plain jumpless script. A player landing scored jumps may outrun the field.
- **Is it right that a routine ends the moment its last element is done?** First ice's 75 s event finished in 8 s in the script, and PCS is scored over that short span. Not changed.
- **Does toe rust feel fair?** It was only checked as a missed pick, on one tap timing. Edge rust was only measured on Simulation.
- **Can Blade Explorer land a turning jump at all?** It rotates up to 2 turns and falls on landing. This belongs to the takeoff and landing work.
- **Do the other courses read well on the pad?** Simulation, Dig Gate, Explorer and Repertoire courses have only passed scripted pads.
- Native paddle presets "Footwork" and "Moves" use unmeasured destination order against the measured paddles. Do they land where their names say?
- From earlier, still open: skirt fullness; the pale band at the lower-outer eyelid; a sliver at the armhole at tick 1600; pelvis weighting at the leg opening; the free-momentum reading on the release tick (L 41.43 against 14.96, owner decides); whether to remap the pad for shoulder wind; whether the name "Edgework" is clear.

## State (verified 18:45 PST)
- `main` `0612c18`, PR #62 merged, plus this hand-off's PR. Native replay foundation green; Ice Lab red on 5 older tests.
- Outer checkout `phase17-assurance`: old dirty work, not today's. Never sweep it into a commit.
- A game instance may still be open from `.delivery/season`, on the same code.

## Project health
- `npm test`: 839 pass, 5 fail: two `backjump`, two ghost double-loop, v1 fixture. CI on `0612c18` lists the same 5 by name. Bridge 35/35. Smoke passes with its new planning stage. Typecheck clean through scratch TypeScript.
- `checks.sh --run` skips everything here because it assumes npm dependencies this project does not use. Use the commands below.
- About 4.27 ms GPU per frame at 1080p on an RTX 2080 Super, no sustained in-game benchmark.
- Fragile: a pad plugged in after launch has no paddles until restart (the home screen says so). The crowd is the costliest render item. Browser career lacks planning and standings.

## Next steps, in order
1. Play a season on the pad, with notes as a timestamped list. This is the most useful next input.
2. Retune floors, weeks, rust and rivals from those notes.
3. Build what was not chosen today, if wanted: coach notes reading your run data; then form, more seasons, music and costume choices (bible §01).
4. Bring planning and standings to the browser, or decide the browser's career stays smaller.
5. Decide on the 5 older failures: re-script `backjump` and the ghost for edge takeoffs, as today's step was, and do the `/40` bump for the fixture. Clearing them unblocks the public build.
6. From earlier: settle the skirt's fullness; read the grip search; consider finger bones for close-ups.

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    npm test
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    godot4 --headless --path games/ice-run-godot -- --smoke-test
    godot4 --path games/ice-run-godot --script res://tools/pad_check.gd --resolution 900x420 -- --out=/tmp/pad.jsonl

Fresh worktrees need `node games/ice-run-godot/tools/prepare.mjs` and `godot4 --headless --path games/ice-run-godot --import` first. Run from a worktree, not the outer checkout. `npm start` launches the game; `--capture` writes menus and a lesson to `/tmp/edgework-godot-*.png`. Typecheck: `npm install typescript @types/node` in a scratch directory, then `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types` from `tools/ice-lab`. `pad_check.gd` run plainly shows no paddles unless `SDL_GAMECONTROLLERCONFIG` is set; see `scripts/pad_map.gd` for its value.

`pose_lab.gd` views and clips: see the archive's 1 November morning section.

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. Additive edits only.
- New work in a fresh worktree off `origin/main`. Another session may share the checkout. Never use a broad process kill.
- Do not change grip, hip ceiling, tuck or landing shock to disguise the contact problem. Keep new physics default-off. Replay stays at unfinished `/39`.
- Compare failures by name. A step's words get played through the setup's real mapping in a test before they ship.
- `pose_lab` proves agreement with the sim, not with real skaters; never present it as realism evidence.
- Judge renders by looking at them, close up and at game distance, at several moments.
- Numbers that are authored say so, in the code and in what you report.
- Before asking the owner to test on the pad, confirm the window launched. Test requests go one at a time.
- `gh pr merge` may be blocked for the assistant without the owner's own "merge"; otherwise ask for `!`.
- The owner decides gate policy. Answer the question first, then build; "keep going" means the next grounded item.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` in a fresh worktree off `origin/main` and run its one-shot check. Then [here are my season notes: ... | clear the 5 older failures | build coach notes]. Stipulate: live work. When we wrap up: /hanoffed [target].
