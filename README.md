# Edgework

**A physics-first figure skating simulation.**
*The ice remembers every line.*

Every metre of travel is the consequence of lean, pressure and edge choice — and every edge
you take is written permanently into the ice beneath you. There is no jump button.

---

> **New here, or picking this up in a later session?** Start with
> [`Hand_off.md`](Hand_off.md) — current state, conventions, artifact URLs, and the three
> things most likely to trip you up.

## Status

**Pre-production. One person, no funding.** The work is
[`tools/ice-lab/`](tools/ice-lab/README.md) — a browser instrument running the blade–ice model —
and it is the work, not preparation for it.

**The gate is fidelity.** The question this repository has to answer next is not whether carving
is fun but whether the model is *right*: does the solver reproduce measurable properties of real
skating — lean against speed and radius, the radius an edge leaves on the ice, the speed a held
edge loses, air time and rotation — within stated tolerances, well enough that a skater, a coach
or a technical specialist recognises it. That question can be answered by one person, offline,
for nothing, so it comes first. Its observables, tolerances, pass condition and what a failure
obligates are specified in [`docs/fidelity-gate.md`](docs/fidelity-gate.md).

**Nothing in the model is validated against real skating yet.** Every number in Ice Lab is
measured and tested against this project's own documents and data. That is internal consistency,
not fidelity, and the difference is the whole of the next phase.

### What exists

- **The instrument.** A deterministic 120 Hz blade–ice solver in TypeScript with zero
  dependencies: carve, balance, stroke and skid, three control schemes on keyboard and gamepad,
  telemetry, session metrics, and a skater profile layer. Jumps — with a single-jump score read
  from `data/` — and the moves (crossovers, the three-turn and mohawk, twizzles, spins, the Ina
  Bauer, jumps from their entries) are in, and **off by default**, each behind its own switch.
- **Replay.** Capture a run, verify it headlessly in another JavaScript engine, and get the first
  tick where two runs diverge. The replay contract is `ice-lab-f64/7`.
- **261 tests** (as of 2026-09-13), all passing.
- **A public build** at **<https://9x25dillon.github.io/KoLd__FEEt.ice_skating_/>**, deployed by
  [`pages.yml`](.github/workflows/pages.yml) on every push to `main` that touches the instrument.
  The tests gate the deploy.
- **CI.** [`ice-lab-checks.yml`](.github/workflows/ice-lab-checks.yml) runs the tests, the build
  and the replay fixture on Node 24 and 26. [`native-replay.yml`](.github/workflows/native-replay.yml)
  builds the native foundation under GCC and Clang.
- **A native foundation**, [`tools/ice-lab/native/`](tools/ice-lab/native/README.md): C++17 wire
  types, math and serialization, checked byte for byte against a pinned `/5` oracle. It is
  **not** a solver. There is no native simulation and no Unreal project.
- **Rink shape.** The ice can be a public rink's slight crown or an old barn's slight bowl, instead of a
  flat sheet (**O** in the lab). The shapes are L3 and flat in every preset.
- **A session collector**, `app/collect.mjs`, with a [runbook](tools/ice-lab/deploy/README.md) for
  putting it on a box. It stores numbers about a simulation and nothing about a person.

### What does not exist yet

- **External evidence.** The validator (`node tools/ice-lab/validate.mjs`) and a case corpus
  (`data/validation/`) exist. Every case that needs published measurement or footage is still a stub,
  and there is no generated fidelity report yet.
- **Parts of the model.** Brackets, rockers, counters and choctaws; spin levels; combinations and
  sequences; stamina. Tracings are drawn but do not yet feed friction or bite back into the solver
  as the bible's §05 requires. The stroke is the bible's semi-analytic push, not a leg model.
- **The runtime.** `KoLdSimCore` is unbuilt, and `src/reference/` is non-compiling specification
  code by design.

### Run it

Node 24.19+ or Node 26, nothing to install:

```sh
cd tools/ice-lab
node --test test/*.test.ts
node app/build.mjs
node app/serve.mjs
```

Open `http://localhost:8123/`, or use the public build. See the
[replay guide](tools/ice-lab/README.md#reproducible-bug-reports) for capturing a run and verifying
it headlessly.

### The studio plan

The design bible and the four phase plans — pre-production → vertical slice → production → beta —
describe a **funded studio scenario**: **~$11.9M** over 30 months to launch. They are kept, whole
and unrevised, as the long-horizon target. They are not the current plan. Content volumes in the
production plan stay provisional until the
[W40 recalculation](docs/production-plan.md#8--the-w40-recalculation) replaces them with
measurements from the slice.

**The Unreal runtime is a downstream consumer of a validated model**, and is deferred indefinitely.
Porting the solver into UE5 before it has been checked against real skating would move
unvalidated numbers somewhere slower to correct.

The decisions inside that scenario still stand. **Engine: Unreal Engine 5.4+** —
[D2 closed](docs/open-decisions.md#d2--engine) on 2026-09-03 — is the engine the runtime will be
built in, when it is built. **Difficulty default: adaptive** —
[D4 closed](docs/open-decisions.md#d4--where-the-difficulty-default-sits) the same day; The Patch
recommends an assist tier from the tracing score it already computes. **Multiplayer:
single-player first** — [D3 closed](docs/open-decisions.md#d3--multiplayer-at-launch) at its
default. **Licensing:** `tools/` is Apache-2.0 —
[D7 closed](docs/open-decisions.md#d7--licence-for-tools) on 2026-09-13.

Two decisions remain open — [D1 budget](docs/open-decisions.md#d1--budget-and-team-size) and
[D5 disciplines](docs/open-decisions.md#d5--disciplines-at-launch) — and they are really one
conversation: if the $18–25M envelope is development-only, the ~$6M of headroom buys exactly the
second discipline D5 asks about. Neither blocks the fidelity work.

---

## Read the design bible

| | |
| --- | --- |
| **📖 Rendered** | [Published document](https://claude.ai/code/artifact/58f6234d-6ece-4f55-8fc5-2b7a7ce86da9) — with diagrams, syntax-highlighted code, light/dark |
| **📄 Markdown** | [`docs/design-bible.md`](docs/design-bible.md) — the reviewable, diffable copy |
| **🧪 Pre-production** | [`docs/pre-production-plan.md`](docs/pre-production-plan.md) · [rendered](https://claude.ai/code/artifact/531a5952-fcfd-44bf-966a-ae31ce3562c9) — 16 weeks, 8 people, and the kill gate |
| **🌀 Level features** | [`docs/level-features.md`](docs/level-features.md) — how spins and step sequences earn levels 1–4 |
| **🧭 Composer solver** | [`docs/composer-solver.md`](docs/composer-solver.md) — planning the skating between elements |
| **🏗 Vertical slice** | [`docs/vertical-slice-plan.md`](docs/vertical-slice-plan.md) · [rendered](https://claude.ai/code/artifact/dde9b2ad-4d31-412f-a15e-6edbb6cc305a) — 24 weeks to the production green-light |
| **🚂 Production** | [`docs/production-plan.md`](docs/production-plan.md) · [rendered](https://claude.ai/code/artifact/6a36f22c-3ed6-4439-828b-cd14759ebaca) — 48 weeks, content trains, the cut list, alpha |
| **🚦 Beta** | [`docs/beta-plan.md`](docs/beta-plan.md) · [rendered](https://claude.ai/code/artifact/bdd4ebbf-b24e-4b31-bcf3-9afdce6a4e53) — 20 weeks, text lock, cert, the ship gate |
| **❓ Open calls** | [`docs/open-decisions.md`](docs/open-decisions.md) — seven decisions that change the shape of the project |

The phase plans are the funded studio scenario described [above](#the-studio-plan).

---

## What is in here

```
tools/ice-lab/             The current work — see its README
  sim/                     The solver: pure, deterministic, written to be transcribed to C++
  app/                     The browser rig, build, local server and session collector
  replay/                  Headless replay verification
  test/                    261 tests
  native/                  C++17 wire, math and serialization foundation — not a solver
  deploy/                  systemd unit, Caddyfile and runbook for the collector
docs/
  design-bible.md          The full specification — 10 sections, ~16k words
  pre-production-plan.md   16-week feel prototype, playtest protocol, kill gate
  vertical-slice-plan.md   24-week slice, cost model, production green-light gate
  production-plan.md       48-week build: content trains, cut list, alpha gate
  beta-plan.md             20 weeks to cert: text lock, bug curve, ship gate
  level-features.md        Spin and step level detection: declared vs observed
  composer-solver.md       Transition planning: lattice search, time fit, chaining
  open-decisions.md        Decisions D1–D7 + known specification gaps
  fidelity-gate.md         The near-term gate: observables, tolerances, pass condition
  web/                     The five rendered documents (open in any browser)
data/
  scale-of-values.csv      Jump base values and GOE steps
  jump-definitions.csv     Takeoff edge, foot, toe assist, edge-callability per jump
  spin-step-values.csv     Spin and step sequence values by level
  calls-and-deductions.csv Technical panel calls with their simulation thresholds
  segment-rules.csv        Durations, PCS factors, well-balanced program requirements
  spin-positions.json      19 positions: difficulty, pose tolerance, inertia scale
  spin-features.json       11 spin level features and their detection requirements
  step-features.json       Turn taxonomy, variety ladder, step sequence features
  motion-primitives.json   The move vocabulary the transition solver searches over
  entry-templates.json     Per-element required approaches (the solver's goal regions)
  assist-tiers.json        Assist tier parameters and the D4 tracing router
src/reference/
  SkateSolver.cpp          The carve solver — the heart of the game
  JumpResolver.cpp         Load → air → land, with technical-panel rotation accounting
  ScoreCalculator.cs       ISU scoring: base values, nine-judge GOE, PCS, deductions
  SkaterAnimDriver.cpp     Layered animation selection + warping chain
  SpinResolver.cpp         The segment model and spin level-feature detection
  TransitionSolver.cpp     Lattice A*, time fitting, whole-program DP chaining
.github/
  workflows/               Ice Lab checks, native foundation, GitHub Pages deploy
  ISSUE_TEMPLATE/          Bug, play report, tuning session
```

The reference code is **specification as code** — it does not compile, and that is
deliberate. See [`src/reference/README.md`](src/reference/README.md). Where Ice Lab has measured
something the reference got wrong, the correction is recorded in the
[Ice Lab README](tools/ice-lab/README.md#what-it-found).

The scoring data is deliberately **not** in code. The ISU revises its Scale of Values most
seasons, so a rules change should be a data patch shipped in days, not a code release. See
[`data/README.md`](data/README.md).

---

## The short version

**Three pillars.**

1. **Edges, not buttons.** Analog lean (left stick) and analog knee pressure (right trigger)
   drive a real blade-contact model. Turn radius is emergent from `tan θ = v²/(g·r)`, not a
   tuned turn rate. A jump is: correct entry edge → compress → release. The release *is* the
   takeoff.
2. **Programs are authored.** The Composer is a choreography editor over your own music, with
   a transition solver that generates the connective skating. Then you go and skate it.
3. **The ice keeps the record.** Blade tracings accumulate on the surface, change its friction,
   and read afterwards as a drawing of everything you did.

**Three technical keystones.**

- **Everything about a jump is decided at takeoff.** `t_air`, height and angular momentum are
  fixed at the instant you leave the ice. In flight the only lever is moment of inertia —
  because that is the only lever a real skater has. Fatigue raises the I-floor you can pull to,
  which is how stamina and the ISU's 1.1× second-half bonus become the central strategic tension.
- **The game observes physics rather than reading input.** `FElementRecognizer` classifies what
  you actually did the way a technical specialist does. One truth source serves Competition,
  Free Skate, the Composer, replay verification and the AI — and rivals feed inputs into the
  same solver, so they fall for the same physical reasons you do.
- **Singles competition has no simultaneous play.** One skater on the ice at a time removes the
  hardest problem in sports netcode before it starts. The architecture exploits this rather than
  ignoring it.

These are the design. What Ice Lab implements of them today is listed under [Status](#status).

**And one honest risk.** No shipped game has used analog lean plus analog knee as its primary
verb. The studio plan meets that with a kill gate at month four — *"is carving fun with no jumps,
no score and no art?"* — which needs twenty external playtesters and a budget, and stays in the
plan. The question underneath it comes first and costs nothing to ask: whether the carving is
*correct*. A model that is wrong about the ice cannot be rescued by being fun, and a fun model
that is right is the only one worth porting.

---

## Licensing

This repository is **dual-licensed**, because the design documents and the reference code want
different things.

| What | Licence | Why |
| --- | --- | --- |
| `docs/` — the design bible and all prose | [**CC BY-NC-ND 4.0**](LICENSE) | Read it, share it, quote it with attribution. You may not use it commercially or publish modified versions. |
| `src/` and `data/` | [**Apache-2.0**](LICENSE-CODE) | Use it freely, including commercially. Includes an express patent grant, which matters for physics and scoring algorithms. |
| `tools/` — Ice Lab, the working solver and its tuned constants | [**Apache-2.0**](tools/ice-lab/LICENSE) | Same terms as `src/`. The instrument is meant to be run, checked and corrected by anyone, and a licence cannot fence off the constants anyway — they are numbers, and every build ships them to the browser. |

**Why not MIT or Apache for everything?** Because the design bible is the asset. Licensing it
permissively would let anyone build and sell this game from the blueprint. The reference code
is illustrative and costs nothing to give away; the document is not. Ice Lab is the same bargain
from the other side: its value is in being checked against real skating, and that needs it open.

**Why not All Rights Reserved?** Because this repository is public, and GitHub's Terms of
Service already grant every GitHub user the right to view and fork public repositories
regardless of what a licence file says. CC BY-NC-ND states the actual boundaries explicitly and
is a real, well-understood licence rather than an ambiguous assertion.

**What this does not do.** Copyright protects the *expression* — the specific text of this
document — not the *ideas* in it. Game mechanics, rules and systems are generally not
copyrightable. This licence stops someone republishing or selling the bible; it does not stop
someone independently making a figure skating game with lean-based carving. Protecting the
*name* "Edgework" is a trademark question, separate from anything here, and worth resolving
before any public announcement.

Not legal advice. If the project takes outside money or acquires collaborators, get a lawyer to
look at this before the first contributor licence agreement.

> Facts are not copyrightable, so the ISU-derived values in `data/` are not claimed as original
> work. They are transcriptions of published sport regulations, reproduced for interoperability,
> and must be verified against current ISU publications before content lock.

© 2026 Dillon ([@9x25dillon](https://github.com/9x25dillon)). Edgework, its design, characters
and world are reserved.
