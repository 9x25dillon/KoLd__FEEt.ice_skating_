# The Composer transition solver

**The piece with the most hidden complexity in the design.**

The player places elements on a musical timeline. The solver generates the *skating between
them* — the transitions, which are a third of the Program Component Score and the part of
figure skating that no game has ever modelled.

Data: [`motion-primitives.json`](../data/motion-primitives.json),
[`entry-templates.json`](../data/entry-templates.json).
Reference: [`src/reference/TransitionSolver.cpp`](../src/reference/TransitionSolver.cpp).

---

## 1 · What it does, and what it must never do

The player authors **intent**: an element, a target position on the ice, a musical anchor.
The solver produces a **plan** — an ordered list of motion primitives with a speed profile —
that gets the skater from the end of one element to the start of the next.

> ### The plan is a reference, not a performance
> **The Composer never skates for you.** The plan is rendered as a ghost line on the ice, and
> the player has to go and execute it themselves. Their actual skating is compared against it
> afterwards.
>
> This single constraint relaxes the precision demands enormously. The plan does not need to be
> optimal or even exactly followable — it needs to be *skatable* and *legible*. A solver that
> had to produce the final performance would need to be an order of magnitude better.

The same output feeds `RivalAI`, which *does* execute plans — as a stream of waypoints and
intents fed into the same solver the player drives ([bible §7.1](design-bible.md#71-the-rival-skaters)).
That is why the Composer's v0 is needed for the vertical slice regardless of whether the
player-facing editor ships: **the AI cannot have programs without it.**

---

## 2 · Why this is hard

Each transition must arrive at a specific **foot**, **edge**, **direction**, **position**,
**speed** and **time**, simultaneously. That is a two-point boundary value problem over a
continuous, dynamically constrained state space — and it is why the obvious approaches fail:

| Naive approach | Why it fails |
| --- | --- |
| A* on a position grid | Ignores heading, edge and speed. Produces paths a skater physically cannot follow. |
| Steering behaviours / potential fields | No terminal state guarantee. Arrives *near* the right place in the wrong state. |
| Sampling planners (RRT*) | Non-deterministic, and shared programs must replan identically on every machine. |
| Search with time in the state | State space explodes by another two orders of magnitude, and buys nothing the time-fitting pass below cannot do afterwards. |
| Search over the animation database | Conflates two questions. The animation layer already handles arbitrary carve radii by warping, so it should *follow* the plan, not constrain it. |

> **A correction to the bible.** [§09A](design-bible.md#a--the-composer) describes the solver as
> "an A* search over the motion-matching database." That is imprecise. The search is over a
> **motion-primitive lattice in physics space**; the motion-matching database follows the
> resulting trajectory via orientation and stride warping. The distinction matters: the animation
> database is not a constraint on what is skatable, and treating it as one would make the plan
> quality hostage to mocap coverage.

There is also a constraint that only appears when you look at the whole program: **transitions
are not independent.** Exit speed chains into entry speed, stamina is a global budget, and ice
coverage is a global goal. Solving each transition greedily produces a skater who is exhausted
by the second half — which is exactly where the 1.1× bonus lives.

---

## 3 · The three moves that make it tractable

### Move 1 — Search over primitives, not space

The vocabulary of skating is *already discrete*: strokes, crossovers, three turns, mohawks,
brackets, rockers, counters, twizzles, glides. Each is a **motion primitive** that carries the
skater from one `(foot, edge, direction)` state to another along a known arc, with a known
duration, speed change and stamina cost.

This is a **state-lattice planner**, the standard technique for kinodynamic motion planning,
and skating fits it unusually well because the primitives are not an engineering abstraction —
they are the sport's own vocabulary, already named and already balanced.

The lattice state is:

```
(cellX, cellY, headingBin, speedBin, foot, edgeSign, forward)
  0.5 m     0.5 m    32 bins    8 bins    1 bit    1 bit     1 bit
```

Packed into a 64-bit key. Cell size is chosen so that every primitive moves at least one cell —
finer than that and the search stalls in place.

### Move 2 — Plan to a template, not a pose

The goal is not "be at (x, y) heading θ at speed v on the left back outside edge." It is
**"reach the start of the lutz entry template,"** where the template is a pre-solved, physically
valid run-in: 12 metres of left back outside edge, curvature under 0.06 m⁻¹, at 7.5 m/s.

This turns a needle-thread into a fat target. The dock tolerance for a lutz is ±0.8 m, ±12°,
±0.8 m/s — roughly a thousand times more volume than an exact pose.

It also encodes real skating knowledge as data. The lutz template is the longest and most
curvature-constrained in the game, which is *why* lutzes are entered down the long axis from a
corner — and why a tight approach produces a flutz. The solver rediscovers the sport's
conventional entries because the templates make them the cheap option.

The spin entry template is the only one with a **lower** curvature bound: a spin needs a tight
hook, not a shallow one, because the entry curve is where the angular momentum comes from.

### Move 3 — Separate path from time

Time is deliberately kept **out** of the search state. The search solves geometry; a second pass
fits the clock by rescaling the speed profile within physical limits.

```
Fastest = traverse(path, maximum profile)
Slowest = traverse(path, minimum profile)

target < Fastest  →  infeasible. Diagnose and tell the author. (§8)
target > Slowest  →  surplus time. Spend it (below).
otherwise         →  bisect for the profile that lands on target.
```

The surplus case is where a naive solver embarrasses itself. **A skater dawdling to fill four
seconds looks exactly as bad as it sounds.** So surplus time is spent on skating that earns
something, in a deliberate preference order:

| Priority | Filler | When |
| --- | --- | --- |
| 1 | **Spiral** | Leg stamina below 35%. A spiral has *negative* leg cost — it is rest. Real choreographers build these in for exactly this reason, and the solver discovers the same trick. |
| 2 | **A new turn type** | Variety is unearned score sitting on the table. |
| 3 | **Curved glide** | Extends the line over fresh ice. |
| 4 | **Loop turn** | Burns time, goes nowhere. The last resort. |

---

## 4 · The cost function is the PCS rubric

The solver is not looking for *a* path. It is looking for one a judge would reward. Every term
is lifted from the Program Component Score:

| Term | Sign | Component it serves |
| --- | --- | --- |
| Duration | + | Efficiency |
| Skid — lateral demand exceeding edge bite | + | **Skating Skills** |
| Fresh ice, read from the tracing buffer | − | **Composition** |
| New turn type (diminishing returns on repeats) | − | **Skating Skills**, and step-sequence variety |
| Turn difficulty | − | Skating Skills |
| Turn landing within 80 ms of a musical accent | − | **Presentation** |
| Repeating a lobe direction | + | Composition — alternating lobes read as deliberate |

The fresh-ice term deserves note: it reads the same tracing buffer that draws the visual and
drives the friction model ([bible §09B](design-bible.md#b--the-line--persistent-ice-tracings)).
One system, now serving four purposes.

---

## 5 · The search

**Bidirectional A***. The goal is as tightly specified as the start, so searching from both ends
and meeting in the middle roughly squares down the explored volume. Backward expansion runs the
primitives in reverse.

The heuristic takes the maximum of two admissible lower bounds:

1. A **precomputed distance field** over `(cell, heading) → dock region`, built once per rink at
   load time. This captures something Euclidean distance cannot: arriving with the wrong heading
   costs you a turn.
2. The time to reach the template's required entry speed under maximum acceleration, even
   travelling straight.

Physics enters at successor generation. A primitive is legal only if:

```
curvature ≤ (g · tan θ_max) / v²
```

which says something important about the shape of every plan: **a skater's minimum turn radius
grows with speed.** They are a vehicle whose steering gets *worse* the faster they go — the
opposite of a car. This is why programs look the way they do, with speed built in long corner
arcs and spent in tight footwork.

A crossover additionally requires an engaged edge, so it is rejected on a straight line. Not
inefficient — impossible.

---

## 6 · Whole-program chaining

Per-transition planning is the inner loop. The outer loop makes the program coherent.

1. For each transition, generate **K diverse candidates** (K ≈ 6) — different speed profiles,
   different lobe patterns, different costs.
2. Dynamic-program over `(transition index, speed bin, stamina bin)` to select one candidate per
   transition such that exit speeds chain, the stamina budget survives to the end, and global
   coverage holds.

The DP grid is small enough to be exhaustive: ~12 transitions × 8 speed bins × 10 stamina bins
× 6 candidates is a few thousand relaxations.

The important subtlety is that the DP charges **the element that follows** each transition, not
just the transition itself. If that element is a jump in the second half carrying the 1.1×
bonus, the DP protects it — it will spend more on an earlier transition to arrive at the bonus
jump with legs left. That is the strategic tension from [bible §2.8](design-bible.md#28-stamina-and-fatigue)
appearing, unprompted, in a planner.

---

## 7 · Diagnostics: never just say "no path"

A solver that reports failure is useless to an author. Recover the reason by **relaxing one
constraint at a time and re-solving.** Whichever relaxation rescues the plan *is* the
explanation, and it arrives with a number attached.

| Relaxation | Message |
| --- | --- |
| Time | *"The 3A at 1:42 needs 2.4 s more approach. Move it later, or shorten the preceding spin."* |
| Entry speed | *"3Lz needs 7.5 m/s; only 6.1 m/s is reachable in this gap."* |
| Stamina | *"Projected leg stamina is 18% short here. Add a spiral, or move a jump earlier."* |
| Curvature | *"The lutz entry cannot be held this shallow from that position — lip/flutz risk."* |
| Ice region | *"This approach needs the long axis, which the preceding step sequence occupies."* |

Constraint relaxation for diagnostics costs one extra solve per candidate explanation, which is
affordable precisely because it only runs on failure.

---

## 8 · Determinism and sharing

Programs are shared and must replan **identically on every machine**
([bible §5.2](design-bible.md#52-music)). That requires:

- Deterministic tie-breaking in the priority queue: order by `(F, then G, then state key)`, never
  by insertion order or pointer address.
- No sampling, no randomness, no floating-point ordering dependence — the same discipline as the
  simulation core ([§6.3](design-bible.md#63-networking)).
- A **solver version tag** in every shared payload.

The shared payload is the **intent** (elements, anchors, target positions) plus a compact
embedded fallback plan. On receipt:

- Solver versions match → re-solve locally. Small payload, and the program improves as the solver
  does.
- Versions differ → use the embedded plan, and mark the program as authored under an older
  solver.

---

## 9 · Performance

This runs in an editor, interactively. The player drags an element and expects the line to move.

| Operation | Budget | Approach |
| --- | --- | --- |
| Single transition re-solve | **< 100 ms** | Bidirectional A* with the heuristic LUT; node budget cap with graceful degradation to the best partial plan. |
| Element nudged | < 150 ms | Only the two adjacent transitions change. Re-solve those, re-run the DP (which is microseconds). |
| Full program solve | < 2 s | 12 transitions × 6 candidates, parallel across transitions. |
| Diagnosis on failure | < 400 ms | Five relaxed re-solves, short-circuiting on the first success. |

Transitions are cached by `(start state, goal template, ice hash)`, so scrubbing the timeline
back and forth is free.

---

## 10 · Incremental delivery

| Version | Ships | Scope |
| --- | --- | --- |
| **v0** | Vertical slice | Single transition, no time constraint, cost = duration only. **Needed anyway** to give AI rivals programs, so the lattice and primitive library are paid for by a system that must exist regardless. |
| **v1** | Launch | Time fitting, the full PCS cost function, DP chaining, entry templates, the player-facing timeline. |
| **v2** | Launch | Diagnostics, slack-filling, live validation against well-balanced program requirements and the Zayak rule. |
| **v3** | +3 months | Sharing: determinism guarantees, version tagging, embedded fallback plans. |
| **v4** | Year one | Two-body planning for pairs — the coupled constraint makes this a genuinely different problem, not an extension. |

---

## 11 · Validation

| Test | Method | Target |
| --- | --- | --- |
| **Feasibility** | Solve the element layouts of 100 real published programs, reconstructed from protocol sheets | ≥ 95% solve without diagnostics |
| **Determinism** | Same input, every target platform, 10,000 solves | Byte-identical plans |
| **Performance** | Fuzz with random layouts, measure the solve-time distribution | p99 under 100 ms for a single transition |
| **Quality** | Blind comparison: solver plans versus choreographer-authored transitions, rated by the skating consultant | Consultant cannot reliably tell them apart on ≥ 40% of pairs |
| **Robustness** | Adversarial layouts — elements stacked in one corner, impossible anchors | Never crashes; always returns either a plan or a specific diagnosis |

The quality test is the one that matters and the one most likely to fail first. A plan can be
optimal against the cost function and still look like a robot skating. If the consultant can
pick out the solver's work every time, the cost function is missing a term — and finding out
*which* term is the real work of v1.

---

*Complexity note: this is the highest-risk system in the game outside the control scheme itself.
It is also the one with the clearest incremental path, because v0 must exist for the AI whether
or not the player-facing Composer ever ships. Build it for the AI first, and the editor becomes
a UI problem rather than an algorithms problem.*
