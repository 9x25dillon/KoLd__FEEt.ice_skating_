# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 2 November 2026, 23:55 PST · Claude Code, Opus 5.5 · session `c1239b45`
**Where things stand:** Everything is on `main` (`8519b10`, PRs #64–#69). The owner played a full native season on the Elite 2 (Simulation, a fresh career). Today's PRs act on those notes. Pad A now selects in menus. A career jump needs a clean half turn. Every career program runs its full time. Floors were re-spaced by measurement, and rust raises the turn a jump needs. Two new features: the Composer timeline (lay a career program on its music) and the costume atelier (three custom costumes built from swatches). None of today's changes have been played on the pad yet. CI is green on `main` at `8519b10`.
**Corrects the previous hand-off:** "CI red on 5 older tests, public build does not deploy" is false: #64 cleared them and the build deploys. "Browser career lacks planning and standings" is false: #65 added them. "Blade Explorer can't land a turning jump" is false: it lands half a turn from 3–5.5 m/s with soft knees after (see Decisions).
**Decision needed:** none to continue. Rival baselines are the next owner call (Open questions).
**Start with:**
1. `git fetch origin; git log --oneline -3 origin/main` and `gh run list --branch main --limit 3`: confirm `8519b10` and green CI.
2. Make a fresh worktree off `origin/main`, then `npm start`, and play a season from First ice on the pad. Note what feels wrong as a timestamped list, like the 2 November notes.
3. Settle the rival baseline (Open questions), then retune from the notes.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-02 late | Opus 5.5 `c1239b45` | PR #69 `8519b10` | Half-turn jump element; full-time career programs; floors 0, 50.5, 51.35, 51.9, 52.5; rust bar 0.5 + 0.25×rust; per-setup measured jump words |
| 2026-11-02 late | Opus 5.5 `c1239b45` | PR #68 `f3c8005` | Pad A selects (ui_accept); Season focus fixes; planner adds before the pose, ↑↓; result names fall wear |
| 2026-11-02 eve | Opus 5.5 `c1239b45` | PR #67 `b4862a7` | Composer timeline on the music (shown, not scored); costume atelier; velvet/lycra/mesh and crystals in `fabric.gdshader` |
| 2026-11-02 eve | Opus 5.5 `2384b1c9` | (play, no code) | Full native season played; notes are the source of #68/#69 |
| 2026-11-02 | Opus 5.5 `57ca76cd` | PR #64, #65, #66 | 5 old failures cleared (CI green); browser career planning, standings, arms; hip-side falls, wear, injuries |
| 2026-11-01 eve | Opus 5.5 `5d8349e8` | PR #61, #62 | Career finishable; weeks, rust, rivals, planning; native paddles |
| 2026-11-01 | Opus 5.5 `6fc58871` | PR #57–#60 | Crowd, ice, eyes, costume detail; README |
| 2026-10-31 | Opus 5.5 `7d6a47c6` | PR #56 | Native game on `main` |
| 2026-09-27/28 | Earlier | PR #52, #54, #55 | Northlight Arena; pairs. See archives |

## In flight
- Nothing from today. Merged worktrees left in place under the no-deletes rule: `.delivery/atelier` (branches `routine-and-atelier`, `season-fixes`, `career-rules`), `.delivery/season-play`.
- **Grip search** on `grip-search` (`370dcb7`, pushed, no PR): unchanged since 1 November.

## Decisions (why things are the way they are)
- 2026-11-02 **Composer: elements anchor to bars; the program runs to the music; timing is shown, not scored** (owner). Rules in `game/composer.ts`. Gap 2 bars, early 1 bar, late 2 bars, all authored. Changing the order in the planner drops the timeline.
- 2026-11-02 **Costume atelier from curated swatches only, presets stay default** (owner, narrowing the 18 September "no player design" rule). `game/atelier.ts`. Saved to `wardrobe-v1.json` beside the career. Skin tone and tights tint the native paint for designs only, so presets render unchanged. Hair style shows only in the browser.
- 2026-11-02 **Jump element = clean landing with ≥ 0.5 rev** (`JUMP_TURN`, pinned equal to the tutorial's `AIR_TURN`). Rejected: any scored jump; keeping the hop.
- 2026-11-02 **Every career program runs its full time** (`Choreography.fullTime`, set by the bridge for career). Falls after the last element count. Rejected: scaling PCS instead.
- 2026-11-02 **Floors measured from silver XP**: reach before each event is 50, 50.56, 51.40, 51.96, 52.52, and each floor sits just under it. Bronze alone falls short. Weeks unchanged.
- 2026-11-02 **Rust raises the bar** (owner, after measurement): a career jump needs `0.5 + 0.25 × rust` rev in its family (`RUST_TURN` authored; family from `JUMP_DEFS[kind].toe`). Clean half-turns per 108 at rust 0→1: Simulation 14/13/13/11/2, Experimental 10/7/4/4/4, Repertoire 48→43 (its jumps turn about 1.08 rev). The input `RustGate` is kept unchanged.
- 2026-11-02 **Explorer and Repertoire jump words re-measured** (432 takeoffs): Explorer lean .5, right stick .5, RT 0.25 s; Repertoire lean .3, right stick 1, RT 0.35 s; both then RT .8 for soft knees. Both land from 3, 4.5 and 5.5 m/s.
- 2026-11-02 **Pad A joins `ui_accept` at startup**: Godot 4.7's default `ui_accept` is Enter, Kp Enter and Space only (measured). Rejected: pressing the focused button by hand, because popups would miss it.
- 2026-11-01 and earlier, still in force: rust is never a menu lock; rivals never decide medals, XP or unlocks; native paddles through an SDL config at launch; no free momentum for shoulder wind. Details in `docs/handoff-before-season-rules-2026-11-02.md`.

## Dead ends (don't retry without new information)
- **Rust on input alone** (2026-11-02): reducing the lean during the load stays flat (Simulation 14/14/17/14/4; Experimental 10 throughout). Scaling `carriage`/`windup` in the load is erratic (14/6/27/7/12). The jump window is narrow, so input changes move you around inside it rather than making it harder.
- Pressing the focused button from `_input` for pad A: dropdown popups are separate windows and never see it.
- From earlier, still true: `Input.add_joy_mapping` for paddles; judging takeoffs from a straight glide; a headless smoke as proof of timing bugs; regenerating fixtures to pass tests.

## Open questions (settle these first)
- **Rival baselines.** `BASELINE` came from a short jumpless script. Programs now run full time and jumps must rotate, so placings may be off. Re-derive from a full-time scripted run? (owner)
- **Do full-time programs feel right?** 75–150 s with nothing left to do after the last element. The Composer timeline is the tool for spreading elements out. Only play settles it.
- **Are the new floors and the rust bar fair on the pad?** All numbers are authored or derived from silver-only XP. Golds with bonuses earn more.
- **Tutorial words are stale.** The "Turn in the air" step for Explorer/Repertoire still has the old words, and the engine's `UNPROVEN_AIR` warning still says Explorer may not land. Updating them needs a tutorial pass test for those setups.
- **Composer and atelier on the pad:** do bar nudges, ♪ preview and swatch cycling read well? Are the crystals visible in the Rink camera close-up?
- **Browser** has neither the Composer timeline nor the atelier yet. Same question as before: does the browser career stay smaller?
- Carried over: skirt fullness, the eyelid band, the paddle preset order, whether the name "Edgework" is clear.

## State (verified 23:50 PST)
- `main` `8519b10`. #68 and #69 CI green before merge. `main` CI green (Ice Lab checks, Native replay).
- Outer checkout `phase17-assurance`: old dirty work, not today's. Never sweep it.
- No game instance left open. The season pilot's Godot (pid 88198) was closed by request.

## Project health
- `npm test` 887/887 · bridge tests 43/43 · typecheck clean (scratch TypeScript) · Godot smoke passed before the rust-bar commit (career now runs 75 s; the stage limit is 100 s).
- `checks.sh --run` assumes npm dependencies this project doesn't use; use the One-shot check below.
- Fragile: a pad plugged in after launch has no paddles until restart; the crowd is the costliest render item.

## Next steps, in order
1. Play a season on the merged build and write timestamped notes, as on 2 November.
2. Decide the rival baselines, then re-derive `BASELINE` in `game/rivals.ts` from a full-time scripted run.
3. Retune from the notes: `EVENT_FLOORS`, `RUST_TURN`, the Composer windows, wear rates.
4. Update the tutorial's Explorer/Repertoire air-turn words and remove `UNPROVEN_AIR` once a tutorial pass test proves them.
5. Bring the Composer timeline and atelier to the browser, if wanted.

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    npm test
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    godot4 --headless --path games/ice-run-godot -- --smoke-test     # about 80 s now
    godot4 --path games/ice-run-godot --resolution 1600x900 -- --capture   # menus, music page, atelier → /tmp/edgework-godot-*.png

A fresh worktree needs `node games/ice-run-godot/tools/prepare.mjs` (with audio) and `godot4 --headless --path games/ice-run-godot --import` first. Typecheck: `npm install typescript @types/node` in a scratch directory, then run `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types` from `tools/ice-lab`.

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. Additive edits only.
- New work in a fresh worktree off `origin/main`; another session may share the checkout. Never use a broad process kill.
- Don't change grip, hip ceiling, tuck or landing shock to disguise the contact problem. New physics stays default-off. Rust and wear act through input or rules, never the solver. Replay stays at `/39`.
- Compare failures by name. A step's words are played through the setup's real mapping in a test before they ship. Re-pin a test only for a deliberate change, and state why.
- Numbers that are authored say so. Judge renders by looking at them.
- The owner decides gate policy: answer first, then build. `gh pr merge` needs the owner's `!`. PRs stacked on each other get retargeted to `main` as each merges.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control, stacked PR, monotonic, triage

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` in a fresh worktree off `origin/main` and run its one-shot check. Then [here are my season notes: … | re-derive rival baselines | bring the atelier to the browser]. Stipulate: live work. When we wrap up: /hanoffed.
