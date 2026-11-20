#include "IceShotCamera.h"
#include "IceSimSpace.h"
#include "IceSkater.h"
#include "IceRunGameMode.h"
#include "Camera/CameraComponent.h"
#include "Engine/World.h"

namespace
{
	double Ease(double Rate, double Dt) { return 1.0 - FMath::Exp(-Rate * Dt); }
	constexpr double M = IceSimSpace::CmPerM;
}

AIceShotCamera::AIceShotCamera()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PostUpdateWork;
	GetCameraComponent()->SetFieldOfView(46.f);
	GetCameraComponent()->bConstrainAspectRatio = false;
}

void AIceShotCamera::Watch(AIceSkater* Skater)
{
	Watched = Skater;
	if (Skater)
	{
		AddTickPrerequisiteActor(Skater);
	}
}

void AIceShotCamera::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const AIceRunGameMode* Mode = GetWorld() ? GetWorld()->GetAuthGameMode<AIceRunGameMode>() : nullptr;
	if (Mode && Mode->Frame().bValid && Watched.IsValid())
	{
		Follow(Mode->Frame().State, Watched->GetActorLocation(), FMath::Min(DeltaSeconds, .1f));
	}
}

const TCHAR* AIceShotCamera::ModeName(int32 Mode)
{
	static const TCHAR* Names[] = {TEXT("Tracking"), TEXT("Broadcast"), TEXT("Rink"), TEXT("Blade"), TEXT("Director")};
	return Names[FMath::Clamp(Mode, 0, 4)];
}

int32 AIceShotCamera::Direct(const FIceState& S, float Dt)
{
	CutAge += Dt;
	const bool bGliding = S.Move == IceMove::None && S.JumpPhase == IceJumpPhase::None && !S.bFallen;
	GlideAge = bGliding ? GlideAge + Dt : 0.0;
	const bool bJumping = S.JumpPhase != IceJumpPhase::None;
	SinceJump = bJumping ? 0.0 : SinceJump + Dt;
	if (S.Move == IceMove::Spin && LastMove != IceMove::Spin)
	{
		SpinShot = SpinShot == 0 ? 3 : 0;
	}
	LastMove = S.Move;
	int32 Want = 1;
	if (bJumping || S.bFallen || SinceJump < 1.6)
	{
		Want = 0;
	}
	else if (S.Move == IceMove::Spin)
	{
		Want = SpinShot;
	}
	else if (S.Move == IceMove::Turn || S.Move == IceMove::Twizzle)
	{
		Want = 3;
	}
	else if (S.Move == IceMove::Spiral || S.Move == IceMove::InaBauer)
	{
		Want = 0;
	}
	else if (GlideAge > 12.0 && FMath::Fmod(GlideAge, 16.0) > 12.0)
	{
		Want = 2;
	}
	// A jump is cut to at once (a short hold); anything else holds the shot a moment first.
	const double Hold = Want == 0 && bJumping ? .4 : 1.6;
	if (Want != Directed && CutAge >= Hold)
	{
		Directed = Want;
		CutAge = 0.0;
		bPlaced = false;
	}
	return Directed;
}

AIceShotCamera::FShot AIceShotCamera::Framing(const FIceState& S)
{
	// shot.gd: a judge has to be able to read the blade, so these change distance and aim only.
	if (S.JumpPhase == IceJumpPhase::Air) return {5.8, 1.2, 1.15, .3};
	if (S.JumpPhase == IceJumpPhase::Load) return {4.5, .8, .8, .5};
	switch (S.Move)
	{
	case IceMove::Turn:
	case IceMove::Twizzle: return {3.7, .5, .55, .35};
	case IceMove::Spin: return {4.1, .7, .95, 0.0};
	case IceMove::InaBauer:
	case IceMove::Spiral: return {4.4, .7, .8, .4};
	default: return {4.7, .9, .9, .6};
	}
}

void AIceShotCamera::Cycle(const FIceState& State)
{
	if (State.JumpPhase != IceJumpPhase::Air)
	{
		CameraMode = (CameraMode + 1) % 5;
	}
}

void AIceShotCamera::Follow(const FIceState& S, const FVector& SkaterLocation, float Dt)
{
	const AIceRunGameMode* Game = GetWorld() ? GetWorld()->GetAuthGameMode<AIceRunGameMode>() : nullptr;
	FVector Podium;
	if (Game && Game->PodiumFocus(Podium))
	{
		// scripts/podium.gd's shot: from the ice in front of the podium (sim -y is Unreal +Y), drifting side to side.
		ShowClock += Dt;
		const FVector Desired = Podium + FVector(FMath::Sin(ShowClock * .12) * 1.1 * M, 6.4 * M, 1.45 * M);
		const FVector Look = Podium + FVector(0, 0, 1.15 * M);
		const FVector At = bPlaced ? FMath::Lerp(GetActorLocation(), Desired, Ease(3.0, Dt)) : Desired;
		bPlaced = true;
		Fov = FMath::Lerp(Fov, 34.0, Ease(2.5, Dt));
		SetActorLocationAndRotation(At, (Look - At).Rotation());
		GetCameraComponent()->SetFieldOfView(float(Fov));
		return;
	}
	if (Game && Game->Showcase())
	{
		// main.gd's menu camera: close, slowly turning about the skater from in front, a little to one side.
		ShowClock += Dt;
		const double A = .38 + FMath::Sin(ShowClock * .09) * .22;
		const FVector Front = IceSimSpace::Direction(S.Heading.X, S.Heading.Y).GetSafeNormal();
		const FVector Around = Front.RotateAngleAxis(-FMath::RadiansToDegrees(A), FVector::UpVector);
		const FVector Desired = SkaterLocation + Around * 5.8 * M + FVector(0, 0, 1.2 * M);
		const FVector Look = SkaterLocation + FVector(0, 0, .88 * M);
		const FVector At = bPlaced ? FMath::Lerp(GetActorLocation(), Desired, Ease(3.0, Dt)) : Desired;
		bPlaced = true;
		Fov = FMath::Lerp(Fov, 38.0, Ease(2.5, Dt));
		SetActorLocationAndRotation(At, (Look - At).Rotation());
		GetCameraComponent()->SetFieldOfView(float(Fov));
		return;
	}
	const FVector Velocity = IceSimSpace::Direction(S.Vel.X, S.Vel.Y);
	if (Velocity.Size() > .5 && S.JumpPhase != IceJumpPhase::Air)
	{
		FollowDirection = FMath::Lerp(FollowDirection, Velocity.GetSafeNormal(), Ease(1.8, Dt)).GetSafeNormal();
	}
	// The director picks which of the four; the others are themselves.
	const int32 Use = CameraMode == 4 ? Direct(S, Dt) : CameraMode;
	const FShot Target = Framing(S);
	const double Blend = Ease(3.0, Dt);
	Shot.Away = FMath::Lerp(Shot.Away, Target.Away, Blend);
	Shot.Height = FMath::Lerp(Shot.Height, Target.Height, Blend);
	Shot.Aim = FMath::Lerp(Shot.Aim, Target.Aim, Blend);
	Shot.Lead = FMath::Lerp(Shot.Lead, Target.Lead, Blend);
	const FVector Focus = SkaterLocation + FVector(0, 0, Shot.Aim * M);
	const FVector Side = FVector::CrossProduct(FVector::UpVector, FollowDirection);
	FVector Desired = Focus - FollowDirection * Shot.Away * M + FVector(0, 0, Shot.Height * M) + Side * Shot.Away * .245 * M;
	// It looks a little ahead of a moving skater, to where the program is going.
	FVector Look = Focus + FollowDirection * Shot.Lead * (1.0 + Velocity.Size() * .14) * M;
	double TargetFov = 46.0;
	if (Use == 1)
	{
		Desired = FVector(FMath::Clamp(Focus.X * .45, -18.0 * M, 18.0 * M), 31.5 * M, 7.8 * M);
		TargetFov = FMath::Clamp(160.0 / (FVector::Dist(Desired, Focus) / M) * 10.0, 28.0, 48.0);
	}
	else if (Use == 2)
	{
		Desired = FVector(39.0 * M, 43.0 * M, 44.0 * M);
		Look = FVector::ZeroVector;
		TargetFov = 58.0;
	}
	else if (Use == 3)
	{
		Desired = Focus - FollowDirection * 3.5 * M + Side * 1.8 * M + FVector(0, 0, -.25 * M);
		Look = Focus + FVector(0, 0, -.3 * M);
	}
	const FVector At = bPlaced ? FMath::Lerp(GetActorLocation(), Desired, Ease(3.0, Dt)) : Desired;
	bPlaced = true;
	Fov = FMath::Lerp(Fov, TargetFov, Ease(2.5, Dt));
	SetActorLocationAndRotation(At, (Look - At).Rotation());
	GetCameraComponent()->SetFieldOfView(float(Fov));
}
