#include "IceFrame.h"

namespace
{
	double Number(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, double Fallback = 0.0)
	{
		double Value = Fallback;
		return Object.IsValid() && Object->TryGetNumberField(Key, Value) ? Value : Fallback;
	}

	bool Flag(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, bool Fallback = false)
	{
		bool Value = Fallback;
		return Object.IsValid() && Object->TryGetBoolField(Key, Value) ? Value : Fallback;
	}

	TSharedPtr<FJsonObject> Child(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key)
	{
		const TSharedPtr<FJsonObject>* Found = nullptr;
		return Object.IsValid() && Object->TryGetObjectField(Key, Found) ? *Found : nullptr;
	}

	FVector2D Vec(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, const FVector2D& Fallback = FVector2D::ZeroVector)
	{
		const TSharedPtr<FJsonObject> V = Child(Object, Key);
		return V.IsValid() ? FVector2D(Number(V, TEXT("x"), Fallback.X), Number(V, TEXT("y"), Fallback.Y)) : Fallback;
	}

	FIceBlade ParseBlade(const TSharedPtr<FJsonObject>& B)
	{
		FIceBlade Blade;
		Blade.Contact = Vec(B, TEXT("contact"));
		Blade.Tangent = Vec(B, TEXT("tangent"), FVector2D(1.0, 0.0));
		Blade.Tilt = Number(B, TEXT("tilt"));
		Blade.Weight = Number(B, TEXT("weight"), 0.5);
		Blade.NormalLoad = Number(B, TEXT("normalLoad"));
		Blade.LongSpeed = Number(B, TEXT("longSpeed"));
		Blade.LatSlipAccel = Number(B, TEXT("latSlipAccel"));
		Blade.bInContact = Flag(B, TEXT("inContact"), true);
		return Blade;
	}
}

FIceFrame FIceFrame::Parse(const TSharedPtr<FJsonObject>& Snapshot)
{
	FIceFrame Frame;
	const TSharedPtr<FJsonObject> S = Child(Snapshot, TEXT("state"));
	if (!S.IsValid())
	{
		return Frame;
	}
	Frame.bValid = true;
	Frame.Raw = Snapshot;
	FIceState& State = Frame.State;
	State.Pos = Vec(S, TEXT("pos"));
	State.Vel = Vec(S, TEXT("vel"));
	State.Heading = Vec(S, TEXT("heading"), FVector2D(1.0, 0.0));
	State.YawRate = Number(S, TEXT("yawRate"));
	State.Lean = Number(S, TEXT("lean"));
	State.LatAccel = Number(S, TEXT("latAccel"));
	State.ComZ = Number(S, TEXT("comZ"), 0.95);
	State.Knee = Number(S, TEXT("knee"), 0.35);
	State.StrokeTime = Number(S, TEXT("strokeTime"));
	State.IntAccel = Number(S, TEXT("intAccel"));
	State.BalanceError = Number(S, TEXT("balanceError"));
	State.Twist = Number(S, TEXT("twist"));
	State.FreeSwing = Number(S, TEXT("freeSwing"));
	State.ArmsL = Number(S, TEXT("armsL"));
	State.SupportFoot = int32(Number(S, TEXT("supportFoot")));
	State.Move = int32(Number(S, TEXT("move")));
	State.Tick = int32(Number(S, TEXT("tick")));
	State.bFallen = Flag(S, TEXT("fallen"));
	const TSharedPtr<FJsonObject> Jump = Child(S, TEXT("jump"));
	State.JumpPhase = int32(Number(Jump, TEXT("phase")));
	State.JumpZ = Number(Jump, TEXT("z"));
	State.JumpVz = Number(Jump, TEXT("vz"));
	State.JumpRotation = Number(Jump, TEXT("rotation"));
	State.JumpInertia = Number(Jump, TEXT("inertia"));
	const TSharedPtr<FJsonObject> Spin = Child(S, TEXT("spin"));
	State.SpinPosition = int32(Number(Spin, TEXT("position")));
	State.SpinInertia = Number(Spin, TEXT("inertia"));
	const TArray<TSharedPtr<FJsonValue>>* Blades = nullptr;
	if (S->TryGetArrayField(TEXT("blade"), Blades))
	{
		for (int32 I = 0; I < 2 && I < Blades->Num(); ++I)
		{
			State.Blade[I] = ParseBlade((*Blades)[I]->AsObject());
		}
	}

	Snapshot->TryGetStringField(TEXT("mode"), Frame.Mode);
	Snapshot->TryGetStringField(TEXT("move"), Frame.MoveLabel);
	Snapshot->TryGetStringField(TEXT("recover"), Frame.Recover);
	Snapshot->TryGetStringField(TEXT("combo"), Frame.Combo);
	const TSharedPtr<FJsonObject> Choreo = Child(Snapshot, TEXT("choreo"));
	Frame.Base = FIcePlan::Parse(Child(Choreo, TEXT("base")));
	Frame.Top = FIcePlan::Parse(Child(Choreo, TEXT("top")));
	Frame.bLow = Flag(Snapshot, TEXT("low"));
	Frame.bFinished = Flag(Snapshot, TEXT("finished"));
	Frame.Elapsed = Number(Snapshot, TEXT("elapsed"));
	Frame.Technical = Number(Snapshot, TEXT("technical"));
	Frame.ArmStyle = Number(Snapshot, TEXT("armStyle"), 1.0);
	Frame.SpinLevel = int32(Number(Snapshot, TEXT("spinLevel"), -1.0));
	const TArray<TSharedPtr<FJsonValue>>* Edges = nullptr;
	if (Snapshot->TryGetArrayField(TEXT("edge"), Edges))
	{
		for (int32 I = 0; I < 2 && I < Edges->Num(); ++I)
		{
			Frame.Edge[I] = (*Edges)[I]->AsString();
		}
	}
	const TArray<TSharedPtr<FJsonValue>>* Trace = nullptr;
	if (Snapshot->TryGetArrayField(TEXT("trace"), Trace))
	{
		for (const TSharedPtr<FJsonValue>& Sample : *Trace)
		{
			const TArray<TSharedPtr<FJsonValue>>* Pair = nullptr;
			if (!Sample->TryGetArray(Pair) || Pair->Num() < 2)
			{
				continue;
			}
			FIceTraceSample Out;
			for (int32 I = 0; I < 2; ++I)
			{
				const TSharedPtr<FJsonObject> Point = (*Pair)[I]->AsObject();
				Out.At[I] = FVector2D(Number(Point, TEXT("x")), Number(Point, TEXT("y")));
				Out.bContact[I] = Flag(Point, TEXT("contact"));
			}
			Frame.Trace.Add(Out);
		}
	}
	return Frame;
}

namespace
{
	FVector Vec3(const TSharedPtr<FJsonObject>& O, const TCHAR* Key, bool& bHas)
	{
		const TArray<TSharedPtr<FJsonValue>>* A = nullptr;
		if (!O.IsValid() || !O->TryGetArrayField(Key, A) || A->Num() < 3)
		{
			return FVector::ZeroVector;
		}
		bHas = true;
		return FVector((*A)[0]->AsNumber(), (*A)[1]->AsNumber(), (*A)[2]->AsNumber());
	}

	FIceArmShape ArmOf(const TSharedPtr<FJsonObject>& O)
	{
		FIceArmShape Arm;
		if (!O.IsValid())
		{
			return Arm;
		}
		bool bE = false, bH = false;
		Arm.E = Vec3(O, TEXT("e"), bE);
		Arm.H = Vec3(O, TEXT("h"), bH);
		Arm.W = Number(O, TEXT("w"), .5);
		Arm.bIce = Flag(O, TEXT("ice"));
		Arm.bHas = bE && bH;
		return Arm;
	}

	FIceArmShape MixArm(const FIceArmShape& A, const FIceArmShape& B, double T)
	{
		if (!A.bHas || !B.bHas)
		{
			return B.bHas ? B : A;
		}
		FIceArmShape Out = B;
		Out.E = FMath::Lerp(A.E, B.E, T);
		Out.H = FMath::Lerp(A.H, B.H, T);
		Out.W = FMath::Lerp(A.W, B.W, T);
		return Out;
	}
}

FIcePlan FIcePlan::Parse(const TSharedPtr<FJsonObject>& O)
{
	FIcePlan Plan;
	if (!O.IsValid())
	{
		return Plan;
	}
	Plan.Id = int32(Number(O, TEXT("id")));
	O->TryGetStringField(TEXT("kind"), Plan.Kind);
	O->TryGetStringField(TEXT("label"), Plan.Label);
	O->TryGetStringField(TEXT("rel"), Plan.Rel);
	Plan.Dur = Number(O, TEXT("dur"));
	Plan.BlendIn = Number(O, TEXT("blendIn"), .1);
	Plan.BlendOut = Number(O, TEXT("blendOut"), .3);
	Plan.Weight = Number(O, TEXT("weight"), 1.0);
	Plan.At = Number(O, TEXT("at"));
	const TArray<TSharedPtr<FJsonValue>>* Keys = nullptr;
	if (O->TryGetArrayField(TEXT("keys"), Keys))
	{
		for (const TSharedPtr<FJsonValue>& V : *Keys)
		{
			const TSharedPtr<FJsonObject> K = V->AsObject();
			if (!K.IsValid())
			{
				continue;
			}
			FIceKey Key;
			Key.T = Number(K, TEXT("t"));
			Key.ArmA = ArmOf(Child(K, TEXT("armA")));
			Key.ArmB = ArmOf(Child(K, TEXT("armB")));
			Key.Leg = Vec3(K, TEXT("leg"), Key.bHasLeg);
			Key.Point = Number(K, TEXT("point"));
			if (const TSharedPtr<FJsonObject> T = Child(K, TEXT("trunk")))
			{
				Key.Trunk.bHas = true;
				Key.Trunk.Pitch = Number(T, TEXT("pitch"));
				Key.Trunk.Roll = Number(T, TEXT("roll"));
				Key.Trunk.Twist = Number(T, TEXT("twist"));
				Key.Trunk.Chin = Number(T, TEXT("chin"));
				Key.Trunk.Turn = Number(T, TEXT("turn"));
			}
			if (const TSharedPtr<FJsonObject> F = Child(K, TEXT("fall")))
			{
				bool bAll = true, bOne = false;
				Key.Fall.Hip = Vec3(F, TEXT("hip"), bOne); bAll &= bOne; bOne = false;
				Key.Fall.Spine = Vec3(F, TEXT("spine"), bOne); bAll &= bOne; bOne = false;
				Key.Fall.Neck = Vec3(F, TEXT("neck"), bOne); bAll &= bOne; bOne = false;
				Key.Fall.Head = Vec3(F, TEXT("head"), bOne); bAll &= bOne; bOne = false;
				Key.Fall.Under = Vec3(F, TEXT("under"), bOne); bAll &= bOne; bOne = false;
				Key.Fall.Other = Vec3(F, TEXT("other"), bOne); bAll &= bOne;
				Key.Fall.bHas = bAll;
			}
			Plan.Keys.Add(Key);
		}
	}
	Plan.bValid = Plan.Keys.Num() > 0 && Plan.Dur > 0.0;
	return Plan;
}

FIceKey FIcePlan::Sample(double T) const
{
	if (Keys.Num() == 0)
	{
		return FIceKey();
	}
	if (T <= Keys[0].T)
	{
		return Keys[0];
	}
	for (int32 I = 1; I < Keys.Num(); ++I)
	{
		const FIceKey& A = Keys[I - 1];
		const FIceKey& B = Keys[I];
		if (T > B.T)
		{
			continue;
		}
		const double U = B.T > A.T ? (T - A.T) / (B.T - A.T) : 1.0;
		const double S = U * U * (3.0 - 2.0 * U);
		FIceKey Out = B;
		Out.T = T;
		Out.ArmA = MixArm(A.ArmA, B.ArmA, S);
		Out.ArmB = MixArm(A.ArmB, B.ArmB, S);
		if (A.bHasLeg && B.bHasLeg)
		{
			Out.Leg = FMath::Lerp(A.Leg, B.Leg, S);
		}
		Out.Point = FMath::Lerp(A.Point, B.Point, S);
		if (A.Trunk.bHas && B.Trunk.bHas)
		{
			Out.Trunk.Pitch = FMath::Lerp(A.Trunk.Pitch, B.Trunk.Pitch, S);
			Out.Trunk.Roll = FMath::Lerp(A.Trunk.Roll, B.Trunk.Roll, S);
			Out.Trunk.Twist = FMath::Lerp(A.Trunk.Twist, B.Trunk.Twist, S);
			Out.Trunk.Chin = FMath::Lerp(A.Trunk.Chin, B.Trunk.Chin, S);
			Out.Trunk.Turn = FMath::Lerp(A.Trunk.Turn, B.Trunk.Turn, S);
		}
		if (A.Fall.bHas && B.Fall.bHas)
		{
			Out.Fall.Hip = FMath::Lerp(A.Fall.Hip, B.Fall.Hip, S);
			Out.Fall.Spine = FMath::Lerp(A.Fall.Spine, B.Fall.Spine, S);
			Out.Fall.Neck = FMath::Lerp(A.Fall.Neck, B.Fall.Neck, S);
			Out.Fall.Head = FMath::Lerp(A.Fall.Head, B.Fall.Head, S);
			Out.Fall.Under = FMath::Lerp(A.Fall.Under, B.Fall.Under, S);
			Out.Fall.Other = FMath::Lerp(A.Fall.Other, B.Fall.Other, S);
		}
		return Out;
	}
	return Keys.Last();
}

double FIcePlan::Blend(double T) const
{
	if (!bValid || T < 0.0 || T >= Dur)
	{
		return 0.0;
	}
	const double In = BlendIn > 0.0 ? FMath::Clamp(T / BlendIn, 0.0, 1.0) : 1.0;
	const double Out = BlendOut > 0.0 ? FMath::Clamp((Dur - T) / BlendOut, 0.0, 1.0) : 1.0;
	const double W = FMath::Min(In, Out);
	return W * W * (3.0 - 2.0 * W);
}
