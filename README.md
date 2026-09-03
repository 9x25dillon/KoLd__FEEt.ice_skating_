# Edgework

**A physics-first figure skating simulation.**
*The ice remembers every line.*

Every metre of travel is the consequence of lean, pressure and edge choice — and every edge
you take is written permanently into the ice beneath you. There is no jump button.

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
| **❓ Open calls** | [`docs/open-decisions.md`](docs/open-decisions.md) — six decisions that change the shape of the project |

---

## What is in here

```
docs/
  design-bible.md        The full specification — 10 sections, ~16k words
  pre-production-plan.md 16-week feel prototype, playtest protocol, kill gate
  vertical-slice-plan.md 24-week slice, cost model, production green-light gate
  level-features.md      Spin and step level detection: declared vs observed
  composer-solver.md     Transition planning: lattice search, time fit, chaining
  open-decisions.md      Unresolved calls + known specification gaps
  web/index.html         The rendered design bible (opens in any browser)
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
src/reference/
  SkateSolver.cpp          The carve solver — the heart of the game
  JumpResolver.cpp         Load → air → land, with technical-panel rotation accounting
  ScoreCalculator.cs       ISU scoring: base values, nine-judge GOE, PCS, deductions
  SkaterAnimDriver.cpp     Layered animation selection + warping chain
  SpinResolver.cpp         The segment model and spin level-feature detection
  TransitionSolver.cpp     Lattice A*, time fitting, whole-program DP chaining
```

The reference code is **specification as code** — it does not compile, and that is
deliberate. See [`src/reference/README.md`](src/reference/README.md).

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

**And one honest risk.** No shipped game has used analog lean plus analog knee as its primary
verb. There is a real kill gate at month four — *"is carving fun with no jumps, no score and no
art?"* — with the authority to stop the project. Everything else in the bible is downstream of
that question.

---

## Status

Pre-production, month 0. The bible is complete and buildable as written; nothing has been
implemented yet.

**Next artefacts**, in the order they are most useful:

1. ~~Pre-production plan for the feel prototype~~ → [`docs/pre-production-plan.md`](docs/pre-production-plan.md)
2. ~~The spin and step level-feature enumeration~~ → [`docs/level-features.md`](docs/level-features.md)
3. ~~The Composer transition solver~~ → [`docs/composer-solver.md`](docs/composer-solver.md)

All three are written, plus both phase plans. The specification is complete through the
production green-light; the next artefact is a build.

**The nearest deadline is not a build.** [D2 — engine choice](docs/open-decisions.md#d2--engine)
must close in **week 2** of pre-production. Every week it stays open costs two engineers half
their throughput.

---

## Licensing

This repository is **dual-licensed**, because the design documents and the reference code want
different things.

| What | Licence | Why |
| --- | --- | --- |
| `docs/` — the design bible and all prose | [**CC BY-NC-ND 4.0**](LICENSE) | Read it, share it, quote it with attribution. You may not use it commercially or publish modified versions. |
| `src/` and `data/` | [**Apache-2.0**](LICENSE-CODE) | Use it freely, including commercially. Includes an express patent grant, which matters for physics and scoring algorithms. |

**Why not MIT or Apache for everything?** Because the design bible is the asset. Licensing it
permissively would let anyone build and sell this game from the blueprint. The reference code
is illustrative and costs nothing to give away; the document is not.

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
