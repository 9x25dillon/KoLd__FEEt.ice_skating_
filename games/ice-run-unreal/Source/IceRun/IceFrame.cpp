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
