#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "IceFrame.h"
#include "IceSkater.generated.h"

class UIceSpray;
class UMaterialInstanceDynamic;

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
 * world frame (GodotWorld, below). The snow off the blades is IceSpray's. Not yet ported: the face and eyes.
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
	/**
	 * Wears a costume: game/appearance.ts's skin colours on skater.gd's slots (bodice, skirt, sleeve,
	 * trim, hair; skin and tights tinted only for an atelier design, so a preset keeps its paint).
	 * Returns how many slots took it; a model without those slots keeps its own look.
	 */
	int32 ApplyCostume(const TSharedPtr<FJsonObject>& Skin);
	/** The blade a spin's finish has lifted off the ice, or -1 (skater.gd lifted_blade). */
	int32 LiftedBlade() const;
	bool HasModel() const { return bHasModel; }
	/** Slots wearing a material that is neither the model's own nor made from it: a model change that kept another model's. */
	int32 ForeignMaterials() const;
	/** Whether this model's face moves: eyes on M_Eye, lids on the Blink morph (the athlete's). */
	bool FaceMoves() const { return EyeMaterial != nullptr && BlinkWeight >= 0; }

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UPoseableMeshComponent> Body;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> StandIn;

	/** Snow off each blade (skater.gd's sprays). */
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UIceSpray> Spray;

public:
	/** skater.gd effects_active: the snow flies only while a run is being skated, not under a menu. */
	void SetEffects(bool bOn) { bEffects = bOn; }
	/** skater.gd lift_height: a pairs partner carried this high, metres, over her own jump height. */
	void SetLift(double Height) { LiftHeight = FMath::Max(0.0, Height); }
	/**
	 * A plan from a menu's preview (game/choreo.ts through the bridge's choreo op), played on the
	 * skater's own clock with no frames: a phrase on the base, anything else on top; a fall's plan
	 * puts her down for its length.
	 */
	void PlayPreview(const FIcePlan& Plan);
	/** The top plan she is dancing now, for the HUD, or empty. */
	FString DancingLabel() const { return TopPlan.bValid && TopAt < TopPlan.Dur ? TopPlan.Label : FString(); }

private:
	bool bEffects = true;
	double LiftHeight = 0.0;
	// game/choreo.ts: the plans she is dancing, each on her own clock from where the bridge last said.
	FIcePlan BasePlan;
	FIcePlan TopPlan;
	double BaseAt = 0.0;
	double TopAt = 0.0;
	bool bPreviewFall = false;
	/** Which arm is a plan's side A: 0 left, 1 right. */
	int32 SideA(const FIcePlan& Plan) const;

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

	// skater.gd's face. The eyes reach a new target first and the head catches up, so how far they
	// lead comes from the head's own lag; fixations and blink timing are presentation, not sim.
	void SetUpFace();
	void UpdateFace(float Dt, double Looking, double EyesDown, bool bAir);
	void StartBlink();
	double BlinkAmount() const;
	UPROPERTY()
	TObjectPtr<UMaterialInstanceDynamic> EyeMaterial;
	int32 BlinkWeight = -1;
	FRandomStream FaceRandom;
	/** Radians: x toward a positive head turn, y up. */
	FVector2D EyeGaze = FVector2D::ZeroVector;
	FVector2D EyeFixation = FVector2D::ZeroVector;
	double FixationLeft = 0.0;
	double BlinkWait = 2.0;
	double BlinkAge = -1.0;
	double SinceBlink = 1.5;
	bool bFaceWasAirborne = false;
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
