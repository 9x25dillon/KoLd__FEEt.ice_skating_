#pragma once

#include "CoreMinimal.h"

/**
 * Ice Lab's plan view has +x along the sheet and +y to the left of +x,
 * anticlockwise positive, in metres; the sheet's centre is at sim y = 18
 * (game/rink.ts RINK). Unreal has X forward, Y right and Z up, in
 * centimetres. Every sim position and direction reaches the world through
 * here, so left stays left: the twin of games/ice-run-godot/scripts/sim_space.gd.
 *
 * The skater's pose is worked in Godot's body frame (x right, y up, z back,
 * metres) so it can follow scripts/skater.gd line by line; FromBody() is the
 * one place that frame becomes Unreal's.
 */
namespace IceSimSpace
{
	constexpr double RinkCentreY = 18.0;
	constexpr double CmPerM = 100.0;

	inline FVector Point(double X, double Y, double Height = 0.0)
	{
		return FVector(X * CmPerM, -(Y - RinkCentreY) * CmPerM, Height * CmPerM);
	}

	/** A sim direction or velocity, still in sim units (m, m/s). */
	inline FVector Direction(double X, double Y)
	{
		return FVector(X, -Y, 0.0);
	}

	/** The Unreal yaw, in degrees, that points an actor's +X along a sim direction. */
	inline double Yaw(double X, double Y)
	{
		return FMath::RadiansToDegrees(FMath::Atan2(-Y, X));
	}

	/** Godot body frame (x right, y up, z back; m) to an Unreal actor's own frame (cm). */
	inline FVector FromBody(const FVector& G)
	{
		return FVector(-G.Z, G.X, G.Y) * CmPerM;
	}

	/** The inverse of FromBody. */
	inline FVector ToBody(const FVector& U)
	{
		return FVector(U.Y, U.Z, -U.X) / CmPerM;
	}

	/** A direction, without the scale. */
	inline FVector DirFromBody(const FVector& G)
	{
		return FVector(-G.Z, G.X, G.Y);
	}
}
