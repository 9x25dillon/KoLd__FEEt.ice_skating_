#pragma once

#include "CoreMinimal.h"
#include "Camera/CameraActor.h"
#include "IceFrame.h"
#include "IceShotCamera.generated.h"

/**
 * The cameras of scripts/main.gd update_camera, with scripts/shot.gd's
 * framing per move: Tracking (behind the line of travel, a little to the
 * side, looking ahead of the skater), Broadcast (from the stands), Rink (high
 * over a corner) and Blade (low beside the skate). A jump keeps its camera.
 */
UCLASS()
class AIceShotCamera : public ACameraActor
{
	GENERATED_BODY()

public:
	AIceShotCamera();
	virtual void Tick(float DeltaSeconds) override;
	/** Follows this skater, ticking after its pose so the frame never trails it. */
	void Watch(class AIceSkater* Skater);
	void Follow(const FIceState& State, const FVector& SkaterLocation, float Dt);
	/** The next camera; not while the skater is in the air. */
	void Cycle(const FIceState& State);
	int32 Mode() const { return CameraMode; }
	static const TCHAR* ModeName(int32 Mode);

private:
	struct FShot
	{
		double Away = 4.7;
		double Height = .9;
		double Aim = .9;
		double Lead = .6;
	};
	static FShot Framing(const FIceState& State);

	TWeakObjectPtr<class AIceSkater> Watched;
	int32 CameraMode = 0;
	bool bPlaced = false;
	FVector FollowDirection = FVector(1.0, 0.0, 0.0);
	FShot Shot;
	double Fov = 46.0;
};
