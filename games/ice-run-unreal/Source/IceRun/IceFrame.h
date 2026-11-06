#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"

/** sim/types.ts MOVE. */
namespace IceMove
{
	enum : int32 { None = 0, Turn = 1, Twizzle = 2, Spin = 3, InaBauer = 4, Spiral = 5 };
}

/** sim/jump.ts JUMP_PHASE. */
namespace IceJumpPhase
{
	enum : int32 { None = 0, Load = 1, Air = 2 };
}

/** One blade, as sim/types.ts states it: only what the presentation reads. */
struct FIceBlade
{
	FVector2D Contact = FVector2D::ZeroVector;
	FVector2D Tangent = FVector2D(1.0, 0.0);
	double Tilt = 0.0;
	double Weight = 0.5;
	double NormalLoad = 0.0;
	double LongSpeed = 0.0;
	double LatSlipAccel = 0.0;
	bool bInContact = true;
};

/** The solver's SkaterState, the fields scripts/skater.gd poses from. */
struct FIceState
{
	FVector2D Pos = FVector2D::ZeroVector;
	FVector2D Vel = FVector2D::ZeroVector;
	FVector2D Heading = FVector2D(1.0, 0.0);
	double YawRate = 0.0;
	double Lean = 0.0;
	double LatAccel = 0.0;
	double ComZ = 0.95;
	double Knee = 0.35;
	double StrokeTime = 0.0;
	double IntAccel = 0.0;
	double BalanceError = 0.0;
	double Twist = 0.0;
	double FreeSwing = 0.0;
	double ArmsL = 0.0;
	int32 SupportFoot = 0;
	/** The sim's stamina, 1 fresh .. 0 spent: breath and legs (staminaMode). */
	double Wind = 1.0;
	double Legs = 1.0;
	int32 Move = IceMove::None;
	int32 Tick = 0;
	bool bFallen = false;
	int32 JumpPhase = IceJumpPhase::None;
	double JumpZ = 0.0;
	double JumpVz = 0.0;
	double JumpRotation = 0.0;
	double JumpInertia = 0.0;
	int32 SpinPosition = 0;
	double SpinInertia = 0.0;
	FIceBlade Blade[2];
};

/** A trace sample: both blades' contacts, every fourth tick (bridge/engine.mjs advance). */
struct FIceTraceSample
{
	FVector2D At[2];
	bool bContact[2] = {false, false};
};

/** game/choreo.ts's arm: the elbow's direction and the hand's point from the shoulder, x outward on its own side. */
struct FIceArmShape
{
	FVector E = FVector::ZeroVector;
	FVector H = FVector::ZeroVector;
	/** The wrist: 0 soft, 1 long (allongé). */
	double W = .5;
	/** The hand's y is its height above the ice. */
	bool bIce = false;
	bool bHas = false;
};

/** game/choreo.ts's trunk and head, radians, toward the plan's side A where a side applies. */
struct FIceTrunk
{
	double Pitch = 0.0;
	double Roll = 0.0;
	double Twist = 0.0;
	double Chin = 0.0;
	double Turn = 0.0;
	bool bHas = false;
};

/** A fall's trunk on the ice, x toward the side she falls on. */
struct FIceFallFrame
{
	FVector Hip = FVector::ZeroVector;
	FVector Spine = FVector::ZeroVector;
	FVector Neck = FVector::ZeroVector;
	FVector Head = FVector::ZeroVector;
	FVector Under = FVector::ZeroVector;
	FVector Other = FVector::ZeroVector;
	bool bHas = false;
};

struct FIceKey
{
	double T = 0.0;
	FIceArmShape ArmA;
	FIceArmShape ArmB;
	FVector Leg = FVector::ZeroVector;
	bool bHasLeg = false;
	double Point = 0.0;
	FIceTrunk Trunk;
	FIceFallFrame Fall;
};

/**
 * A choreography plan (game/choreo.ts): a short timeline in the body frame that the skater blends
 * over the pose the physics gives. Played on the client's own clock from where the bridge said it was.
 */
struct FIcePlan
{
	bool bValid = false;
	int32 Id = 0;
	FString Kind;
	FString Label;
	/** left, right, support, fall: which side is A. */
	FString Rel;
	double Dur = 0.0;
	double BlendIn = .1;
	double BlendOut = .3;
	double Weight = 1.0;
	/** Seconds into the plan when the bridge sent it. */
	double At = 0.0;
	TArray<FIceKey> Keys;

	static FIcePlan Parse(const TSharedPtr<FJsonObject>& Object);
	/** The plan at T seconds: between its keys, smoothstepped. */
	FIceKey Sample(double T) const;
	/** Its weight at T seconds: eased in over BlendIn, out over the last BlendOut. */
	double Blend(double T) const;
};

/**
 * One bridge snapshot (bridge/engine.mjs IceEngine.snapshot): the state in
 * typed fields, the words and scores the HUD shows, and the rest kept as JSON.
 */
struct FIceFrame
{
	bool bValid = false;
	FIceState State;
	FString Mode;
	FString MoveLabel;
	FString Edge[2];
	FString Recover;
	bool bLow = false;
	bool bFinished = false;
	double Elapsed = 0.0;
	double Technical = 0.0;
	double ArmStyle = 1.0;
	int32 SpinLevel = -1;
	FString Combo;
	TArray<FIceTraceSample> Trace;
	/** game/choreo.ts: the base plan (port de bras, a spin's line) and the top one (a landing, a fall, the bow). */
	FIcePlan Base;
	FIcePlan Top;
	TSharedPtr<FJsonObject> Raw;

	static FIceFrame Parse(const TSharedPtr<FJsonObject>& Snapshot);
};
