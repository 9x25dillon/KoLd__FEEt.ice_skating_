// Edgework - reference implementation excerpt
// Copyright 2026 Dillon (github.com/9x25dillon)
// SPDX-License-Identifier: Apache-2.0
//
// Illustrative reference code from the Edgework design bible (docs/design-bible.md).
// These are specifications-as-code, not a compiling module: helper functions
// are described in the docs and left to the implementation.
//
// The Composer transition solver. Companion to docs/composer-solver.md,
// data/motion-primitives.json and data/entry-templates.json.

// ═══════════════════════════════════════════════════════════════════════════
// THE SHAPE OF THE PROBLEM
//
// The player places elements on a musical timeline. The solver generates the
// skating BETWEEN them. Each transition must arrive at a specific foot, edge,
// direction, position, speed and TIME - which is a two-point boundary value
// problem, and the reason naive approaches to this fail.
//
// Three moves make it tractable:
//
//   1. Search over MOTION PRIMITIVES, not continuous space. The vocabulary of
//      skating is already discrete: strokes, crossovers, turns, glides.
//   2. Plan to an ENTRY TEMPLATE, not a pose. The template is a pre-solved
//      run-in, so the goal becomes a fat dock region instead of a needle.
//   3. Separate PATH from TIME. Solve geometry first, fit the clock second.
//      Putting time in the search state explodes it for no benefit.
// ═══════════════════════════════════════════════════════════════════════════

namespace Composer
{

// ── Lattice state ──────────────────────────────────────────────────────────
// Discretised because A* needs to recognise revisited states. Resolution is
// tuned so that one primitive always moves at least one cell: finer than that
// and the search stalls in place.

constexpr float kCellSize      = 0.5f;   // metres
constexpr int32 kHeadingBins   = 32;     // 11.25 degrees
constexpr int32 kSpeedBins     = 8;      // 0..10 m/s in 1.25 m/s steps
constexpr float kSpeedBinWidth = 1.25f;

struct FLatticeState
{
    int16 CellX, CellY;
    uint8 Heading;              // 0..31
    uint8 Speed;                // 0..7
    uint8 Foot     : 1;         // 0 left, 1 right
    uint8 EdgeSign : 1;         // 0 inside, 1 outside
    uint8 Forward  : 1;         // 0 backward, 1 forward
    uint8 Pad      : 5;

    uint64 Key() const
    {
        return  (uint64)(uint16)CellX
             | ((uint64)(uint16)CellY   << 16)
             | ((uint64)Heading         << 32)
             | ((uint64)Speed           << 40)
             | ((uint64)Foot            << 48)
             | ((uint64)EdgeSign        << 49)
             | ((uint64)Forward         << 50);
    }
};

struct FPlanNode
{
    FLatticeState State;
    float  G, H;                // cost so far, heuristic
    float  ArcTime;             // accumulated seconds
    float  LegsUsed, WindUsed;
    int32  Parent;              // index into the node pool
    int32  PrimitiveId;         // primitive that produced this node
    uint32 TurnTagMask;         // which turn types have been used (variety)

    float F() const { return G + H; }
};

// ── Request ────────────────────────────────────────────────────────────────

struct FTransitionRequest
{
    FSkaterState        Start;          // exit state of element N
    const FEntryTemplate* Goal;         // entry template of element N+1
    FVector2D           GoalAnchor;     // where the template's dock sits
    float               TargetArrival;  // seconds, from the music grid
    float               TimeTolerance;  // typically 0.15 s
    const FIceSurface*  Ice;            // for the fresh-ice reward
    const FMusicGrid*   Music;          // for on-beat turn bonuses
    FStaminaBudget      Budget;         // what the whole program can afford here
    uint32              PriorTurnMask;  // variety already spent earlier in the program
};

// ═══════════════════════════════════════════════════════════════════════════
// 1 - SUCCESSOR GENERATION
//
// Where the physics enters. A primitive is only legal if the skater can
// actually perform it at this speed, on this edge, on this ice.
// ═══════════════════════════════════════════════════════════════════════════

void FTransitionSolver::Expand(const FPlanNode& N, const FTransitionRequest& Req,
                               TArray<FCandidate>& Out) const
{
    const float Speed = (N.State.Speed + 0.5f) * kSpeedBinWidth;

    for (const FPrimitive& P : Primitives)
    {
        // Discrete precondition: does the foot/edge/direction state match?
        if (!P.AcceptsState(N.State)) continue;

        // Physical legality. Minimum turn radius grows with speed - a skater
        // is a vehicle whose steering gets WORSE the faster it goes, which is
        // the opposite of a car and drives most of the plan's shape.
        const float HeadingDelta = P.HeadingDeltaRad * P.ChiralityFor(N.State);
        const float ArcLen       = P.ArcLengthAt(Speed);
        const float Curvature    = FMath::Abs(HeadingDelta) / FMath::Max(ArcLen, 0.1f);
        const float MaxCurvature = (kGravity * FMath::Tan(kMaxLean)) / FMath::Max(Speed * Speed, 1.f);
        if (Curvature > MaxCurvature) continue;

        // A crossover is propulsion off an engaged edge. On a straight line
        // there is no edge to push against, so it is not merely inefficient,
        // it is impossible.
        if (P.bRequiresCurve && FMath::Abs(HeadingDelta) < 0.25f) continue;

        // Authored primitives have fixed geometry and cannot be warped.
        if (P.bAuthored && !P.FitsAt(Speed)) continue;

        // Stamina: reject anything the whole-program budget cannot afford.
        const float Legs = N.LegsUsed + P.StaminaLegs;
        const float Wind = N.WindUsed + P.StaminaWind * P.DurationAt(Speed);
        if (Legs > Req.Budget.LegsAvailable || Wind > Req.Budget.WindAvailable) continue;

        FCandidate C;
        C.State       = ApplyPrimitive(N.State, P, Speed);
        C.PrimitiveId = P.Index;
        C.DeltaTime   = P.DurationAt(Speed);
        C.LegsUsed    = Legs;
        C.WindUsed    = Wind;
        C.Cost        = StepCost(N, C, P, Req);
        Out.Add(C);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 - COST
//
// This function IS the Program Component Score rubric. The solver is not
// finding a path, it is finding a path a judge would reward - so the terms
// below are lifted straight from Composition and Skating Skills.
// ═══════════════════════════════════════════════════════════════════════════

float FTransitionSolver::StepCost(const FPlanNode& From, const FCandidate& To,
                                  const FPrimitive& P, const FTransitionRequest& Req) const
{
    const float Speed = (From.State.Speed + 0.5f) * kSpeedBinWidth;
    float Cost = P.DurationAt(Speed) * W.Time;

    // Skating Skills: skidding is the cardinal sin. A primitive that demands
    // more lateral force than the edge can supply gets charged for the slip.
    const float Demand = Speed * Speed * FMath::Abs(P.HeadingDeltaRad) / FMath::Max(P.ArcLengthAt(Speed), 0.1f);
    const float Bite   = Req.Ice->BiteCoefficient(CellCentre(To.State), kMaxLean, 1.f) * kGravity;
    if (Demand > Bite) Cost += (Demand - Bite) * W.Skid;

    // Composition: reward covering ice nobody has cut yet. Read straight off
    // the tracing buffer, so one system serves the visual, the friction model
    // and the score.
    const float Freshness = 1.f - Req.Ice->DamageAt(CellCentre(To.State));
    Cost -= Freshness * W.FreshIce;

    // Skating Skills: variety, with diminishing returns. The first counter in
    // a program is worth a great deal; the fourth is worth almost nothing.
    if (P.TurnTag != ETurnTag::None)
    {
        const uint32 Bit = 1u << (uint32)P.TurnTag;
        const bool bNew = !(From.TurnTagMask & Bit) && !(Req.PriorTurnMask & Bit);
        Cost -= bNew ? W.NewTurnType : W.RepeatTurnType;
        Cost -= P.Difficulty * W.TurnDifficulty;
    }

    // Presentation: a turn landing on a musical accent is worth having.
    // Cheap to evaluate here because the path's time is monotonic even before
    // the time-fitting pass rescales it.
    if (P.TurnTag != ETurnTag::None && Req.Music)
    {
        const float Phase = Req.Music->DistanceToNearestAccent(From.ArcTime + To.DeltaTime);
        if (Phase < 0.08f) Cost -= W.OnBeat * (1.f - Phase / 0.08f);
    }

    // Composition: alternating lobes read as deliberate; repeating them reads
    // as circling aimlessly.
    if (SameLobeDirection(From.State, To.State)) Cost += W.SameLobe;

    return Cost;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 - HEURISTIC
//
// Must never overestimate or A* stops being optimal. Two parts, take the max.
// ═══════════════════════════════════════════════════════════════════════════

float FTransitionSolver::Heuristic(const FLatticeState& S, const FTransitionRequest& Req) const
{
    // (a) Precomputed obstacle-free distance field over (cell, heading) to the
    //     dock region, built once per rink at load. Captures the fact that
    //     arriving with the wrong heading costs a turn, which pure Euclidean
    //     distance cannot see.
    const float FromLut = HeuristicLut.Lookup(S.CellX, S.CellY, S.Heading);

    // (b) The time it would take to reach the template's required speed even
    //     travelling in a straight line at maximum acceleration.
    const float Speed   = (S.Speed + 0.5f) * kSpeedBinWidth;
    const float NeedDv  = FMath::Max(0.f, Req.Goal->MinEntrySpeed - Speed);
    const float FromAcc = NeedDv / kMaxAcceleration;

    return FMath::Max(FromLut, FromAcc) * W.Time;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 - THE SEARCH
//
// Bidirectional A*. The goal is as tightly specified as the start, so
// searching from both ends and meeting in the middle roughly squares down the
// explored volume. Backward expansion runs the primitives in reverse.
// ═══════════════════════════════════════════════════════════════════════════

bool FTransitionSolver::PlanPath(const FTransitionRequest& Req, FTransitionPlan& Out)
{
    FSearchDirection Fwd(Req.Start,  EDir::Forward);
    FSearchDirection Bwd(*Req.Goal,  EDir::Backward);

    float BestJoinCost = FLT_MAX;
    int32 BestFwd = -1, BestBwd = -1;

    while (!Fwd.Open.IsEmpty() && !Bwd.Open.IsEmpty())
    {
        // Alternate, always expanding whichever frontier is cheaper - it keeps
        // the two searches meeting near the middle rather than one racing.
        FSearchDirection& D = (Fwd.Open.TopF() <= Bwd.Open.TopF()) ? Fwd : Bwd;
        FSearchDirection& O = (&D == &Fwd) ? Bwd : Fwd;

        const int32 Idx = D.Open.Pop();
        const FPlanNode& N = D.Nodes[Idx];

        // Deterministic tie-breaking. Programs are shared and must replan
        // identically on every machine, so the priority queue orders by
        // (F, then G, then state key) with no reliance on insertion order.
        if (N.F() >= BestJoinCost) break;
        if (D.Closed.Contains(N.State.Key())) continue;
        D.Closed.Add(N.State.Key());

        // Have the frontiers met?
        if (const int32* Meet = O.Closed.Find(N.State.Key()))
        {
            const float Join = N.G + O.Nodes[*Meet].G;
            if (Join < BestJoinCost) { BestJoinCost = Join; BestFwd = Idx; BestBwd = *Meet; }
        }

        TArray<FCandidate, TInlineAllocator<24>> Kids;
        Expand(N, Req, Kids);
        for (const FCandidate& C : Kids)
        {
            if (D.Closed.Contains(C.State.Key())) continue;
            FPlanNode K;
            K.State       = C.State;
            K.G           = N.G + C.Cost;
            K.H           = Heuristic(C.State, Req);
            K.ArcTime     = N.ArcTime + C.DeltaTime;
            K.LegsUsed    = C.LegsUsed;
            K.WindUsed    = C.WindUsed;
            K.Parent      = Idx;
            K.PrimitiveId = C.PrimitiveId;
            K.TurnTagMask = N.TurnTagMask | TurnBit(C.PrimitiveId);
            D.Push(K);
        }

        if (D.Nodes.Num() + O.Nodes.Num() > kNodeBudget) break;   // give up gracefully
    }

    if (BestFwd < 0) return false;
    Out = Stitch(Fwd, BestFwd, Bwd, BestBwd, Req);
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 - TIME FITTING
//
// The path is geometry. Now make it hit the clock. Time was deliberately kept
// out of the search state; it is recovered here by rescaling the speed profile
// within physical limits, and if that is not enough, by spending the surplus
// on choreography rather than dawdling.
// ═══════════════════════════════════════════════════════════════════════════

ETimeFitResult FTransitionSolver::FitTime(FTransitionPlan& Plan, const FTransitionRequest& Req)
{
    const float Target = Req.TargetArrival;

    // Bracket what is physically achievable along this exact path.
    const float Fastest = TraverseAtProfile(Plan, EProfile::Maximum);
    const float Slowest = TraverseAtProfile(Plan, EProfile::Minimum);

    if (Target < Fastest - Req.TimeTolerance)
    {
        // Cannot arrive in time even flat out. This is a real authoring error
        // and the Composer must say so precisely (see Diagnose below).
        Plan.Shortfall = Fastest - Target;
        return ETimeFitResult::TooSlow;
    }

    if (Target > Slowest + Req.TimeTolerance)
    {
        // Arriving early. Do NOT solve this by crawling - a skater dawdling to
        // fill four seconds looks exactly as bad as it sounds. Spend the
        // surplus on skating that earns something.
        const float Surplus = Target - Slowest;
        return FillSlack(Plan, Surplus, Req);
    }

    // Inside the achievable window: solve for the scalar speed profile that
    // lands on the target. Monotonic in the profile parameter, so bisection
    // converges in a handful of iterations.
    Plan.SpeedProfile = SolveProfileForDuration(Plan, Target);
    return ETimeFitResult::Exact;
}

ETimeFitResult FTransitionSolver::FillSlack(FTransitionPlan& Plan, float Surplus,
                                            const FTransitionRequest& Req)
{
    // Preference order matters and is a design statement, not an optimisation.
    // Rest first if the program needs it, then earn variety, then lengthen the
    // line, and only pad as a last resort.
    while (Surplus > 0.3f)
    {
        const FPrimitive* Filler = nullptr;

        if (Req.Budget.LegsAvailable < 0.35f)
            Filler = FindPrimitive("spiral");          // negative leg cost: rest
        else if (Plan.MissingTurnTypes() > 0)
            Filler = FindBestNewTurnType(Plan, Req);   // variety is free score
        else if (Req.Ice->FreshIceNear(Plan.Tail()) > 0.5f)
            Filler = FindPrimitive("glide_curve");     // extend the line, cover ice
        else
            Filler = FindPrimitive("loop_turn");       // burns time, goes nowhere

        if (!Filler || !TryInsert(Plan, *Filler, Surplus)) break;
        Surplus -= Filler->DurationAt(Plan.MeanSpeed());
    }

    Plan.SpeedProfile = SolveProfileForDuration(Plan, Req.TargetArrival);
    return Surplus > 0.5f ? ETimeFitResult::Padded : ETimeFitResult::Exact;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6 - WHOLE-PROGRAM CHAINING
//
// Transitions are NOT independent. Exit speed of one is entry speed of the
// next; stamina is a global budget; ice coverage is a global goal. Solving
// each greedily produces a program that is exhausted by the second half -
// which is precisely where the 1.1x bonus lives.
//
// So: generate K diverse candidates per transition, then dynamic-program over
// (transition index, speed bin, stamina bin) to pick a globally coherent set.
// ═══════════════════════════════════════════════════════════════════════════

bool FTransitionSolver::SolveProgram(const FProgram& Prog, FProgramPlan& Out)
{
    const int32 T = Prog.Transitions.Num();
    TArray<TArray<FTransitionPlan>> Candidates;   // [transition][k]

    for (int32 i = 0; i < T; ++i)
        Candidates.Add(PlanDiverse(Prog.Transitions[i], kCandidatesPerTransition));

    // DP over a coarse resource grid. Small enough to be exhaustive:
    // ~12 transitions x 8 speed bins x 10 stamina bins x 6 candidates.
    TArray<FDpCell> Prev, Cur;
    InitDp(Prev, Prog.StartState);

    for (int32 i = 0; i < T; ++i)
    {
        ResetDp(Cur);
        for (const FDpCell& From : Prev)
        {
            if (!From.bReachable) continue;
            for (const FTransitionPlan& C : Candidates[i])
            {
                // Chaining constraint: this candidate must accept the speed the
                // previous one actually delivered.
                if (!C.AcceptsEntrySpeed(From.Speed)) continue;

                const float Legs = From.Legs - C.LegsCost;
                const float Wind = From.Wind - C.WindCost;
                if (Legs < Prog.MinLegsAt(i) || Wind < 0.f) continue;

                // The element that FOLLOWS this transition also costs stamina,
                // and if it is a jump in the second half it is carrying the
                // 1.1x bonus. Charge it here so the DP protects it.
                const float AfterElement = Legs - Prog.Elements[i + 1].LegsCost;
                if (AfterElement < 0.f) continue;

                const float Score = From.Score + C.Cost
                                  + Prog.BonusRisk(i + 1, AfterElement);
                Relax(Cur, C.ExitSpeed, AfterElement, Wind, Score, i, &C, &From);
            }
        }
        if (AllUnreachable(Cur)) { Out.FailedAt = i; return false; }
        Prev = Cur;
    }

    Out = Backtrack(Prev);
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7 - DIAGNOSTICS
//
// A solver that says "no path" is useless to an author. Recover the reason by
// relaxing one constraint at a time and re-solving: whichever relaxation
// rescues the plan IS the explanation, and it comes with the number attached.
// ═══════════════════════════════════════════════════════════════════════════

FDiagnosis FTransitionSolver::Diagnose(const FTransitionRequest& Req)
{
    static const FRelaxation Ladder[] = {
        { ERelax::Time,       "needs %.1fs more approach"                    },
        { ERelax::EntrySpeed, "cannot reach %.1f m/s in this gap"            },
        { ERelax::Stamina,    "projected leg stamina is %.0f%% short here"   },
        { ERelax::Curvature,  "entry edge cannot be held this shallow"       },
        { ERelax::IceRegion,  "approach needs the long axis; it is occupied" },
    };

    for (const FRelaxation& R : Ladder)
    {
        FTransitionRequest Relaxed = Req;
        const float Amount = ApplyRelaxation(Relaxed, R.Kind);
        FTransitionPlan Ignored;
        if (PlanPath(Relaxed, Ignored))
            return { R.Kind, Amount, FormatSuggestion(R, Amount, Req) };
    }
    return { ERelax::None, 0.f, "no single change makes this transition skatable" };
}

} // namespace Composer
