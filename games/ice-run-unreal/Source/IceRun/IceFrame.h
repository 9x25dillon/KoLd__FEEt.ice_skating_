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

/**
 * sim/support.ts SupportSignal, sent beside the state: who carries the skater,
 * where the pressure is, how the load is moving. scripts/skater.gd reads the
 * same one. Invalid for a frame that carries none.
 */
struct FIceSupport
{
	bool bValid = false;
	/** one, both, shift, air or down. */
	FString Phase;
	int32 Foot = 0;
	/** The blade gaining load during a shift, or -1. */
	int32 Toward = -1;
	double Share[2] = {0.0, 0.0};
	double Rate[2] = {0.0, 0.0};
	/** carrying, sharing, taking, giving or free. */
	FString Role[2];
	FVector2D Cop = FVector2D::ZeroVector;
	double ComOverAcross = 0.0;
	double ComOverAlong = 0.0;
	double ComHeight = 0.95;
};

/**
 * game/footprep.ts FootPrep, per blade: where a free foot is carried before it
 * takes the load (beside, extended, cross, under, held, or none).
 * scripts/skater.gd reads the same one.
 */
struct FIceFootPrep
{
	bool bValid = false;
	FString Pose;
	double Weight = 0.0;
	FVector2D At = FVector2D::ZeroVector;
	double Lift = 0.0;
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
	FIceSupport Support;
	FIceFootPrep FootPrep[2];
};

/** A trace sample: both blades' contacts, every fourth tick (bridge/engine.mjs advance). */
struct FIceTraceSample
{
	FVector2D At[2];
	bool bContact[2] = {false, false};
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
	TSharedPtr<FJsonObject> Raw;

	static FIceFrame Parse(const TSharedPtr<FJsonObject>& Snapshot);
};
