# Hand-off

**Last session: 2026-09-09 (second). Repo state: complete specification, plus one running implementation.**

Read this before touching anything. It covers what exists, what is decided, the conventions that
hold the document set together, and the things most likely to trip you up.

> **This line changed.** Until 2026-09-08 this file said *"zero implementation."* That is no longer
> true: `tools/ice-lab/` is real, runs, and has 81 passing tests. Nothing else has been built.

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
| Implementation | `tools/ice-lab/` — ~4,400 lines, 81 tests, zero dependencies |
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
node --test test/*.test.ts     # 81 pass, ~2 s
node app/serve.mjs             # http://localhost:8123/
```

**Zero dependencies, and keep it that way.** Node 26 strips TypeScript natively and exposes the
stripper as an API (`node:module` → `stripTypeScriptTypes`), which is the entire build step. The
price is **erasable syntax only** — no `enum`, no `namespace`, no constructor parameter properties.
`test/boundary.test.ts` enforces that, and also enforces the rule the UE5 port depends on: `sim/`
never imports `app/`, never touches the DOM, a clock, or `Math.random`.

`tsconfig.json` exists for editors and an optional `tsc --noEmit`. It is the only thing in the rig
that wants anything installed. Tests and build do not need it.

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
| **Collection** | `tools/ice-lab/app/collect.mjs` — serves the rig *and* takes `POST /api/session` into a JSONL file. Zero dependencies, one file, meant for a small box behind Caddy. |
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
   and an edge code whose spelling already matches `data/jump-definitions.csv`.
5. **Verify the ISU data.** `spin-features.json`, `step-features.json` and `scale-of-values.csv`
   are faithful models, not transcriptions, and all carry `verified_against_isu: false`.
6. **Build the protocol validation corpus** — 50 published elements reconstructed against the level
   detector, target ≥85% agreement. Needs Composer v0, so it belongs to the vertical slice.

### Not in the rig, deliberately

Turns and three-turns, spins, jumps, airborne flight, stamina, flow, animation, audio, networking,
and ice-grid feedback — tracings are drawn but do not yet feed friction or bite back into the
solver as the bible's §05 requires. The stroke is the bible's semi-analytic push, not a leg model.

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
| 2026-09-02 → 03 | Specification completed. D2, D3, D4, D6 closed. Five Artifacts published and mirrored. |
| 2026-09-08 → 09 | `big_reffg.txt` reviewed and committed with its defects recorded. `tools/ice-lab/` built, 56 tests. Six defects found in the engineering package, each captured as a test. D2 re-raised and re-closed. Merged as PR #1 (`fbbf83c`). |
| 2026-09-09 (fourth) | Publishing and playtest prep. Pages workflow, a session collector, CONTRIBUTING with a contributor grant, and three issue templates. Control schemes B and C built, labelled A/B/C blind, `?playtest=1` mode, and the plan's §6 session metrics. An eighth finding: the internal authority holds a lean forever, found because B could not steer. 82 tests. |
| 2026-09-09 (fourth, part one) | Publishing and playtest prep. Control schemes B and C built, labelled A/B/C blind, `?playtest=1` mode, and the plan's §6 session metrics. An eighth finding: the internal authority holds a lean forever, found because B could not steer. 78 tests. |
| 2026-09-09 (third) | First play report on a pad. `app/pad.ts` had applied a per-axis deadzone while its own header described a radial one; fixed, plus fore/aft cross-talk suppression and a second control scheme on M / Back. The root URL served a blank rink and now redirects. 68 tests. |
| 2026-09-09 (second) | The controls. Findings 4 and 5 fixed and a seventh found: the fall test scores a save as a fall. Two new parameters, both defaulting to the spec's behaviour; `validate()` now rejects the assist tier written the wrong way. 64 tests. |

### How the 2026-09-09 session ran, for whoever runs the next one

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

Two habits worth keeping:

- **Check the repo before believing a document about the repo.** `big_reffg.txt` declares its own
  repository access UNKNOWN and marks everything PENDING AUDIT. The data files were sitting right
  there and answered most of it in about five minutes.
- **When a spec and the project's own reference code disagree, say which wins and why, in the
  code.** `sim/params.ts` carries that table as a comment. Nobody has to re-derive it.
