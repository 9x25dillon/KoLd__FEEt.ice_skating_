// tools/ice-lab/sim/params.ts — every number the rig can be tuned by.
//
// WHERE THE DEFAULTS COME FROM, AND WHY IT MATTERS WHICH.
//
// The engineering package (big_reffg.txt) and the design bible do not agree on
// several of these, because the package was written without repository access
// and marked its own numbers ASSUMPTION. The bible and src/reference/SkateSolver.cpp
// are the project's own, so they win:
//
//   quantity        bible / SkateSolver.cpp   package        taken
//   rocker radius   2.05 m                    2.2 / 2.4 m    2.05
//   mu_skid         0.35                      0.03           0.35
//   max lean        1.13 rad (65 deg)         1.05 / 0.96    1.13
//   air drag        rho 1.29, CdA 0.495       1.2, 0.45      bible
//
// The bite model (c0 + c1 sin|theta|) has no counterpart in the bible, which
// says only that the edge "lets go", so those two constants are the package's
// and are the first thing this rig exists to tune.
//
// EVERY VALUE HERE IS A LEVER, NOT A MEASUREMENT. The point of the rig is that
// they move.

export interface Params {
  // ── blade geometry ────────────────────────────────────────────────────────
  /** Longitudinal rocker radius, m. Bible: 1.8-2.4, tighter toward the front. */
  rocker: number;
  /** Effective rocker at the toe, as a fraction of `rocker`. SkateSolver: 0.55. */
  rockerToeFraction: number;
  /** Where along the blade the tighter front rocker starts to come in. */
  rockerToeOnset: number;
  sharpness: number;

  // ── ice ───────────────────────────────────────────────────────────────────
  iceHardness: number;
  /** Longitudinal glide friction, steel on fresh ice. */
  muGlide: number;
  /** Extra longitudinal mu per (1 - cos theta): a deep edge costs speed. */
  muEdgeGain: number;
  /** Longitudinal mu once the edge has let go and the blade is shaving. */
  muSkid: number;
  airDensity: number;
  cdA: number;

  // ── bite: the lateral holding capacity of an edge ─────────────────────────
  /** Flat-blade lateral mu. F_bite = N (c0 + c1 sin|theta|) * sharpness * hardness. */
  biteC0: number;
  /** Per sin|theta|. Above ~1 this is mechanical interlock, not Coulomb friction:
   *  the edge is cutting a groove and pushing against its wall. */
  biteC1: number;
  /** demand/capacity above which a held edge is reported as a Carve. */
  carveDemand: number;

  // ── edge classification ───────────────────────────────────────────────────
  flatThreshold: number;
  flatHysteresis: number;
  depthShallow: number;
  depthDeep: number;
  /** Seconds on an edge before it counts as established. Scoring reads this
   *  timestamp, not the first tick the tilt crossed a threshold. */
  minDwell: number;
  /** m/s dead-band below which forward/backward holds its previous answer. */
  dirSpeedEps: number;

  // ── balance ───────────────────────────────────────────────────────────────
  maxLean: number;
  maxTilt: number;
  /** MUST exceed g or the lean loop is unstable. Validated below. */
  balanceKp: number;
  balanceKd: number;
  /** How far the blade may be tilted away from the body's own lean. This is
   *  ankle, knee and hip, and it is most of what "edge quality" means. */
  angulationLimit: number;
  /** First-order lag on the tilt command, s. Assist tiers shrink this. */
  controlLatency: number;
  /** Arms and free leg: bounded lateral authority with no edge involved. */
  internalGain: number;
  /**
   * Rate term on that same authority, per rad/s of lean rate.
   *
   * The engineering package has no such term, and that omission is why raising
   * `internalMax` makes balance WORSE rather than easier: a proportional gain
   * with no damping is an oscillator, so a bigger ceiling is a bigger
   * oscillation. Arms and a free leg do not work that way — they are swung,
   * and what they are swung against is lean RATE.
   *
   * Zero in `spec`, so the defect stays measurable. Every preset that raises
   * `internalMax` must raise this first.
   */
  internalRateGain: number;
  /**
   * Seconds over which a SUSTAINED internal authority washes out. 0 disables it.
   *
   * Arms and a free leg have finite travel. You can throw them out to catch a
   * wobble; you cannot hold them out to hold a lean, and a model that lets you
   * is a model where the ice is optional. Without this the skater reaches a
   * stable, wrong equilibrium — body held at a shallow lean by the arms, blade
   * steering the other way forever, neither tracking the command nor falling.
   *
   * So the term is high-passed: transients pass through at full strength and
   * anything held decays toward zero, which puts the load back on the edge
   * where it belongs. 0 in `spec`, because that is what the package specifies
   * and every recorded measurement was taken against it.
   */
  internalWashout: number;
  internalMax: number;
  /** Shifting the centre of pressure within the stance, two-footed only. */
  copGain: number;
  /**
   * Rate term on that same stance authority, per rad/s of lean rate: the half
   * of the stance's PD the package never had, as `internalRateGain` is the
   * arms'. Pressure is shifted between the feet against a lean that is moving,
   * not only one that is off.
   *
   * 0 in `spec`, so the defect stays measurable.
   */
  copRateGain: number;
  /**
   * Where the stance corrects the body toward, 0..1: at 0 the lean the edge
   * alone balances, which is the package's; at 1 the lean the skater
   * commands, as far as the edge could carry the stance's load at this speed.
   *
   * At 0 the stance and the lean controller pull against each other: the
   * controller eases the edge to let the body lean in, the stance holds the
   * body up off the edge it has eased, and two-footed they settle short of the
   * command with the stance at its cap — or, entering from upright, the
   * stance's push runs the lean past what the edge can hold and the blade
   * pins at maxTilt. At a standstill the edge can carry nothing, so the stance
   * aims where it always did, and standing still is unchanged.
   *
   * 0 in `spec`, so the defect stays measurable.
   */
  copCommandShare: number;
  /** Guards kappa = a / v^2 at a standstill. */
  minSpeedForCurv: number;
  /**
   * Full deflection of `leanSplit`, in radians of tilt per blade.
   *
   * Inert unless something drives that axis, so `spec` is unaffected and every
   * recorded measurement still measures the same thing.
   */
  splitTiltMax: number;

  // ── stroke ────────────────────────────────────────────────────────────────
  /**
   * Peak push acceleration at a full knee bend, m/s^2.
   *
   * The design bible's stroke is a lateral impulse along the pushing blade's
   * normal, J = m k knee stamina dt, in a two-beat alternation. Stamina is a
   * later system; knee is here.
   */
  strokePower: number;
  /** How far the pushing blade is splayed out of the line of travel, rad. The
   *  propulsive component is F sin(beta) — a blade offers nothing along its
   *  own length, which is why this angle exists at all. */
  strokeBeta: number;
  /** Seconds a single push lasts. */
  strokeDuration: number;
  /** The inside edge the pushing blade rolls onto, rad. A push is made against
   *  an edge, not a flat: the capacity term below would otherwise clamp a
   *  stroke to almost nothing, which is the correct answer to the wrong
   *  question — a skater pushing off a flat blade genuinely goes nowhere. */
  strokeEdge: number;

  // ── legs ──────────────────────────────────────────────────────────────────
  /** How fast the knee command itself can move, 1/s. A leg is not a step
   *  function: without this a knee slammed from straight to deep asks the
   *  spring for more than g of downward acceleration, the normal load goes to
   *  zero, and the solver reports a skater who has jumped. */
  kneeRate: number;
  kneeSpring: number;
  kneeDamping: number;
  maxKneeCompression: number;

  // ── fall ──────────────────────────────────────────────────────────────────
  fallLean: number;
  fallError: number;
  fallErrorTime: number;
  /**
   * How much of the internal authority counts as support when deciding whether
   * the skater is going down, 0..1.
   *
   * The balance-timeout test asks whether the lean is far from the lean the
   * EDGE would balance, and for how long. A skater using their arms and free
   * leg is deliberately away from that lean — so at 0, which is what the
   * package specifies, using the recovery authority is itself scored as
   * falling, and the harder the assist tier the sooner the skater goes down.
   *
   * 0 in `spec`, so that stays measurable. 1 credits it in full.
   */
  fallAuthorityCredit: number;

  // ── jumps ─────────────────────────────────────────────────────────────────
  // sim/jump.ts, after src/reference/JumpResolver.cpp. Every one of these is
  // inert while jumpMode is 0, which it is in every preset: pre-production-
  // plan.md §1 keeps jumps out of what the kill gate evaluates, and the lab
  // additionally forces them off under ?playtest=1.
  /** 0 off, 1 the plan's load-release hop (no rotation, no element), 2 full jumps. */
  jumpMode: number;
  /** Knee input at or above which a compression counts as a load. */
  jumpLoadKnee: number;
  /** Knee input below which a load is released: the release IS the takeoff. */
  jumpReleaseKnee: number;
  /** s. A deep knee held longer than this was a carve, not a load. */
  jumpLoadMax: number;
  /** m/s of vertical velocity at a perfect takeoff. Bible: 2.94 for a clean triple. */
  jumpImpulse: number;
  /** rad/s of spin a full carriage whip puts into an open body at takeoff. */
  jumpWhip: number;
  /** How much of the entry curve's yaw rate becomes rotation. */
  jumpRotBias: number;
  /** kg m^2 about the vertical, arms open and drawn in. Bible: 4.0 and 0.95. */
  inertiaOpen: number;
  inertiaTucked: number;
  /** kg m^2 / s the arms can be drawn in or opened at. */
  inertiaPullRate: number;
  /** s either side of the release a toe strike counts as the pick. Bible: 90 ms. */
  toeWindow: number;
  /** rad/s of lean rate a zero-quality landing kicks into the body. */
  landingShock: number;
  /** Revolutions short that draw q, < and <<; data/calls-and-deductions.csv. */
  callQuarter: number;
  callUnder: number;
  callDowngrade: number;
  /** Takeoff-edge error that draws ! and e; the same file. */
  callEdgeUnclear: number;
  callEdgeWrong: number;
  /**
   * 0..1: how much of the arms a WOUND-UP jump flies for the skater.
   *
   * The operator's direction (2026-09-13): the arms and body positioning are
   * partly automated from the jump's own geometry, more the more assisted the
   * preset, and only after an initiating action — a flick of the wind-up
   * (SkatingInput.windup) against the rotation before the release. Without the
   * flick nothing here runs and the jump is the manual one, bit for bit.
   *
   * With it: the whip at takeoff is at least jumpAssist x the flick, and in the
   * air the carriage is blended jumpAssist of the way toward what the geometry
   * asks — the arms that land the nearest whole revolution (half, for an axel)
   * the takeoff can really reach, opening early to check out when there is
   * rotation to spare (sim/jump.ts `assistedCarriage`).
   * It moves only the moment of inertia, at the arms' own rate: angular
   * momentum is still set at takeoff and conserved, so a takeoff that cannot
   * reach the revolution still comes down short. L3, chosen.
   *
   * spec 0.25, responsive 0.5, assisted 0.8.
   */
  jumpAssist: number;
  /** Wind-up past which a flick counts, 0..1 of the stick. */
  windupThreshold: number;
  /** s before the release inside which the flick still arms the jump. */
  windupWindow: number;

  // ── moves ─────────────────────────────────────────────────────────────────
  // The skating vocabulary beyond the carve: crossovers first. Added on the
  // operator's direction (2026-09-13), over pre-production-plan.md §1 the way
  // jumps were, and contained the way jumps are: 0 in every preset, forced to
  // 0 under ?playtest=1, and every lever below is inert at 0 — so no measured
  // block contains a move, and every number recorded so far still measures
  // the same thing.
  /** 0 the carve-only rig, 1 the moves: crossovers on a curve. */
  movesMode: number;
  /**
   * |blade tilt command| at or above which a push is a crossover rather than a
   * stroke, rad. The bible's A is "a straight stroke on a flat, a crossover on
   * a curve", and data/motion-primitives.json says the solver rejects a
   * crossover "below a minimum heading change, which is physically why you
   * cannot crossover in a straight line". This is that minimum, as a lean.
   */
  crossoverLean: number;
  /**
   * A push made skating backward, as a fraction of the same push forward.
   * data/motion-primitives.json has a back crossover gaining 1.05 m/s where a
   * forward one gains 1.15, and a back stroke 0.60 where a forward one gains
   * 0.75: pushing backward is slightly WEAKER, not stronger. The crossover
   * ratio is taken, since back crossovers are how skaters approach jumps.
   */
  backPushScale: number;
  /**
   * Seconds a turn's pivot takes on the middle of the blade. The blade turns
   * half a revolution about its contact; on the front of the rocker, where it
   * is tighter, it turns faster in proportion — "turns are executed on the
   * rocker" (bible §3.2) — and scrapes for less time.
   */
  turnTime: number;
  /**
   * Friction of a blade scraping across its own path while it pivots: the
   * speed a turn costs is muTurn g |sin a| integrated over the pivot, a the
   * angle between blade and path. Calibrated to data/motion-primitives.json's
   * three-turn, -0.45 m/s at 6 m/s.
   */
  muTurn: number;
  /**
   * A mohawk's second half, on the new foot, as a fraction of a three-turn's.
   * The data has a mohawk at -0.40 m/s against the three-turn's -0.45: the
   * placed foot scrapes less than the pivoting one.
   */
  mohawkScrub: number;
  /**
   * A bracket's whole pivot, against a three-turn's, at the same entry speed
   * and rate. No motion-capture entry exists for it (data/motion-primitives.json
   * has only three-turn and mohawk) — authored from the bible's own difficulty
   * ordering (★★★ against ★), not measured. Above 1: fighting the curve
   * costs more, never less.
   */
  againstTurnScrub: number;
  /** m/s below which there is no edge to turn on. */
  turnMinSpeed: number;
  /**
   * The share of a turn's pivot rate left in the body as rotation a jump can
   * take off with (`spinCarry`). A skater who checks the turn keeps none of
   * it; one who takes off out of it, as a salchow does, keeps some.
   */
  turnCarry: number;
  /** Seconds that carried rotation takes to drain away. */
  turnCarryTime: number;
  /**
   * rad/s a twizzle spins at with the arms in. data/motion-primitives.json's
   * twizzle is two revolutions over 4.5 m at 6 m/s: 16.8 rad/s.
   */
  twizzleRate: number;
  /** The share of that rate lost with the arms held all the way out (carriage 1). */
  twizzleArmsOut: number;
  /**
   * A twizzle's scrape as a share of a turn's (muTurn): it is made on the ball
   * of the foot, a smaller contact than a turn's rocker. Calibrated to the
   * data's -1.0 m/s for two revolutions at 6 m/s.
   */
  twizzleScrub: number;
  /** m/s below which a twizzle cannot start, and half of which ends one. */
  twizzleMinSpeed: number;
  /** Seconds for the stick's steer to bend a twizzle's path. */
  twizzleSteerTime: number;
  /** m/s a spin needs at entry. data/spin-positions.json's basic entries: 3.0. */
  spinMinSpeed: number;
  /**
   * Metres: the lever arm of the entry. A skater hooking into a spin at speed v
   * turns m v arm of travel into rotation about their own axis; the check of
   * the upper body (carriage at the press) is what makes the transfer clean.
   * 0.15 puts a 4 m/s upright entry, arms drawn in, at about 5 revolutions a
   * second and a camel at 2.5.
   */
  spinArm: number;
  /** 1/s: the angular momentum a centred spin loses to blade friction. */
  spinDecay: number;
  /** Extra 1/s of that loss per m/s of drift: "a wobbling spin dies fast". */
  spinTravelDecay: number;
  /** Share of the entry velocity left as drift once the hook has taken the rest. */
  spinTravelKeep: number;
  /** Seconds that drift takes to die away. */
  spinTravelTime: number;
  /** rad/s below which a spin cannot be held and checks out by itself. */
  spinMinOmega: number;
  /** m/s the check-out pushes the skater away onto the back edge. */
  spinExitSpeed: number;
  /** Knee at or above which a spin is a sit, and stick forward at or above which a camel. */
  spinSitKnee: number;
  spinCamelPitch: number;
  /** m/s an Ina Bauer needs: it is a glide, and a slow one falls over. */
  inaBauerMinSpeed: number;
  /**
   * The body side-on to the travel, arms spread and arched back: its drag area
   * as a multiple of `cdA`.
   */
  inaBauerDrag: number;
  /**
   * Friction on the trailing blade, whose foot no one turns out a perfect
   * 180 degrees. With the drag, calibrated to data/motion-primitives.json's
   * Ina Bauer: -1.1 m/s over 6 m at 6 m/s.
   */
  inaBauerScrub: number;
  /**
   * The share of a jump's lift that comes from its approach speed, with the
   * moves on. A takeoff is not a leg pushing up from rest: the skater's travel
   * is blocked by the edge — or, for a toe jump, vaulted over the pick — and
   * part of it turns upward. Anchored per jump to data/entry-templates.json's
   * min_entry_speed_ms for a triple: at that speed a jump rises exactly as
   * `jumpImpulse` says, faster rises higher, slower lower. A toe jump without a
   * clean pick has nothing to vault over and gets none of it. A balance lever,
   * labelled as one.
   */
  jumpSpeedShare: number;

  // ── stamina ───────────────────────────────────────────────────────────────
  // design-bible.md §2.8: two pools, Wind (aerobic) and Legs (anaerobic),
  // draining and recovering at different rates and feeding back into jump
  // height, how tight a spin or jump air position can pull in, how deep an
  // edge still holds, and balance noise. src/reference/SkateSolver.cpp calls
  // UpdateStamina/StaminaGain but never defines either — only one number
  // survives from it (`staminaLegsPerPush`, its own S.LegPool -= 0.011f *
  // Knee) — so the rest is authored from the bible's own table, L2/L3, and 0
  // in every preset the way jumps, moves, music and the ice grid are.
  /** 0 the pools never move and every effect below is inert; 1 they drain and feed back. */
  staminaMode: number;
  /** 1/s: Wind's floor drain just from being on the ice. Bible: "elapsed time... continuously". */
  staminaWindTimeDrain: number;
  /** 1/s per (m/s)^2 of speed: the bulk of Wind's drain at pace. */
  staminaWindSpeedDrain: number;
  /** 1/s recovered while genuinely low-effort. Competes with the drain above; net positive only
   *  once speed and tilt are both low, which is the point. */
  staminaWindRecover: number;
  /** |tiltCmd| at or below which the skater counts as "low-effort", for both pools' recovery. */
  staminaLowEffortTilt: number;
  /** Legs lost per push, scaled by knee depth. Source: SkateSolver.cpp, S.LegPool -= 0.011f * Knee. */
  staminaLegsPerPush: number;
  /** 1/s per radian |tiltCmd| runs past depthShallow: Legs drain from holding
   *  a genuinely DEEP edge, not from ordinary cruising. */
  staminaLegsPerDeepEdge: number;
  /** Legs lost on one jump takeoff, flat, regardless of the jump's size. */
  staminaLegsPerJump: number;
  /** 1/s while spinning with the knee at or past a sit position (`spinSitKnee`). */
  staminaLegsPerSitSpin: number;
  /** 1/s recovered while low-effort — but only when Wind clears the floor below. */
  staminaLegsRecover: number;
  /** Wind must be at least this high for Legs to recover at all: "gated by Wind". */
  staminaLegsRecoverWindFloor: number;
  /** jumpImpulse multiplier at Legs 0. Bible: "Jump height falls... 1.00 -> 0.82". */
  staminaJumpImpulseMin: number;
  /** kg m^2: the tightest inertiaTucked can reach at Legs 0. Bible: "0.95 -> 1.55". */
  staminaInertiaFloorMax: number;
  /** rad subtracted from maxLean and maxTilt at Legs 0. Bible: "maximum sustainable lean -8 deg". */
  staminaMaxLeanLoss: number;
  /** m/s^2: baseline balance-loop noise amplitude, present only while staminaMode is on — 0 in
   *  every preset means the balance loop has no noise at all until this system is turned on. */
  staminaBalanceNoiseBase: number;
  /** Multiplier on that noise at Legs 0. Bible: "Balance noise grows... x1.0 -> x2.4". */
  staminaBalanceNoiseMax: number;

  // ── music ─────────────────────────────────────────────────────────────────
  // sim/music.ts, design-bible.md §2.1, §2.6, §5.2. Off in every preset the
  // way jumps and moves were: 0 here leaves every lever below inert, so
  // nothing measured so far changes.
  /** 0 off, 1 the rhythm layer: beat-timed crossover pushes and accent credit. */
  musicMode: number;
  /** Beats per minute of the assumed track — a game-layer track manifest can override this. */
  musicBpm: number;
  /**
   * s from the tick clock's zero to the track's first beat — the lead-in a
   * real recording almost always has. 0 for the rig's placeholder grid; a
   * track manifest supplies its own, itself an aubiotrack estimate pending
   * hand correction (bible §5.2: "let the player correct the grid by hand").
   */
  musicOffset: number;
  /** Beats to a bar — also this rig's placeholder accent spacing; see sim/music.ts. */
  musicBeatsPerBar: number;
  /** Bars to a phrase; the last downbeat of one is its climax, worth 3x credit. */
  musicBarsPerPhrase: number;
  /**
   * s either side of a beat a crossover's push still counts as on tempo.
   * Authored here, not measured: the bible specifies the mechanic ("each push
   * has a beat window") but not this tolerance. Playtest it (bible §2.6).
   */
  musicBeatWindow: number;
  /** s either side of an accent a turn or landing still earns credit. Bible: 80 ms. */
  musicAccentWindow: number;
  /** A crossover push that misses its beat window, as a fraction of a hit. Bible: 45%. */
  musicMissedPushScale: number;

  // ── hype ──────────────────────────────────────────────────────────────────
  // The operator's own bridge (2026-09-1x): "the stamina, strength, flow
  // state and hype from successive trick landing has to be the bridge
  // between the musical and career parts of the game... engaging more and
  // more assist engines with performance increases." Not in the design
  // bible under this name — authored from that brief, L3 throughout — and
  // deliberately does not wait for flow (bible §2.6), a separate,
  // still-unbuilt system. 0 in every preset, the same convention as
  // everything else here; reads `musicMode`'s own accent events when both
  // are on, but needs neither music nor stamina to function on its own.
  /** 0 off, 1 successive clean landings build hype and it feeds a small assist. */
  hypeMode: number;
  /** Hype added per clean landing (no fall, step-out or two-foot), scaled by landingQuality. */
  hypeLandingGain: number;
  /** Extra share of that gain per consecutive clean landing already in the streak. */
  hypeStreakBonus: number;
  /** Flat bonus when the same landing also earned a musicMode accent (sim/music.ts). */
  hypeMusicBonus: number;
  /** 1/s: hype fades on its own, so a bare meter is not a permanent buff. */
  hypeDecayPerSecond: number;
  /** Share of banked hype a fall costs, on top of resetting the streak. */
  hypeFallLoss: number;
  /** controlLatency multiplier at hype 1: the neuromuscular lag shrinks. */
  hypeControlLatencyMin: number;
  /** internalMax multiplier at hype 1: more recovery authority to spend. */
  hypeInternalMaxGain: number;
  /** angulationLimit multiplier at hype 1: the blade may run a little deeper than the body leans. */
  hypeAngulationGain: number;

  // ── flow ──────────────────────────────────────────────────────────────────
  // design-bible.md §2.6: "a single value in [0,1], integrated continuously".
  // The bible's own rises-with/falls-with table is wider than this models —
  // "alternating lobes", "turns on the beat grid" beyond a flat bonus, and
  // "dead air between elements" are not modelled; README.md says so. Feeds
  // "stamina efficiency" (bible: "high flow means... cheaper to skate well")
  // while both flowMode and staminaMode are on. 0 in every preset.
  /** 0 off, 1 flow is integrated and feeds stamina efficiency. */
  flowMode: number;
  /** Flow gained per second on a real, unskidded, held edge (REGIME.Carve or .Edge) while moving. */
  flowCarveGain: number;
  /** Flow lost per second on a flat blade while moving: "skating on flat feet". */
  flowFlatLoss: number;
  /** Flow lost per second while skidding: "skids and chops". */
  flowSkidLoss: number;
  /** Flow lost per second under MOVING speed: "stopping or coasting straight". */
  flowStopLoss: number;
  /** Flat bonus when a turn's cusp or a jump's landing lands within musicMode's own accent window. */
  flowBeatGain: number;
  /** Local ice condition (sim/ice.ts) at or past this counts as "damaged" for flow. */
  flowDamagedIceThreshold: number;
  /** Flow lost per second on damaged ice past the threshold above, while iceGridMode is on. */
  flowDamagedIceLoss: number;
  /** Wind drain multiplier at flow 1: "cheaper to skate well". */
  flowStaminaEfficiencyMin: number;

  // ── rink ──────────────────────────────────────────────────────────────────
  /**
   * m: the ice at centre ice minus the ice at the side and end boards. Positive
   * is a crown (convex), negative a bowl (concave), 0 a flat sheet — which it
   * is in every preset, and the solver then skips the rink entirely.
   *
   * The shape is h = relief (1 - (x/a)^2 - (y/b)^2) inside the boards and flat
   * beyond them, a and b the half-length and half-width, centred on the origin;
   * the corners sit twice as far from centre height as the board midpoints.
   * Gravity along the ice is -g grad h (sim/blade.ts `rinkSlopeAccel`).
   *
   * It is here because a rink is not a plane, and a glide measured on a shaped
   * one measures the slope as much as the friction (data/validation/README.md,
   * the venue record). Named shapes are in RINKS below. Every value is L3.
   */
  rinkRelief: number;
  /** m, half the rink's length (along x) and width (along y). */
  rinkHalfLength: number;
  rinkHalfWidth: number;

  // ── ice wear ──────────────────────────────────────────────────────────────
  // sim/ice.ts, design-bible.md §3.2: a grid over the rink storing damage and
  // snow, written by every blade pass and read back into friction and bite.
  // The grid itself lives outside Params — an IceGrid, passed into step()
  // explicitly, never a hidden global — so at `iceGridMode` 0, or with no
  // grid passed at all, nothing below is ever read and nothing kinematic
  // changes. 0 in every preset, the way jumps, moves and music are.
  /** 0 the sheet never wears; 1 every blade pass writes it and reads it back. */
  iceGridMode: number;
  /** Local wear a single pass adds, saturating at 1. No data file gives a
   *  rate for this — authored to visibly dull a sheet over a session's worth
   *  of laps, not a single stroke. */
  iceDamagePerPass: number;
  /** Snow per (m/s^2 of skid scrub) x dt: the same excess acceleration
   *  step 5 already scrubs off as speed ("mu_skid * excess * dt is a speed
   *  decrement, which is where the snow comes from"), deposited here instead
   *  of only being spent as a loss. */
  iceSnowPerScrub: number;
  /** Longitudinal glide friction at full wear, blended with muGlide by local
   *  condition. Bible: "rising toward 0.015 on soft or chewed ice." */
  iceMuChewed: number;
  /** Share of bite capacity full wear removes, 0..1: "damage... lowers bite." */
  iceBiteLossMax: number;

  // ── skater ────────────────────────────────────────────────────────────────
  mass: number;
  comHeight: number;
  stanceHalfWidth: number;
  gravity: number;
}

export const DEFAULT_PARAMS: Params = {
  rocker: 2.05,
  rockerToeFraction: 0.55,
  rockerToeOnset: 0.55,
  sharpness: 1.0,

  iceHardness: 1.0,
  muGlide: 0.006,
  muEdgeGain: 0.6,
  muSkid: 0.35,
  airDensity: 1.29,
  cdA: 0.495,

  biteC0: 0.08,
  biteC1: 3.5,
  carveDemand: 0.5,

  flatThreshold: 0.070,     // 4 deg
  flatHysteresis: 0.026,    // 1.5 deg
  depthShallow: 0.21,       // 12 deg
  depthDeep: 0.44,          // 25 deg
  minDwell: 0.12,
  dirSpeedEps: 0.15,

  maxLean: 1.13,            // ~65 deg, where the bible says the blade washes out
  maxTilt: 1.13,
  balanceKp: 39.0,
  balanceKd: 8.0,
  angulationLimit: 0.35,    // 20 deg
  controlLatency: 0.12,
  internalGain: 6.0,
  internalRateGain: 0.0,    // the package has no rate term; see the field comment
  internalWashout: 0.0,     // nor any limit on holding it out; see the field comment
  internalMax: 1.5,
  copGain: 12.0,
  copRateGain: 0.0,         // the package has no rate term here either; see the field comment
  copCommandShare: 0.0,     // nor any aim but the edge's balance; see the field comment
  minSpeedForCurv: 0.5,
  splitTiltMax: 0.35,       // 20 deg apart at full deflection

  strokePower: 3.2,
  strokeBeta: 0.65,          // 37 deg
  strokeDuration: 0.30,
  strokeEdge: 0.35,          // 20 deg

  kneeRate: 3.5,
  kneeSpring: 120.0,
  kneeDamping: 18.0,
  maxKneeCompression: 0.25,

  fallLean: 1.13,
  fallError: 0.35,
  fallErrorTime: 0.35,
  fallAuthorityCredit: 0.0,   // the package credits none of it; see the field comment

  jumpMode: 0,
  jumpLoadKnee: 0.7,
  jumpReleaseKnee: 0.45,
  jumpLoadMax: 1.0,
  jumpImpulse: 2.94,
  jumpWhip: 9.5,             // JumpResolver.cpp
  jumpRotBias: 1.0,
  inertiaOpen: 4.0,
  inertiaTucked: 0.95,
  inertiaPullRate: 11.0,     // JumpResolver.cpp
  toeWindow: 0.09,
  landingShock: 1.5,
  callQuarter: 0.125,
  callUnder: 0.25,
  callDowngrade: 0.5,
  callEdgeUnclear: 0.25,
  callEdgeWrong: 0.55,
  jumpAssist: 0.25,          // the operator's override of spec, like jumps themselves; 0 is the package
  windupThreshold: 0.6,
  windupWindow: 0.6,

  movesMode: 0,
  crossoverLean: 0.21,       // 12 deg: the shallow-edge boundary
  backPushScale: 0.91,       // 1.05 / 1.15, data/motion-primitives.json
  turnTime: 0.30,
  muTurn: 0.20,              // three-turn -0.45 m/s at 6 m/s with glide and drag, data/motion-primitives.json
  mohawkScrub: 0.78,         // mohawk -0.40 m/s, the same file
  againstTurnScrub: 1.35,    // authored, not measured; see the field comment
  turnMinSpeed: 1.0,
  turnCarry: 0.11,           // a three-turn entry worth about a third of a revolution at a full whip
  turnCarryTime: 0.5,
  twizzleRate: 16.0,
  twizzleArmsOut: 0.5,
  twizzleScrub: 0.75,
  twizzleMinSpeed: 2.0,
  twizzleSteerTime: 0.3,
  spinMinSpeed: 3.0,         // data/spin-positions.json entries
  spinArm: 0.15,
  spinDecay: 0.12,
  spinTravelDecay: 0.5,
  spinTravelKeep: 0.12,
  spinTravelTime: 0.6,
  spinMinOmega: 3.0,
  spinExitSpeed: 2.0,
  spinSitKnee: 0.6,
  spinCamelPitch: 0.5,
  inaBauerMinSpeed: 2.0,
  inaBauerDrag: 2.0,
  inaBauerScrub: 0.13,
  jumpSpeedShare: 0.2,

  staminaMode: 0,
  staminaWindTimeDrain: 0.0002,
  staminaWindSpeedDrain: 0.00004,
  staminaWindRecover: 0.0006,
  staminaLowEffortTilt: 0.10,
  staminaLegsPerPush: 0.011,      // SkateSolver.cpp, taken directly
  staminaLegsPerDeepEdge: 0.015,
  staminaLegsPerJump: 0.05,
  staminaLegsPerSitSpin: 0.03,
  staminaLegsRecover: 0.0008,
  staminaLegsRecoverWindFloor: 0.3,
  staminaJumpImpulseMin: 0.82,     // bible §2.8
  staminaInertiaFloorMax: 1.55,    // bible §2.8
  staminaMaxLeanLoss: 0.1396,      // 8 deg, bible §2.8
  staminaBalanceNoiseBase: 0.15,
  staminaBalanceNoiseMax: 2.4,     // bible §2.8

  musicMode: 0,
  musicBpm: 128,
  musicOffset: 0,
  musicBeatsPerBar: 4,
  musicBarsPerPhrase: 8,
  musicBeatWindow: 0.10,
  musicAccentWindow: 0.08,      // bible §2.1, §2.6
  musicMissedPushScale: 0.45,   // bible §2.6

  hypeMode: 0,
  hypeLandingGain: 0.12,
  hypeStreakBonus: 0.15,
  hypeMusicBonus: 0.05,
  hypeDecayPerSecond: 0.03,
  hypeFallLoss: 0.5,
  hypeControlLatencyMin: 0.7,
  hypeInternalMaxGain: 1.3,
  hypeAngulationGain: 1.15,

  flowMode: 0,
  flowCarveGain: 0.35,
  flowFlatLoss: 0.25,
  flowSkidLoss: 0.9,
  flowStopLoss: 0.4,
  flowBeatGain: 0.05,
  flowDamagedIceThreshold: 0.5,
  flowDamagedIceLoss: 0.2,
  flowStaminaEfficiencyMin: 0.6,

  rinkRelief: 0,
  rinkHalfLength: 30,        // a 60 x 30 m sheet
  rinkHalfWidth: 15,

  iceGridMode: 0,
  iceDamagePerPass: 0.004,   // ~250 passes over one cell to fully chew it
  iceSnowPerScrub: 0.05,
  iceMuChewed: 0.015,        // bible §3.2
  iceBiteLossMax: 0.35,

  mass: 55.0,
  comHeight: 0.95,
  stanceHalfWidth: 0.12,
  gravity: 9.81,
};

export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;

/**
 * The same validation UEdgeworkTuningAsset::Bake() will have to do in C++.
 * Returns human-readable reasons, empty when the parameter set is usable.
 */
export function validate(p: Params): string[] {
  const errs: string[] = [];
  if (p.flatHysteresis >= p.flatThreshold)
    errs.push("flatHysteresis must be below flatThreshold, or the classifier has no dead band");
  if (p.balanceKp <= p.gravity)
    errs.push(`balanceKp must exceed g (${p.gravity}) or the lean loop is unstable`);
  if (p.minDwell < 2 * SIM_DT)
    errs.push("minDwell is below two sim ticks, so an edge can be established by rounding");
  if (p.depthShallow >= p.depthDeep)
    errs.push("depthShallow must be below depthDeep");
  if (p.rocker <= 0) errs.push("rocker radius must be positive");
  if (p.mass <= 0) errs.push("mass must be positive");
  if (p.comHeight <= 0) errs.push("comHeight must be positive");
  if (p.maxTilt < p.flatThreshold)
    errs.push("maxTilt is below flatThreshold, so no edge can ever be entered");
  if (p.rockerToeFraction <= 0 || p.rockerToeFraction > 1)
    errs.push("rockerToeFraction must be in (0, 1]");
  if (p.strokeBeta <= 0 || p.strokeBeta >= Math.PI / 2)
    errs.push("strokeBeta must be in (0, pi/2): at zero a push is pure sideways, at pi/2 it is along the blade");
  if (p.strokeDuration < 2 * SIM_DT)
    errs.push("strokeDuration is below two sim ticks");
  if (p.kneeRate <= 0) errs.push("kneeRate must be positive");
  if (p.strokeEdge <= p.flatThreshold)
    errs.push("strokeEdge is at or below the flat threshold, so a push has no edge to bite with");
  if (p.internalWashout < 0)
    errs.push("internalWashout is a time constant in seconds, or 0 to disable it");
  if (p.internalRateGain < 0)
    errs.push("internalRateGain must not be negative: a negative rate term is anti-damping");
  if (p.copRateGain < 0)
    errs.push("copRateGain must not be negative: a negative rate term is anti-damping");
  if (p.copCommandShare < 0 || p.copCommandShare > 1)
    errs.push("copCommandShare is a share, 0..1");
  if (p.fallAuthorityCredit < 0 || p.fallAuthorityCredit > 1)
    errs.push("fallAuthorityCredit is a fraction, 0..1");
  // Measured on this rig, not asserted from theory: with no rate term, raising
  // the ceiling past about 2 m/s^2 costs more in oscillation than it buys in
  // authority. This is the check that stops an assist tier being written the
  // obvious wrong way in a UE5 tuning asset.
  if (![0, 1, 2].includes(p.jumpMode)) errs.push("jumpMode is 0 (off), 1 (hop) or 2 (full jumps)");
  if (p.jumpReleaseKnee >= p.jumpLoadKnee)
    errs.push("jumpReleaseKnee must be below jumpLoadKnee, or a load is released the tick it starts");
  if (p.inertiaTucked <= 0 || p.inertiaTucked > p.inertiaOpen)
    errs.push("inertiaTucked must be positive and no more than inertiaOpen");
  if (!(p.callQuarter < p.callUnder && p.callUnder < p.callDowngrade))
    errs.push("rotation call thresholds must rise q < under < downgrade");
  if (p.callEdgeUnclear >= p.callEdgeWrong)
    errs.push("callEdgeUnclear must be below callEdgeWrong");
  if (p.jumpAssist > 1) errs.push("jumpAssist is a share of the arms, 0..1");
  if (p.windupThreshold <= 0 || p.windupThreshold > 1)
    errs.push("windupThreshold must be in (0, 1]: at 0 a resting stick would arm every jump");
  if (p.windupWindow < 2 * SIM_DT) errs.push("windupWindow is under two ticks");
  if (![0, 1].includes(p.movesMode)) errs.push("movesMode is 0 (the carve only) or 1 (the moves)");
  if (p.turnTime < 4 * SIM_DT) errs.push("turnTime is under four ticks: a pivot needs a cusp to flip at");
  if (p.turnCarry > 1) errs.push("turnCarry is a share of the pivot rate, 0..1");
  if (p.againstTurnScrub < 1) errs.push("againstTurnScrub is against a three-turn's cost, and fighting the curve cannot be cheaper");
  if (p.turnCarryTime <= 0) errs.push("turnCarryTime must be positive");
  if (p.twizzleRate * SIM_DT >= Math.PI / 2)
    errs.push("twizzleRate turns a quarter revolution in a tick, so a cusp could be skipped");
  if (p.twizzleArmsOut >= 1) errs.push("twizzleArmsOut is a share of the rate, below 1");
  if (p.twizzleSteerTime <= 0) errs.push("twizzleSteerTime must be positive");
  if (p.spinTravelKeep > 1) errs.push("spinTravelKeep is a share of the entry velocity, 0..1");
  if (p.spinTravelTime <= 0) errs.push("spinTravelTime must be positive");
  if (p.spinMinSpeed <= 0) errs.push("spinMinSpeed must be positive: a spin from a standstill has no angular momentum");
  if (p.inaBauerDrag < 1) errs.push("inaBauerDrag multiplies the upright drag area: a side-on body has more, not less");
  if (p.jumpSpeedShare > 1) errs.push("jumpSpeedShare is a share of the lift, 0..1");
  if (p.backPushScale <= 0 || p.backPushScale > 1)
    errs.push("backPushScale is a fraction of the forward push, in (0, 1]");
  if (p.crossoverLean < p.flatThreshold)
    errs.push("crossoverLean is below flatThreshold, so a push on a flat blade would count as a crossover");
  if (Math.abs(p.rinkRelief) > 0.05)
    errs.push("rinkRelief is over 5 cm: that is not a rink's shape, it is a hill");
  if (p.rinkHalfLength <= 0 || p.rinkHalfWidth <= 0)
    errs.push("rinkHalfLength and rinkHalfWidth must be positive");
  if (p.internalMax > 2.0 && p.internalRateGain <= 0)
    errs.push("internalMax above 2 with no internalRateGain: a proportional gain with no damping "
      + "makes balance worse, not easier — raise internalRateGain first");
  if (![0, 1].includes(p.musicMode)) errs.push("musicMode is 0 (off) or 1 (the rhythm layer)");
  if (p.musicBpm <= 0) errs.push("musicBpm must be positive");
  if (p.musicOffset < 0) errs.push("musicOffset is a lead-in, seconds from tick zero, and cannot be negative");
  if (p.musicBeatsPerBar < 1) errs.push("musicBeatsPerBar must be at least 1");
  if (p.musicBarsPerPhrase < 1) errs.push("musicBarsPerPhrase must be at least 1");
  if (p.musicBeatWindow <= 0 || p.musicBeatWindow >= 30 / p.musicBpm)
    errs.push("musicBeatWindow must be positive and below half a beat, or every push is on tempo");
  if (p.musicAccentWindow <= 0 || p.musicAccentWindow >= 30 * p.musicBeatsPerBar / p.musicBpm)
    errs.push("musicAccentWindow must be positive and below half a bar, or every landing is an accent");
  if (p.musicMissedPushScale <= 0 || p.musicMissedPushScale >= 1)
    errs.push("musicMissedPushScale is a fraction of a hit, in (0, 1)");
  if (![0, 1].includes(p.hypeMode)) errs.push("hypeMode is 0 (off) or 1 (hype builds and assists)");
  if (p.hypeLandingGain < 0) errs.push("hypeLandingGain cannot be negative");
  if (p.hypeStreakBonus < 0) errs.push("hypeStreakBonus cannot be negative");
  if (p.hypeMusicBonus < 0) errs.push("hypeMusicBonus cannot be negative");
  if (p.hypeDecayPerSecond < 0) errs.push("hypeDecayPerSecond cannot be negative");
  if (p.hypeFallLoss < 0 || p.hypeFallLoss > 1) errs.push("hypeFallLoss is a share of banked hype, 0..1");
  if (p.hypeControlLatencyMin <= 0 || p.hypeControlLatencyMin > 1)
    errs.push("hypeControlLatencyMin is a multiplier that shrinks the lag, in (0, 1]");
  if (p.hypeInternalMaxGain < 1) errs.push("hypeInternalMaxGain cannot reduce recovery authority below its own base");
  if (p.hypeAngulationGain < 1) errs.push("hypeAngulationGain cannot reduce angulation below its own base");
  if (![0, 1].includes(p.flowMode)) errs.push("flowMode is 0 (off) or 1 (flow is integrated)");
  if (p.flowCarveGain < 0) errs.push("flowCarveGain cannot be negative");
  if (p.flowFlatLoss < 0) errs.push("flowFlatLoss cannot be negative");
  if (p.flowSkidLoss < 0) errs.push("flowSkidLoss cannot be negative");
  if (p.flowStopLoss < 0) errs.push("flowStopLoss cannot be negative");
  if (p.flowBeatGain < 0) errs.push("flowBeatGain cannot be negative");
  if (p.flowDamagedIceThreshold < 0 || p.flowDamagedIceThreshold > 1)
    errs.push("flowDamagedIceThreshold is an ice condition share, 0..1");
  if (p.flowDamagedIceLoss < 0) errs.push("flowDamagedIceLoss cannot be negative");
  if (p.flowStaminaEfficiencyMin <= 0 || p.flowStaminaEfficiencyMin > 1)
    errs.push("flowStaminaEfficiencyMin is a multiplier that shrinks Wind's drain, in (0, 1]");
  if (![0, 1].includes(p.staminaMode)) errs.push("staminaMode is 0 (off) or 1 (the pools drain)");
  if (p.staminaWindTimeDrain < 0) errs.push("staminaWindTimeDrain cannot be negative");
  if (p.staminaWindSpeedDrain < 0) errs.push("staminaWindSpeedDrain cannot be negative");
  if (p.staminaWindRecover <= p.staminaWindTimeDrain)
    errs.push("staminaWindRecover must exceed staminaWindTimeDrain, or low-effort gliding never nets a recovery");
  if (p.staminaLowEffortTilt < 0) errs.push("staminaLowEffortTilt cannot be negative");
  if (p.staminaLegsPerPush < 0) errs.push("staminaLegsPerPush cannot be negative");
  if (p.staminaLegsPerDeepEdge < 0) errs.push("staminaLegsPerDeepEdge cannot be negative");
  if (p.staminaLegsPerJump < 0) errs.push("staminaLegsPerJump cannot be negative");
  if (p.staminaLegsPerSitSpin < 0) errs.push("staminaLegsPerSitSpin cannot be negative");
  if (p.staminaLegsRecover < 0) errs.push("staminaLegsRecover cannot be negative");
  if (p.staminaLegsRecoverWindFloor < 0 || p.staminaLegsRecoverWindFloor > 1)
    errs.push("staminaLegsRecoverWindFloor is a share of Wind, 0..1");
  if (p.staminaJumpImpulseMin <= 0 || p.staminaJumpImpulseMin > 1)
    errs.push("staminaJumpImpulseMin is a multiplier on jumpImpulse, in (0, 1]");
  if (p.staminaInertiaFloorMax < p.inertiaTucked)
    errs.push("staminaInertiaFloorMax must be at least inertiaTucked: fatigue cannot pull in tighter than fresh");
  if (p.staminaMaxLeanLoss < 0) errs.push("staminaMaxLeanLoss cannot be negative");
  if (p.staminaMaxLeanLoss > p.maxLean) errs.push("staminaMaxLeanLoss cannot exceed maxLean itself");
  if (p.staminaBalanceNoiseBase < 0) errs.push("staminaBalanceNoiseBase cannot be negative");
  if (p.staminaBalanceNoiseMax < 1) errs.push("staminaBalanceNoiseMax is a multiplier at Legs 0, and fatigue cannot reduce noise");
  if (![0, 1].includes(p.iceGridMode)) errs.push("iceGridMode is 0 (off) or 1 (the sheet wears)");
  if (p.iceDamagePerPass <= 0 || p.iceDamagePerPass > 1)
    errs.push("iceDamagePerPass is a per-pass saturating share, in (0, 1]");
  if (p.iceSnowPerScrub < 0) errs.push("iceSnowPerScrub cannot be negative");
  if (p.iceMuChewed < p.muGlide)
    errs.push("iceMuChewed must be at least muGlide: chewed ice is not slicker than fresh ice");
  if (p.iceBiteLossMax < 0 || p.iceBiteLossMax > 1)
    errs.push("iceBiteLossMax is a share of bite capacity, 0..1");
  return errs;
}

/**
 * What the lab boots on — `responsive`, not `spec`.
 *
 * `spec` is the baseline every measurement is taken against and it stays that,
 * but it cannot enter an edge deeper than 11 degrees at stroking pace, so
 * handing it to someone as their first thirty seconds of the model is not a
 * fair test of anything: it reads as a broken skater rather than as a recorded
 * defect. Press the preset button (T, or X on a pad) to cycle to it.
 *
 * It lives here, not in app/lab.ts, because the fidelity gate makes its claims
 * about this preset (docs/fidelity-gate.md §3) and tools/ice-lab/validate.mjs
 * must read the same answer the public build boots on.
 */
export const BOOT_PRESET = "responsive";

/**
 * Named rink shapes, as `rinkRelief` in metres. The lab cycles them (O) over
 * whatever preset is loaded; every preset itself is flat.
 *
 * ALL L3, and chosen, not measured. The shapes are the operator's field
 * observations: a public rink skated in laps near the boards wears its outer
 * ice down and crowns; an old barn on a thin poured slab settles and bowls. The
 * magnitudes are "barely perceivable", made concrete as the slope's pull at
 * the side boards against flat-glide friction (muGlide g, 0.059 m/s^2 in spec):
 *
 *   flat     0        a competition sheet
 *   public   +4.5 mm  a crown: 2 g relief / halfWidth = 10% of that friction
 *   barn     -9 mm    a bowl: 20% of it, since a settling slab is not bounded
 *                     by wear the way a crown is
 *
 * A measured relief (data/validation/README.md, `surface.relief_mm`) replaces
 * any of these for the case it was measured in.
 */
export const RINKS: Readonly<Record<string, number>> = {
  flat: 0,
  public: 0.0045,
  barn: -0.009,
};

/**
 * Damping ratio of the linearized lean loop, for the tuning panel.
 *
 * Linearizing the pendulum about the commanded lean gives
 *   d2phi = ((g - Kp) phi - Kd dphi) / L
 * so the loop is stable iff Kp > g, with w_n = sqrt((Kp - g)/L). The panel
 * shows this live because "it wobbles" and "zeta is 0.3" are the same fact,
 * and only one of them tells you which slider to move.
 */
export function leanLoopResponse(p: Params): { wn: number; zeta: number } {
  const k = p.balanceKp - p.gravity;
  if (k <= 0) return { wn: 0, zeta: 0 };
  const wn = Math.sqrt(k / p.comHeight);
  return { wn, zeta: p.balanceKd / (2 * Math.sqrt(p.comHeight * k)) };
}

/**
 * Named parameter sets.
 *
 * `spec` is DEFAULT_PARAMS: what the engineering package and design bible say,
 * with nothing tuned. It is the baseline every measurement is taken against.
 *
 * `responsive` is the first tuning pass. It widens the angulation limit,
 * roughly doubles lean damping, gives the internal authority the rate term the
 * package never had, credits that authority in the fall test, and gives the
 * two-footed stance its rate term and its aim at the commanded lean. See
 * test/balance.test.ts and test/stance.test.ts for what each of those buys,
 * measured separately — the gains and the rate terms fix different halves of it.
 */
export const PRESETS: Readonly<Record<string, Params>> = {
  spec: DEFAULT_PARAMS,
  responsive: {
    ...DEFAULT_PARAMS, balanceKd: 16.0, angulationLimit: 0.70,
    internalRateGain: 2.0, internalWashout: 1.5, fallAuthorityCredit: 1.0,
    copRateGain: 2.0, copCommandShare: 1.0, jumpAssist: 0.5,
  },
  /**
   * An assist tier, as a parameter overlay and nothing else.
   *
   * It buys down neuromuscular latency, adds damping, and — now that the
   * preconditions exist — actually raises recovery authority, which is the
   * obvious way to write an assist and which used to make things worse. Both
   * preconditions are required and neither is optional:
   *
   *   internalRateGain   the authority is a PD term, so a bigger ceiling is
   *                      more damping rather than a bigger oscillation
   *   fallAuthorityCredit  the fall test counts that authority as support,
   *                      instead of scoring the save itself as a fall
   *
   * Measured at 2.5 m/s^2 of authority: deepest lean from upright 18 / 29 / 48
   * degrees at 3 / 4 / 6 m/s, against 15 / 27 / 46 for the old overlay. The
   * cost is honest and shows on a stopwatch: a 20 degree edge takes 2.9 s to
   * settle rather than 1.7 s, because damping is what is being bought.
   *
   * `internalMax` is not a free knob. 2.5 m/s^2 is about a quarter of g from
   * arms and a free leg, which is already generous; at 5 the skater holds
   * leans the edge cannot support at all and the ice stops mattering.
   */
  assisted: {
    ...DEFAULT_PARAMS, balanceKd: 20.0, angulationLimit: 0.70,
    controlLatency: 0.04,
    internalRateGain: 4.0, internalWashout: 1.5, internalMax: 2.5,
    fallAuthorityCredit: 1.0, copRateGain: 2.0, copCommandShare: 1.0, jumpAssist: 0.8,
  },
};
