# Choreography: the skater's animation layer

The owner's ask, 2026-11-06: "make a lot of different falling animations, hand movement
animations that are like ballerina styles, add a bunch of different landing animations for each
different trick, and when they are comboed together they have different animations, and the more
accurate your tricks are or technically performed they are give different landing animations,
there's also different ones for different styles and skater physiques, and any other features
mechanics styles designs and details that an AAA olympic figure skating simulation game would
have ... keep a detailed history leading up to any potentially code destructive or any
programmatic minimizations."

This file is that history. Every decision is logged below in the order it was made, and anything
that replaces, removes or reduces existing behaviour is recorded **before** it is done, with what
the old behaviour was and how to get it back.

## The rules it keeps

From the owner, recorded in earlier sessions and binding here:

- **Falls land her on her hip side and outer thigh, never her front** (falls-and-body-wear). Every
  fall variant below is a way of going down onto the hip; none is prone.
- **Nobody holds arms level for a program** (pose-from-physics). The port de bras keeps the arms
  moving through positions while she glides.
- **Physics first** (owner-likes-emergent-mechanics, pose-from-physics). The trunk's height, the
  lean, the blades, the heading and the jump's air time are the solver's. This layer only shapes
  what the solver leaves free: the arms, the free leg's line, the trunk's bend, the head. Which
  animation plays is chosen from what the physics did (the landing record, the fall reason, the
  speed and spin at the fall), not from a button or a dice roll.
- **Delete nothing.** The layer blends on top of the existing pose. With no plan active the pose
  is exactly the one the clients drew before this work, so nothing they did is lost.
- **Replays look the same.** The choreographer runs on the states the solver produced; a replay
  produces the same states, so it chooses the same animations at the same ticks. Variety comes
  from the tick, never from an unseeded random number.

## Architecture (decision 1, 2026-11-06)

**Decided:** the choosing and timing live in one shared TypeScript module,
`tools/ice-lab/game/choreo.ts`; the clients only play what it hands them.

- The bridge's engine runs a `Choreographer` beside the solver, sampling every tick (and every tick
  of a replay). It sends up to two **plans** in each snapshot (`choreo`): a **base** plan (the port
  de bras while she glides, a spin's or spiral's arm line) and a **top** plan (a landing, a fall, a
  rise, a combination's rebound, the bow).
- A plan is a short keyframe timeline in the skater's body frame (Godot's: x right, y up, z back,
  metres), the frame both the Godot script and the Unreal port already pose in. Its channels are
  the arms (elbow direction and hand point from the shoulder), the free foot, the trunk's bend and
  twist, the head, and, for falls, the whole trunk on the ice.
- The client eases each plan in and out over its blend times and lerps the procedural pose toward
  it by the plan's weight. Event plans (landings, falls) override the base.

**Why not in C++:** a second and third copy (Godot, browser) would follow, untested. In TypeScript
the choices are unit-tested in Node, deterministic, and the same for every client.

**Why plans, not a pose every frame:** frames reach the client unevenly; a timeline it evaluates on
its own clock stays smooth, costs a few hundred bytes when it starts, and plays in a menu preview
where no frames arrive.

## Vocabulary

**Arm positions** (port de bras), authored in the body frame for one arm, x outward:
bras bas, first, demi-seconde, second, allongé second, fifth en haut, the arabesque pair, the
landing check pair (forward arm and side arm), a V overhead, a hand to the heart, a reach up, a low
sweep, a fist, an arm presented to the audience, a wave, braces and flails for trouble, a bow's
sweep. THE POSITIONS ARE AUTHORED (L3), judged from stills, not measured from skaters.

**Styles**, chosen per skater: Classical (ballet: rounded arms, soft wrists, long holds, a curtsey),
Contemporary (asymmetric, flowing, the head following the hand), Athletic (compact and efficient,
a fist on a clean triple), Showman (big lines to the crowd, a wave from the bow).

**Physique**, from the skater's profile and live fatigue: reach (balance and edge control lengthen
the line), steadiness (balance damps the flail), absorb (strength keeps the trunk upright through a
landing), tempo (mass and height), and fatigue (wind and legs lower the arms and slow the phrases).

## History

### 2026-11-06 — decisions before the first line of code

1. **Shared module, plans, blended on top** (above). Nothing in the Godot or Unreal pose code is
   removed: the Unreal port gains a plan player whose weight is zero when no plan is active.
2. **Landing tiers come from the landing record**, not from the judges: `landingQuality`, the
   rotation and edge calls, `twoFoot`, `stepOut`, `fall`. The judges' GOE (which carries panel
   noise) is shown in the element call, never used to choose an animation.
3. **Every jump lands RBO in the sim** (`JUMP_LANDING`), so the landing check is authored relative
   to the support foot: the support-side arm goes to the side, the free-side arm leads forward, and
   the free leg extends behind. A left-foot landing (a hop) mirrors it.
4. **Combinations:** a landing followed by a takeoff within half a second becomes a *rebound* (arms
   gather for the next jump, the free leg stays in); the landing the combo tracker links becomes
   the *combination finale* (a longer hold and the style's flourish).
5. **Falls choose a variant from the fall reason, the speed, the spin and the jump**, all landing
   on the hip side. The existing Unreal fall (down onto the hip, trunk up, then over onto the
   forearm) is kept as the *wash-out* variant, unchanged in its numbers.
6. **The port de bras plays only when she is free to dance**: gliding (no push under way), no move,
   no jump, not fallen, and the balance not being caught. Its weight is the run's arm style
   (game/armfocus.ts), so a Function skater's arms keep working for balance, as that tier promises.

### 2026-11-06 — building it

7. **The port de bras gate was wrong, and was changed on a measurement.** The first draft let a
   phrase begin only with the balance error under 0.08 rad and no push under way. Measured through
   the bridge (free skate, three setups, a gentle carving input): ordinary carving holds 0.20-0.34
   rad of balance error against a 0.35 fall threshold, and a push is under way 35-40% of the time,
   so no phrase ever started. Now a phrase starts below 60% of the fall threshold and is cut above
   85%; a push does not stop it (arms carry a line through crossovers). The client also fades a
   phrase by the existing pose's own balance-catch measure (`Catching`), so balance still wins.
8. **A free foot asked past the leg's reach is pulled back to it** (Unreal port, plan targets only).
   Measured: a landing's line asked 0.91 m of a 0.77 m leg; the knee straightened (5°) but the boot
   was placed 14 cm past the shin's end. Only plan-driven targets are clamped; the existing
   planted-foot path is untouched, so nothing it did changes.
9. **Replays reset the phrase counter.** A replay began on the run's *next* phrase because
   `reset()` kept `phraseIndex`; a bridge test now holds a replay's plans to its run's.

### Existing behaviour this changed (recorded before each change)

- **The landing banner's words** (Unreal `SenseLanding`). Before: `CLEAN LANDING` or
  `FIND YOUR EDGE`, with the rotations and the jump TES. Now, for a jump with a protocol label: the
  jump's name and label (`TRIPLE LUTZ   3Lz<`) and, beneath, the landing's tier, the panel's GOE
  and the element's points. A hop or a fall keeps the old words. Restoring the old line is one
  `Announce` call, kept in the code as the fallback.
- **The shoulders' turn** (Unreal `Pose`). Six uses of `UpperTurn` after its update now read
  `Shoulders = UpperTurn + PlanTwist`; with no plan `PlanTwist` is zero, so the numbers are the
  same as before. `UpperTurn` itself (the eased state) is untouched.
- **The head's aim** adds `PlanChin * 0.17` to its forward offset and `PlanTurn` to its turn: both
  zero with no plan.
- **The wrist's droop** is multiplied by `DroopScale`: 1 with no plan.
- **The fall pose** keeps every one of its numbers; a fall plan lerps from them by its weight. The
  wash-out variant *is* those numbers (a test holds the first key to them).

Nothing was deleted. No physics, params or replay format changed (still /39).

## What a player sees

- Gliding, the arms move through the style's port de bras on the music's beat, giving way to
  balance; spins, spirals and the Ina Bauer carry the style's line (an upright spin's open shape
  fades as the sim draws the arms in).
- Each landing plays its jump's exit at the tier its landing record earned; a combination's inner
  landings gather for the next takeoff and its last is the finale; a caption names the animation
  and the broadcast plate calls the element, its tier, GOE and points.
- Each fall chooses one of eight ways down onto the hip from what the physics did; getting up is by
  the knee, popping up, or slowly, by strength and fatigue.
- A career program or a Composer program ends in the style's bow.
- Wardrobe → Style of movement, and Wardrobe → Movement gallery, which plays every one of these on
  demand.

### 2026-11-06 — the program's end, and the hall

10. **The crowd rises by how good the landing was**, from the landing's own tier (flowing 1.0,
    clean 0.75, tight 0.45, step-out and two-foot 0.25, under-rotated 0.2, fall 0.1; a combination's
    finale 1.0). Before: 1.0 for any clean landing and 0.12 otherwise (main.gd's rule), which stays
    the fallback when the bridge sends no tier.
11. **A career or Composer program now ends in its bow, then the scores** (the kiss and cry): the
    result page opens 9 s after the end instead of 2.5 s; from 3 s the HUD reveals the technical
    score, the program components, the deductions, the total and her place, a line at a time, the
    hall rises by the place and bouquets and plush toys come down from the stands onto the ice
    (AUTHORED counts: 60 for first, 40 second, 26 third, 8 off the podium, 18 for a Composer
    program). Other runs keep main.gd's 2.5 s.
12. **The stills clock** (Unreal `ShotStep`) used to stop whenever no run was playing and no still
    had been taken yet, so a still asked for after a run's end never came and the process never
    quit (found when stilling the bow). It now runs on once started. `-IceScript` drives an
    ordinary run with the smoke test's pad script, for stills of a program skated to its end.
13. **Through the bow and the scores the camera takes the menu's slow orbit** (`Showcase`), so she
    is framed close as a broadcast would; before this, a program's end stayed on whatever camera
    the run used. The reveal holds to 9 s so the total and the place stay up about three seconds.
14. **Air positions by style** (Contemporary a Tano, Showman a Rippon, Classical and Athletic the
    tuck) once a jump has turned past three-quarters of a revolution in the air: a double or more
    in progress, decided by the sim's own rotation. Overhead arms are as close to the spin axis as
    the tuck, so nothing the physics does about inertia is contradicted. The Unreal pose lets this
    one plan through the flight's gate, and lets go of it as she comes down for the ice.
15. **The instant replay.** A program's result names its best-scoring element (`result.highlight`);
    "Watch the highlight" replays the run from its own inputs (the same states), seeks to 1.25 s
    before that element's tick (bridge op `seek`, which carries a replay on without a frame for each
    step), plays it at 0.3x without the music, then returns to the program's own result page. A test
    holds the seek to its tick. Not yet watched live: no scripted pad lands a jump on the ice here.
16. **The judges' marks and the components.** The element call shows the panel's nine GOE marks as
    tiles under it; the kiss and cry's reveal breaks the program components into composition,
    presentation and skating skills (`protocol.components`, sim/pcs.ts's own scores).
17. **Officials in the hall:** a judges' panel of nine (the crowd's own model and shader, so they
    watch her too) at a table behind the boards mid-side, a kiss and cry booth, and the event's
    name over the far boards. Set dressing only; the boards and the ice are unchanged.
