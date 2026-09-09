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
  if (p.fallAuthorityCredit < 0 || p.fallAuthorityCredit > 1)
    errs.push("fallAuthorityCredit is a fraction, 0..1");
  // Measured on this rig, not asserted from theory: with no rate term, raising
  // the ceiling past about 2 m/s^2 costs more in oscillation than it buys in
  // authority. This is the check that stops an assist tier being written the
  // obvious wrong way in a UE5 tuning asset.
  if (p.internalMax > 2.0 && p.internalRateGain <= 0)
    errs.push("internalMax above 2 with no internalRateGain: a proportional gain with no damping "
      + "makes balance worse, not easier — raise internalRateGain first");
  return errs;
}

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
 * package never had, and credits that authority in the fall test. See
 * test/balance.test.ts for the envelope each of those buys, measured
 * separately — the gains and the rate term fix different halves of it.
 */
export const PRESETS: Readonly<Record<string, Params>> = {
  spec: DEFAULT_PARAMS,
  responsive: {
    ...DEFAULT_PARAMS, balanceKd: 16.0, angulationLimit: 0.70,
    internalRateGain: 2.0, internalWashout: 1.5, fallAuthorityCredit: 1.0,
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
    fallAuthorityCredit: 1.0,
  },
};
