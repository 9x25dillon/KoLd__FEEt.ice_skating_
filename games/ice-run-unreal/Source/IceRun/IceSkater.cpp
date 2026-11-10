#include "IceSkater.h"
#include "IceRun.h"
#include "IceSimSpace.h"
#include "IceSpray.h"
#include "Components/PoseableMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "ReferenceSkeleton.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Dom/JsonObject.h"
#include "UObject/ConstructorHelpers.h"
#include "Animation/MorphTarget.h"

namespace
{
	// skater.gd's constants, unchanged.
	constexpr double ComHeight = .95;
	constexpr double BodyWeight = 540.0;
	// The face (skater.gd): the eye's radius and the iris's scale on its dome, from build_athlete.py.
	constexpr double EyeDome = .0156;
	constexpr double IrisUvPerM = .42 / .0062;
	constexpr double EyeTurnMax = .3;
	constexpr double EyeDropMax = .2;
	constexpr double EyeSpeed = 8.0;
	constexpr double EyeDropPerHead = .33;
	constexpr double SaccadeBlink = .2;
	constexpr double BlinkClose = .07;
	constexpr double BlinkHold = .03;
	constexpr double BlinkOpen = .16;
	constexpr double BlinkRest = 1.5;
	constexpr double PoseRate = 12.0;
	constexpr double FallHit = .26;
	constexpr double FallRollFrom = .16;
	constexpr double FallRollTo = .62;
	constexpr double InertiaTucked = .95;
	constexpr double InertiaOpen = 4.0;
	constexpr double ArmRate = 14.0;
	constexpr double FootRate = 16.0;
	constexpr double SpinExit = 1.6;
	constexpr double SpinArmTurn = UE_DOUBLE_PI / 2.0;
	constexpr double ShoulderHold = .8;
	constexpr double ShouldersLevel = .55;
	constexpr double FreeToeTurnout = 1.3;
	constexpr double GazeDown = .105;
	constexpr double ForearmSwing = .345;
	constexpr double ForearmSwingMax = .6;
	constexpr double UpperSwingMax = .38;
	constexpr double ArmLagStiffness = 40.0;
	constexpr double ArmLagDamping = 9.0;
	constexpr double ArmRateFunction = 18.0;
	constexpr double ArmRateExpression = 8.0;
	constexpr double SwayRateFunction = 1.15;
	constexpr double SwayRateExpression = .8;
	constexpr double SwayFunction = .45;
	constexpr double LineReach = .14;
	constexpr double LineLift = .05;
	constexpr double WristDrag = .07;
	constexpr double WristDroopFunction = .1;
	constexpr double WristDroopExpression = .38;
	constexpr double WristRate = 12.0;
	constexpr double SkirtStiffness = 160.0;
	constexpr double SkirtDrag = .90;
	// Its own fixed step: a spring stepped by the display's frame time hangs differently at every frame rate.
	constexpr double SkirtStep = 1.0 / 120.0;
	constexpr double ThighRadius = .085;
	constexpr double SkirtLegClear = .03;
	constexpr double ShinRadius = .055;
	constexpr double SkirtFlare = .6;
	constexpr double SkirtTop = -.07;
	constexpr double SkirtTrail = .012;
	constexpr double SkirtTrailMax = .07;
	constexpr double SkirtSwing = .022;
	constexpr double SkirtSwingMax = .09;

	// Godot's body frame: x right, y up, z back.
	const FVector Up(0.0, 1.0, 0.0);
	const FVector Down(0.0, -1.0, 0.0);
	const FVector Right(1.0, 0.0, 0.0);

	double Ease(double Rate, double Dt) { return 1.0 - FMath::Exp(-Rate * Dt); }
	double Smooth(double From, double To, double X) { return FMath::SmoothStep(From, To, X); }

	/** Godot's v.rotated(axis, angle): the right-hand rule, in the body frame's own numbers. */
	FVector Rotated(const FVector& V, const FVector& Axis, double Angle) { return FQuat(Axis, Angle).RotateVector(V); }
	FVector RotY(const FVector& V, double Angle) { return Rotated(V, Up, Angle); }
	FVector RotX(const FVector& V, double Angle) { return Rotated(V, Right, Angle); }

	double LerpAngle(double From, double To, double Weight)
	{
		const double Difference = FMath::Fmod(To - From, UE_DOUBLE_TWO_PI);
		const double Distance = FMath::Fmod(2.0 * Difference, UE_DOUBLE_TWO_PI) - Difference;
		return From + Distance * Weight;
	}

	double WrapF(double Value, double Min, double Max)
	{
		const double Range = Max - Min;
		return Range == 0.0 ? Min : Min + (Value - Min - Range * FMath::Floor((Value - Min) / Range));
	}

	double Cross2(const FVector2D& A, const FVector2D& B) { return A.X * B.Y - A.Y * B.X; }

	FVector LimitLength(const FVector& V, double Length)
	{
		const double Size = V.Size();
		return Size > Length && Size > 0.0 ? V * (Length / Size) : V;
	}
	/** skater.gd push_off: how far a point must move to stand Radius clear of the segment A-B. */
	FVector PushOff(const FVector& Point, const FVector& A, const FVector& B, double Radius)
	{
		const FVector Along = B - A;
		const FVector Nearest = A + Along * FMath::Clamp(FVector::DotProduct(Point - A, Along) / Along.SizeSquared(), 0.0, 1.0);
		const FVector Away = Point - Nearest;
		const double Size = Away.Size();
		return Size >= Radius || Size < .0001 ? FVector::ZeroVector : Away / Size * (Radius - Size);
	}

	/** Godot's SimSpace.direction: a sim vector in Godot's world frame. */
	FVector GodotDirection(double X, double Y) { return FVector(X, 0.0, -Y); }
}

AIceSkater::AIceSkater()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PostPhysics;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	Body = CreateDefaultSubobject<UPoseableMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(Root);
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	// The pose reaches well past the rest pose's bounds: a spiral, a fall.
	Body->SetBoundsScale(2.5f);
	StandIn = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("StandIn"));
	StandIn->SetupAttachment(Root);
	StandIn->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cylinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	if (Cylinder.Succeeded())
	{
		StandIn->SetStaticMesh(Cylinder.Object);
	}
	Spray = CreateDefaultSubobject<UIceSpray>(TEXT("Spray"));
	Spray->SetupAttachment(Root);
	StandIn->SetRelativeLocation(FVector(0.0, 0.0, 85.0));
	StandIn->SetRelativeScale3D(FVector(.32, .32, 1.7));
	StandIn->SetVisibility(true);

	for (FVector& V : TrunkOffsets) V = FVector::ZeroVector;
	FreeFeet[0] = FVector(-.15, .16, .22);
	FreeFeet[1] = FVector(.15, .16, .22);
	ArmTargets[0] = FVector(-.25, -.14, -.05);
	ArmTargets[1] = FVector(-.43, -.19, -.12);
	ArmTargets[2] = FVector(.25, -.14, -.05);
	ArmTargets[3] = FVector(.43, -.19, -.12);
	HandLast[0] = HandLast[1] = FVector::ZeroVector;
	HandAim[0] = HandAim[1] = Down;
	ContactSlide[0] = ContactSlide[1] = FVector::ZeroVector;
}

bool AIceSkater::LoadModel(const FString& ObjectPath)
{
	USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr, *ObjectPath);
	if (!Mesh)
	{
		UE_LOG(LogIceRun, Error, TEXT("No skater model at %s: run games/ice-run-unreal/tools/prepare.mjs. Showing a stand-in."), *ObjectPath);
		bHasModel = false;
		StandIn->SetVisibility(true);
		return false;
	}
	// A mesh change keeps the component's materials by slot index, and the models order their slots
	// differently: what the last model wore would land on this one's other parts.
	Body->EmptyOverrideMaterials();
	Body->SetSkinnedAssetAndUpdate(Mesh);
	bHasModel = true;
	StandIn->SetVisibility(false);
	MeasureRig();
	SetUpFace();
	return true;
}

int32 AIceSkater::ApplyCostume(const TSharedPtr<FJsonObject>& Skin)
{
	if (!Skin.IsValid() || !bHasModel)
	{
		return 0;
	}
	// skater.gd SKIN_SLOTS, by the material names the .glb carries (Interchange keeps them, '_' for ' ').
	static const TMap<FString, FString> Slots = {
		{TEXT("midnight plum satin"), TEXT("bodice")}, {TEXT("flowing skirt satin"), TEXT("skirt")}, {TEXT("illusion sleeve"), TEXT("sleeve")},
		{TEXT("champagne crystals"), TEXT("trim")}, {TEXT("espresso hair"), TEXT("hair")}, {TEXT("warm porcelain"), TEXT("skin")}, {TEXT("skin-tone tights"), TEXT("tights")}};
	auto Colour = [&Skin](const TCHAR* Key, const TCHAR* Fallback)
	{
		FString Hex;
		if (!Skin->TryGetStringField(Key, Hex))
		{
			Hex = Fallback;
		}
		return FLinearColor::FromSRGBColor(FColor::FromHex(Hex));
	};
	bool bCustom = false;
	Skin->TryGetBoolField(TEXT("custom"), bCustom);
	int32 Worn = 0;
	const TArray<FName> Names = Body->GetMaterialSlotNames();
	for (int32 I = 0; I < Names.Num(); ++I)
	{
		const FString* Slot = Slots.Find(Names[I].ToString().Replace(TEXT("_"), TEXT(" ")).ToLower());
		if (!Slot)
		{
			continue;
		}
		UMaterialInstanceDynamic* M = Body->CreateDynamicMaterialInstance(I);
		if (!M)
		{
			continue;
		}
		FLinearColor Factor = FLinearColor::White;
		if (*Slot == TEXT("hair"))
		{
			// The paint fades to orange at the tips; the costume's colour settles it (skater.gd).
			Factor = FMath::Lerp(Colour(TEXT("hair"), TEXT("4a3528")), FLinearColor::White, .42f);
		}
		else if (*Slot == TEXT("skin") || *Slot == TEXT("tights"))
		{
			// A design tints the paint by its swatch against the paint's own tone, so the detail stays.
			if (bCustom)
			{
				const FLinearColor Wanted = Colour(**Slot, TEXT("d4a68b"));
				const FLinearColor Own = FLinearColor::FromSRGBColor(FColor::FromHex(*Slot == TEXT("skin") ? TEXT("e7bfa6") : TEXT("d9b39b")));
				Factor = FLinearColor(FMath::Min(Wanted.R / Own.R, 1.4f), FMath::Min(Wanted.G / Own.G, 1.4f), FMath::Min(Wanted.B / Own.B, 1.4f));
			}
		}
		else
		{
			Factor = Colour(**Slot, TEXT("ffffff"));
		}
		M->SetVectorParameterValue(TEXT("BaseColorFactor"), Factor);
		++Worn;
	}
	return Worn;
}

void AIceSkater::MeasureRig()
{
	const USkeletalMesh* Mesh = Cast<USkeletalMesh>(Body->GetSkinnedAsset());
	if (!Mesh)
	{
		return;
	}
	const FReferenceSkeleton& Ref = Mesh->GetRefSkeleton();
	const TArray<FTransform>& Local = Ref.GetRefBonePose();
	TArray<FTransform> Component;
	Component.SetNum(Ref.GetNum());
	Rest.Reset();
	for (int32 I = 0; I < Ref.GetNum(); ++I)
	{
		const int32 Parent = Ref.GetParentIndex(I);
		Component[I] = Parent == INDEX_NONE ? Local[I] : Local[I] * Component[Parent];
		Rest.Add(Ref.GetBoneName(I), Component[I]);
	}
	const FTransform* ThighL = Rest.Find(TEXT("ThighL"));
	const FTransform* ThighR = Rest.Find(TEXT("ThighR"));
	const FTransform* ShinL = Rest.Find(TEXT("ShinL"));
	if (!ThighL || !ThighR || !ShinL || !Rest.Contains(TEXT("ArmL")))
	{
		UE_LOG(LogIceRun, Error, TEXT("The skater model lacks the Hips/Spine/Head/Thigh/Shin/Foot/Arm/Forearm skeleton skater.gd poses."));
		return;
	}

	// Which local axis runs along a bone: whatever the importer made of Blender's +Y.
	const FVector Along = ThighL->GetRotation().UnrotateVector((ShinL->GetLocation() - ThighL->GetLocation()).GetSafeNormal());
	const FVector Abs = Along.GetAbs();
	AlongLocal = Abs.X >= Abs.Y && Abs.X >= Abs.Z ? FVector(FMath::Sign(Along.X), 0, 0)
		: Abs.Y >= Abs.Z ? FVector(0, FMath::Sign(Along.Y), 0)
		: FVector(0, 0, FMath::Sign(Along.Z));

	// Face the model along the actor's +X: its right is from the left thigh to the right.
	const FVector RightSide = FVector(ThighR->GetLocation() - ThighL->GetLocation()).GetSafeNormal2D();
	const FVector Forward = FVector::CrossProduct(RightSide, FVector::UpVector);
	Body->SetRelativeRotation(FRotator(0.0, -FMath::RadiansToDegrees(FMath::Atan2(Forward.Y, Forward.X)), 0.0));
	Body->SetRelativeLocation(FVector::ZeroVector);

	const FQuat Turn = Body->GetRelativeRotation().Quaternion();
	auto At = [&](const TCHAR* Bone)
	{
		const FTransform* T = Rest.Find(Bone);
		return T ? IceSimSpace::ToBody(Turn.RotateVector(T->GetLocation())) : FVector::ZeroVector;
	};
	Thigh = FVector::Dist(At(TEXT("ThighL")), At(TEXT("ShinL")));
	Shin = FVector::Dist(At(TEXT("ShinL")), At(TEXT("FootL")));
	AnkleHeight = At(TEXT("FootL")).Y;
	HipHalfWidth = FMath::Abs(At(TEXT("ThighL")).X);
	ComAboveHip = ComHeight - At(TEXT("ThighL")).Y;
	HipsLength = FVector::Dist(At(TEXT("Hips")), At(TEXT("Spine")));
	SpineLength = FVector::Dist(At(TEXT("Spine")), At(TEXT("Head")));
	ShoulderRest = FVector2D(FMath::Abs(At(TEXT("ArmL")).X), At(TEXT("Head")).Y - At(TEXT("ArmL")).Y);
	UpperArm = FVector::Dist(At(TEXT("ArmL")), At(TEXT("ForearmL")));
	if (Rest.Contains(TEXT("HandL")))
	{
		Forearm = FVector::Dist(At(TEXT("ForearmL")), At(TEXT("HandL")));
	}
	MeasureSkirt();
	UE_LOG(LogIceRun, Log, TEXT("Skater rig: %d bones, along-axis %s, facing turn %.1f deg; thigh %.3f shin %.3f ankle %.3f hip half-width %.3f spine %.3f upper arm %.3f forearm %.3f m"),
		Ref.GetNum(), *AlongLocal.ToString(), Body->GetRelativeRotation().Yaw, Thigh, Shin, AnkleHeight, HipHalfWidth, SpineLength, UpperArm, Forearm);
}

void AIceSkater::ApplyFrame(const FIceFrame& Frame, bool bSnap)
{
	State = Frame.State;
	bHaveState = true;
	bPoseLow = Frame.bLow;
	ArmStyle = Frame.ArmStyle;
	FrameAge = 0.0;
	if (bSnap || !bInitialized)
	{
		Spray->Clear();
		bSkirtDirty = true;
		Facing = FMath::Atan2(State.Heading.Y, State.Heading.X);
		SetActorLocationAndRotation(IceSimSpace::Point(State.Pos.X, State.Pos.Y, FMath::Max(0.0, State.JumpZ) + LiftHeight),
			FRotator(0.0, -FMath::RadiansToDegrees(Facing), 0.0));
		bInitialized = true;
	}
}

void AIceSkater::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bHaveState)
	{
		return;
	}
	Pose(FMath::Min(DeltaSeconds, .1f));
	Spray->Step(FMath::Min(DeltaSeconds, .1f));
}

FVector AIceSkater::BodyFromSim(double X, double Y) const
{
	const double Forward = X * FMath::Cos(Facing) + Y * FMath::Sin(Facing);
	const double Left = -X * FMath::Sin(Facing) + Y * FMath::Cos(Facing);
	return FVector(-Left, 0.0, -Forward);
}

FVector AIceSkater::ToComponent(const FVector& BodyPoint) const
{
	return Body->GetRelativeTransform().InverseTransformPosition(IceSimSpace::FromBody(BodyPoint));
}

FVector AIceSkater::ToComponentDir(const FVector& BodyDir) const
{
	return Body->GetRelativeTransform().InverseTransformVectorNoScale(IceSimSpace::DirFromBody(BodyDir));
}

void AIceSkater::AimBone(FName Name, const FVector& Head, const FVector& Tail, double Twist)
{
	const FTransform* RestPose = Rest.Find(Name);
	if (!RestPose)
	{
		return;
	}
	const FVector A = ToComponent(Head);
	const FVector Direction = (ToComponent(Tail) - A).GetSafeNormal();
	if (Direction.IsNearlyZero())
	{
		return;
	}
	const FQuat RestRotation = RestPose->GetRotation();
	FQuat Aimed = FQuat::FindBetweenNormals(RestRotation.RotateVector(AlongLocal), Direction) * RestRotation;
	if (Twist != 0.0)
	{
		// A turn about the bone, anticlockwise from above in the body frame: the
		// opposite sense in Unreal's left-handed numbers.
		Aimed = FQuat(Direction, -Twist) * Aimed;
	}
	Body->SetBoneTransformByName(Name, FTransform(Aimed, A, RestPose->GetScale3D()), EBoneSpaces::ComponentSpace);
}

void AIceSkater::AimFoot(FName Name, const FVector& Ankle, const FVector& Toe, const FVector& UpDir)
{
	const FTransform* RestPose = Rest.Find(Name);
	if (!RestPose)
	{
		return;
	}
	const FQuat RestRotation = RestPose->GetRotation();
	const FVector RestAlong = RestRotation.RotateVector(AlongLocal);
	const FVector RestToe = FVector(RestAlong.X, RestAlong.Y, 0.0).GetSafeNormal();
	const FVector T = ToComponentDir(Toe).GetSafeNormal();
	const FVector U = ToComponentDir(UpDir).GetSafeNormal();
	if (RestToe.IsNearlyZero() || T.IsNearlyZero())
	{
		return;
	}
	// The turn that carries the rest boot's toe and top onto the blade's (skater.gd bone_frame).
	const FQuat ToToe = FQuat::FindBetweenNormals(RestToe, T);
	const FVector Rolled = ToToe.RotateVector(FVector::UpVector);
	const FVector From = (Rolled - T * FVector::DotProduct(Rolled, T)).GetSafeNormal();
	const FVector To = (U - T * FVector::DotProduct(U, T)).GetSafeNormal();
	const double Roll = FMath::Atan2(FVector::DotProduct(FVector::CrossProduct(From, To), T), FVector::DotProduct(From, To));
	const FQuat Aimed = FQuat(T, Roll) * ToToe * RestRotation;
	Body->SetBoneTransformByName(Name, FTransform(Aimed, ToComponent(Ankle), RestPose->GetScale3D()), EBoneSpaces::ComponentSpace);
}

FVector AIceSkater::PlantLeg(const FString& Suffix, const FVector& Hip, const FVector& Ankle, const FVector& Pole)
{
	const FVector Delta = Ankle - Hip;
	const double Reach = FMath::Clamp(Delta.Size(), .1, Thigh + Shin - .001);
	const FVector Direction = Delta.GetSafeNormal();
	const FVector Bend = (Pole - Direction * FVector::DotProduct(Pole, Direction)).GetSafeNormal();
	const double Along = (Thigh * Thigh - Shin * Shin + Reach * Reach) / (2.0 * Reach);
	const FVector Knee = Hip + Direction * Along + Bend * FMath::Sqrt(FMath::Max(0.0, Thigh * Thigh - Along * Along));
	AimBone(FName(TEXT("Thigh") + Suffix), Hip, Knee);
	AimBone(FName(TEXT("Shin") + Suffix), Knee, Ankle);
	return Knee;
}

double AIceSkater::ExitProgress() const
{
	return 1.0 - SpinExitLeft / SpinExit;
}

double AIceSkater::ExitAmount() const
{
	if (SpinExitLeft <= 0.0)
	{
		return 0.0;
	}
	const double At = ExitProgress();
	return Smooth(0.0, .22, At) * (1.0 - Smooth(.7, 1.0, At));
}

int32 AIceSkater::LiftedBlade() const
{
	return ExitAmount() > .01 ? 1 - SpinFoot : -1;
}

void AIceSkater::TrackFall(float Dt)
{
	// The landing hip is the side she was already going down on, latched (skater.gd track_fall).
	if (!State.bFallen)
	{
		FallClock = -1.0;
		return;
	}
	if (FallClock >= 0.0)
	{
		FallClock += Dt;
		return;
	}
	FallClock = 0.0;
	const double TowardLeft = FMath::Abs(State.Lean) > .02 ? FMath::Sign(State.Lean) : (State.SupportFoot == 0 ? 1.0 : -1.0);
	const FVector SimLeft = BodyFromSim(-State.Heading.Y, State.Heading.X);
	FallSide = SimLeft.X != 0.0 ? FMath::Sign(SimLeft.X) * TowardLeft : -TowardLeft;
}

void AIceSkater::FollowSpin(float Dt, bool bUpright, bool bAir)
{
	if (bUpright)
	{
		SpinRate = FMath::Abs(State.YawRate);
		if (State.YawRate != 0.0)
		{
			SpinSign = FMath::Sign(State.YawRate);
		}
		SpinFoot = State.SupportFoot;
		bWasSpinning = true;
	}
	else if (bWasSpinning)
	{
		bWasSpinning = false;
		if (!bAir && !State.bFallen)
		{
			SpinExitLeft = SpinExit;
			// The harder she was spinning, the bigger the finish.
			SpinExitPower = FMath::Clamp(SpinRate / 28.0, .45, 1.0);
		}
	}
	if (bAir || State.bFallen)
	{
		SpinExitLeft = 0.0;
	}
	SpinExitLeft = FMath::Max(0.0, SpinExitLeft - Dt);
	double Opened = 1.0;
	if (bUpright)
	{
		Opened = FMath::Clamp((State.SpinInertia - InertiaTucked) / (InertiaOpen - InertiaTucked), 0.0, 1.0);
	}
	// The shoulder travelling forward with the spin leads: the right one anticlockwise.
	const int32 Leading = SpinSign > 0.0 ? 1 : 0;
	ArmOpen[Leading] = FMath::Lerp(ArmOpen[Leading], Opened, Ease(16.0, Dt));
	const double Behind = FMath::Clamp(SpinArmTurn / FMath::Max(SpinRate, .1), .04, .35);
	ArmOpen[1 - Leading] = FMath::Lerp(ArmOpen[1 - Leading], ArmOpen[Leading], 1.0 - FMath::Exp(-Dt / Behind));
}

void AIceSkater::Pose(float Dt)
{
	const FIceState& S = State;
	const bool bAir = S.JumpPhase == IceJumpPhase::Air;
	// The last moment of a flight opens up for the ice: arms, free leg, landing foot.
	const bool bComingDown = bAir && S.JumpVz < 0.0 && S.JumpZ < -S.JumpVz * .14;

	// Frames arrive unevenly from the bridge. Carry the body on the sim's own
	// velocity between them and only ease out what that leaves.
	const FVector Velocity = IceSimSpace::Direction(S.Vel.X, S.Vel.Y) * IceSimSpace::CmPerM;
	const double Rise = bAir ? S.JumpVz : 0.0;
	const FVector Truth = IceSimSpace::Point(S.Pos.X, S.Pos.Y, FMath::Max(0.0, S.JumpZ + Rise * FrameAge) + LiftHeight) + Velocity * FrameAge;
	const FVector Position = bInitialized
		? FMath::Lerp(GetActorLocation() + (Velocity + FVector::UpVector * Rise * IceSimSpace::CmPerM) * Dt, Truth, Ease(18.0, Dt))
		: Truth;
	bInitialized = true;
	double Heading = FMath::Atan2(S.Heading.Y, S.Heading.X);
	if (bAir)
	{
		Heading += S.JumpRotation;
	}
	Facing = LerpAngle(Facing + S.YawRate * Dt, Heading + S.YawRate * FrameAge, Ease(24.0, Dt));
	SetActorLocationAndRotation(Position, FRotator(0.0, -FMath::RadiansToDegrees(Facing), 0.0));
	FrameAge = FMath::Min(FrameAge + Dt, .05);
	if (!bHasModel || Rest.Num() == 0)
	{
		return;
	}

	// The blades in the body's own frame, measured from the centre of mass
	// (s.pos): wherever the eased body has got to, they stay on their tracings.
	FVector Contacts[2];
	FVector Base = FVector::ZeroVector;
	double Support = 0.0;
	for (int32 I = 0; I < 2; ++I)
	{
		const FIceBlade& B = S.Blade[I];
		Contacts[I] = BodyFromSim(B.Contact.X - S.Pos.X, B.Contact.Y - S.Pos.Y);
		if (B.bInContact)
		{
			Base += Contacts[I] * B.Weight;
			Support += B.Weight;
		}
	}
	const bool bGrounded = Support > 0.0 && !bAir && !S.bFallen;
	TrackFall(Dt);
	const double FallRoll = Smooth(FallRollFrom, FallRollTo, FallClock);
	// The body hangs along the solver's own pendulum, contact to centre of mass,
	// which already holds its lean and its fore-aft pitch.
	const FVector Com(0.0, S.ComZ, 0.0);
	const FVector BodyAxis = bGrounded ? (Com - Base / Support).GetSafeNormal() : Up;
	const double Knee = S.Knee;
	const FVector SettledHip = Com - BodyAxis * ComAboveHip + FVector(0.0, 0.0, Knee * .035);
	const FVector SettledSpine = SettledHip + (BodyAxis + FVector(0.0, 0.0, -Knee * .4)).GetSafeNormal() * HipsLength;
	const FVector SettledNeck = SettledSpine + (BodyAxis + FVector(0.0, 0.0, -Knee * .14)).GetSafeNormal() * SpineLength;
	const FVector SettledHead = SettledNeck + FVector(0.0, .12, 0.0);
	FVector Hip = SettledHip;
	FVector Spine = SettledSpine;
	FVector Neck = SettledNeck;
	FVector Head = SettledHead;
	const bool bSpinning = S.Move == IceMove::Spin;
	const bool bCamel = (bSpinning && S.SpinPosition == 2) || S.Move == IceMove::Spiral;
	const bool bSit = bSpinning && S.SpinPosition == 1;
	const bool bUprightSpin = bSpinning && S.SpinPosition == 0;
	FollowSpin(Dt, bUprightSpin, bAir);
	const double Finish = ExitAmount();
	if (bCamel)
	{
		Spine = Hip + FVector(BodyAxis.X * .08, .08, -.15);
		Neck = Spine + FVector(BodyAxis.X * .05, .10, -.31);
		Head = Neck + FVector(0.0, .1, -.07);
	}
	else if (bSit)
	{
		Hip.Y = .50;
		Spine = Hip + FVector(0.0, .13, -.12);
		Neck = Spine + FVector(0.0, .29, -.13);
		Head = Neck + FVector(0.0, .12, 0.0);
	}
	if (bPoseLow)
	{
		Hip.Y -= .16;
		Spine = Hip + FVector(0.0, .10, .12);
		Neck = Spine + FVector(0.0, .18, .22);
		Head = Neck + FVector(0.0, .10, .03);
	}
	if (S.bFallen)
	{
		// Down and out onto the hip with the trunk still up, then over onto the forearm.
		Hip = FVector(FallSide * .16, .13 - .02 * FMath::Sin(UE_DOUBLE_PI * FMath::Clamp((FallClock - FallHit) / .2, 0.0, 1.0)), .02);
		Spine = Hip + FMath::Lerp(FVector(-FallSide * .03, .20, -.04), FVector(FallSide * .16, .14, .03), FallRoll);
		Neck = Spine + FMath::Lerp(FVector(-FallSide * .02, .36, -.02), FVector(FallSide * .30, .22, .05), FallRoll);
		Head = Neck + FVector(-FallSide * .02, .10, -.03);
	}
	// Authored poses ease in as offsets, so a settled skater is the sim exactly.
	const double EasePose = Ease(PoseRate, Dt);
	TrunkOffsets[0] = FMath::Lerp(TrunkOffsets[0], Hip - SettledHip, EasePose);
	TrunkOffsets[1] = FMath::Lerp(TrunkOffsets[1], Spine - SettledSpine, EasePose);
	TrunkOffsets[2] = FMath::Lerp(TrunkOffsets[2], Neck - SettledNeck, EasePose);
	TrunkOffsets[3] = FMath::Lerp(TrunkOffsets[3], Head - SettledHead, EasePose);
	Hip = SettledHip + TrunkOffsets[0];
	Spine = SettledSpine + TrunkOffsets[1];
	Neck = SettledNeck + TrunkOffsets[2];
	Head = SettledHead + TrunkOffsets[3];
	// The trunk's bones keep their lengths through every authored shape.
	Spine = Hip + (Spine - Hip).GetSafeNormal() * HipsLength;
	Neck = Spine + (Neck - Spine).GetSafeNormal() * SpineLength;
	AimBone(TEXT("Hips"), Hip, Spine);

	const double EaseArm = Ease(ArmRate, Dt);
	const double EaseFoot = Ease(FootRate, Dt);
	// How hard the arms are working, from what the sim is asking of the body.
	const double YawRateNow = S.YawRate;
	const double Stroking = FMath::Sin(FMath::Clamp(S.StrokeTime * 3.0, 0.0, 1.0) * UE_DOUBLE_PI);
	const double Carrying = S.ArmsL;
	const double Asked = FMath::Max(FMath::Max(FMath::Abs(YawRateNow) / 3.5, Stroking * .8), FMath::Max(FMath::Abs(S.IntAccel) * .25, FMath::Abs(Carrying) * .12));
	ArmEnergy = FMath::Lerp(ArmEnergy, FMath::Clamp(Asked + ArmStyle * .12, 0.0, 1.0), Ease(4.0, Dt));
	SwayClock += Dt * (1.4 + S.Vel.Size() * .15) * FMath::Lerp(SwayRateFunction, SwayRateExpression, ArmStyle);
	// The hands have weight: a body that turns leaves them behind, and they swing back.
	const double YawPull = FMath::Clamp((YawRateNow - ArmLastYaw) / FMath::Max(double(Dt), .001), -60.0, 60.0);
	ArmLastYaw = YawRateNow;
	ArmLagRate += (-ArmLagStiffness * (ArmLag - FMath::Clamp(Carrying * .04, -.5, .5)) - ArmLagDamping * ArmLagRate - YawPull * .9) * Dt;
	ArmLag = FMath::Clamp(ArmLag + ArmLagRate * Dt, -.6, .6);
	const double Curve = bGrounded ? FMath::Clamp(YawRateNow * .14, -.4, .4) : 0.0;
	const double TrunkSwing = bGrounded ? FMath::Sin(SwayClock) * .09 * Smooth(.7, 1.0, ArmEnergy) : 0.0;
	// The shoulders hold square across the line of travel, whichever way the hips have turned.
	double OverTheHips = 0.0;
	if (bGrounded && !bSpinning && S.Vel.Size() > 1.0)
	{
		const double OffLine = WrapF(FMath::Atan2(Cross2(S.Heading, S.Vel), FVector2D::DotProduct(S.Heading, S.Vel)), -UE_DOUBLE_PI / 2.0, UE_DOUBLE_PI / 2.0);
		OverTheHips = OffLine * Smooth(0.0, .5, UE_DOUBLE_PI / 2.0 - FMath::Abs(OffLine));
	}
	UpperTurn = FMath::Lerp(UpperTurn, S.Twist + Curve + TrunkSwing + FMath::Clamp(OverTheHips, -ShoulderHold, ShoulderHold), EaseArm);
	// Forward, the eyes go where the ice is going; backward, down along the blade's own line.
	double Looking = 0.0;
	double EyesDown = 0.0;
	const FIceBlade& SkatingBlade = S.Blade[FMath::Clamp(S.SupportFoot, 0, 1)];
	if (bGrounded && !bSpinning && SkatingBlade.LongSpeed < -.8)
	{
		const FVector2D Along = SkatingBlade.Tangent;
		Looking = FMath::Clamp(FMath::Atan2(Cross2(S.Heading, Along), FVector2D::DotProduct(S.Heading, Along)), -1.25, 1.25) - UpperTurn;
		EyesDown = 1.0;
	}
	else if (S.Vel.Size() > .8 && !bAir)
	{
		Looking = FMath::Clamp(FMath::Atan2(Cross2(S.Heading, S.Vel), FVector2D::DotProduct(S.Heading, S.Vel)), -1.25, 1.25) - UpperTurn;
	}
	HeadTurn = FMath::Lerp(HeadTurn, Looking, Ease(5.0, Dt));
	HeadDown = FMath::Lerp(HeadDown, EyesDown, Ease(4.0, Dt));
	UpdateFace(Dt, Looking, EyesDown, bAir);
	AimBone(TEXT("Spine"), Spine, Neck, UpperTurn);
	AimBone(TEXT("Head"), Neck, Head + FVector(0.0, .17, 0.0) + RotY(FVector(0.0, 0.0, -GazeDown * HeadDown), HeadTurn + UpperTurn), HeadTurn);
	const FQuat TrunkTilt = FQuat::FindBetweenNormals(Up, BodyAxis);
	// The trunk leans with the edge; the shoulders stay nearer level than it does.
	const FQuat ShoulderTilt = FQuat::FindBetweenNormals(Up, FMath::Lerp(BodyAxis, Up, ShouldersLevel).GetSafeNormal());
	Backing = FMath::Lerp(Backing, bGrounded && !bSpinning && SkatingBlade.LongSpeed < -.8 ? 1.0 : 0.0, Ease(5.0, Dt));

	TArray<FVector> Legs;
	for (int32 I = 0; I < 2; ++I)
	{
		const FString Suffix = I == 0 ? TEXT("L") : TEXT("R");
		const double Side = I == 0 ? -1.0 : 1.0;
		const FIceBlade& Blade = S.Blade[I];
		const bool bOnIce = Blade.bInContact && !bAir && !S.bFallen && !(Finish > .01 && I != SpinFoot);
		// The loaded hip rides higher than the unloaded one.
		FVector H = Hip + TrunkTilt.RotateVector(FVector(Side * HipHalfWidth, bGrounded ? (Blade.Weight - .5) * .05 : 0.0, 0.0));
		const bool bUnder = S.bFallen && Side == FallSide;
		if (S.bFallen)
		{
			H.Y += bUnder ? -.035 : .05;
		}
		FVector Free(Side * .04, .25, I == 0 ? .04 : -.03);
		if (!bAir || bComingDown)
		{
			const double Extension = FMath::Clamp(S.StrokeTime * 2.5, 0.0, 1.0);
			// Trailing behind the skating foot and clear of it, wherever the lean has that foot.
			Free = FVector(Side * (.12 + Extension * .19), .20 + Extension * .06, .36 + Extension * .15);
			if (bGrounded)
			{
				Free.X += Base.X / Support;
			}
			if (bCamel)
			{
				Free = FVector(Side * .08, .94, .68);
			}
			else if (bSit)
			{
				Free = FVector(Side * .1, .20, -.60);
			}
			Free = H + RotY(Free - H, S.FreeSwing);
		}
		if (bUnder)
		{
			// The outer thigh on the ice, the knee out to that side and the foot trailing.
			Free = FVector(FallSide * .42, .08, .30);
		}
		else if (S.bFallen)
		{
			// The other knee up and that foot flat ahead of her, ready to get up from.
			Free = FVector(-FallSide * .10, AnkleHeight, -.50);
		}
		// Spinning, the free foot draws in to cross the skating knee as the arms do.
		if (bUprightSpin)
		{
			Free = FMath::Lerp(Free, FVector(-Side * .02, .36, -.09), 1.0 - (ArmOpen[0] + ArmOpen[1]) * .5);
		}
		// The finish: the free leg sweeps round behind her and extends, trailing the spin.
		if (Finish > 0.0 && I != SpinFoot)
		{
			const FVector LongLine(Side * .12 + (bGrounded ? Base.X / Support : 0.0), .32 + .16 * SpinExitPower, .68);
			const double Sweep = -SpinSign * .9 * (1.0 - Smooth(0.0, .35, ExitProgress()));
			Free = FMath::Lerp(Free, H + RotY(LongLine - H, Sweep), Finish);
		}
		FreeFeet[I] = FMath::Lerp(FreeFeet[I], Free, EaseFoot);
		// Coming down, the landing foot reaches for the ice ahead of the touchdown.
		const bool bReaching = bComingDown && I == S.SupportFoot;
		FootOnIce[I] = FMath::Lerp(FootOnIce[I], bOnIce || bReaching ? 1.0 : 0.0, EaseFoot);
		if (FootOnIce[I] > .995)
		{
			FootOnIce[I] = 1.0;
		}
		// The blade's top leans toward perpLeft(tangent) by its tilt, and the
		// ankle stands on that line, so a deep edge rolls the whole boot over.
		const FVector Toe = BodyFromSim(Blade.Tangent.X, Blade.Tangent.Y);
		const FVector BladeLeft = FVector::CrossProduct(Up, Toe).GetSafeNormal();
		const FVector BladeUp = Up * FMath::Cos(Blade.Tilt) + BladeLeft * FMath::Sin(Blade.Tilt);
		// The solver moves a contact in one step when the support changes; the boot carries it.
		if (LastContacts.Num() == 2 && FVector::Dist(Contacts[I], LastContacts[I]) > .02)
		{
			ContactSlide[I] += LastContacts[I] - Contacts[I];
		}
		ContactSlide[I] = FMath::Lerp(ContactSlide[I], FVector::ZeroVector, EaseFoot);
		const FVector Planted = Contacts[I] + ContactSlide[I] + BladeUp * AnkleHeight;
		const double Planting = Smooth(0.0, 1.0, FootOnIce[I]);
		const FVector Ankle = FMath::Lerp(FreeFeet[I], Planted, Planting);
		// A free foot turns out from the hip; backward it points down the line.
		const FVector Pointed = FVector(Side * FMath::Sin(FreeToeTurnout), -.32, -FMath::Cos(FreeToeTurnout)).GetSafeNormal();
		FVector LooseToe = FMath::Lerp(FMath::Lerp(RotY(FVector(0.0, 0.0, -1.0), -Side * .6), Pointed, Backing), Toe, Planting);
		FVector LooseUp = FMath::Lerp(Up, BladeUp, Planting);
		FVector Pole = FMath::Lerp(FVector(0.0, 0.0, -1.0), Toe, .5 * Planting);
		if (bUnder)
		{
			Pole = FVector(FallSide, .1, -.6);
		}
		else if (S.bFallen)
		{
			Pole = FVector(-FallSide * .1, 1.0, -.4);
		}
		const FVector KneeAt = PlantLeg(Suffix, H, Ankle, Pole);
		Legs.Append({H, KneeAt, Ankle});
		if (bUnder)
		{
			// The boot lies on its side, its top along the shin.
			LooseToe = FVector(FallSide * .8, 0.0, -.5).GetSafeNormal();
			LooseUp = (KneeAt - Ankle).GetSafeNormal();
		}
		else if (S.bFallen)
		{
			LooseToe = FVector(-FallSide * .25, 0.0, -1.0).GetSafeNormal();
			LooseUp = Up;
		}
		AimFoot(FName(TEXT("Foot") + Suffix), Ankle, LooseToe, LooseUp);
		// skater.gd: snow from just under the ankle, thrown back and up, when this edge slips sideways
		// at speed on the ice; the more the blade is loaded, the harder it throws.
		const FTransform& Here = GetActorTransform();
		Spray->Feed(I, Here.TransformPosition(IceSimSpace::FromBody(Ankle - FVector(0.0, .08, 0.0))),
			Here.TransformVectorNoScale(IceSimSpace::DirFromBody(FVector(0.0, .4, 1.0))),
			float(1.0 + 1.6 * FMath::Clamp(Blade.NormalLoad / BodyWeight, 0.0, 1.5)),
			bEffects && bOnIce && Blade.LatSlipAccel > .3 && FMath::Abs(Blade.LongSpeed) > 1.0);

		const FVector Shoulder = Neck + ShoulderTilt.RotateVector(RotY(FVector(Side * ShoulderRest.X, -ShoulderRest.Y, 0.0), UpperTurn));
		double Spread = !bAir ? .43 : FMath::Clamp(S.JumpInertia / 6.0, .12, .44);
		if (bSpinning)
		{
			Spread = .15 + FMath::Clamp(S.SpinInertia / 6.0, 0.0, 1.0) * .34;
		}
		// At rest the arms hang relaxed, a little away from the sides, elbows soft.
		FVector Elbow = FMath::Lerp(FVector(Side * .10, -.26, .01), FVector(Side * .17, -.20, -.04), ArmStyle);
		FVector Hand = FMath::Lerp(FVector(Side * .14, -.46, -.10), FVector(Side * .34, -.31, -.21), ArmStyle);
		// They come out only when balance asks, the spin has them open, or a finish shows them off.
		const double Lead = FMath::Clamp(S.YawRate * .6, -1.0, 1.0);
		const FVector WideElbow(Side * Spread * .62, -.06, -.03 + Side * Lead * .05);
		const FVector WideHand(Side * Spread * 1.12, -.01, -.12 + Side * Lead * .17);
		const double Catching = FMath::Clamp(FMath::Abs(S.IntAccel) * .05 + FMath::Abs(S.BalanceError) / .25, 0.0, 1.0);
		const double Out = bUprightSpin ? 1.0 : FMath::Max(Finish, Catching * .8);
		// Expression draws a line along the turn: one arm leads and rises, the other trails.
		const double Line = Lead * ArmStyle * (1.0 - Out);
		Hand += FVector(0.0, Side * Line * LineLift, Side * Line * LineReach);
		Elbow += FVector(0.0, Side * Line * LineLift * .4, Side * Line * LineReach * .4);
		Elbow = FMath::Lerp(Elbow, WideElbow, Out);
		Hand = FMath::Lerp(Hand, WideHand, Out);
		// An upright spin's arms follow the sim's own inertia, meeting at the chest as it draws in.
		Elbow = FMath::Lerp(FVector(Side * .17, -.15, -.09), Elbow, ArmOpen[I]);
		Hand = FMath::Lerp(FVector(Side * .015, -.15, -.17), Hand, ArmOpen[I]);
		if (Finish > 0.0)
		{
			const double Leads = Side * SpinSign;
			Hand += FVector(Side * .04, .10 * SpinExitPower, -Leads * .16) * Finish;
			Elbow += FVector(0.0, .05 * SpinExitPower, -Leads * .07) * Finish;
		}
		if (bAir && !bComingDown)
		{
			Elbow = FVector(Side * .13, -.18, -.10);
			Hand = FVector(-Side * .11, -.12, -.19);
		}
		else if (bCamel)
		{
			Elbow = FVector(Side * .23, .03, .08);
			Hand = FVector(Side * .45, .01, .16);
		}
		else if (bSit)
		{
			Elbow = FVector(Side * .10, -.05, -.24);
			Hand = FVector(Side * .08, -.09, -.46);
		}
		if (bPoseLow)
		{
			Elbow = FVector(Side * .24, .02, .03);
			Hand = FVector(Side * .44, -.02, .05);
		}
		if (bUnder)
		{
			// Out and ready, then taking what is left of the fall on the forearm, after the hip.
			Elbow = FMath::Lerp(FVector(FallSide * .22, -.10, .02), FVector(FallSide * .20, -Shoulder.Y * .5, .12), FallRoll);
			Hand = FMath::Lerp(FVector(FallSide * .40, -.20, .02), FVector(FallSide * .16, .03 - Shoulder.Y, .04), FallRoll);
		}
		else if (S.bFallen)
		{
			// The other hand comes to the raised knee.
			Elbow = FVector(-FallSide * .12, -.16, -.12);
			Hand = FVector(-FallSide * .02, -.28, -.26);
		}
		// The swing starts below the elbow and spreads up the arm as more is asked of it.
		const bool bFreeToSwing = !(bSpinning || (bAir && !bComingDown) || bCamel || bSit || bPoseLow || S.bFallen);
		if (bFreeToSwing)
		{
			const double Settle = 1.0 - Finish;
			const double SwaySize = FMath::Lerp(SwayFunction, 1.0, ArmStyle);
			const double ForearmAngle = Side * FMath::Lerp(ForearmSwing, ForearmSwingMax, ArmEnergy) * FMath::Sin(SwayClock - .5) * Settle * SwaySize;
			const double UpperAngle = Side * UpperSwingMax * Smooth(.35, 1.0, ArmEnergy) * FMath::Sin(SwayClock) * Settle * SwaySize;
			const FVector HangingForearm = Hand - Elbow;
			Elbow = RotY(RotX(Elbow, UpperAngle), ArmLag * .35 * ArmEnergy);
			Hand = Elbow + RotY(RotX(HangingForearm, ForearmAngle), ArmLag);
		}
		// A save is quick at any tier; only free carriage takes its time.
		double LimbEase = EaseArm;
		if (bFreeToSwing && Finish <= 0.0)
		{
			LimbEase = Ease(FMath::Lerp(ArmRateFunction, ArmRateExpression, ArmStyle * (1.0 - Catching)), Dt);
		}
		ArmTargets[I * 2] = FMath::Lerp(ArmTargets[I * 2], Elbow, LimbEase);
		ArmTargets[I * 2 + 1] = FMath::Lerp(ArmTargets[I * 2 + 1], Hand, LimbEase);
		// The arms ride the shoulders round and over with the trunk.
		const FQuat Carried = ShoulderTilt * FQuat(Up, UpperTurn);
		const FVector ElbowAt = Shoulder + Carried.RotateVector(ArmTargets[I * 2]).GetSafeNormal() * UpperArm;
		const FVector HandAt = ElbowAt + (Shoulder + Carried.RotateVector(ArmTargets[I * 2 + 1]) - ElbowAt).GetSafeNormal() * Forearm;
		AimBone(FName(TEXT("Arm") + Suffix), Shoulder, ElbowAt);
		AimBone(FName(TEXT("Forearm") + Suffix), ElbowAt, HandAt);
		// The wrist: the hand trails its forearm when moving and droops when not.
		const FVector Along = (HandAt - ElbowAt).GetSafeNormal();
		const FVector HandMoved = (HandAt - HandLast[I]) / FMath::Max(double(Dt), .001);
		HandLast[I] = HandAt;
		const double Droop = FMath::Lerp(WristDroopFunction, WristDroopExpression, ArmStyle);
		const FVector Bend = LimitLength(Down * Droop - HandMoved * WristDrag * ArmStyle, .7);
		HandAim[I] = FMath::Lerp(HandAim[I], (Along + Bend).GetSafeNormal(), Ease(WristRate, Dt)).GetSafeNormal();
		AimBone(FName(TEXT("Hand") + Suffix), HandAt, HandAt + HandAim[I] * .1);
	}
	LastContacts = {Contacts[0], Contacts[1]};
	SwingSkirt(Dt, Hip, Spine, Legs);
}

FVector AIceSkater::GodotWorld(const FVector& BodyPoint) const
{
	const FVector At = GetActorLocation();
	return FVector(At.X, At.Z, At.Y) / IceSimSpace::CmPerM + RotY(BodyPoint, GodotYaw());
}

FVector AIceSkater::GodotLocal(const FVector& WorldPoint) const
{
	const FVector At = GetActorLocation();
	return RotY(WorldPoint - FVector(At.X, At.Z, At.Y) / IceSimSpace::CmPerM, -GodotYaw());
}

void AIceSkater::MeasureSkirt()
{
	// skater.gd measure_skirt: each panel's pivot and resting hem, from the hips, in the body frame.
	SkirtBones.Reset();
	SkirtPivots.Reset();
	SkirtRestTips.Reset();
	bSkirtDirty = true;
	const FTransform* Hips = Rest.Find(TEXT("Hips"));
	const FTransform* ThighL = Rest.Find(TEXT("ThighL"));
	if (!Hips || !ThighL)
	{
		return;
	}
	const FQuat Turn = Body->GetRelativeRotation().Quaternion();
	auto BodyPoint = [&](const FVector& Component) { return IceSimSpace::ToBody(Turn.RotateVector(Component)); };
	const FVector HipsAt = BodyPoint(Hips->GetLocation());
	const double Hem = BodyPoint(ThighL->GetLocation()).Y - .205;
	TArray<FName> Names;
	Rest.GetKeys(Names);
	Names.Sort([](const FName& A, const FName& B) { return A.LexicalLess(B); });
	for (const FName& Name : Names)
	{
		if (!Name.ToString().StartsWith(TEXT("Skirt")))
		{
			continue;
		}
		const FTransform& Panel = Rest[Name];
		const FVector Origin = BodyPoint(Panel.GetLocation());
		const FVector Hang = IceSimSpace::ToBody(Turn.RotateVector(Panel.GetRotation().RotateVector(AlongLocal))).GetSafeNormal();
		// A bone's length is not in a glTF; the builder's panels all hang from the waist to the hem.
		const double Length = (Origin.Y - Hem) / FMath::Max(.2, -Hang.Y);
		SkirtBones.Add(Name);
		SkirtPivots.Add(Origin - HipsAt);
		SkirtRestTips.Add(Origin + Hang * Length - HipsAt);
	}
	SkirtGap = SkirtRestTips.Num() > 1 ? FVector::Dist(SkirtRestTips[0], SkirtRestTips[1]) : 0.0;
}

void AIceSkater::SwingSkirt(float Dt, const FVector& Hip, const FVector& Spine, const TArray<FVector>& Legs)
{
	const int32 Count = SkirtBones.Num();
	if (Count == 0)
	{
		return;
	}
	const FQuat Hang = FQuat::FindBetweenNormals(Up, (Spine - Hip).GetSafeNormal());
	TArray<FVector> Pivots, Rests;
	for (int32 I = 0; I < Count; ++I)
	{
		Pivots.Add(GodotWorld(Hip + Hang.RotateVector(SkirtPivots[I])));
		Rests.Add(GodotWorld(Hip + Hang.RotateVector(SkirtRestTips[I])));
	}
	if (bSkirtDirty || SkirtTips.Num() != Count || FVector::Dist(SkirtTips[0], Rests[0]) > 1.2)
	{
		SkirtTips = Rests;
		SkirtLast = Rests;
		SkirtCentreLast = GodotWorld(Hip);
		SkirtYawLast = GodotYaw();
		bSkirtDirty = false;
	}
	FVector Wind = LimitLength(-GodotDirection(State.Vel.X, State.Vel.Y) * SkirtTrail, SkirtTrailMax);
	// On an edge the cloth swings out of the curve; an edge pulls the body the other way.
	const FVector Pulled = GodotDirection(-State.Heading.Y, State.Heading.X) * State.LatAccel;
	Wind += LimitLength(-Pulled * SkirtSwing, SkirtSwingMax);
	SkirtClock = FMath::Min(SkirtClock + Dt, SkirtStep * 8.0);
	const int32 Waiting = FMath::FloorToInt32(SkirtClock / SkirtStep);
	const FVector Centre = GodotWorld(Hip);
	const FVector Carried = (Centre - SkirtCentreLast) / FMath::Max(1, Waiting);
	// The cloth turns with the body and flares outward by an explicit force.
	const double YawStep = WrapF(GodotYaw() - SkirtYawLast, -UE_DOUBLE_PI, UE_DOUBLE_PI) / FMath::Max(1, Waiting);
	const double SpinRateNow = YawStep / SkirtStep;
	TArray<FVector> LegsWorld;
	for (const FVector& Point : Legs)
	{
		LegsWorld.Add(GodotWorld(Point));
	}
	while (SkirtClock >= SkirtStep)
	{
		SkirtClock -= SkirtStep;
		for (int32 I = 0; I < Count; ++I)
		{
			// Drag acts on how the cloth moves against the skater, not against the ice.
			SkirtTips[I] = Centre + RotY(SkirtTips[I] - Centre, YawStep);
			SkirtLast[I] = Centre + RotY(SkirtLast[I] - Centre, YawStep);
			const FVector Moving = Carried + (SkirtTips[I] - SkirtLast[I] - Carried) * SkirtDrag;
			FVector Radius = SkirtTips[I] - Centre;
			Radius.Y = 0.0;
			SkirtLast[I] = SkirtTips[I];
			SkirtTips[I] += Moving + ((Rests[I] + Wind - SkirtTips[I]) * SkirtStiffness + Radius * SpinRateNow * SpinRateNow * SkirtFlare) * SkirtStep * SkirtStep;
		}
		for (int32 Relax = 0; Relax < 3; ++Relax)
		{
			// Neighbours stay one cloth; no panel leaves the waist or passes through a leg.
			for (int32 I = 0; I < Count; ++I)
			{
				const int32 Next = (I + 1) % Count;
				const FVector Between = SkirtTips[Next] - SkirtTips[I];
				const double Length = Between.Size();
				const double Wanted = FMath::Clamp(Length, SkirtGap * .55, SkirtGap * 1.7);
				if (Length > .0001)
				{
					const FVector Fix = Between / Length * (Length - Wanted) * .5;
					SkirtTips[I] += Fix;
					SkirtTips[Next] -= Fix;
				}
			}
			for (int32 I = 0; I < Count; ++I)
			{
				const FVector From = Pivots[I];
				for (const double Reach : {.5, .75, 1.0})
				{
					const FVector At = FMath::Lerp(From, SkirtTips[I], Reach);
					for (int32 Leg = 0; Leg + 2 < LegsWorld.Num(); Leg += 3)
					{
						const FVector Pushed = PushOff(At, LegsWorld[Leg], LegsWorld[Leg + 1], ThighRadius + SkirtLegClear)
							+ PushOff(At, LegsWorld[Leg + 1], LegsWorld[Leg + 2], ShinRadius + SkirtLegClear);
						// Cloth rides out and over a leg rather than parting round it.
						FVector Outward = At - Centre;
						Outward.Y = 0.0;
						SkirtTips[I] += (Outward.GetSafeNormal() * .8 + Up * .45) * Pushed.Size() / Reach;
					}
				}
				FVector Hanging = LimitLength(SkirtTips[I] - From, FVector::Dist(Rests[I], From));
				// Cloth does not stand above its own waist, however fast the spin.
				Hanging.Y = FMath::Min(Hanging.Y, SkirtTop);
				SkirtTips[I] = From + Hanging;
			}
		}
	}
	if (Waiting > 0)
	{
		SkirtCentreLast = Centre;
		SkirtYawLast = GodotYaw();
	}
	for (int32 I = 0; I < Count; ++I)
	{
		AimBone(SkirtBones[I], GodotLocal(Pivots[I]), GodotLocal(SkirtTips[I]));
	}
}

void AIceSkater::SetUpFace()
{
	EyeMaterial = nullptr;
	BlinkWeight = -1;
	Body->ActiveMorphTargets.Empty();
	Body->MorphTargetWeights.Reset();
	USkeletalMesh* Mesh = Cast<USkeletalMesh>(Body->GetSkinnedAsset());
	if (!Mesh)
	{
		return;
	}
	// The lids: build_athlete.py's Blink shape, driven on the poseable mesh as an animation would.
	if (UMorphTarget* Blink = Mesh->FindMorphTarget(TEXT("Blink")))
	{
		Body->MorphTargetWeights.SetNumZeroed(Mesh->GetMorphTargets().Num());
		BlinkWeight = Mesh->GetMorphTargets().IndexOfByKey(Blink);
		Body->ActiveMorphTargets.Add(Blink, BlinkWeight);
	}
	// The eyes: the model's own iris image on M_Eye, which slides it as she looks (eye.gdshader). Only
	// an image the model carries itself: an instance without one reports its parent's default.
	UMaterialInterface* EyeBase = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/Materials/M_Eye.M_Eye"), nullptr, LOAD_NoWarn | LOAD_Quiet);
	const TArray<FSkeletalMaterial>& Own = Mesh->GetMaterials();
	for (int32 I = 0; EyeBase && I < Own.Num(); ++I)
	{
		UTexture* Iris = nullptr;
		if (Own[I].MaterialSlotName == TEXT("Eyes") && Own[I].MaterialInterface
			&& Own[I].MaterialInterface->GetTextureParameterValue(FMaterialParameterInfo(TEXT("BaseColorTexture")), Iris, true) && Iris)
		{
			EyeMaterial = UMaterialInstanceDynamic::Create(EyeBase, this);
			EyeMaterial->SetTextureParameterValue(TEXT("Iris"), Iris);
			Body->SetMaterial(I, EyeMaterial);
		}
	}
	EyeGaze = EyeFixation = FVector2D::ZeroVector;
	FixationLeft = 0.0;
	BlinkAge = -1.0;
	SinceBlink = BlinkRest;
	UE_LOG(LogIceRun, Log, TEXT("Face: eyes %s, lids %s."), EyeMaterial ? TEXT("move") : TEXT("still"), BlinkWeight >= 0 ? TEXT("blink") : TEXT("still"));
}

void AIceSkater::StartBlink()
{
	if (BlinkAge < 0.0 && SinceBlink >= BlinkRest)
	{
		BlinkAge = 0.0;
		SinceBlink = 0.0;
		BlinkWait = FaceRandom.FRandRange(2.2, 6.0);
	}
}

double AIceSkater::BlinkAmount() const
{
	if (BlinkAge < 0.0) return 0.0;
	if (BlinkAge < BlinkClose) return FMath::SmoothStep(0.0, BlinkClose, BlinkAge);
	if (BlinkAge < BlinkClose + BlinkHold) return 1.0;
	return 1.0 - FMath::SmoothStep(BlinkClose + BlinkHold, BlinkClose + BlinkHold + BlinkOpen, BlinkAge);
}

void AIceSkater::UpdateFace(float Dt, double Looking, double EyesDown, bool bAir)
{
	if (!EyeMaterial && BlinkWeight < 0)
	{
		return;
	}
	FixationLeft -= Dt;
	if (FixationLeft <= 0.0)
	{
		EyeFixation = FVector2D(FaceRandom.FRandRange(-.07, .07), FaceRandom.FRandRange(-.035, .035));
		FixationLeft = FaceRandom.FRandRange(.7, 2.6);
	}
	const FVector2D Lead(Looking - HeadTurn, (HeadDown - EyesDown) * EyeDropPerHead);
	FVector2D Aim = Lead + EyeFixation;
	Aim = FVector2D(FMath::Clamp(Aim.X, -EyeTurnMax, EyeTurnMax), FMath::Clamp(Aim.Y, -EyeDropMax, EyeDropMax));
	// Large gaze shifts tend to bring a blink with them.
	if (FVector2D::Distance(EyeGaze, Aim) > SaccadeBlink)
	{
		StartBlink();
	}
	const FVector2D Toward = Aim - EyeGaze;
	const double Step = EyeSpeed * Dt;
	EyeGaze = Toward.Size() <= Step ? Aim : EyeGaze + Toward.GetSafeNormal() * Step;
	// Touching down after a jump brings a reflex blink; otherwise they come every few seconds.
	if (bFaceWasAirborne && !bAir)
	{
		StartBlink();
	}
	bFaceWasAirborne = bAir;
	SinceBlink += Dt;
	BlinkWait -= Dt;
	if (BlinkWait <= 0.0)
	{
		StartBlink();
	}
	if (BlinkAge >= 0.0)
	{
		BlinkAge += Dt;
		if (BlinkAge > BlinkClose + BlinkHold + BlinkOpen)
		{
			BlinkAge = -1.0;
		}
	}
	// The upper lid follows the eye down, resting lower the further down she looks.
	const double LidRest = FMath::Clamp(.05 - EyeGaze.Y * .9 + HeadDown * .15, 0.0, .4);
	if (EyeMaterial)
	{
		const FVector2D Slide = FVector2D(-FMath::Sin(EyeGaze.X), FMath::Sin(EyeGaze.Y)) * EyeDome * IrisUvPerM;
		EyeMaterial->SetVectorParameterValue(TEXT("Gaze"), FLinearColor(Slide.X, Slide.Y, 0.f, 0.f));
	}
	if (Body->MorphTargetWeights.IsValidIndex(BlinkWeight))
	{
		Body->MorphTargetWeights[BlinkWeight] = float(FMath::Max(LidRest, BlinkAmount()));
	}
}

int32 AIceSkater::ForeignMaterials() const
{
	const USkeletalMesh* Mesh = Cast<USkeletalMesh>(Body->GetSkinnedAsset());
	if (!Mesh)
	{
		return 0;
	}
	int32 Count = 0;
	const TArray<FSkeletalMaterial>& Own = Mesh->GetMaterials();
	for (int32 I = 0; I < Own.Num(); ++I)
	{
		const UMaterialInterface* Worn = Body->GetMaterial(I);
		if (const UMaterialInstanceDynamic* Made = Cast<UMaterialInstanceDynamic>(Worn))
		{
			if (Made == EyeMaterial)
			{
				continue;
			}
			Worn = Made->Parent;
		}
		Count += Worn != Own[I].MaterialInterface ? 1 : 0;
	}
	return Count;
}
