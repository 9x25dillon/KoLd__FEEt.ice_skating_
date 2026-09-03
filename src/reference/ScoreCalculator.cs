// Edgework - reference implementation excerpt
// Copyright 2026 Dillon (github.com/9x25dillon)
// SPDX-License-Identifier: Apache-2.0
//
// Illustrative reference code from the Edgework design bible (docs/design-bible.md).
// These are specifications-as-code, not a compiling module: helper functions
// (MoveTowards, WrapPi, EdgeMismatch, ...) are declared in the bible and left
// to the implementation. See src/reference/README.md.

public enum ElementCategory { Jump, JumpCombo, JumpSequence, Spin, StepSequence,
                              ChoreoSequence, Lift, Throw }
public enum JumpType     { Toeloop, Salchow, Loop, Flip, Lutz, Axel }
public enum SpinType     { Upright, Sit, Camel, Layback, Combination,
                           FlyingCamel, FlyingSit }
public enum RotationCall { Clean, Quarter, UnderRotated, Downgraded } // -, q, <, <<
public enum EdgeCall     { Clean, Unclear, Wrong }                    // -, !, e
public enum Component    { Composition, Presentation, SkatingSkills }

// Scale of Values, indexed [jump, revolutions - 1]. This lives in a DataTable
// in the shipping game: the ISU revises it most seasons and a live title has
// to follow within days of publication.
static readonly float[,] JumpBV = {
//    single  double  triple    quad
    { 0.40f,  1.30f,  4.20f,   9.50f },  // Toeloop
    { 0.40f,  1.30f,  4.30f,   9.70f },  // Salchow
    { 0.50f,  1.70f,  4.90f,  10.50f },  // Loop
    { 0.50f,  1.80f,  5.30f,  11.00f },  // Flip
    { 0.60f,  2.10f,  5.90f,  11.50f },  // Lutz
    { 1.10f,  3.30f,  8.00f,  12.50f },  // Axel (a "single" is 1.5 revolutions)
};

public sealed class ScoreCalculator
{
    const float SecondHalfBonus = 1.10f;

    // ── Base value ────────────────────────────────────────────────────────
    public float BaseValue(ElementResult e)
    {
        float bv = 0f;

        foreach (var j in e.Jumps)
        {
            float b = JumpBV[(int)j.Type, j.Revolutions - 1];
            switch (j.Rotation)
            {
                case RotationCall.UnderRotated: b *= 0.80f;             break;
                case RotationCall.Downgraded:   b = DowngradeValue(j);  break;
                // A quarter call keeps full base value and is punished only
                // through a mandatory GOE reduction.
            }
            if (j.EdgeCall == EdgeCall.Wrong) b = WrongEdgeValue(j);
            bv += b;
        }

        if (e.Category == ElementCategory.JumpSequence) bv *= 0.80f;

        if (e.Category is ElementCategory.Spin or ElementCategory.StepSequence)
            bv = LevelTable[e.Kind][(int)e.Level];

        // Only the last jump element started in the second half is boosted —
        // which is exactly why program layout is a strategic decision.
        if (e.IsSecondHalf && e.IsBonusEligible) bv *= SecondHalfBonus;

        if (e.ViolatesRepetitionRule) bv = 0f;          // the Zayak rule

        return Round2(bv);
    }

    // One GOE step is worth 10% of base value for jumps; spins and step
    // sequences use a fixed increment per level.
    public float GoeStep(ElementResult e) =>
        e.Category is ElementCategory.Jump or ElementCategory.JumpCombo
            ? Round2(0.10f * RawBaseValue(e))
            : LevelGoeStep[e.Kind][(int)e.Level];

    public float ElementScore(ElementResult e, IReadOnlyList<int> panelGoe)
        => Round2(BaseValue(e) + TrimmedMean(panelGoe) * GoeStep(e));

    // Nine judges; drop the highest and lowest, average the remaining seven.
    static float TrimmedMean(IReadOnlyList<float> v)
    {
        var s = v.OrderBy(x => x).ToArray();
        float sum = 0f;
        for (int i = 1; i < s.Length - 1; i++) sum += s[i];
        return sum / (s.Length - 2);
    }

    // ── Segment ───────────────────────────────────────────────────────────
    public SegmentScore Score(Program p, JudgePanel panel, SegmentRules rules)
    {
        var seg = new SegmentScore();

        foreach (var e in p.Elements)
            seg.TES += ElementScore(e, panel.CollectGoe(e));

        // Three components since 2022-23. Each judge scores 0.25-10.00 in
        // quarter steps; the panel is trimmed, then scaled by a factor that
        // brings short and free programs to comparable magnitudes.
        foreach (Component c in Enum.GetValues<Component>())
            seg.PCS += Round2(TrimmedMean(panel.CollectComponent(c, p)))
                     * rules.ComponentFactor;   // e.g. 2.67, women's free skate

        seg.Deductions = Deductions(p, rules);
        seg.TES = Round2(seg.TES);
        seg.PCS = Round2(seg.PCS);
        seg.Total = Round2(seg.TES + seg.PCS - seg.Deductions);
        return seg;
    }

    static float Deductions(Program p, SegmentRules rules)
    {
        float d = 0f;
        for (int i = 0; i < p.Falls; i++)          // -1, -1, -2, -2, -3, -3 ...
            d += i < 2 ? 1f : (i < 4 ? 2f : 3f);

        float over = Mathf.Abs(p.DurationSeconds - rules.TargetSeconds)
                   - rules.ToleranceSeconds;
        if (over > 0f) d += Mathf.Ceil(over / 5f);          // -1.0 per 5 seconds

        d += p.CostumeViolations * 1f;
        d += p.IllegalElements   * 2f;
        d += p.Interruptions     * 1f;
        return d;
    }
}

// ── A judge is a person, not a formula ───────────────────────────────────
// Nine of them disagreeing is what makes a score feel earned rather than
// computed. Seeded from the replay header so a run always re-scores the same.
public static int JudgeGoe(Judge j, ElementResult e, Rng rng)
{
    float v = Mathf.Lerp(-5f, 5f, e.Quality);          // 0..1 from the sim
    v += j.TechnicalBias * e.DifficultyZ;              // some reward risk
    v -= j.Strictness    * e.BlemishCount;
    v += j.Halo          * e.Skater.Reputation;
    v += j.FederationWarmth(e.Skater, e.Venue);

    if (e.HasFall)                       v  = -5f;                  // mandatory
    if (e.EdgeCall  == EdgeCall.Wrong)   v  = Mathf.Min(v, -1f);
    if (e.Rotation  == RotationCall.Quarter) v -= 1f;               // mandatory
    if (e.MusicalCredit > 0.7f)          v += 0.4f;

    v += rng.Gaussian(0f, j.NoiseSigma);
    return Mathf.Clamp(Mathf.RoundToInt(v), -5, 5);
}
