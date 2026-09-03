// Edgework - reference implementation excerpt
// Copyright 2026 Dillon (github.com/9x25dillon)
// SPDX-License-Identifier: Apache-2.0
//
// Illustrative reference code from the Edgework design bible (docs/design-bible.md).
// These are specifications-as-code, not a compiling module: helper functions
// (MoveTowards, WrapPi, EdgeMismatch, ...) are declared in the bible and left
// to the implementation. See src/reference/README.md.

// Units SI, world +Z up. No allocation, no engine types, no side effects
// beyond the ice grid — everything here must replay bit-identically.

constexpr float kGravity      = 9.81f;
constexpr float kRockerRadius = 2.05f;   // figure blade, metres
constexpr float kMuGlide      = 0.006f;  // longitudinal, fresh ice at -5.5 C
constexpr float kMuSkid       = 0.35f;   // once the edge has let go
constexpr float kMaxLean      = 1.13f;   // ~65 deg before the blade washes out

struct FFootState {
    bool  bOnIce;
    float EdgeSign;    // +1 outside, -1 inside, 0 flat
    float ContactS;    // 0 = heel .. 1 = toe pick; sets effective rocker
    float PressureN;
};

// The blade is not a single arc: its front third is far tighter, which is
// why turns are executed "on the rocker".
static float EffectiveRocker(float ContactS) {
    return Lerp(kRockerRadius, 0.55f * kRockerRadius,
                SmoothStep(0.55f, 1.0f, ContactS));
}

void FSkateSolver::Tick(FSkaterState& S, const FSkaterInput& In,
                        FIceSurface& Ice, float Dt)
{
    const float Speed   = S.Vel.Size2D();
    const int   Support = PickSupportFoot(S);
    FFootState& F       = S.Foot[Support];

    // 1 — Lean command. The left stick is a lean vector in the skater's
    //     frame; its magnitude is how far off vertical the body is asked
    //     to go. Fatigue slows how fast you can get there.
    const float LeanCmd  = Min(In.LeanStick.Size(), 1.f) * kMaxLean;
    const float LeanRate = 6.5f * (0.55f + 0.45f * S.LegPool);
    S.Lean     = MoveTowards(S.Lean, LeanCmd, LeanRate * Dt);
    S.LeanAxis = AngleTowards(S.LeanAxis, In.LeanStick.Angle(), 9.f * Dt);
    F.EdgeSign = SignedEdgeFromLean(S.Yaw, S.LeanAxis, Support);

    // 2 — Geometry: the radius the blade WANTS to cut.
    //     A rocker of radius R tilted theta from vertical traces an arc of
    //     R / sin(theta) on the ice. theta -> 0 gives a straight line.
    const float SinLean = Max(Sin(S.Lean), 1e-3f);
    const float RGeo    = EffectiveRocker(F.ContactS) / SinLean;

    // 3 — Dynamics: the radius that BALANCES at this speed.
    //     tan(theta) = v^2 / (g r)  ->  r = v^2 / (g tan theta)
    const float RDyn = (Speed * Speed) / (kGravity * Tan(S.Lean) + 1e-3f);

    //     The skater rides the geometric arc; the mismatch with RDyn is a
    //     torque the body has to absorb. That mismatch IS the balance problem
    //     the player is solving, tick by tick.
    const float TorqueErr = (1.f / RGeo - 1.f / RDyn) * Speed * Speed;
    S.BalanceErr.X += TorqueErr * kBalanceGain * Dt;

    // 4 — Can the edge hold it?
    const float Normal  = S.Mass * kGravity / Max(Cos(S.Lean), 0.30f);
    const float NeedLat = S.Mass * Speed * Speed / RGeo;
    const float Bite    = Ice.BiteCoefficient(S.Pos, S.Lean, F.PressureN,
                                              S.BladeSharpness) * Normal;

    float Radius = RGeo;
    if (NeedLat > Bite) {
        // The edge lets go: the arc widens, speed bleeds, snow flies.
        Radius = S.Mass * Speed * Speed / Max(Bite, 1.f);
        const float Slip = (NeedLat - Bite) / S.Mass;
        S.Vel -= S.Vel.GetSafeNormal() * kMuSkid * Slip * Dt;
        S.Flow = Max(0.f, S.Flow - 1.8f * Slip * Dt);
        Ice.DepositSnow(S.Pos, Slip * Dt);
        Events.Push({ ESkateEvent::Skid, Slip });
    } else {
        S.Flow = Min(1.f, S.Flow + 0.35f * (S.Lean / kMaxLean) * Dt);
    }

    // 5 — Integrate the arc. Yaw rate is emergent, never an input.
    const float TurnSign = -F.EdgeSign * SideOf(Support);
    S.YawRate = TurnSign * Speed / Max(Radius, 0.35f);
    S.Yaw     = WrapPi(S.Yaw + S.YawRate * Dt);

    // 6 — Propulsion. You push SIDEWAYS against an edge; a blade offers
    //     almost nothing to push against along its length.
    if (In.bPushPressed && CanPush(S)) {
        const float Knee    = In.KneeAxis;
        const float Beat    = CrossoverBeatQuality(S);   // 1.0 on-beat, 0.45 off
        const float Power   = S.Mass * 3.2f * Knee * Beat * StaminaGain(S);
        const FVector Push  = BladeNormal(S, 1 - Support);
        S.Vel     += Push * (Power / S.Mass) * Dt;
        S.LegPool -= 0.011f * Knee;
    }

    // 7 — Losses. Blade friction is tiny; at 8 m/s air drag is comparable,
    //     which is why speed is expensive to build and cheap to keep.
    const float Mu   = Ice.GlideFriction(S.Pos);     // damaged ice is slower
    const float Drag = 0.5f * 1.29f * 0.9f * 0.55f * Speed * Speed;
    S.Vel -= S.Vel.GetSafeNormal() * (Mu * kGravity + Drag / S.Mass) * Dt;

    S.Pos += S.Vel * Dt;

    Ice.WriteTracing(S.Pos, S.Yaw, F.EdgeSign, S.Lean, F.PressureN);
    UpdateBalance(S, In, Dt);
    UpdateStamina(S, Speed, Dt);
}
