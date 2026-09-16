# Hand-off

## Current checkpoint — 2026-09-15, resumed career / Godot session

Still on **`ue-replay-01-foundation`**. The operator authorized the Godot rebuild,
then asked to recover the latest interrupted session, continue, and commit/push.
The previous session's career and Godot files survived on disk; its last test-path
fix had not executed. That fix is recovered. The historical branch-divergence
warning below still applies: this work does not merge or rewrite `main`.

- Browser Ice Run now has five career events, ordered choreography, medals,
  unlocks, XP training and local saves (`game/career.ts`).
- `games/ice-run-godot/` is the playable Godot project. Its Node pipe host runs
  the unchanged Ice Lab simulation; Godot renders a rigged Blender skater,
  rink/traces, cameras, music, career and a simple ordered Composer editor.
  This is **not yet a native GDScript/C++ physics port**.
- Godot 4.7.2 and Linux export templates are installed locally. Launch the project
  with `./games/ice-run-godot/run.sh`. See its README for editor, export, controls,
  saved data, rebuild instructions and an explicit design-bible coverage table.
- Runtime JS and converted music are generated; skater `.blend` and `.glb`, fonts,
  source scripts and import settings are versioned. Smoke tests use isolated
  per-process career saves. No need to reconstruct assets from `/tmp`.
- Checks: all 296 existing Ice Lab tests and all eight Godot bridge/host tests
  pass. Both the editor runtime and the Linux export completed the first career
  routine. A rendered capture caught washed-out lighting, which was corrected.
- The next substantial work is better character animation, a spatial/music
  Composer, persistent ice affecting friction, and the stamina/flow/hype layer.
  The roughly 75% bible direction is **not a measured completeness claim**.

The operator's root play-data folder and saved HTML page remain outside these
changes, as recorded below. All pre-2026-09-15 material below is historical context.

---

**Last session: 2026-09-14 (tenth), on `ue-replay-01-foundation`, three commits. Repo state: everything
the ninth session left, plus a standalone game (Free Skate, a guided Rookie course, a 90-second light
run) on the same solver; a rhythm layer (beat-timed crossover pushes, musical credit) with five of the
operator's own tracks actually playing; a new turn, the bracket; a skirt and a ponytail on the skater;
and a rink boundary the skater bounces off of or crashes into. `main` has moved separately and further,
on a different feature set — see item 1 below before assuming a merge is simple.**

Read this before touching anything. It covers what exists, what is decided, the conventions that
hold the document set together, and the things most likely to trip you up.

> **This line changed.** Until 2026-09-08 this file said *"zero implementation."* That is no longer
> true: `tools/ice-lab/` is real, runs, and has 249 passing tests, including replay capture and a
> verifier that replays a clip recorded in one JavaScript engine in another.

## 0 · Start here (written at the close of 2026-09-14, tenth session)

### First, before anything else

1. **`main` and this branch have diverged hard. Do not assume a merge is a fast-forward.** This
   session's checkout stayed on **`ue-replay-01-foundation`** (three commits, ending `667b3a9`,
   pushed) the whole time. In parallel, a *different* branch — `fidelity-00-repo-correction`, in a
   **separate worktree** at `/home/kill/KoLd__FEEt.fidelity` — merged into `main` as PR #5 while this
   session ran. The two branches share a merge-base (`3571cff`) and have both moved a long way past
   it, touching the same files:

   | | this branch (`ue-replay-01-foundation`) | `main` (via PR #5) |
   | --- | --- | --- |
   | Adds | a game (`game/`), `sim/music.ts`, the bracket turn, `game/rink.ts` (rink **boundary walls**) | `rinkRelief` — ice **surface curvature**, crown/bowl (`sim/blade.ts`) — a same-named, different-meaning "rink"; the jump wind-up (`SkatingInput.windup`, key **U**); `validate.mjs`, a fidelity-gate harness |
   | Both touched | `app/pad.ts`, `app/schemes.ts`, `sim/params.ts`, `sim/replay.ts`, `sim/solver.ts`, `sim/types.ts`, `test/fixtures/replay-v1.json`, and — coincidentally — both independently wrote a file named **`test/rink.test.ts`** for their own unrelated "rink" | |
   | `REPLAY_SOLVER` | reached **`ice-lab-f64/8`** here (music at `/7`, the bracket at `/8`) | reached **`ice-lab-f64/8`** there too (rink relief at `/7`, wind-up at `/8`) — the same number, two different physics changes |
   | Tests | 280 | 272 |

   Reconciling this needs a real session, not a quick rebase: decide a merge order, renumber whichever
   side's `/7`–`/8` lands second, regenerate `test/fixtures/replay-v1.json` once for the union, and
   rename one side's `game/rink.ts` / `test/rink.test.ts` (or namespace both) before either can build.
   `game/main.ts`'s own keyboard **U** (get low / cantilever) will also want a look against the other
   branch's **U** (jump wind-up) once they share a build. Read `main`'s own `tools/ice-lab/README.md`
   and `docs/open-decisions.md`'s new **D7** (tools/ licensing, resolved Apache-2.0) before starting.
2. **The carve-as-a-feature question is still open — the third session running.** See below. It keeps
   getting redirected to something else on the operator's own initiative, which is a legitimate call
   each time, but if a session opens with no stated goal, put this question first rather than assuming
   the redirect will happen again.
3. **Don't re-attempt a foot-changing "choctaw."** It was built and rejected this session — see
   `sim/types.ts`'s `TURN_KIND` comment for the physics reason before spending time on it again.

**Untracked on purpose, at the repo root:** `E_W_replays_sessions_eng_bld/` (the operator's play data:
cards, clips, params exports, event logs) and `Ice Lab — KoLd__FEEt edgework.html` (a browser "save
page", not a source file). Use only the play data that is there; commit or delete neither without asking.

### What happened on 2026-09-14 — three commits, one branch

**`23e675b` — finished another session's in-progress game.** The operator's message was "there should
another session in the middle of building a game, go ahead and take over": `game/` (Free Skate, a
guided Rookie course, a 90-second gold-light time attack, all on the existing solver) existed but threw
on load — `index.html` was missing six DOM ids `main.ts` reads at every frame, so the page came up
blank. Added the markup, rebuilt, drove all three modes and both difficulties through headless
Chromium with no console errors, cleaned up a README that had two overlapping half-written drafts.
262 tests.

**`3b93279` — the rhythm layer, and real music.** Asked to "begin the musical engine before the
career" plus "any enhancing play features": `sim/music.ts` (`musicMode`, off in every preset) gives
every crossover push a beat window — full strength on tempo, `musicMissedPushScale` (0.45) and an
audible chop off it, per the design bible's own guardrail that this must be a modifier, never a gate —
and phrase-weighted musical credit for a turn or a jump landing within `musicAccentWindow` (80 ms) of
an accent (this rig's downbeats, until real authored beat grids exist). Replay `/7`. Then the operator
volunteered five of their own tracks, in `~/KoLd__FEEt.fidelity/` (a sibling worktree, not this repo) —
`Moonlit Alibi`, `摩擦の水面`, `Borrowed Eyes`, `Tongues That Flee`, `Moon Ray Glide` — now copied into
`game/audio/` and playing for real through a plain `<audio>` element, picked in the Controls window.
`aubiotrack` estimated each track's tempo; the raw numbers were roughly double what the tracks actually
feel like (a common octave error on syncopated material), so the stored `bpm` is **half** the raw
detection — an estimate, not ground truth; `game/audio/README.md` says so. Mid-session the operator
laid out where this is going, verbatim because it is the design brief for whenever stamina lands:
*"the stamina, strength, flow state and hype from succesive trick landing has to be the bridge between
the musical and carreer parts of the game... all those should sequentually stack engaging more and
more assist engines with performance increases."* Nothing of that economy is built — `s.musicCredit`
is deliberately a plain, tick-stamped, replay-safe number so it is easy to feed into it once stamina
pools (queue item 4, still not started) exist. 271 tests.

**`667b3a9` — a new turn, a redesigned skater, and boards.** Asked for "more figure skating moves,"
"a more feminine representation," and "rink boundaries and walls to bounce off of and crash into":

- **The bracket** (`sim/moves.ts`, replay `/8`): a three-turn's mirror — same foot, same edge change,
  but entered rotating *against* the curve instead of into it (key **N**, pad **R3**), costing more
  speed (`againstTurnScrub`, authored — bible §2.3 ranks it ★★★ against a three-turn's ★, but no
  `motion-primitives.json` entry exists for either bracket or counter/rocker to measure against).
  **A "choctaw" was built alongside it and taken back out**: entering against the curve with a foot
  change lands on the same edge a mohawk preserves, not the changed edge a real choctaw has, because
  `flipFrame`'s tilt negation — which is what makes three-turn/mohawk's edge outcomes correct at all —
  never depended on rotation direction to begin with. `TURN_KIND` no longer has a `Choctaw` value, and
  a test asserts weight at a bracket's cusp does nothing. `SkatingInput`'s own `leanSplit` field
  comment names a *different*, two-footed mechanism for a real choctaw, not yet built.
- **A skirt and a ponytail** on the skater (`game/scene.ts`), purely cosmetic. The skirt is drawn as a
  screen-space ellipse rather than a world-space flat shape, on purpose: a flat billboard aligned to
  one direction goes edge-on and disappears whenever the body's facing rotates through it, which a
  spin does continuously — caught by an actual screenshot, not assumed.
- **The boards** (`game/rink.ts`): a rounded-rectangle boundary matching the shape `scene.ts` already
  drew. A soft hit bounces the skater back onto the ice; past `CRASH_SPEED` (3.5 m/s of perpendicular
  impact) it is a fall, `FALL.Collision` named as the reason, with its own crash sound. Deliberately
  presentation-layer — applied to the state a frame renders, never inside `sim/`'s own `step()` — so a
  replay's recorded digest stays pure regardless of which wall a run touched, the same precedent as
  the cantilever pose overlay and the choice of music track (both also not recorded). **This is a
  different "rink" from `main`'s `rinkRelief`** — see item 1 above.

280 tests, tsc 7.0.2 clean throughout the session. All three commits verified interactively in headless
Chromium, the third with an actual screenshot read back to check the skirt rendered correctly.

### The open question — ask it first

**The carve as a feature** is still next in the operator's queue, in their words *"adding a ghost line to
follow"* and *"being able to use the carved lines as a performance tool."* The recommendation, made
across two sessions now: one layer, `sim/ice.ts` — the tracing as data, a ~12 cm grid over the ice that
every blade pass writes (bible §3.2: `damage` and `snow`), read by the solver (chewed ice glides slower,
μ 0.006 → 0.015, and bites less; 0 in `spec`, on in the presets) and by the game (the ghost carves its
own ice as it re-simulates, so its whole line lies on the ice ahead of you, with a live "off the line"
number against it — bible §09B v2's distance-transform scoring, against any run). Also: the whole run's
tracing would stay on the ice, where today `app/draw.ts` keeps only each foot's last ~30 seconds. One
trap to fix rather than copy: `SkateSolver.cpp` reads friction right where it just wrote the tracing, so
a blade would slow on its own wake — cells need the tick they were cut.

**The question:** is the line you follow **a replay's tracing** (recommended: any run — your best, your
last, a replay file — on every course, the Figure Eight keeping its drawn circles for its §6 score) or
**a designed curve** (hand-built lines like the Figure Eight's, exact but only where someone designs one)?

### The queue, in the operator's order

1. **The carve as a feature** — after the question.
2. **A career module** holding training and the practice mini-games: a `CareerState` that earns XP from
   the courses and calls `train` (`sim/profile.ts`). Keep it in `sim/` or a `career/` that imports only
   `sim/`, so a career replays like a run.
3. **Stat balance tied to the competitive scoring** — `overall` and the tier floors are the attachment
   points. Not before (1) and (2).
4. **Stamina pools in the solver** (bible §2.8, `SkateSolver.cpp` `UpdateStamina`/`StaminaGain`) — the
   stamina stat means nothing until they exist, and neither does the operator's stamina/flow/hype
   bridge above: build the pools first, then read this session's music-engine credit as one of its
   inputs, not the other way round.

**The native track, in its report's order** (unchanged, not touched this session): a strict native
JSON importer from `native/reference/wire-manifest.json`; transcribe `createState`, the blade and
classification, and the ground solver from the pinned `/5` source; a runner with oracle comparison and
first-difference diagnostics; only then an Unreal module and commandlet on a pinned UE installation.

**Loose ends of the moves**, none started: scheme B cannot steer backward (it chases the heading, which
a turn reverses); spin levels (`SpinResolver.cpp` — the state already records positions held two
revolutions); turns and twizzles in step-sequence levels (`step-features.json`); rockers, counters and
a genuine choctaw (all three need a same-edge or two-footed mechanism this rig does not have — see
above); the jump challenge still starts attempts at 5 m/s. **Noticed but not built**: `data/spin-positions.json`
already has real `inertia_scale` numbers for layback and crossfoot spin positions (0 and 2 more
flexibility-gated ones besides) — the cheapest possible "more moves" for a future session, since it
reuses 100% of the existing spin architecture and needs no new physics, only a control mapping.

### Working with this operator — what held up on 2026-09-14

- **A message that bundles several asks ("more moves, a different look, and walls") has no
  prioritization or scope in it by default.** Each one turned into real research (which turn is
  physically tractable, why a flat skirt fails, what "crash" should mean) that a single follow-up
  line could have shortened. Not wrong to send it that way — the operator's calls on scope were all
  reasonable — just slower than naming the one thing that matters most first.
- **Mid-flight design direction ("the stamina/flow/hype bridge") arrived as a message while a
  different, concrete task was already underway.** It was worth having and is written into the queue
  above, but landing it after the concrete task closes (or as its own opening message) means it does
  not compete with something already in progress for attention.
- **A vague asset pointer costs round trips.** "I have a few files, they should be in the rep" sent
  the session through `~/Downloads` and a 5,841-file `~/Music/Suno_Songs` before the operator named
  the actual folder (`~/KoLd__FEEt.fidelity/`, nine files). A path, even an approximate one, upfront
  saves the search.
- **Verify before shipping, every time, paid off again.** Three separate guesses this session — a
  choctaw built from rotation direction, a skirt as a flat world-space trapezoid, a wall-bounce
  sign — were each wrong on the first attempt and each caught before the operator ever saw them: by a
  test in two cases, by an actual screenshot in the third. None of this required the operator's time;
  name it so the pattern keeps being trusted rather than second-guessed.
- **The operator plays scheme A on an Xbox pad, in Firefox.** Every lean in their replays is analog.
  Keyboard A / D is a full 65° lean — never use it to measure anything.
- **At the close** they ask for a two-sided efficiency review, prompting vocabulary, and this file.

**Toolchain reminders:** `npm run typecheck` still fails (no tsc on the box); scratch-install
`typescript @types/node` and run `tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types` from
`tools/ice-lab/` — TypeScript 7.0.2 was clean at every commit. **Headless Chromium** (`/usr/bin/chromium`)
drives the real page over the DevTools protocol with nothing installed: `node app/serve.mjs`, launch
`--headless=new --remote-debugging-port=…`, connect with Node's global `WebSocket`, and inject a fake
analog pad with `Page.addScriptToEvaluateOnNewDocument` overriding `navigator.getGamepads` — the
keyboard's A / D is a full 65° lean and puts the skater down at once. **A screenshot is
`Page.captureScreenshot`'s result nested one level deeper than other CDP calls** — `msg.result.result.data`,
not `msg.result.data`; it cost one failed attempt this session. `aubiotrack` (already on the box) gives
onset-based tempo for a real audio file; sanity-check its raw bpm against how the track actually feels
before trusting it — see the music-engine entry above. The native build commands are in
`tools/ice-lab/native/README.md`. The README's test count is 280.

---

## 1 · What this is

**Edgework** — a physics-first figure skating simulation. Mostly design specification; the first
code is a tuning rig, not the game. The repo is a complete plan for a 30-month, ~$11.9M production,
plus the machine-readable data and reference implementations that plan depends on, plus a browser
rig for tuning the blade–ice model before it is written in C++.

Owner: [@9x25dillon](https://github.com/9x25dillon). Public repo. Dual-licensed — see
[README](README.md#licensing), and **do not relicense without asking**: the split (docs
CC BY-NC-ND, code/data Apache-2.0) is deliberate and reasoned.

---

## 2 · Current state

| | |
| --- | --- |
| Documents | 8 in `docs/`, all complete |
| Data files | 12 in `data/` — 5 CSV, 6 JSON, 1 README |
| Reference code | 6 files in `src/reference/` — specifications-as-code, do not compile |
| Engineering material | `big_reffg.txt` — 3,711 lines, three concatenated documents, **has known defects, see §2.2** |
| Native foundation | `tools/ice-lab/native/` — C++17 serialization, CRC32 and deterministic math checked against an oracle pinned at replay `/5`; no native solver yet (PR #4) |
| Implementation | `tools/ice-lab/` (branch `ue-replay-01-foundation`, not yet on `main` — see §0 item 1) — 280 tests, zero dependencies, engine-independent replay, camera, three courses with ghosts, jumps (off by default), scoring from `data/`, skater profiles, the moves (off by default) including the bracket, a rhythm layer with real music, and a standalone game (`game/`) with rink-boundary walls |
| Rendered pages | 5, published as Artifacts **and** mirrored in `docs/web/` |
| Decisions | **4 of 6 closed.** D1 and D5 remain |

### The two open decisions — and they are one conversation

**D1 (budget/team)** and **D5 (disciplines at launch)** are coupled. The plan totals **$11.9M of
development**; D1's envelope quotes **$18–25M**. If that envelope is development-only, there is
~$6M of headroom, and the honest place to spend it is the second discipline D5 asks about. If it
includes marketing and year-one liveops, the plan fits as written. **Resolve them together, with
whoever holds the money in the room.**

### Decisions closed 2026-09-03 (previous session)

| | Decision | Note |
| --- | --- | --- |
| **D2** | Unreal Engine 5.4+ | Cancelled the pre-production bake-off; W1–2 became a single-engine validation spike |
| **D3** | Single-player first | Default; async ghosts + warm-up lobby at launch, pairs year one |
| **D4** | Adaptive tier routing | *Not* either option the register offered — The Patch recommends a tier from its own tracing score |
| **D6** | No athlete licensing | Closed at first writing |

**D2 is closed and stays closed.** It was raised again on 2026-09-09 as "should we build a game
engine" and the answer was no, for the reason the register itself gives: it was the only item with
a hard date, and every week it stayed open cost two engineers half their throughput. If a session
is asked to build an engine, say what D2 says and offer the Ice Lab route instead.

---

## 2.1 · `tools/ice-lab/` — what it is and how to run it

A 120 Hz, deterministic, **inertial** implementation of the blade–ice model with every constant on
a slider. It is EDGE-019's Ice Lab, built early and cheap, so `KoLdSimCore` can be written in C++ as
transcription rather than as discovery. **It is not the game and it is not an engine.**

```sh
cd tools/ice-lab
node --test test/*.test.ts     # 280 pass, ~35 s
node app/serve.mjs             # http://localhost:8123/
```

**Zero dependencies, and keep it that way.** Node 26 strips TypeScript natively and exposes the
stripper as an API (`node:module` → `stripTypeScriptTypes`), which is the entire build step. The
price is **erasable syntax only** — no `enum`, no `namespace`, no constructor parameter properties.
`test/boundary.test.ts` enforces that, and also enforces the rule the UE5 port depends on: `sim/`
never imports `app/`, never touches the DOM, a clock, or `Math.random`.

`tsconfig.json` exists for editors and an optional `tsc --noEmit`. It is the only thing in the rig
that wants anything installed. Tests and build do not need it. **On this machine nothing provides
`tsc`** — see §5 item 13 for the working recipe.

**Falling and getting up (added 2026-09-09, fifth session).** A fallen skater slides until the
tester does something. A *fresh* press of A / Space stands them up where they fell, at rest; the
press is consumed (not a stroke) and a button held through the fall does not count (new state field
`pushHeld`). This makes the plan's time-to-retry — "seconds from fall to next input" — the same
event as the sim's response. `downSeconds` is time on the ice until stand-up or reset. A stroke
also floors the knee at the neutral stance 0.35, because a straight leg cannot push and a pad with
RT released previously had zero push force. Scheme C gained the rocker on both sticks' fore/aft
(mean of the two, with A's sideways-bleed relief). **Schemes A and B were deliberately left as they
were**: a draft that gave both a right-stick weight/rocker channel was reverted, because A is under
test as §2.1 wrote it (three channels, not five) and a blade channel on B hands it a piece of A and
narrows the contrast the down-select measures. The commit message of `fb87c52` has the reasoning.

**Jumps, over the plan's refusal (added 2026-09-10, sixth session).** pre-production-plan §1 refuses
jumps, rotation, scoring and named elements in the prototype, admitting only a rotation-free hop from
W9. The operator was shown that and chose to have full jumps in the rig anyway, alongside the hop,
headless-testable scoring, the Edge Ribbon and the edge tone. **That is their decision; do not reopen
it, and do not loosen the containment either**: `jumpMode` is 0 in every preset, `?playtest=1` forces
it to 0, so no M2 or gate session can contain a jump. `sim/jump.ts` is `JumpResolver.cpp` (no jump
button — release the knee; ballistics fixed at takeoff; carriage the one air lever); `sim/score.ts` is
the jump half of `ScoreCalculator.cs`, reading the CSVs, with the data winning where the two disagree.
Replay contract is now `ice-lab-f64/3`; the fixture was re-recorded from its own inputs after its
kinematics were proven identical to `/2` (§5 item 14's procedure).

**Seeing the controls.** The operator asked for "something to visualize while running the engine" to
learn what each button does. The skater figure is drawn from state (feet on the solver's contacts,
arms from the save, tuck in the air), and the input panel shows hardware beside the mapped
`SkatingInput`. The panel is developer-only (off in playtest); the figure is not.

**The moves, over the same refusal (added 2026-09-13, ninth session).** Crossovers, the three-turn and
mohawk, twizzles, spins, the Ina Bauer, and jumps reached from those entries — the operator's list, in
`sim/moves.ts` and the solver, behind `movesMode` with the same containment as jumps (0 in every
preset, forced 0 in playtest, inert at 0). Two ideas hold it together. **A cusp is a change of frame,
not of physics**: lean and tilt are measured toward the heading's left, so when a turn reverses the
heading they all change sign with the body unchanged, and the edge code flips on the same tick
(`flipFrame`, counted in `s.flips`, which a control scheme reads to keep a held stick on its side of
the ice). **The moves are measured against the project's own data** — `motion-primitives.json` for
costs, `spin-positions.json` for inertia, `entry-templates.json` for entry speeds — with every
calibrated constant labelled a balance lever. The README's "The moves" section has all of it.

Read [`tools/ice-lab/README.md`](tools/ice-lab/README.md) before changing any of it.

### What the rig found

Eight things, each recorded as a test rather than prose, so they fail loudly if reverted.
**Findings 4, 5, 6 and 7 have been fixed in the rig** (2026-09-09); the defects stay reproducible
because `spec` still carries every one of them.

1. **`big_reffg.txt` contains both readings of the handedness.** One half correctly calls `Up × t`
   "the skater's left"; the other calls the identical expression "Right" and derives every edge
   code from it. Mirror images — one names an RFO where the other names an RFI. A takeoff-edge
   validator on the wrong one fails every jump in `data/jump-definitions.csv` while looking
   self-consistent. Settled in `sim/math.ts`; checked against every CSV row in
   `test/classify.test.ts`.
2. **The internal balance authority has its sign backwards.** A positive balance error needs a
   *positive* `a_int` to arrest it. As specified, arms and free leg push the skater further over.
3. **The two-blade lateral solve cannot pass its own acceptance test.** Full body mass per blade,
   applied Gauss-Seidel, so the first blade absorbs everything. Fixed — which surfaces a model
   fact: with capacity linear in load, both blades sit at *identical* demand ratios, so the weight
   split can never decide which lets go without sublinear capacity, which is not in the model.
4. **The specified gains cannot enter a deep edge from upright.** Holding 20° at 4 m/s is stable;
   reaching it is not. Instrumenting which clamp binds separates two different failures: at `spec`
   the **angulation limit** binds for 256 of 317 ticks (a controller limit), at `responsive` it is
   **maxTilt** for 215 of 314 (a physical one). Below ~5 m/s gains move the limit; above it only
   blade geometry does — at 6 m/s tripling the authority damping is worth 1°, sharpening the rocker
   to 1.6 m is worth 7°. Measured, deepest lean reachable from upright:

   | | 3 m/s | 4 m/s | 6 m/s |
   |---|---|---|---|
   | `spec` (Kd 8, angulation 20°, no rate term) | 4° | **11°** | 32° |
   | `spec` + finding 5's rate term, nothing else | 9° | **19°** | 43° |
   | `responsive` (Kd 16, angulation 40°, fixed) | 13° | **25°** | 44° |
   | `assisted` | 13° | **25°** | 44° |

   These are leans **reached**, not merely survived: each preset stays up about 2° deeper than it
   tracks. Quote the tracked number — the other one flatters.

   Two things it is not, both checked rather than assumed: **not an entry transient** (slewing the
   stick at 360 / 180 / 90 / 45 °/s changes the limit by nothing), and **partly the measurement
   horizon** — six seconds with no propulsion means speed decays, and at twenty seconds every
   parameter set collapses to 4–7° for no reason but lost speed. Measure the loop with losses off
   or with a stroke in the sequence.

   The table also carries the best thing the model says about the game: **speed buys depth, as v²**.
   With the controller fixed, `tan φ` tracks κ = g tan φ / v² to three digits — 1.777 measured
   against 1.778 predicted from 3 to 4 m/s.
5. **An assist tier that raises recovery authority makes balance worse.** `internalMax` 1.5 → 2.5
   falls at tick 77 instead of 617, and 2.0 outlasts both — a proportional gain with no damping.
   **Fixed** by `internalRateGain`, the missing rate half of the PD: arms and a free leg are swung,
   and what they are swung against is lean *rate*. 1.5, 2.5 and 3.0 now all skate the reference
   sequence. `validate()` rejects `internalMax > 2` with no rate term under it, so the mistake
   cannot reach a UE5 tuning asset. Cost, stated honestly: a 20° edge settles in 2.9 s under
   `assisted` rather than 1.7 s, because damping is what is being bought.
6. **A save is scored as a fall.** `balanceError` measures lean against the equilibrium the *edge
   alone* supports, and the balance-timeout test credits none of the internal authority — so using
   the arms and free leg **is** the fall condition, and the more authority a tier grants the sooner
   it fires. At `internalMax` 2.5 the reference sequence is declared over at tick 77, at **2.6° of
   lean**, upright, at 4 m/s, mid-recovery. **Fixed** by `fallAuthorityCredit` (0 in `spec`, 1 in
   the presets). It buys no depth at all — the entry envelope with credit alone is identical to
   `spec` — and it does not make the skater unfallable: an unholdable lean still goes down by
   `LEAN EXCEEDED`.
7. **The internal authority has no range limit, and will hold a lean forever.** Found by building
   control scheme B, which could not steer and should have been able to. A skater asked for a 20°
   edge settled at 13°, blade flat, going straight, indefinitely — arms and centre of pressure
   holding a lean the ice was not carrying, while the balance loop steered the other way trying to
   reach the edge it had been asked for. The arithmetic is exact: authority 2.74 m/s² against
   `g·tan(13°)` = 2.26 m/s², so it holds forever. **Fixed** by `internalWashout`, a high-pass on
   the arms term — what is held drains away, what changes still gets through — with the
   centre-of-pressure term deliberately exempt, because a 24 cm stance really can hold ~7°
   indefinitely and that is what standing still is. **This was invisible until finding 6 was
   fixed**: while the fall test credited none of the authority, these states timed out and fell, so
   the model looked honest for the wrong reason. Fixing one thing is how you find the next.
8. **Four mechanisms the package lacks**: variable effective rocker along the blade; lateral
   resistance on a flat blade; a rate-limited knee; and rotating rather than projecting velocity
   under the constraint.

**`DEFAULT_PARAMS` stays faithful to the spec so the defects remain measurable.** Working values
live in `PRESETS.responsive`. Do not "fix" the defaults — that hides the finding. The corollary,
which the second session had to obey twice: **a new parameter's default must reproduce the old
behaviour exactly.** `internalRateGain` and `fallAuthorityCredit` are both 0 in `spec`, so every
previously recorded number still measures the same thing, and both tests that broke when the
presets were fixed were rewritten around the *measured* replacement rather than loosened.

---

## 2.3 · Publishing it, and collecting what it measures

Two pieces, because a static host cannot collect anything and a collector should
not be the front door for contributors.

| | |
| --- | --- |
| **Public build** | `.github/workflows/pages.yml` — tests, builds, deploys to GitHub Pages. The tests gate the deploy. |
| **Collection** | `tools/ice-lab/app/collect.mjs` — serves the rig *and* takes `POST /api/session` into a JSONL file. Zero dependencies, one file, binds loopback. |
| **Deployment** | `tools/ice-lab/deploy/` — hardened systemd unit, a Caddyfile that strips client addresses from the access log, and a twenty-minute runbook. |
| **Contributors** | `CONTRIBUTING.md` and three issue templates. The docs licence needs the grant in it — see below. |

**An Artifact with a database cannot be used for this.** The `db` capability
makes an artifact organization-internal and *unshareable publicly*: every reader
and writer must be a signed-in member of the owner's org. That rules it out for
handing a link to a nephew, which is what it was being considered for. A plain
box with 180 lines of Node does the job with no accounts at all.

**The collector trusts nothing it receives.** Cards are rebuilt field by field
from a fixed schema — numbers coerced and rounded, strings stripped to a safe
alphabet, unknown fields dropped, bodies over 64 KB refused. No accounts, no
cookies, no analytics, **no IP logging**: the payload is numbers about a
simulation and nothing about a person, which is both the privacy position and
what makes two testers' sessions comparable.

**The docs licence blocks doc contributions and always did.** `docs/` is CC
BY-NC-**ND**, and a pull request editing a document is a derivative work.
`CONTRIBUTING.md` now carries a contributor grant (DCO sign-off plus a licence
back to the project for `docs/` changes) so the door is open without touching
the split, which stays as reasoned. It is written to be readable rather than
airtight; if a contribution ever matters commercially, both sides should want a
lawyer to look at it.

---

## 2.2 · `big_reffg.txt` — read this before trusting it

Committed unedited on 2026-09-09 (`1a0fa55`) because it is the source the Ice Lab was built against.
It is **three separate documents concatenated**, not one:

| line | document |
| --- | --- |
| 1 | Edgework Subsystem: Engineering Package v0.1 — `KoldSim`, 48 B blade, 16 B input, balance external |
| 636 | First 50 Engineering Tasks, KOLD-001..050 |
| 2502 | Edgework Build Package, EDGE-000..019 — `KoLdSimCore`, 80 B blade, 8 B input, balance integrated |

Known defects:

- **The first and third are incompatible designs sharing a name** — different modules, struct sizes
  and layouts, input quantization, and disagreeing on whether the solver owns balance or reports it.
- **They disagree on handedness** (see §2.1).
- **The 50-task list contradicts itself**: KOLD-012/013 give 48 B blade + 56 B body while KOLD-014
  asks for 256 B total (the sum is 152), and KOLD-015 says 16 B input where the third package says 8.
- **§6.2's classifier is truncated.** The `.cpp` stops mid-function at line 630, `if (F.bLobeOpen)`,
  and line 631 is prose from the second document. `FKoldEdgeClassifier::Update` has no body.
- **Its "repository unavailable, PENDING AUDIT" premise is stale.** `data/jump-definitions.csv`,
  `data/assist-tiers.json`, `data/step-features.json` and `src/reference/` answer most of its open
  questions directly, and D2 closed the engine question on 2026-09-03.
- **Where its ASSUMPTION values disagree with the design bible and `src/reference/SkateSolver.cpp`,
  the bible wins**: rocker 2.05 not 2.2/2.4, μ_skid 0.35 not 0.03, max lean 1.13 not 1.05/0.96.

---

## 3 · Conventions that hold the set together

Break these and the repo stops being coherent. They are not arbitrary.

### 3.1 Markdown is the source of truth; HTML is the rendering

Every phase and system document exists twice: `docs/*.md` (reviewable, diffable, PR-commentable)
and `docs/web/*.html` (the published Artifact). **Edit the markdown first, then mirror.** They
will drift if you do it the other way round.

### 3.2 Scoring is data, never code

The ISU revises its Scale of Values most seasons. Everything scoring-related lives in `data/` so a
rules change is a data patch shipped in days. **Never inline a base value, a threshold, or a level
feature into code.** See [`data/README.md`](data/README.md).

### 3.3 Every threshold is a balance lever, not a rule

Where the ISU says *"clear increase of speed"*, a human specialist applies judgement and a game
must pick a number. We picked 1.30. **Label these as design decisions wherever they surface** —
`data/spin-features.json` and `step-features.json` both carry this warning in their headers, and
`verified_against_isu: false` is set honestly. Do not quietly flip that flag.

### 3.4 Gate criteria are pre-commitments

Every phase gate has thresholds **signed before the data exists** — that is what stops a gate
becoming theatre. If you add a gate, add its sign-off date too.

### 3.5 Corrections are recorded, not silently applied

Three places the later documents deliberately correct the bible. Preserve these notes:

| Correction | Where |
| --- | --- |
| The Composer searches a **motion-primitive lattice in physics space**, not the motion-matching database | [composer-solver.md §2](docs/composer-solver.md#2--why-this-is-hard) |
| Mocap blocks 1 and 2 moved to the **vertical slice**; production gets a third, smaller block | [production-plan.md §6](docs/production-plan.md#6--mocap-block-3) |
| `spin-step-values.csv` gained the missing **level B** rows | commit `9de53a4` |

---

## 4 · Published Artifacts

Five live pages. **URLs are stable — always update in place, never republish as new.**

| Page | Artifact URL | Repo mirror |
| --- | --- | --- |
| Design bible | `claude.ai/code/artifact/58f6234d-6ece-4f55-8fc5-2b7a7ce86da9` | `docs/web/index.html` |
| Pre-production | `claude.ai/code/artifact/531a5952-fcfd-44bf-966a-ae31ce3562c9` | `docs/web/pre-production.html` |
| Vertical slice | `claude.ai/code/artifact/dde9b2ad-4d31-412f-a15e-6edbb6cc305a` | `docs/web/vertical-slice.html` |
| Production | `claude.ai/code/artifact/6a36f22c-3ed6-4439-828b-cd14759ebaca` | `docs/web/production.html` |
| Beta | `claude.ai/code/artifact/bdd4ebbf-b24e-4b31-bcf3-9afdce6a4e53` | `docs/web/beta.html` |

### To update one from a new session

1. Edit the markdown in `docs/`.
2. Edit the mirror in `docs/web/`.
3. Publish **passing the `url` parameter** from the table above. Without it you create a *second*
   artifact instead of updating the existing one.

The mirrors in `docs/web/` exist precisely so a new session never needs the previous session's
scratchpad — which does not survive.

### Shared visual identity

All five pages use one stylesheet: Bodoni Moda (display) × IBM Plex Sans (body) × IBM Plex Mono
(data), cool grey-white ground, arena-amber accent `#9c6b12` / `#e2a94e`, steel-teal `#2c6773` for
data, double-hairline section rules echoing a blade tracing. **The bible's stylesheet is the
richest** (it has the syntax-highlighting classes); the four plans share a slightly reduced one.
If you add a sixth page, copy the head from `docs/web/production.html`.

---

## 5 · Things that will trip you up

**Documents and shell**

1. **The shell is `fish`.** Heredocs (`cat > f <<'EOF'` and `python3 - <<'PY'`) work fine through
   the Bash tool and were used throughout both sessions. What differs is **globbing**: an unmatched
   glob is a hard error, not a pass-through — `ls LICENSE*` fails with *"no matches found"* rather
   than printing nothing. Quote globs you are not certain match.

2. **Do not write HTML entities into source files.** `src/reference/SpinResolver.cpp` was written
   with `&amp;` and `&lt;` and needed an unescape pass. If you have just been authoring an HTML
   page, consciously switch modes before writing a `.cpp`.

3. **Exact-match edits fail across the md/HTML pair.** The same sentence is line-wrapped
   differently — e.g. `None, no HUD` (markdown) vs `None, no HUD at all` (HTML). **Grep the target
   file for the actual string before constructing the edit.**

**The Ice Lab**

4. **Erasable syntax only.** An `enum`, a `namespace`, or a constructor parameter property compiles
   under an IDE and then fails at `node app/build.mjs`. `test/boundary.test.ts` catches all three —
   run the tests before assuming a change is fine.

5. **A skater with no propulsion always falls, and it looks like a controller bug.** Speed decays
   through friction and drag, the maximum holdable lean falls as `κ = g·tan φ / v²`, and eventually
   any commanded lean is unholdable. Roughly five seconds from 5 m/s. **Before debugging the balance
   loop, check the speed at the moment of the fall** — an afternoon went into gain sweeps that a
   single speed trace would have ended. Test sequences must either stroke (`push: true` every ~90
   ticks) or disable losses.

   **The same trap contaminates measurements, not just debugging.** The entry-envelope numbers are
   partly a function of how long the run is: at six seconds `spec` reaches 11° at 4 m/s, at twenty
   seconds it reaches 4°, and the difference is entirely lost speed. Any number quoted about the
   balance loop needs its horizon quoted with it.

6. **Measure before asserting.** Several tests were written with guessed bounds and had to be
   loosened to the measured value. Print the number first, then write the assertion around it —
   otherwise a passing test is only recording the guess that happened to be generous enough.

7. **Piping a long background command to `tail` hides it.** `npm test | tail` in the background
   produces an empty output file until the command exits, which reads exactly like a hang. Give
   long runs a generous timeout and read the raw output file, not a filtered tail.

8. **Trace once before sweeping anything.** Both of this session's findings came out of two
   diagnostics — print the loop's own variables each tick, then print *which clamp is binding* each
   tick. That took twenty minutes and pointed straight at the mechanism; the parameter sweeps
   afterwards only confirmed sizes. A sweep tells you a number moved. A trace tells you why, and
   the why is what turns out to be wrong.

9. **A fixed defect is how you find the next one.** Finding 7 was invisible while finding 6 stood:
   the states where the arms hold a lean forever used to trip the balance timeout and fall over, so
   the model looked honest for the wrong reason. After every fix, re-measure the things the fix was
   not about — the entry tables moved by 1–3° and nothing in the change touched them.

10. **A "control" parameter set built by subtracting fixes from a preset will rot.** Two tests
    constructed "as the package specifies it" as `{...PRESETS.responsive, someFix: 0}`, so the next
    fix leaked straight into the control case and both tests failed for the wrong reason. Build
    control cases by ADDING to `spec`, which is the baseline by definition.

11. **`python3 - <<PY` patches that do not assert their match will lie to you.** A `.replace()`
    whose pattern is absent is a silent no-op, so a whole import line was never added, the build
    "succeeded" (type stripping checks nothing), and the page died with `ReferenceError` in a
    browser. Every patch in this session that asserted `old in s` was fine; the two that did not
    were the two that broke. **Assert the match, always.**

12. **`sim/` has no type checker in this environment.** `tsc` is not installed and the build only
   strips types, so a slider naming a parameter that does not exist, or a state field never
   initialised, reaches a browser silently. `test/boundary.test.ts` catches the syntax rules; for
   `app/`, `test/app-loads.test.ts` imports every module against a DOM stub **and constructs the
   lab**, which is the part that matters: importing a module only proves its imports resolve, not
   that the code runs. A missing binding used in a class field linked cleanly and threw in the
   browser.

13. **The npx cache holds a decoy `tsc`.** `npx tsc` prints "This is not the tsc command you are
   looking for" and the only real TypeScript on disk is 5.5.4 in Trash, too old for
   `erasableSyntaxOnly`. Working recipe: `npm install typescript @types/node` in a scratch dir,
   then from `tools/ice-lab`: `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots
   <scratch>/node_modules/@types`. TS 7.0.2 checked the tree clean on 2026-09-09.

14. **The replay digest hashes the whole `SkaterState`.** Adding a field, even one with no effect
   on kinematics, moves every digest and fails `test/replay.test.ts` on tick 1. The rule in
   `sim/replay.ts` is: bump `REPLAY_SOLVER`, re-run the fixture from its own recorded inputs, and
   prove whether kinematics changed by replaying through the previous solver
   (`git archive origin/main tools/ice-lab/sim | tar -x -C /tmp/oldsim`, then compare final
   state). Never regenerate just to make CI pass. `/1 → /2` was done this way for `pushHeld`.

15. **Fetch before you push.** The first push of `fb87c52` was rejected because PR #3 had landed
   on `main` mid-session. A clean rebase followed, but the fixture test then failed for the reason
   in item 14. `git fetch && git log HEAD..origin/main` before committing would have surfaced it.

16. **A leading `=` in a shell argument is a command lookup.** `echo =====X` fails with
   "=====X not found". Quote separators or start them with another character.

17. **The balance overlay was mirrored until 2026-09-10.** It drew the COM at
   `base − perpLeft·L·sin(lean)`, outside every turn. Any screenshot or play note about "the purple
   line" from before `7f113ca` described the mirror image. `pendulum()` in `app/draw.ts` now reads
   the COM off `pos`, and `test/draw.test.ts` holds it there.

18. **The Edge Ribbon and edge tone are on in playtest**, because the plan builds them as channels
   under test. Sessions recorded before 2026-09-10 had neither, so they are a different condition —
   do not pool them with later M2 data.

19. **A jump's landing inherits the `EdgeChanged` caveat.** Contact returns as NONE→edge, like a
   stand-up. Irrelevant while jumps are off in playtest; fix it with the other one if that changes.

20. **The canvas stub in `test/app-loads.test.ts` has no `measureText`** and returns `undefined` for
   every call. Anything in `app/` that reads a return value from the 2D context throws there first.

21. **A replay recorded in one JS engine may not verify in another** — see §0 item 2. A divergence
   on a Firefox clip is not evidence of a solver bug until it has been replayed in Firefox.

22. **A pasted clip gets a newline every 10,000 characters.** `replay-4` arrived that way and failed
   `JSON.parse`. The recorder never writes newlines, so stripping every `\n` restores it, and the
   per-tick digests prove the repair was lossless. Repair a copy in the scratchpad; the operator's
   file stays as they left it.

23. **`schema` on a session card is a format version, not a session counter.** One card arrived
   hand-edited to `edgework-session/2`. The collector rebuilds cards and treats the field as the
   format; number sessions in the filename.

24. **The Bash tool's shell is zsh here, not fish or bash.** An unquoted `$var` does not word-split:
   `for cfg in "0 5 0.25"; do node x.ts $cfg` passes one argument and every number reads as NaN — a
   run of all-zero traces that looks like a physics result. Use `${=cfg}`.

25. **After a turn, lean and tilt have the opposite sign for the same body.** Anything reading
   `s.lean` across a turn must follow `s.flips`. A test driver that does not mirror its stick at a
   flip leans the skater out of the circle it was on; every moves test does the mirror by hand, the
   way `latchTurns` does for a player.

26. **Stroking and crossovers top out near 8.7 m/s**, where the pushing blade — at its 20° push edge,
   carving nothing — reports its own skid and friction. Pre-existing, in `spec` too, and a plausible
   ceiling; do not mistake it for drag.

27. **Enter an Ina Bauer with the lean already in.** Pressed while the balance loop is still rolling a
   lean in (the blade first tilts the other way), it starts on inside edges, correctly for the tilt it
   found. Measured runs lean first.

28. **Jump outcomes with the moves on depend on approach speed**, so a jump test copied from
   `test/jump.test.ts` into moves mode comes out lower unless it approaches at the jump's entry speed
   (`ENTRY_SPEED`, from `data/entry-templates.json`). The turns test's salchow had to move from 6.3
   to 7.0 m/s for exactly this reason.

29. **A new `Params` or `SkatingInput` field is not done until three places agree, plus a fixture.**
   `sim/replay.ts`'s `parseReplay` hand-enumerates every allowed key for both, twice over (once as the
   required-fields list, once as the type-checked subset) — separately from the interface in
   `sim/types.ts`/`sim/params.ts` and separately from `DEFAULT_PARAMS`/`NEUTRAL_INPUT`. Miss the
   `replay.ts` list and the *old, already-committed* fixture starts failing with "unknown field" or
   "missing field" on a field that was never touched. Bump `REPLAY_SOLVER` and re-record the fixture
   from its own inputs every time (item 14), for `SkatingInput` changes exactly as much as for `Params`.

30. **State the sign of a dot product in a comment before writing the conditional that uses it.** A
   wall bounce's velocity-dot-outward-normal is positive when *still heading out* and negative when
   *already heading back in* — "into the wall" is the intuitive name for the first case but describes
   the second just as easily in English, and the collision code was written backwards on the first
   pass. A test with a skater already leaving the boundary caught it before anything shipped; it would
   not have been obvious from playtesting alone, since a wrong sign here still looks like *some*
   physical response, just the opposite one.

---

## 6 · Where to go next

In descending order of value:

1. **Close D1 and D5 together.** Everything else is downstream of the money. Unchanged.
2. ~~**Fix what the Ice Lab found, in the rig, before any C++ is written.**~~ **Done**, 2026-09-09
   (second session): findings 4, 5 and 6 are fixed, `spec` still carries the defects, and every
   number is a test. What is left of this item is the part a keyboard cannot answer — whether the
   fixed loop *feels* like skating, which is item 3.
3. **Take the rig to a skater.** It renders edges, carve circles, force vectors, the equilibrium
   lean and a live tracing, and exports per-tick CSV. The question the whole project is downstream
   of — §7 below — is now answerable by someone who skates, on a laptop, in an afternoon. Record
   the session in `docs/tuning/` and export the parameter set with the panel's **params.json**
   button, which emits only what differs from `spec`.

   **The rig is now set up for the plan's own M2, not for the kill gate.** Read
   [pre-production-plan.md §3, §6 and §7](docs/pre-production-plan.md) before running anyone:

   - **All three schemes exist** — A *Lean & Load* (bible §2.1), B *Steer & Load*, C *Two-Foot* —
     cycled with **M** or **Back**, labelled A/B/C on screen and nowhere identified, because §7
     requires the labels be blind to the testers *and* the observers.
   - **`?playtest=1`** hides the sliders, the preset name and the exports. A tester gets a rink and
     a letter.
   - **The session export** is the five §6 metrics the rig can compute, under that document's
     definitions, plus the scheme and the parameters. No names, no accounts, no free text.
   - **Two pre-existing metric caveats to settle before gate data exists** (found 2026-09-09,
     fifth, left alone on purpose): B's LB/RB pick the foot, and for a given turn direction foot
     choice *is* inside/outside edge choice, so B's stated trade is partly leaky; and
     `EdgeChanged` counts the NONE→edge transitions after every reset and stand-up (~2 per fall).
     Both change what a number means, neither is hard to fix.
   - **W8's M2 is the milestone this serves**: *"eight team members plus eight friendly externals,
     blind A/B/C, ranked. Soft gate: down-select 3 → 2."* Friends and family are friendly
     externals, and their data legitimately chooses a scheme. It can **never** feed the W16 kill
     gate, which excludes *"anyone who knows the team"* — and W13's protocol pilot exists precisely
     so a first run debugs the protocol rather than the game. Its data is discarded by design.

   **Start them on `responsive`, not `spec`.** `spec` cannot enter an edge deeper than 11° at
   stroking pace, which is not a fair test of anything. The two questions worth putting to a skater
   first, because the rig now has an answer to check against: does depth arriving with speed feel
   like a reward or like a lockout, and is 2.9 s to settle a 20° edge under `assisted` help or
   sludge?
4. **Then port `sim/` to `KoLdSimCore`.** It is written to be transcribed: SI throughout, plain
   data, no allocation in `step`, every transcendental through one module, truncating checksums,
   and an edge code whose spelling already matches `data/jump-definitions.csv`. **Started 2026-09-13**
   as UE-REPLAY-01 (`tools/ice-lab/native/`, PR #4): the wire types, serialization and math are
   checked against a pinned `/5` oracle; the solver transcription is next (§0).
5. **Verify the ISU data.** `spin-features.json`, `step-features.json` and `scale-of-values.csv`
   are faithful models, not transcriptions, and all carry `verified_against_isu: false`.
6. **Build the protocol validation corpus** — 50 published elements reconstructed against the level
   detector, target ≥85% agreement. Needs Composer v0, so it belongs to the vertical slice.

### Not in the rig, deliberately

Rockers, counters and a genuine choctaw (bracket exists as of 2026-09-14; see §0 for why a
foot-changing choctaw needs a different mechanism); spin and step-sequence levels; jump combinations
and sequences; stamina pools, flow, animation, networking, a career state, and ice-grid feedback —
tracings are drawn but do not yet feed friction or bite back into the solver as the bible's §05
requires. The stroke is the bible's semi-analytic push, not a leg model. The profile layer
(2026-09-11) exists but nothing moves its stats yet. The moves (2026-09-13) and the bracket
(2026-09-14) exist, contained; see §0. A rhythm layer and rink-boundary collision (2026-09-14) exist
in `game/`, both game-layer and both deliberately outside what a replay verifies; see §0.

### Known gaps, all deliberate

Tracked at the foot of [open-decisions.md](docs/open-decisions.md): balance-model tuning constants
(**the Ice Lab is now the instrument for these** — they were "cannot be derived, they come from the
feel prototype"), crowd reaction propagation timing, career economy, and ice temperature as a
career variable.

---

## 7 · The one thing that matters most

Everything in this repo is downstream of a single unproven claim: **that analog lean plus analog
knee pressure is a good primary verb.** No shipped game has used it.

There is a real kill gate at pre-production week 16 — *"is carving fun with no jumps, no score and
no art?"* — with pre-committed thresholds, a decision-maker who is **not** the person who invented
the scheme, and the authority to stop the project.

If a future session is asked to soften that gate, move its thresholds after seeing data, or let the
creative lead vote on it — **push back.** Those three properties are the only reason the gate is
worth having.

---

## 8 · Session log

| date | what happened |
| --- | --- |
| 2026-09-14 (tenth) | The bracket, a redesigned skater, and rink walls: `sim/moves.ts` gained a same-foot, against-the-curve turn (replay `/8`); `game/scene.ts` gained a skirt and a ponytail; `game/rink.ts` gave the game a rounded-rectangle boundary to bounce off of or crash into, deliberately outside what a replay verifies. A "choctaw" was built and removed the same session when a test showed it wasn't one. 280 tests. `667b3a9`. |
| 2026-09-14 (tenth) | The rhythm layer and real music: `sim/music.ts` (replay `/7`) gives crossover pushes a beat window and turns/landings musical credit near an accent, off in every preset. Five of the operator's own tracks, found in a sibling worktree after some searching, now play for real via `game/audio/`; their tempo is `aubiotrack`'s estimate, halved for a likely octave error. Operator laid out a future stamina/flow/hype bridge to the career module, not built. 271 tests. `3b93279`. |
| 2026-09-14 (tenth) | Took over another session's in-progress game (`game/`): fixed a blank-page crash (missing DOM ids), cleaned up a doubled-up README draft, verified all three modes in headless Chromium. 262 tests. `23e675b`. |
| 2026-09-13 (parallel: UE-REPLAY-01) | A separate session, per its commit and `Kold_Feet_Summary_report.md`: the native replay verification foundation in `tools/ice-lab/native/` — C++ wire types and an oracle generated from Git objects pinned at `8d89af2` (`/5`), canonical serialization, CRC32 and deterministic math checked under GCC and Clang, CI wiring; no native solver, importer, runner or Unreal host. Merged as PR #4 (`a0ffada`); its report is on `ue-replay-01-foundation` (`effc0e5`). |
| 2026-09-13 (ninth, after the merge) | Merged the moves into `main` and pushed. Then finding 9 on the operator's word: the two-footed stance was proportional-only and aimed at the edge's balance, so it pulled against the lean controller and a 20° two-footed entry at 4 m/s fell. `copRateGain` and `copCommandShare`, 0 in `spec`, on in the presets; standing still bit-for-bit unchanged; replay `/6`; `test/stance.test.ts`. 249 tests. |
| 2026-09-13 (ninth) | The moves, on the operator's redirect toward backward skating and "back crossovers right into the jump": crossovers (`8da3a2a`), three-turn and mohawk (`aee316c`), twizzles (`a282cf7`), spins (`e10e6a7`), the Ina Bauer (`33986ce`), edge and toe jumps from their entries with the approach in the lift (`1e38ad0`). All behind `movesMode`, contained as jumps are; calibrated to `motion-primitives.json`, `spin-positions.json` and `entry-templates.json`. Found: the bible's crossover feet are backwards; a stroke on a curve always halved lateral support; two-footed lean commands lock at maxTilt at 4 m/s. Moves-off proven identical to `/4` over 22,184 ticks at every commit; replay `/5`. Driven in headless Chromium with a fake pad. 244 tests, tsc 7.0.2 clean. Branch `ice-lab-moves`, local, unpushed. |
| 2026-09-11 (eighth) | The skater profile layer, on the operator's direction toward a career game: `sim/profile.ts` — body, blade wear, five stats baked over a preset by `applyProfile`, one balance table and curve, XP pricing, `train`/`overall`/`tierOf`/`level`. Reference skater bakes bit-for-bit to every preset. Stamina listed and inert, recorded by a test. K cycles four samples in the lab. 194 tests, tsc 7.0.2 clean. `00ec259`. |
| 2026-09-11 (seventh) | Closed the sixth's three items: edge changes count choices not strokes (`f1cb2b4`), deterministic sin/cos/tan/atan2/asin/log in `sim/math.ts` with a boundary test banning raw `Math.*` transcendentals and `**` in `sim/` (`0b4636b`), session card `/2` with jumps and a clip digest (`87607af`). Then the game layers: debug camera and chase view, the Figure Eight with best-run ghosts, ghost races on any course, the edge course, the jump challenge from `data/`, and all of it on a pad. Every layer reads state and never writes it, tested; all unreachable in `?playtest=1`. |
| 2026-09-10 (sixth, after push) | Served the lab for the operator's first play sessions. Found the stroke-inflated edge-change metric (measured), the Firefox-vs-Node replay divergence (confirmed by verifying in headless Firefox), and a paste-wrapped clip (repaired losslessly in scratch). No code changed after `34fecd8`. |
| 2026-09-10 (sixth) | Reviewed and finished an uncommitted reskin: skater figure rebuilt on the solver's contacts, new input panel, mirrored COM overlay fixed (`7f113ca`). Then, on the operator's explicit choice over pre-production §1: `sim/jump.ts` (hop + full jumps, off by default and in playtest), `sim/score.ts` from `data/`, Edge Ribbon, edge tone, toe pick and carriage inputs. Replay `/3`, fixture re-recorded with kinematics proven identical. `e` given a numeric 0.80 factor in the calls CSV. 131 tests, tsc 7.0.2 clean. |
| 2026-09-09 (fifth) | Review of an unreviewed six-file draft against the kill-gate experiment, not just the tests. Kept and finished: fall recovery (fresh-press, in place, consumed), knee floor on strokes, C's shared rocker. Reverted: right-stick weight/rocker on A and B, for narrowing the A-vs-B contrast. Failing session test kept its assertions; only the stimulus changed. Replay contract bumped to `ice-lab-f64/2` for the new state field, fixture regenerated with kinematics proven identical. 105 tests. `fb87c52`, rebased onto PR #3. |
| 2026-09-10 | Replay milestone: exact mapped inputs, tuning snapshots, full-state/event digests, bounded five-minute capture, browser playback and a headless verifier. Pause/resume fixed. A 240-tick fixture and PR checks cover the regression contract. 97 tests pass locally on Node 24.19; browser visual QA was blocked by the environment's localhost access restriction. C++/UE5 remains the next port, not an implemented runtime. |
| 2026-09-02 → 03 | Specification completed. D2, D3, D4, D6 closed. Five Artifacts published and mirrored. |
| 2026-09-08 → 09 | `big_reffg.txt` reviewed and committed with its defects recorded. `tools/ice-lab/` built, 56 tests. Six defects found in the engineering package, each captured as a test. D2 re-raised and re-closed. Merged as PR #1 (`fbbf83c`). |
| 2026-09-09 (fourth) | Publishing and playtest prep. Pages workflow, a session collector, CONTRIBUTING with a contributor grant, and three issue templates. Control schemes B and C built, labelled A/B/C blind, `?playtest=1` mode, and the plan's §6 session metrics. An eighth finding: the internal authority holds a lean forever, found because B could not steer. 82 tests. |
| 2026-09-09 (fourth, part one) | Publishing and playtest prep. Control schemes B and C built, labelled A/B/C blind, `?playtest=1` mode, and the plan's §6 session metrics. An eighth finding: the internal authority holds a lean forever, found because B could not steer. 78 tests. |
| 2026-09-09 (third) | First play report on a pad. `app/pad.ts` had applied a per-axis deadzone while its own header described a radial one; fixed, plus fore/aft cross-talk suppression and a second control scheme on M / Back. The root URL served a blank rink and now redirects. 68 tests. |
| 2026-09-09 (second) | The controls. Findings 4 and 5 fixed and a seventh found: the fall test scores a save as a fall. Two new parameters, both defaulting to the spec's behaviour; `validate()` now rejects the assist tier written the wrong way. 64 tests. |

### How the 2026-09-09 session ran, for whoever runs the next one

(The ninth session's shape, 2026-09-13, is at the end of this section.)

The shape that worked: **assess first, recommend once, then build.** The session opened as a
review of `big_reffg.txt`, pivoted to "can this other repo become a game engine", and the useful
move was to answer the question that was asked, then say plainly that the obvious next step
collided with a closed decision — rather than either building the wrong thing or refusing.

The second session's shape was different and worth naming too: **trace, then measure, then
assert.** Every claim in §2.1 finding 4 and 6 came from printing the loop's own variables and the
binding clamp per tick, before any parameter was moved. Two hypotheses died that way in the first
twenty minutes — that the entry failure was a step-command transient (slewing the command changes
nothing) and that the tick-77 collapse was an oscillation (it is a detector firing at 2.6° of lean).
Both would have survived a parameter sweep, and both would have been fixed in the wrong place.

The fifth session's shape: **review a diff against the experiment it serves, not against the
suite.** Every file in the draft type-checked and 81 of 82 tests passed, and two of its three
ideas would still have damaged the month-four gate — by giving scheme A channels §2.1 never gave
it, and scheme B a channel that made it partly A. The brief that made this possible named the
authority order (bible and `data/` over README over `big_reffg.txt`), the invariant (the A/B/C
contrast and the §6 metric definitions), and what "done" meant, then asked for one uninterrupted
pass. The test that failed was protecting a stimulus assumption, not a metric; changing the
stimulus and keeping every assertion is the right move when the mechanic is sound.

The sixth session's shape: **finish what is on the table, then ask once where the plan pushes
back.** The draft was reviewed and committed before anything new began; the request to "continue
building any code in the reference bible" collided with pre-production §1, so the conflict was put
as one question with a recommendation, the operator chose all four options including the override,
and the override was built with containment rather than argued. Data analysis worked best as
*measure the claim in the sim, then report* — the edge-change finding is two numbers, not a theory.
What cost time: reading files the operator had not pointed at (Downloads) before confirming which
files were meant.

The eighth session's shape: **a roadmap stated as prose became one bounded layer.** The operator
listed six future systems in one message; the useful first move was to map each onto what
`params.ts` already had (mass, sharpness, strokePower existed; carve depth and a career state did
not) and recommend the cheapest layer that made every later item a matter of tuning numbers. The
operator picked it and added three asks in the same message; the layer was built, the asks were
written down verbatim (§0) and not started. One cost: the README's measured span was written from
the test's *bounds* before the numbers were run, and had to be corrected — measure, then write.

Two habits worth keeping:

- **Check the repo before believing a document about the repo.** `big_reffg.txt` declares its own
  repository access UNKNOWN and marks everything PENDING AUDIT. The data files were sitting right
  there and answered most of it in about five minutes.
- **When a spec and the project's own reference code disagree, say which wins and why, in the
  code.** `sim/params.ts` carries that table as a comment. Nobody has to re-derive it.

The ninth session's shape: **answer the claim before building the ask.** The operator's redirect came
with a physics claim — backward skating adds speed and angular momentum — and the useful first move
was four measurements (the takeoff's spin split, forward against backward, the stroke both ways, the
data's back pushes) that kept what was right, corrected what was not, and located the real gap (no way
to turn around). The operator then asked for seven things at once; they became six layers, each
measured against the project's own data before its test was written, each proven not to move the
moves-off solver, each committed before the next began. What cost time: a first crossover model that
shared the push's force correctly and still let the curve collapse, because the pushing leg's own arc
demand had never been carried — found by tracing the blade command through the first push rather than
by sweeping; and a browser check driven from the keyboard, whose full-deflection lean put the skater
down before any move could start, until a fake analog pad replaced it.

The second half's shape: **derive the steady state before sweeping the fix.** The two-footed lean went
through four stance variants in sweeps — a rate term (stopped the fall, left the lean 3° short), an aim
at the command (tracked, but stood still only by falling over), an aim scaled by what the edge can carry
(tracked and stood still), and a handover washout (worse). The equation that explained all four — the
stance sitting at its cap, and the command-aimed stance's standstill equilibrium at 27° — took a few
lines once written, and would have ruled out two variants without simulation. Two tests whose stimulus
leaned on the old wobble were re-timed around the new physics with their assertions kept, the fifth
session's rule. And the operator's review at the close turned up three prompting habits worth keeping
in mind for them: a stated goal for the day, a priority order with a definition of done and anything
off-limits (their pad's reset button moved without them asking), and fix-then-ship sequencing.

The tenth session's shape (2026-09-14): **guess, then verify, before the operator ever sees it — three
times running, in three unrelated systems.** A "choctaw" built by symmetry with the bracket, a skirt
built as a flat world-space shape, and a wall bounce's sign were each wrong on the first pass, in three
different ways (a physics claim that didn't hold up, a rendering approach that didn't survive a camera
angle, a dot-product sign that read backwards in English), and each was caught by this session's own
tests or its own screenshot before costing the operator anything. None of the three inefficiencies this
session names below are about that discipline — it held. They are about *scope*: a single message
carrying three substantial, unrelated asks with no stated priority ("more moves, a different look,
walls") turns into real research time on each before any of them can be scoped down to something
buildable, and a design idea (the stamina/flow/hype bridge) landing mid-task competes with whatever is
already in progress rather than opening its own turn. Read on for the review and the vocabulary that
follow from it.
