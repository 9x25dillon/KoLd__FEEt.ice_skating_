#pragma once

#include "CoreMinimal.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "IceSpray.generated.h"

/**
 * skater.gd's two CPUParticles3D sprays, one per blade: snow thrown back and up from under the
 * ankle when that edge slips sideways at speed, harder the more the blade is loaded. Each flake
 * flies under gravity, settles on the ice and lies there until its life is up. Presentation only:
 * it reads the sim's blades and writes nothing back.
 */
UCLASS()
class UIceSpray : public UInstancedStaticMeshComponent
{
	GENERATED_BODY()

public:
	UIceSpray();

	/** One blade's emitter this frame, in world space: where, which way (unit), the fastest throw in m/s, and whether it throws. */
	void Feed(int32 Blade, const FVector& At, const FVector& Direction, float FastestThrow, bool bThrowing);
	/** Throws what is owed, moves every flake on by Dt, and draws them. */
	void Step(float Dt);
	/** No snow: a new run. */
	void Clear();

	// skater.gd: 45 flakes a blade, each living .48 s, thrown within 30 degrees of the direction at
	// .5 m/s at the least, falling at 4 m/s², spheres of 8 to 21 mm radius in dfebef.
	static constexpr int32 Amount = 45;
	static constexpr float Lifetime = .48f;
	static constexpr float SpreadDegrees = 30.f;
	static constexpr float Gravity = 4.f;
	static constexpr float SlowestThrow = .5f;
	static constexpr float SmallestRadius = .008f;
	static constexpr float LargestRadius = .021f;

private:
	struct FFlake
	{
		FVector At;
		FVector Velocity;
		float Age = 0.f;
		float Radius = .01f;
		int32 Blade = 0;
		bool bSettled = false;
	};
	TArray<FFlake> Flakes;
	FVector Source[2];
	FVector Toward[2];
	float Fastest[2] = {1.f, 1.f};
	bool bOn[2] = {false, false};
	float Owed[2] = {0.f, 0.f};
	FRandomStream Random;
	bool bDressed = false;
	TArray<FTransform> Drawn;
};
