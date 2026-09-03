// Edgework - reference implementation excerpt
// Copyright 2026 Dillon (github.com/9x25dillon)
// SPDX-License-Identifier: Apache-2.0
//
// Illustrative reference code from the Edgework design bible (docs/design-bible.md).
// These are specifications-as-code, not a compiling module: helper functions
// (MoveTowards, WrapPi, EdgeMismatch, ...) are declared in the bible and left
// to the implementation. See src/reference/README.md.

EAnimState FSkaterAnimDriver::Resolve(const FSkaterState& S,
                                      const FJumpAttempt& J,
                                      const FSpinAttempt& Sp,
                                      FPoseSearchQuery& OutQuery)
{
    // ── Priority 0: recovery pre-empts everything ────────────────────────
    if (S.bGrounded)                        return EAnimState::PoweredRagdoll;
    if (S.BalanceErr.Size() > 0.85f)        return EAnimState::Fall;
    if (S.BalanceErr.Size() > 0.55f)        return EAnimState::Stumble;

    // ── Priority 1: elements override locomotion ─────────────────────────
    switch (J.Phase)
    {
    case EJumpPhase::Load:
        // Intent broadcast: publish the predicted takeoff instant so the
        // locomotion layer can pre-position the foot plant instead of
        // snapping. This is what stops the classic sports-game pop.
        BroadcastTakeoffIntent(J.PredictedTakeoffTime(), J.Type);
        return EAnimState::JumpLoad;

    case EJumpPhase::Air:
        // Check-out begins when the rotation still owed fits the time left
        // to open. Below that, the skater is committed to landing.
        return RemainingRotation(J) < OpeningWindow(J)
             ? EAnimState::JumpCheck : EAnimState::JumpAir;

    case EJumpPhase::Land: return EAnimState::JumpLand;
    case EJumpPhase::Fail: return EAnimState::Fall;
    default: break;
    }

    if (Sp.bActive)
        return Sp.bChangingFoot ? EAnimState::SpinChangeFoot
             : Sp.bExiting      ? EAnimState::SpinExit
             : SpinStateFor(Sp.Position);

    if (S.PendingTurn != ETurn::None && TurnIsValidFromEdge(S, S.PendingTurn))
        return TurnStateFor(S.PendingTurn);

    // ── Priority 2: locomotion is not a state machine at all ─────────────
    // Hand the physical context to Pose Search and let the mocap database
    // answer. The alternative — hand-built blend spaces over
    // edge x speed x curvature x knee — does not fit in a schedule.
    OutQuery.Velocity     = S.Vel;
    OutQuery.CarveRadius  = SignedCarveRadius(S);   // sign encodes which way
    OutQuery.EdgeSign     = S.Foot[Support(S)].EdgeSign;
    OutQuery.LeanAngle    = S.Lean;
    OutQuery.KneeAxis     = S.LastInput.KneeAxis;
    OutQuery.FutureRoot   = PredictRoot(S, 0.35f);  // the solver's commitment
    OutQuery.Tags         = LocomotionTags(S);      // glide/stroke/crossover/...
    return EAnimState::Locomotion;
}

// Post-selection: this is what stops the skater sliding across the ice like
// furniture. Every clip was captured on some radius; almost none of them the
// one the solver just produced.
void FSkaterAnimDriver::PostProcess(FPoseContext& Pose, const FSkaterState& S)
{
    // Bend a straight-line stride onto the arc the physics actually solved,
    // distributing the rotation between hips and spine so it reads as a lean
    // into the circle rather than a waist twist.
    OrientationWarp(Pose, S.YawRate, /*SpineWeight*/ 0.35f, /*HipWeight*/ 0.65f);

    // Match the blade's animated contact speed to real ground speed. Without
    // this the feet skate on a treadmill and the illusion dies instantly.
    StrideWarp(Pose, S.Vel.Size2D() / Max(Pose.ClipRootSpeed, 0.1f));

    // Clips are authored upright. Control Rig stacks the body over the edge,
    // keeping the upper body several degrees more vertical than the legs —
    // skaters stack, they do not tip like a motorcycle.
    ControlRig_Lean(Pose, S.Lean, S.LeanAxis, /*UpperBodyBias*/ 0.72f);

    // Plant both blades on the ice honouring the contact point along the
    // rocker, then let the free leg follow its choreography target.
    BladeIK(Pose, S.Foot[0], S.Foot[1], IceHeight(S.Pos));
    FreeLegIK(Pose, S.FreeLegTarget, S.LastInput.ToeAxis);

    // Additives last: none of these can change which pose was selected.
    ApplyAdditive(Pose, FatiguePose,  1.f - S.LegPool);
    ApplyAdditive(Pose, CarriagePose, S.LastInput.CarriageStick);
    ApplyAdditive(Pose, BreathPose,   BreathPhase(S.WindPool));
    GazeSolver(Pose, PredictTravelDirection(S, 0.4f), S.AccentTarget);
}
