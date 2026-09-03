// Edgework - reference implementation excerpt
// Copyright 2026 Dillon (github.com/9x25dillon)
// SPDX-License-Identifier: Apache-2.0
//
// Illustrative reference code from the Edgework design bible (docs/design-bible.md).
// These are specifications-as-code, not a compiling module: helper functions
// (MoveTowards, WrapPi, EdgeMismatch, ...) are declared in the bible and left
// to the implementation. See src/reference/README.md.

enum class EJumpPhase : uint8 { None, Load, Air, Land, Fail };

struct FJumpDef {
    EJumpType Type;
    EEdge     TakeoffEdge;   // e.g. LBO for a lutz
    bool      bToeAssisted;
    bool      bEdgeCallable; // only flip and lutz can draw an 'e'
    float     BaseImpulse;   // m/s of vertical velocity at a perfect load
    float     RotBias;       // how readily the entry generates angular momentum
};

void FJumpResolver::Tick(FSkaterState& S, FJumpAttempt& J,
                         const FSkaterInput& In, float Dt)
{
  const FJumpDef& Def = Defs[(int)J.Type];

  switch (J.Phase)
  {
  // ── LOAD ─────────────────────────────────────────────────────────────
  // Knee compression sets the vertical impulse. Hold too long and the edge
  // rotates underneath you before you leave the ice: pre-rotation.
  case EJumpPhase::Load:
  {
      J.PhaseTime += Dt;
      J.EntryEdgeError = EdgeMismatch(CurrentEdge(S), Def.TakeoffEdge); // 0..1

      constexpr float kIdealLoad = 0.30f;
      if (J.PhaseTime > kIdealLoad * 1.6f) J.PreRotation += 2.2f * Dt;

      if (In.KneeAxis < 0.15f)                    // trigger released: takeoff
      {
          const float TimingQ = 1.f - Abs(J.PhaseTime - kIdealLoad) / kIdealLoad;
          const float DepthQ  = Clamp(J.PeakKnee / 0.85f, 0.f, 1.f);
          const float Fatigue = 0.82f + 0.18f * S.LegPool;

          J.TakeoffQuality = Clamp(0.55f * TimingQ + 0.45f * DepthQ, 0.f, 1.f)
                           * (1.f - 0.35f * J.EntryEdgeError)
                           * (1.f - 0.40f * Saturate(J.PreRotation));

          // Toe jumps need the pick planted inside a 90 ms window.
          if (Def.bToeAssisted && !J.bToeStruck) J.TakeoffQuality *= 0.45f;

          // Ballistics are fixed HERE and cannot be changed in the air.
          J.VertVel = Def.BaseImpulse * (0.62f + 0.38f * J.TakeoffQuality) * Fatigue;
          J.AirTime = 2.f * J.VertVel / kGravity;
          J.Height  = J.VertVel * J.VertVel / (2.f * kGravity);

          // Angular momentum comes from the entry curve plus the check of the
          // free side. L = I * omega, and after this instant L never changes.
          const float Entry = S.Vel.Size2D() / Max(CarveRadius(S), 0.5f);
          const float Whip  = Clamp(In.CarriageFlick, 0.f, 1.f);
          J.AngMomentum = S.InertiaZ * (Entry * Def.RotBias + 9.5f * Whip)
                        * (0.80f + 0.20f * J.TakeoffQuality);

          S.Vel.Z    = J.VertVel;
          S.LegPool -= 0.055f + 0.020f * J.Revolutions;
          J.Phase = EJumpPhase::Air;  J.PhaseTime = 0.f;  J.Rotation = 0.f;
      }
      break;
  }

  // ── AIR ──────────────────────────────────────────────────────────────
  // L is conserved. The only remaining control is the moment of inertia:
  // pulling the arms and free leg to the axis roughly quarters I, which
  // roughly quadruples omega. Fatigue raises the floor you can reach.
  case EJumpPhase::Air:
  {
      J.PhaseTime += Dt;

      const float Pull     = Clamp(1.f - In.CarriageStick.Size(), 0.f, 1.f);
      const float IFloor   = Lerp(1.55f, 0.95f, S.LegPool);
      const float PullRate = 11.f * (0.60f + 0.40f * S.LegPool);
      S.InertiaZ = MoveTowards(S.InertiaZ, Lerp(4.0f, IFloor, Pull),
                               PullRate * Dt);

      const float Omega = J.AngMomentum / S.InertiaZ;    // rad/s
      J.Rotation += Omega * Dt;
      J.PeakOmega = Max(J.PeakOmega, Omega);

      S.Vel.Z -= kGravity * Dt;
      S.Pos   += S.Vel * Dt;

      if (S.Pos.Z <= IceHeight(S.Pos) || J.PhaseTime >= J.AirTime)
          J.Phase = EJumpPhase::Land;
      break;
  }

  // ── LAND ─────────────────────────────────────────────────────────────
  // Rotation accounting mirrors how a technical panel actually calls a jump.
  case EJumpPhase::Land:
  {
      // An axel takes off forwards, so it carries an extra half revolution.
      const float Target  = TWO_PI * (J.Revolutions
                          + (J.Type == EJumpType::Axel ? 0.5f : 0.f));
      const float ShortBy = (Target - J.Rotation) / TWO_PI;   // in revolutions

      FElementResult R;
      R.Called      = J.Type;
      R.Revolutions = J.Revolutions;

      if      (ShortBy > 0.500f) R.Rotation = ERotationCall::Downgraded;   // <<
      else if (ShortBy > 0.250f) R.Rotation = ERotationCall::UnderRotated; // <
      else if (ShortBy > 0.125f) R.Rotation = ERotationCall::Quarter;      // q
      else                       R.Rotation = ERotationCall::Clean;

      if (Def.bEdgeCallable)                                  // flutz / lip
          R.EdgeCall = J.EntryEdgeError > 0.55f ? EEdgeCall::Wrong
                     : J.EntryEdgeError > 0.25f ? EEdgeCall::Unclear
                     :                            EEdgeCall::Clean;

      // Landing quality: did you open on time, present the right edge,
      // and absorb the impact with the knee?
      const float CheckErr = Abs(WrapPi(J.Rotation - Target)) / PI;
      const float Absorb   = In.KneeAxis;
      const float EdgeOK   = 1.f - EdgeMismatch(CurrentEdge(S), EEdge::RBO);
      const float Balance  = S.BalanceErr.Size();

      R.LandingQuality = Clamp(1.f - 0.90f * CheckErr
                                   - 0.50f * (1.f - Absorb)
                                   - 0.35f * (1.f - EdgeOK)
                                   - 0.60f * Balance, 0.f, 1.f);

      R.Height    = J.Height;
      R.Flow      = S.Vel.Size2D();
      R.PeakOmega = J.PeakOmega;
      R.bFall     = R.LandingQuality < 0.18f || ShortBy > 0.70f;
      R.bStepOut  = !R.bFall && R.LandingQuality < 0.34f;

      Recognizer.Submit(R);

      S.Vel.Z    = 0.f;
      S.InertiaZ = 4.0f;
      S.BalanceErr += LandingShock(R, J);
      J.Phase = R.bFall ? EJumpPhase::Fail : EJumpPhase::None;
      break;
  }
  default: break;
  }
}
