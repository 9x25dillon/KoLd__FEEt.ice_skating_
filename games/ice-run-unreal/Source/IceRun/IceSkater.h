#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "IceFrame.h"
#include "IceSkater.generated.h"

class UPoseableMeshComponent;
class UStaticMeshComponent;

/**
 * The skater, posed every frame from the solver's own state: the port of
 * games/ice-run-godot/scripts/skater.gd. The hip from comZ, the trunk along
 * the contact-to-centre-of-mass pendulum, each boot rolled by its blade's
 * tilt and placed at its contact; only what the sim does not state (arms,
 * the free leg, spin and fall shapes) is authored and eased.
 *
 * The working is in Godot's body frame (x right, y up, z back, metres) so it
 * reads against skater.gd line for line; IceSimSpace::FromBody is the only
 * door into Unreal's. The skirt's panels swing on skater.gd's springs in its
 * world frame (GodotWorld, below). Not yet ported: the face and eyes, snow spray.
 */
UCLASS()
class AIceSkater : public AActor
{
	GENERATED_BODY()

public:
	AIceSkater();
	virtual void Tick(float DeltaSeconds) override;

	/** A new snapshot from the bridge. Snap puts the body there at once (a new run). */
	void ApplyFrame(const FIceFrame& Frame, bool bSnap);
	/** Loads a skeletal mesh by object path. False, with a stand-in shown, when it is missing. */
	bool LoadModel(const FString& ObjectPath);
	/** The blade a spin's finish has lifted off the ice, or -1 (skater.gd lifted_blade). */
	int32 LiftedBlade() const;
	bool HasModel() const { return bHasModel; }

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UPoseableMeshComponent> Body;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> StandIn;

private:
	void MeasureRig();
	void Pose(float Dt);
	void TrackFall(float Dt);
	void FollowSpin(float Dt, bool bUpright, bool bAir);
	double ExitProgress() const;
	double ExitAmount() const;
	/** A sim vector (m) in the body frame, from the body's current facing. */
	FVector BodyFromSim(double X, double Y) const;
	FVector ToComponent(const FVector& BodyPoint) const;
	FVector ToComponentDir(const FVector& BodyDir) const;
	void AimBone(FName Name, const FVector& Head, const FVector& Tail, double Twist = 0.0);
	void MeasureSkirt();
	void SwingSkirt(float Dt, const FVector& Hip, const FVector& Spine, const TArray<FVector>& Legs);
	/** Godot's world frame (x along the sheet, y up, z = 18 - sim y; metres) and the body's rotation.y in it. */
	FVector GodotWorld(const FVector& BodyPoint) const;
	FVector GodotLocal(const FVector& WorldPoint) const;
	double GodotYaw() const { return Facing - UE_DOUBLE_PI / 2.0; }
	void AimFoot(FName Name, const FVector& Ankle, const FVector& Toe, const FVector& Up);
	FVector PlantLeg(const FString& Suffix, const FVector& Hip, const FVector& Ankle, const FVector& Pole);

	FIceState State;
	bool bHaveState = false;
	bool bPoseLow = false;
	double ArmStyle = 1.0;
	double FrameAge = 0.0;
	bool bInitialized = false;
	bool bHasModel = false;

	/** The rest pose in component space, by bone. */
	TMap<FName, FTransform> Rest;
	/** The bone-local axis that points along a bone (Blender's +Y, wherever the import put it). */
	FVector AlongLocal = FVector(0.0, 1.0, 0.0);

	// The rig's own proportions, metres (skater.gd measure_rig); defaults are skater.glb's.
	double Thigh = .4105;
	double Shin = .3755;
	double AnkleHeight = .105;
	double HipHalfWidth = .105;
	double ComAboveHip = .06;
	double HipsLength = .17;
	double SpineLength = .37;
	FVector2D ShoulderRest = FVector2D(.185, .04);
	double UpperArm = .29;
	double Forearm = .2074;

	/** The sim's anticlockwise facing, radians, eased (skater.gd's rotation.y, less a quarter turn). */
	double Facing = 0.0;
	double UpperTurn = 0.0;
	double HeadTurn = 0.0;
	double HeadDown = 0.0;
	double Backing = 0.0;
	double ArmEnergy = 0.0;
	double SwayClock = 0.0;
	double ArmLag = 0.0;
	double ArmLagRate = 0.0;
	double ArmLastYaw = 0.0;

	bool bWasSpinning = false;
	int32 SpinFoot = 0;
	double SpinRate = 0.0;
	double SpinSign = 1.0;
	double SpinExitLeft = 0.0;
	double SpinExitPower = 0.0;
	double ArmOpen[2] = {1.0, 1.0};

	double FallClock = -1.0;
	double FallSide = 1.0;

	FVector TrunkOffsets[4];
	FVector FreeFeet[2];
	double FootOnIce[2] = {1.0, 1.0};
	FVector ArmTargets[4];
	FVector HandLast[2];
	FVector HandAim[2];
	FVector ContactSlide[2];
	TArray<FVector> LastContacts;

	// The skirt: panels hanging from the waist, each tip on a spring toward where it hangs at rest.
	TArray<FName> SkirtBones;
	TArray<FVector> SkirtPivots;
	TArray<FVector> SkirtRestTips;
	TArray<FVector> SkirtTips;
	TArray<FVector> SkirtLast;
	double SkirtGap = 0.0;
	bool bSkirtDirty = true;
	double SkirtClock = 0.0;
	FVector SkirtCentreLast = FVector::ZeroVector;
	double SkirtYawLast = 0.0;
};
