# Beta

**20 weeks (W89–108) · 40 FTE · ~$2.97M · four campaigns, not one polish pass.**

Beta is routinely misdescribed as "polish." It is not. It is four largely independent campaigns
running in parallel, each with its own owner, metric and end condition:

| Campaign | Ends when |
| --- | --- |
| **Stability** | Bug find rate stays below fix rate for three consecutive weeks, with zero A-bugs |
| **Balance** | Five assist tiers each pass their own playtest cohort |
| **Compliance** | Certification passed on every platform, ratings granted, accessibility audited |
| **Launch readiness** | Demo shipped, localisation integrated, day-one patch scoped |

Treating these as one activity is why betas slip: the stability curve is a burn-down, balance is a
design problem, compliance is an external dependency with fixed lead times, and launch readiness is
marketing's calendar. They do not trade against each other and cannot be traded against each other.

---

## Contents

1. [The immovable date](#1--the-immovable-date)
2. [Launch timing](#2--launch-timing)
3. [The text lock cascade](#3--the-text-lock-cascade)
4. [The bug curve](#4--the-bug-curve)
5. [Three playtest waves](#5--three-playtest-waves)
6. [Balance across five tiers](#6--balance-across-five-tiers)
7. [Certification](#7--certification)
8. [Accessibility](#8--accessibility)
9. [Week by week](#9--week-by-week)
10. [The ship gate](#10--the-ship-gate)
11. [Risks](#11--risks)
12. [Budget and cumulative cost](#12--budget-and-cumulative-cost)

---

## 1 · The immovable date

Everything in beta is scheduled **backwards from launch**, because three of the four campaigns
have external dependencies with fixed lead times that no amount of effort compresses.

Taking launch as **L**:

| Milestone | When | Why that lead time |
| --- | --- | --- |
| Launch | **L** | |
| Gold master / final deploy | L − 4 weeks | Digital deployment and any physical manufacturing |
| Certification pass | L − 5 weeks | |
| Cert submission, attempt 2 | L − 8 weeks | **Budget two attempts. First-pass cert failure is the default assumption, not the pessimistic one.** |
| Cert submission, attempt 1 | L − 12 weeks | Platform holders take 2–4 weeks to respond |
| Code lock / release candidate | L − 13 weeks | |
| Content lock | L − 16 weeks | |
| **Text lock** | **L − 22 weeks** | 8 weeks translation × 10 languages, 4 weeks integration, 4 weeks LQA, then it must be in the RC |
| Beta begins | L − 27 weeks | |

---

## 2 · Launch timing

Figure skating is a **seasonal sport**, and its audience is seasonal with it. The competitive
calendar runs Grand Prix from October, national championships in December and January, and World
Championships in March. Outside that window the fandom's attention is measurably elsewhere.

**Launch in the November–February window.** A figure skating game released in June is fighting for
attention from an audience that is not currently thinking about figure skating.

There is a second, larger beat available. On the schedule this document set assumes — pre-production
beginning late 2026 — the phases land as:

| Phase | Ends |
| --- | --- |
| Pre-production (16 weeks) | Jan 2027 |
| Vertical slice (24 weeks) | Jul 2027 |
| Production (48 weeks) | Jul 2028 |
| Beta (20 weeks) | Dec 2028 |
| **Launch** | **Feb 2029** |

That lands inside the competitive season, ahead of Worlds. And it puts the **pairs and ice dance
expansion** — already scoped as the year-one drop in [bible §01](design-bible.md#game-modes) — at
roughly November 2029, directly into the build-up to the **2030 Winter Olympics**.

> **Two marketing beats, not one delay.** The instinct will be to hold launch to ride the Olympics
> directly. Resist it: an eight-month hold costs roughly $4M in burn and stales the build. Launching
> into the 2029 season and landing the expansion into the Olympic build-up gets both peaks for the
> price of neither.

---

## 3 · The text lock cascade

**The most under-planned date in any game project**, and the reason it belongs at the front of this
document rather than buried in a localisation appendix.

Text lock falls in **week 6 of beta**. Which means:

> ### For the last 14 weeks of beta, not one word of text can change.
>
> Not a tooltip. Not a tutorial line. Not an error message. Not a commentary line. Not a menu label.
> A single string changed in week 100 invalidates ten translations, their integration, and their
> LQA — and either misses cert or ships untranslated.

| Week | Localisation milestone |
| --- | --- |
| W94 | **TEXT LOCK.** All UI strings, tutorial copy, commentary lines, subtitles, achievement text, legal text final. |
| W94–102 | Translation, 9 target languages |
| W102–106 | Integration and linguistic QA |
| W106 | Loc-complete build feeds the release candidate |

**Languages:** Japanese and Korean first, then Simplified Chinese, French, German, Spanish (LatAm),
Italian, Russian, Brazilian Portuguese. Japanese and Korean are prioritised because they are the
sport's two largest and most engaged audiences — this is not the usual default ordering and it
should not be allowed to drift back to one.

### Practical consequences

- Every string must be in the string table from production P3. A hard-coded string found in week 95
  is a crisis.
- **Commentary is the risk.** An authored line bank is large, and every line is text.
  [Bible §09C](design-bible.md#c--commentary-smaller-high-value) specifies generating that bank
  *offline at content-build time* precisely so it exists early enough to lock.
- Budget a **hotfix string allowance**: ~50 strings for post-lock legal or cert-mandated changes,
  agreed with vendors in advance and priced as a rush.

---

## 4 · The bug curve

The ship criterion is not "zero bugs." It is a **rate relationship**.

```
find_rate = new defects opened per week
fix_rate  = defects verified closed per week

Not shippable while find_rate >= fix_rate.
Shippable when find_rate < fix_rate for 3 consecutive weeks
             AND A-bugs == 0
             AND B-bugs <= 25
```

Crossing over is the real signal that the game has stopped moving underneath the team. A project
where find rate is still climbing in week 100 is not in beta, whatever the schedule says.

| Severity | Definition | At ship |
| --- | --- | --- |
| **A** | Crash, progression blocker, data loss, cert violation, save corruption | **Zero** |
| **B** | A system does not work as designed; major visual or audio break | ≤ 25, all triaged and accepted |
| **C** | Minor functional or cosmetic | Tracked; no gate |
| **D** | Polish and improvement requests | **Deferred to post-launch by default.** Promoting a D is a decision someone signs, not a drift. |

Expect the find rate to *rise* through waves 1 and 2 — that is the playtests working. The curve
should peak around W99 and decline from there. **A find rate that never peaks means the content is
still changing**, which means content lock did not really happen.

---

## 5 · Three playtest waves

Three waves with three genuinely different jobs. Running three of the same test is a common and
expensive mistake.

### Wave 1 · The first hour and the assist ladder — W90–92

**40 testers, 8 per assist tier.** The question: does the ladder work at both ends?

| Cohort | Question |
| --- | --- |
| Show / Club | Can someone who has never played a sim get through The Patch and enjoy a full program? |
| Novice | Is the default tier the right default? |
| Senior / Patch | Does the intended experience satisfy the audience it was built for, or does it just frustrate? |

Measured: completion of The Patch, time to first clean program, drop-off points in the first hour,
and tier switching — **who moves up, who moves down, and when**. A ladder nobody climbs is a ladder
with the wrong rungs.

**Plus one question this wave exists to answer: is the router right?**
[D4](open-decisions.md#d4--where-the-difficulty-default-sits) has The Patch recommend a tier from
the player's tracing score. Router accuracy is `1 − (override rate within the first hour)`, target
**≥ 0.75**. A router overridden by half its players is *worse than a fixed default*, because it has
spent the player's trust to arrive at the same place. If wave 1 shows that, cut the router and ship
Novice — the fallback path already exists and costs nothing to fall back to.

### Wave 2 · Content fatigue — W96–99

**24 testers, 15+ hours each over three weeks, at home.** The question: does it hold?

This is the first test of anything longer than a session. Measured: session count and length over
time, career progression pacing, which rinks and modes get revisited, and whether the Composer
retains anyone beyond the novelty. **The vertical slice explicitly did not test this**, and it is
the last chance to find out that hour twelve is boring.

### Wave 3 · Fresh-eyes blocker sweep — W103–105

**30 testers, unguided, four hours each, on the release candidate.** The question: what breaks that
the team has stopped being able to see?

No tasks, no facilitation, full telemetry and crash reporting. The purpose is A-bugs and
first-impression damage, not opinions. Anyone who has played the game before is excluded.

---

## 6 · Balance across five tiers

**Five assist tiers is five times the balance surface**, and it is routinely scheduled as though it
were one. Each tier gets its own cohort in wave 1 and its own tuning pass.

| Tier | Balance question | Owner metric |
| --- | --- | --- |
| Show | Can it be completed without frustration by someone who does not play games? | First-hour completion ≥ 90% |
| *Router* | *Does the recommendation match where players settle?* | *Accuracy ≥ 0.75* |
| Club | Does it teach, or does it carry? | Tier-up rate within 5 hours ≥ 35% |
| Novice | Is this the right default? | Retention at hour 5 ≥ 60% |
| Senior | Does mastery feel earned rather than arbitrary? | Clean-program rate rising over sessions |
| Patch | Is the ceiling real? | Leaderboard spread, no plateau in the top decile |

The assist ladder is also the game's central accessibility feature, and it was designed in from
[bible §2.1](design-bible.md#21-control-mapping) rather than bolted on in beta. Beta's job is to
verify that claim, not to invent it.

---

## 7 · Certification

An external dependency on a fixed clock. Plan for failure.

**Likely failure causes for this game specifically** — worth testing explicitly rather than
discovering:

- Suspend and resume **mid-program**, mid-jump, mid-spin
- Controller disconnect during an element, and reconnect to the correct state
- Network loss during an async ghost download or a leaderboard submission
- Save corruption across a career spanning many sessions
- Achievement and trophy triggers firing exactly once, including on a repeated element
- Storage-full handling during replay capture
- Accessibility mandates, which now vary by platform and are tightening
- Age rating text and legal screens per territory

**Ratings:** ESRB, PEGI, USK, CERO, and any territory-specific boards. CERO matters more than usual
here given the Japanese audience priority, and its lead time is longer than PEGI's. Submit ratings
material at content lock, not at code lock.

Budget **two submission attempts per platform** and treat a first-pass success as a pleasant
surprise that buys back three weeks.

---

## 8 · Accessibility

Audited in W95 by an external specialist, not self-assessed.

| Area | Commitment |
| --- | --- |
| **Difficulty** | The five-tier assist ladder, available from the title screen, changeable mid-career, no content gated behind any tier |
| **Controls** | Full remapping including analog-to-digital substitution for the trigger channels, adjustable dead zones, hold-to-toggle for every hold input |
| **Visual** | Edge state coded by **shape as well as colour** on the Edge Ribbon (designed that way from the start), scalable UI, high-contrast mode |
| **Motion** | Camera shake, motion blur, and spin-orbit intensity all separately disableable — a game about rotation needs this more than most |
| **Audio** | Full subtitles including commentary, visual indicators for the edge-tone feedback channel, independent mix sliders |
| **Cognitive** | Element callouts, slower tutorial pacing option, no time pressure in Free Skate or the Composer |

The one that matters most and is easiest to get wrong: **the edge-tone audio channel is the primary
feedback for edge quality** ([bible §5.3](design-bible.md#53-sound-effects--the-blade-is-the-lead-instrument)).
A deaf or hard-of-hearing player must have an equivalent visual channel, and that is an Edge Ribbon
feature, not a subtitle.

---

## 9 · Week by week

| Weeks | Focus |
| --- | --- |
| **W89** | Beta begins. Bug triage process live. Wave 1 recruitment. Loc kit prepared. |
| **W90–92** | **Wave 1** — first hour and assist ladder. Ratings material submitted. |
| **W93** | Wave 1 findings actioned. Final tutorial and first-hour revisions — the last window for them. |
| **W94** | **TEXT LOCK.** Translation begins. |
| **W95** | External accessibility audit. Cert pre-submission technical checklist run internally. |
| **W96–99** | **Wave 2** — content fatigue. Career pacing tuning. Performance lock work. |
| **W100** | **CONTENT LOCK.** No new assets. Demo build branches. |
| **W101–102** | Demo polished and shipped for the marketing beat. Loc integration begins. |
| **W103–105** | **Wave 3** — fresh-eyes sweep on the release candidate. |
| **W104** | **CODE LOCK.** Release candidate. |
| **W105** | **Cert submission, attempt 1**, all platforms. |
| **W106** | Loc-complete build. LQA. |
| **W107–108** | Cert response window. Fix-and-resubmit if required. **Beta formally ends W108.** |
| *W109–116* | *Cert attempt 2 if needed → gold → manufacturing → launch.* |

---

## 10 · The ship gate

Signed in W100, before wave 3 data exists.

| # | Criterion | Threshold |
| --- | --- | --- |
| 1 | **A-bugs** | Zero, verified closed |
| 2 | **B-bugs** | ≤ 25, each individually triaged and accepted by name |
| 3 | **Bug curve** | Find rate below fix rate for **three consecutive weeks** |
| 4 | **Performance** | At target on every SKU, worst-case scene, sustained over a 30-minute session |
| 5 | **Certification** | Passed on every platform |
| 6 | **Localisation** | All 10 languages integrated and LQA-signed |
| 7 | **Accessibility** | External audit findings closed or formally accepted |
| 8 | **Endurance** | 100 aggregate hours with zero crashes and zero progression blockers |
| 9 | **Balance** | All five assist tiers pass their wave 1 metric (§6) |

### Decision rule

| Outcome | Condition | Action |
| --- | --- | --- |
| **SHIP** | All nine | Gold. Day-one patch scoped for the accepted B-bugs. |
| **SLIP** | 1, 3, 5 or 8 fails | **Slip the date.** These four are not negotiable, and shipping through them produces a launch-week reputation problem that outlives any schedule saving. Six-week slip granularity, because anything shorter re-collides with cert lead times. |
| **SHIP WITH PATCH** | 2, 4, 7 or 9 fails narrowly | Ship, with the gap named publicly and a dated patch commitment. Acceptable exactly once and never for accessibility. |

---

## 11 · Risks

| # | Risk | P | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| 1 | **Text changes after lock.** One tooltip rewrite in W99 cascades through ten languages. | **High** | Major | Text lock is a build-breaking constraint, not a convention: string table frozen in source control with a required sign-off to modify. 50-string hotfix allowance pre-negotiated with vendors. |
| 2 | **Cert fails twice.** | Med | Major | Two attempts budgeted; internal pre-cert checklist run at W95, six weeks before submission, against the specific failure list in §7. |
| 3 | **Find rate never peaks**, meaning content is still moving. | Med | **Fatal to the date** | Content lock enforced at W100 with no exceptions. If the curve has not peaked by W102, the date slips — the curve is the honest signal and the schedule is not. |
| 4 | **Wave 2 reveals the game is boring at hour twelve.** | Med | Major | It runs at W96, deliberately early enough that career pacing and content unlock ordering can still be retuned. Data, not assets, is the lever — which is why the scoring and progression systems are data-driven throughout. |
| 5 | **Five-tier balance is under-resourced** and Show tier ships unplayable for its audience. | Med | Major | Dedicated cohort and metric per tier from wave 1. Show and Club get equal weight to Senior, which is not the instinct of a team that loves the hard version. |
| 6 | **Beta team burnout.** Twenty weeks of triage after twelve months of production. | **High** | Major | No crunch mandate. QA surge staffing rather than overtime. The Wednesday Session continues as the one non-triage ritual. Post-launch leave scheduled *before* launch, not after. |
| 7 | **The demo eats three weeks** it was not budgeted. | Med | Moderate | It branches at content lock and is scoped as one week of one team, not a parallel product. If it needs more, it does not ship. |

---

## 12 · Budget and cumulative cost

| Line | Cost |
| --- | --- |
| 40 FTE × 5 months, loaded (includes 10 surge QA) | $2,400,000 |
| Localisation: 9 languages, translation + integration + LQA | $260,000 |
| Compatibility lab and additional device testing | $120,000 |
| Certification fees and ratings boards | $60,000 |
| Demo build and marketing beat support | $90,000 |
| Wave 1–3 playtesting | $40,000 |
| Hardware, infrastructure | $40,000 |
| **Total** | **~$3,010,000** |

### Cumulative development cost

| Phase | Cost |
| --- | --- |
| Pre-production | $0.47M |
| Vertical slice | $1.95M |
| Production | $6.47M |
| Beta | $3.01M |
| **Total to launch** | **~$11.9M** |

> **Reconciling with [D1](open-decisions.md#d1--budget-and-team-size).** That decision quotes
> $18–25M for the project. This document set totals **$11.9M of development**. The difference is
> launch marketing, year-one live operations and the pairs expansion — which is the right way to
> hold those numbers, since development cost is knowable from a plan and marketing spend is a
> decision made against a finished game. If the $18–25M envelope is being treated as
> development-only, the project has roughly $6M of headroom, and the honest place to spend it is
> [D5](open-decisions.md#d5--disciplines-at-launch) — a second discipline at launch.

---

## After launch

Out of scope for this plan, and named only so it is not forgotten in the schedule:

- **Day one:** the patch is already scoped from the accepted B-bugs. Ship it on day one, not week two.
- **Weeks 1–4:** live incident response, server scaling for Composer sharing, first balance hotfix.
- **Season 1** (~month 3): the first content drop. Rinks cut in production return here first.
- **Year one** (~Nov 2029): **pairs and ice dance**, timed into the Olympic build-up (§2).

---

*This completes the phase plan series: [pre-production](pre-production-plan.md) →
[vertical slice](vertical-slice-plan.md) → [production](production-plan.md) → beta.
Volumes in the production plan remain provisional until its
[W40 recalculation](production-plan.md#8--the-w40-recalculation).*
