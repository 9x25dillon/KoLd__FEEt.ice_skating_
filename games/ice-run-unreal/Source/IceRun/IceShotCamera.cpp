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
	static const TCHAR* Names[] = {TEXT("Tracking"), TEXT("Broadcast"), TEXT("Rink"), TEXT("Blade")};
	return Names[FMath::Clamp(Mode, 0, 3)];
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
		CameraMode = (CameraMode + 1) % 4;
	}
}

void AIceShotCamera::Follow(const FIceState& S, const FVector& SkaterLocation, float Dt)
{
	const AIceRunGameMode* Game = GetWorld() ? GetWorld()->GetAuthGameMode<AIceRunGameMode>() : nullptr;
	if (Game && Game->Showcase())
	{
		// main.gd's menu camera: close, slowly turning about the skater from in front, a little to one side.
		ShowClock += Dt;
		const double A = .38 + FMath::Sin(ShowClock * .09) * .22;
		const FVector Front = IceSimSpace::Direction(S.Heading.X, S.Heading.Y).GetSafeNormal();
		const FVector Around = Front.RotateAngleAxis(-FMath::RadiansToDegrees(A), FVector::UpVector);
		FVector Desired = SkaterLocation + Around * 5.8 * M + FVector(0, 0, 1.2 * M);
		// On the ice side of the boards. In front of her, the orbit can sit in the stands when she
		// stops facing a wall or in a corner (found on a program's end), and pulling it back inside
		// can put it on top of her; so then it orbits from the rink's middle side of her instead.
		if (const TSharedPtr<FJsonObject> R = Game->RinkShape())
		{
			const double MinX = R->GetNumberField(TEXT("minX")), MaxX = R->GetNumberField(TEXT("maxX"));
			const double MinY = R->GetNumberField(TEXT("minY")), MaxY = R->GetNumberField(TEXT("maxY"));
			const FVector Mid = IceSimSpace::Point((MinX + MaxX) * .5, (MinY + MaxY) * .5);
			const double Margin = 1.5 * M;
			const double HalfX = (MaxX - MinX) * .5 * M - Margin, HalfY = (MaxY - MinY) * .5 * M - Margin;
			const double Corner = FMath::Max(0.0, R->GetNumberField(TEXT("corner")) * M - Margin);
			// Pulls a point into the rink's rounded rectangle; says whether it was already inside.
			auto KeepInside = [&](FVector& Point)
			{
				FVector2D P(Point.X - Mid.X, Point.Y - Mid.Y);
				const FVector2D Was = P;
				P.X = FMath::Clamp(P.X, -HalfX, HalfX);
				P.Y = FMath::Clamp(P.Y, -HalfY, HalfY);
				const FVector2D C(FMath::Sign(P.X) * (HalfX - Corner), FMath::Sign(P.Y) * (HalfY - Corner));
				if (FMath::Abs(P.X) > HalfX - Corner && FMath::Abs(P.Y) > HalfY - Corner && (P - C).Size() > Corner)
				{
					P = C + (P - C).GetSafeNormal() * Corner;
				}
				Point.X = Mid.X + P.X;
				Point.Y = Mid.Y + P.Y;
				return P.Equals(Was, 1.0);
			};
			if (!KeepInside(Desired))
			{
				const FVector Inward = (Mid - SkaterLocation).GetSafeNormal2D();
				const FVector Toward = (Inward.IsNearlyZero() ? Front : Inward).RotateAngleAxis(FMath::RadiansToDegrees(A - .38), FVector::UpVector);
				Desired = SkaterLocation + Toward * 5.8 * M + FVector(0, 0, 1.2 * M);
				KeepInside(Desired);
			}
		}
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
	if (CameraMode == 1)
	{
		Desired = FVector(FMath::Clamp(Focus.X * .45, -18.0 * M, 18.0 * M), 31.5 * M, 7.8 * M);
		TargetFov = FMath::Clamp(160.0 / (FVector::Dist(Desired, Focus) / M) * 10.0, 28.0, 48.0);
	}
	else if (CameraMode == 2)
	{
		Desired = FVector(39.0 * M, 43.0 * M, 44.0 * M);
		Look = FVector::ZeroVector;
		TargetFov = 58.0;
	}
	else if (CameraMode == 3)
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
