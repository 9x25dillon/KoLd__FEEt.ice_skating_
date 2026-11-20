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
	/**
	 * The director (camera 5): picks one of the four each moment, as a broadcast's would: close
	 * through a jump's load, flight and landing, close or at the blades in a spin (alternating), at
	 * the blades for turns, wide for the glide, the rink from above now and then on a long one; a
	 * hard cut each time, held at least a moment. AUTHORED (L3) rules.
	 */
	int32 Direct(const FIceState& State, float Dt);
	int32 Directed = 1;
	double CutAge = 0.0;
	double GlideAge = 0.0;
	double SinceJump = 10.0;
	int32 SpinShot = 3;
	int32 LastMove = 0;

	TWeakObjectPtr<class AIceSkater> Watched;
	int32 CameraMode = 0;
	bool bPlaced = false;
	FVector FollowDirection = FVector(1.0, 0.0, 0.0);
	FShot Shot;
	double Fov = 46.0;
	double ShowClock = 0.0;
};
