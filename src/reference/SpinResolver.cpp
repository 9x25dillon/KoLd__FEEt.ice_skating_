// Edgework - reference implementation excerpt
// Copyright 2026 Dillon (github.com/9x25dillon)
// SPDX-License-Identifier: Apache-2.0
//
// Illustrative reference code from the Edgework design bible (docs/design-bible.md).
// These are specifications-as-code, not a compiling module: helper functions
// (MoveTowards, WrapPi, EdgeMismatch, ...) are declared in the bible and left
// to the implementation. See src/reference/README.md.
//
// Level-feature detection for spins. Companion to docs/level-features.md and
// data/spin-features.json.

// ─────────────────────────────────────────────────────────────────────────────
// THE SEGMENT MODEL
//
// A spin is not a state, it is a SEQUENCE OF SEGMENTS. A new segment opens on
// any change of position, foot, edge, variation or rotation direction. Almost
// every level feature then reduces to a query over that list, which is why this
// system is far smaller than the rules make it sound.
// ─────────────────────────────────────────────────────────────────────────────

struct FSpinSegment
{
    FName  VariationId;        // index into data/spin-positions.json
    EBasicPosition Basic;      // Upright | Sit | Camel
    int32  Foot;               // 0 = left, 1 = right
    float  EdgeSign;           // +1 outside, -1 inside
    float  RotationSign;       // +1 CCW, -1 CW

    float  Revolutions;
    float  OmegaMin, OmegaMax;
    float  PoseErrorAccum;     // mean joint-angle error vs the reference pose
    float  PoseErrorSamples;
    float  MaxCenteringError;  // metres from the spin's anchor point
    float  StartTime, EndTime;

    bool   bAttained;          // did the declared position ever come within tolerance?
    float  RevolutionsAttained;// revolutions held INSIDE tolerance, not merely elapsed

    float  MeanPoseError() const {
        return PoseErrorSamples > 0.f ? PoseErrorAccum / PoseErrorSamples : 999.f;
    }
};

struct FSpinAttempt
{
    ESpinCode Code;                    // USp, SSp, CSp, LSp, CoSp, CCoSp, FCSp, FSSp
    FName EntryId, ExitId;             // declared, from spin-positions.json
    TArray<FSpinSegment, TInlineAllocator<12>> Segments;

    FVector2D Anchor;                  // where the spin claims to be centred
    float TotalRevolutions;
    float MaxTravel;                   // worst centering error over the element

    // Discrete events the accumulator flags as they happen.
    bool  bAirborneFootChange;
    bool  bAirborneNoFootChange;
    float FootChangeStart, FootChangeEnd;
    float PositionChangeStart, PositionChangeEnd;
    float BalanceErrorAtExit, ExitSpeed, EntrySpeed;
    int32 SetupStepsBeforeEntry;
    bool  bStoppedBeforeEntry;
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCUMULATION - runs at simulation rate
// ─────────────────────────────────────────────────────────────────────────────

void FSpinResolver::Tick(const FSkaterState& S, FSpinAttempt& A, float Dt)
{
    const FSpinPositionDef& Def = Positions.Get(S.Spin.VariationId);

    // A change in ANY of these opens a new segment. This single line is what
    // makes eight-revolutions-without-change, change-of-edge, increase-of-speed
    // and both-directions all fall out for free below.
    FSpinSegment& Seg = A.Segments.Last();
    const bool bChanged =
           S.Spin.VariationId != Seg.VariationId
        || S.Spin.Foot        != Seg.Foot
        || FMath::Sign(S.Foot[S.Spin.Foot].EdgeSign) != FMath::Sign(Seg.EdgeSign)
        || FMath::Sign(S.YawRate) != FMath::Sign(Seg.RotationSign);

    if (bChanged) { CloseSegment(A, S.Time); OpenSegment(A, S, Def); }

    FSpinSegment& Cur = A.Segments.Last();

    const float Omega = FMath::Abs(S.YawRate);
    Cur.Revolutions += Omega * Dt / TWO_PI;
    Cur.OmegaMin     = FMath::Min(Cur.OmegaMin, Omega);
    Cur.OmegaMax     = FMath::Max(Cur.OmegaMax, Omega);

    // Pose fidelity: the declared position only counts while it is actually
    // being held. This is the whole of the "declared" verification story.
    const float PoseErr = MeanJointAngleError(S.Pose, Def.ReferencePose);
    Cur.PoseErrorAccum += PoseErr;
    Cur.PoseErrorSamples += 1.f;
    if (PoseErr <= Def.PoseToleranceDeg) {
        Cur.bAttained = true;
        Cur.RevolutionsAttained += Omega * Dt / TWO_PI;
    }

    const float Travel = FVector2D::Distance(FVector2D(S.Pos), A.Anchor);
    Cur.MaxCenteringError = FMath::Max(Cur.MaxCenteringError, Travel);
    A.MaxTravel           = FMath::Max(A.MaxTravel, Travel);
    A.TotalRevolutions   += Omega * Dt / TWO_PI;

    // Moment of inertia comes from the catalogue, so a camel is slow and an
    // upright is fast emergently. Nothing scripts this.
    S.InertiaZ = TargetInertiaFor(Def, S.LastInput.CarriageStick) * S.BodyInertiaScale;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVALUATION - runs once, at the exit
// ─────────────────────────────────────────────────────────────────────────────

FSpinResult FSpinResolver::Evaluate(const FSpinAttempt& A) const
{
    FSpinResult R;
    R.Code = A.Code;

    // Minimum requirements gate the element itself, not its level.
    const float MinRevs = Features.MinTotalRevolutions(A.Code);
    if (A.TotalRevolutions < MinRevs) { R.bInvalid = true; return R; }
    if (A.MaxTravel > Features.MaxTravel) R.bMandatoryGoeReduction = true;

    TSet<FName> Earned;
    TSet<FName> Attempted;    // declared but not attained - costs GOE, no level

    // ── Declared: difficult variation, once per distinct BASIC position ──────
    TSet<EBasicPosition> CreditedBasics;
    for (const FSpinSegment& Seg : A.Segments)
    {
        const FSpinPositionDef& D = Positions.Get(Seg.VariationId);
        if (!D.bDifficult) continue;

        Attempted.Add(FeatureKey("spin.difficult_variation", Seg.Basic));

        const bool bHeld = Seg.bAttained
                        && Seg.RevolutionsAttained >= D.MinRevolutions
                        && Seg.MeanPoseError()    <= D.PoseToleranceDeg
                        && Seg.MaxCenteringError  <= 0.45f;

        if (bHeld && !CreditedBasics.Contains(Seg.Basic)) {
            CreditedBasics.Add(Seg.Basic);
            Earned.Add(FeatureKey("spin.difficult_variation", Seg.Basic));
        }
    }

    // ── Declared: difficult entrance and exit ───────────────────────────────
    const FSpinEntryDef& E = Entries.Get(A.EntryId);
    if (E.bDifficult) {
        Attempted.Add("spin.difficult_entrance");
        if (A.EntrySpeed >= E.MinEntrySpeedMs
            && !A.bStoppedBeforeEntry
            && A.SetupStepsBeforeEntry <= 2
            && RevolutionsToAttain(A) <= 2.f)
            Earned.Add("spin.difficult_entrance");
    }
    const FSpinExitDef& X = Exits.Get(A.ExitId);
    if (X.bDifficult) {
        Attempted.Add("spin.difficult_exit");
        if (A.BalanceErrorAtExit <= 0.4f && A.ExitSpeed >= 2.5f)
            Earned.Add("spin.difficult_exit");
    }

    // ── Observed: eight revolutions with nothing changing ───────────────────
    // Free, because a segment BY DEFINITION contains no changes.
    for (const FSpinSegment& Seg : A.Segments)
        if (Seg.Revolutions >= 8.f && Seg.MaxCenteringError <= 0.5f)
            { Earned.Add("spin.eight_revolutions_no_change"); break; }

    // ── Observed: clear increase of speed, once per basic position ──────────
    TSet<EBasicPosition> SpeedCredited;
    for (const FSpinSegment& Seg : A.Segments)
    {
        if (Seg.OmegaMin <= KINDA_SMALL_NUMBER) continue;
        const float Ratio = Seg.OmegaMax / Seg.OmegaMin;
        if (Ratio >= 1.30f && Seg.Revolutions >= 2.f
            && !SpeedCredited.Contains(Seg.Basic))
        {
            SpeedCredited.Add(Seg.Basic);
            Earned.Add(FeatureKey("spin.increase_of_speed", Seg.Basic));
        }
    }

    // ── Observed: clear change of edge ──────────────────────────────────────
    // Adjacent segments, same variation, opposite edge, two revolutions either
    // side. The two-revolution windows are what separate a feature from a wobble.
    for (int32 i = 1; i < A.Segments.Num(); ++i)
    {
        const FSpinSegment& P = A.Segments[i - 1];
        const FSpinSegment& C = A.Segments[i];
        if (P.VariationId != C.VariationId || P.Foot != C.Foot) continue;
        if (FMath::Sign(P.EdgeSign) == FMath::Sign(C.EdgeSign))  continue;
        if (!Features.EdgeChangeEligible(C.VariationId))         continue;
        if (P.Revolutions >= 2.f && C.Revolutions >= 2.f
            && C.MaxCenteringError <= 0.5f)
            Earned.Add(FeatureKey("spin.change_of_edge", C.Basic));
    }

    // ── Observed: both rotational directions back to back ───────────────────
    // The simulation gets this nearly free: the sign of angular momentum flips.
    for (int32 i = 1; i < A.Segments.Num(); ++i)
    {
        const FSpinSegment& P = A.Segments[i - 1];
        const FSpinSegment& C = A.Segments[i];
        if (FMath::Sign(P.RotationSign) == FMath::Sign(C.RotationSign)) continue;
        if ((P.Basic != EBasicPosition::Sit && P.Basic != EBasicPosition::Camel)) continue;
        if (P.Revolutions >= 3.f && C.Revolutions >= 3.f
            && (C.StartTime - P.EndTime) <= 1.0f)
            Earned.Add("spin.both_directions");
    }

    // ── Observed: jumps, foot changes ───────────────────────────────────────
    if (A.bAirborneFootChange)   Earned.Add("spin.change_foot_by_jump");
    if (A.bAirborneNoFootChange) Earned.Add("spin.jump_within_spin");

    // Difficult change of foot: the foot change and the position change
    // OVERLAP rather than happening one after the other.
    if (A.Code == ESpinCode::CCoSp
        && RangesOverlap(A.FootChangeStart, A.FootChangeEnd,
                         A.PositionChangeStart, A.PositionChangeEnd)
        && (A.FootChangeEnd - A.FootChangeStart) <= 0.5f)
        Earned.Add("spin.difficult_change_of_foot");

    // ── Observed: all three basic positions on the second foot ──────────────
    if (A.Code == ESpinCode::CCoSp)
    {
        TSet<EBasicPosition> AfterChange;
        for (const FSpinSegment& Seg : A.Segments)
            if (Seg.StartTime >= A.FootChangeEnd && Seg.Revolutions >= 2.f)
                AfterChange.Add(Seg.Basic);
        if (AfterChange.Num() >= 3) Earned.Add("spin.all_three_positions_second_foot");
    }

    // ── Level ───────────────────────────────────────────────────────────────
    R.Features       = Earned;
    R.FeaturesFailed = Attempted.Difference(Earned);
    R.Level          = (ELevel)FMath::Min(Earned.Num(), 4);

    // Reaching for a feature and missing it is not neutral. It is a visible
    // error, and the panel treats it as one.
    R.GoeModifier   -= 0.35f * R.FeaturesFailed.Num();
    R.GoeModifier   -= R.bMandatoryGoeReduction ? 1.0f : 0.f;
    return R;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE HUD FEEDBACK
//
// The feature checklist from bible section 2.5 has THREE states, not two. The
// middle one is the teaching moment: the player reached for something and did
// not get it, and the game should say so while there is still time to fix it.
// ─────────────────────────────────────────────────────────────────────────────

EFeatureUiState FSpinResolver::LiveState(const FSpinAttempt& A, FName FeatureId) const
{
    if (WouldEarn(A, FeatureId))    return EFeatureUiState::Earned;      // filled
    if (WasAttempted(A, FeatureId)) return EFeatureUiState::Missed;      // struck through
    return EFeatureUiState::Available;                                   // hairline
}
