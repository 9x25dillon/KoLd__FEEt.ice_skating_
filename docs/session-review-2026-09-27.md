# Session review · 2026-09-27

We resumed the double-loop investigation, isolated the facing-versus-travel
problem, and fixed two errors in how the experiment was evaluated. The jump still
falls; today's progress makes its cause and the next experiment more precise.

## Work completed

- Recovered the current project state from the worktrees and latest handoff,
  leaving the shared checkout's uncommitted work intact.
- Added `test/takeoff-orientation.ts` to track body, blade, shoulders and travel
  separately, including an optional tick trace.
- Corrected the landing report to use first contact's incoming velocity. The
  baseline is **115.957° off backward at contact**, versus the previous report's
  107.280° one tick earlier.
- Established that the held takeoff turns body and travel by **87.151° each**.
  That curve contributes no net body rotation relative to its travel direction.
- Corrected the experimental landing check to use actual arrival alignment,
  while retaining the element's separate rotation ledger and under-rotation call.
- Clarified that the published 470.5° reference measures shoulders. See the
  [orientation audit](takeoff-orientation.md) for source links and limitations.
- Added eight regression/diagnostic tests. Three fail against the old landing
  implementation and pass after the correction. A complete mode-off run remains
  byte-identical: trace, result and touchdown budget, 277,945 bytes.

Validation: **42 focused tests**, **20 Godot bridge tests**, TypeScript check,
browser build and the pinned native reference pass. The unrestricted full suite
reports **729 passed / 8 failed**; the eight are the pre-existing backjump (2),
ghost-loop (2), tutorial-air (3) and replay-fixture (1) failures. Some additional
sandbox failures were subprocess restrictions, confirmed by the successful
unrestricted runs. A native-reference pass is not validation of a native solver.

## Key decisions and their owners

1. **User:** resume takeoff orientation relative to travel, then continue toward
   the landing problem. The broader target remains a double loop that emerges
   from the physics and lands.
2. **Assistant implementation decision:** separate world-space curve turn,
   body-relative-to-travel orientation, shoulder rotation and rotation credit.
   They answer different questions and must be measured separately.
3. **Assistant implementation decision:** repair arrival scoring inside the
   existing default-off `rotationCallMode`, with regressions, rather than change
   the takeoff. The existing element ledger still governs the rotation call.
4. **Carried-forward project constraints:** preserve blade grip, hip ceiling,
   tuck and `landingShock`; keep experimental modes opt-in; defer the one-time
   replay `/40` canonicalisation until the physical changes are ready. Today's
   alignment change must be included in that eventual migration.
5. **User, at close:** commit, push and merge today's work, and persist a review
   and next-session handoff. The served play checkout was not changed during
   the investigation; publication status is independently verifiable in Git.

## Unresolved assumptions

- **How facing changes before blade-off:** the held-carve model turns body and
  velocity together. Contact-point motion, slip/pivot and segment motion need
  investigation. No measured target takeoff angle or replacement contact law
  was established today.
- **Shoulder versus blade motion:** airborne trunk twist is frozen in the model.
  The study's shoulder rotation alone cannot determine blade orientation at
  either endpoint or justify assigning the remaining angle to takeoff.
- **Jump identity:** classification currently reads the blade's direction at
  blade-off. A forward-facing exit from a backward loop approach may need entry
  history to preserve loop identity. This has not been implemented.
- **Touchdown dynamics:** lateral velocity is projected onto the blade, yaw spin
  is stopped, and the model does not apply the predicted contact impulse to the
  lean. Correcting a score does not resolve these physical limitations.
- **Calibration and rules:** the hip ceiling and tighter air tuck remain
  assumptions; takeoff credit and pivot treatment remain project policy. The
  measured cohort and current geometric scaling do not validate every body size
  or controller-driven attempt.
- **Replay and reachability:** `/39` is unfinished, the eight known failures
  remain, and an aligned diagnostic pose is not evidence that the controller
  can produce a successful physical takeoff.

## Three concrete efficiency lessons

The assistant-side examples are observed costs in this session. The user-side
suggestions are opportunities to reduce setup and review effort, not measured
evidence that a different prompt would have prevented a bug.

| Observed example | Where Codex could improve | How the user could improve the brief | Example wording |
| --- | --- | --- | --- |
| The initial home-directory search returned more than 1,300 lines; later reads also produced truncated output. Several old handoffs preceded the latest one. | Enumerate matching project directories first, read the worktree list, then inspect the current branch's handoff with bounded searches. | Supply the exact worktree or canonical repository path when resuming among many similar names. | “Continue in `/home/kill/KoLd__FEEt.yaw`; read `Hand_off.md` and check it against `origin/main` first.” |
| The baseline suite first ran inside a subprocess-restricted sandbox. A no-isolation diagnostic run added shared-state failures; unrestricted normal execution finally exposed the eight known failures. | Start from the repository's normal isolated test command, identify sandbox-caused subprocess failures early, and retain the same runner conditions for before/after comparisons. | State whether success means targeted tests, a fully green suite, or no new failures relative to an accepted baseline. | “For this change, require focused regressions, build/typecheck and no new full-suite failures; list the eight known failures separately.” |
| The task began as “continue there”; the investigation uncovered both a diagnostic timing error and a landing-score error, and publishing/review requirements arrived at close. | State a concrete completion boundary at the beginning and distinguish an evaluation fix from a solved physical jump throughout. | Include the desired outcome, constraints and delivery requirements together when already known. | “Investigate facing versus travel, fix proven measurement/scoring errors with regressions, and document the next physical experiment. Preserve grip/tuck/hip settings. Commit, push, merge and update the handoff.” |

A useful reusable brief is: **outcome + starting point + constraints + evidence
of completion + delivery**. Add your observed symptom and a replay path when
available. You can leave routine implementation choices to Codex; naming the
decision that matters most is more useful than prescribing every tool call.

## Vocabulary to use together

- **Observable:** a precisely defined quantity that can be measured. Example:
  “Our observable is blade orientation relative to incoming velocity at the first
  contact tick.” This identifies the body part, reference frame and event.
- **Invariant:** a property that must remain unchanged during a comparison or
  operation. Example: “Keep airborne angular momentum invariant while testing
  landing alignment.” This gives Codex a concrete preservation test.

Suggested opening next session: “Read the latest handoff and orientation audit.
Investigate the physical mechanism that changes blade/body facing relative to
travel during a loop takeoff. Keep grip, hip torque, tuck and landingShock as
invariants. Preserve jump identity from the approach, measure the new observable
at first contact, and distinguish physical reachability from a test-only pose
perturbation.”
