# Hand-off

**Last session: 2026-09-02 → 03. Repo state: complete specification, zero implementation.**

Read this before touching anything. It covers what exists, what is decided, the conventions that
hold the document set together, and the three things most likely to trip you up.

---

## 1 · What this is

**Edgework** — a physics-first figure skating simulation. Design specification only; no game code
has been written. The repo is a complete plan for a 30-month, ~$11.9M production, plus the
machine-readable data and reference implementations that plan depends on.

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
| Rendered pages | 5, published as Artifacts **and** mirrored in `docs/web/` |
| Decisions | **4 of 6 closed.** D1 and D5 remain |
| Implementation | **None.** Nothing has been built. |

### The two open decisions — and they are one conversation

**D1 (budget/team)** and **D5 (disciplines at launch)** are coupled. The plan totals **$11.9M of
development**; D1's envelope quotes **$18–25M**. If that envelope is development-only, there is
~$6M of headroom, and the honest place to spend it is the second discipline D5 asks about. If it
includes marketing and year-one liveops, the plan fits as written. **Resolve them together, with
whoever holds the money in the room.**

### What was decided this session

| | Decision | Note |
| --- | --- | --- |
| **D2** | Unreal Engine 5.4+ | Cancelled the pre-production bake-off; W1–2 became a single-engine validation spike |
| **D3** | Single-player first | Default; async ghosts + warm-up lobby at launch, pairs year one |
| **D4** | Adaptive tier routing | *Not* either option the register offered — The Patch recommends a tier from its own tracing score |
| **D6** | No athlete licensing | Closed at first writing |

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

## 5 · Three things that will trip you up

1. **The shell is `fish`, not bash.** No heredocs. `--include=*.md` needs quoting or the glob
   errors. Use `python3 - <<'PY'` for anything multi-line — that works and was used throughout.

2. **Do not write HTML entities into source files.** `src/reference/SpinResolver.cpp` was written
   with `&amp;` and `&lt;` in it and needed an unescape pass. If you have just been authoring an
   HTML page, consciously switch modes before writing a `.cpp`.

3. **Exact-match edits fail across the md/HTML pair.** The same sentence is line-wrapped
   differently in the two formats — e.g. `None, no HUD` (markdown) vs `None, no HUD at all`
   (HTML). **Grep the target file for the actual string before constructing the edit**, rather
   than reconstructing it from what you think you wrote.

---

## 6 · Where to go next

In descending order of value:

1. **Close D1 and D5 together.** Everything else is downstream of the money.
2. **Build the feel prototype.** The specification is finished; the next artefact is a build.
   [pre-production-plan.md](docs/pre-production-plan.md) is executable as written from week 1.
3. **Verify the ISU data.** `spin-features.json`, `step-features.json` and `scale-of-values.csv`
   are faithful models, not transcriptions, and all carry `verified_against_isu: false`. Someone
   with the current ISU Communications should reconcile them.
4. **Build the protocol validation corpus** — 50 published elements reconstructed and compared
   against the level detector, target ≥85% agreement. Needs Composer v0, so it belongs to the
   vertical slice. See [level-features.md §7](docs/level-features.md#7--validating-against-reality).

### Known gaps, all deliberate

Tracked at the foot of [open-decisions.md](docs/open-decisions.md): balance-model tuning constants
(cannot be derived — they come from the feel prototype), crowd reaction propagation timing, career
economy (deferred until the moment-to-moment game is proven), and ice temperature as a career
variable.

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
