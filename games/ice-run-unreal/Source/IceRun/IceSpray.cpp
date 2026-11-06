#include "IceSpray.h"
#include "IceSimSpace.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

UIceSpray::UIceSpray()
{
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	if (Sphere.Succeeded())
	{
		SetStaticMesh(Sphere.Object);
	}
	SetCollisionEnabled(ECollisionEnabled::NoCollision);
	SetCastShadow(false);
	// The flakes are placed in the world, not about the skater who throws them (local_coords = false).
	SetUsingAbsoluteLocation(true);
	SetUsingAbsoluteRotation(true);
	SetUsingAbsoluteScale(true);
	Random.Initialize(0x5A0);
	for (int32 I = 0; I < 2; ++I)
	{
		Source[I] = FVector::ZeroVector;
		Toward[I] = FVector::UpVector;
	}
}

void UIceSpray::Feed(int32 Blade, const FVector& At, const FVector& Direction, float FastestThrow, bool bThrowing)
{
	if (Blade < 0 || Blade > 1)
	{
		return;
	}
	Source[Blade] = At;
	Toward[Blade] = Direction.GetSafeNormal();
	Fastest[Blade] = FMath::Max(SlowestThrow, FastestThrow);
	bOn[Blade] = bThrowing;
}

void UIceSpray::Clear()
{
	Flakes.Reset();
	Owed[0] = Owed[1] = 0.f;
	bOn[0] = bOn[1] = false;
	ClearInstances();
}

void UIceSpray::Step(float Dt)
{
	if (!bDressed)
	{
		// The rink's surface material in the snow's colour; the engine's plain one when the content is not built.
		bDressed = true;
		UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/Materials/M_Surface.M_Surface"), nullptr, LOAD_NoWarn | LOAD_Quiet);
		if (Base)
		{
			UMaterialInstanceDynamic* Snow = UMaterialInstanceDynamic::Create(Base, this);
			Snow->SetVectorParameterValue(TEXT("Color"), FLinearColor::FromSRGBColor(FColor::FromHex(TEXT("dfebef"))));
			Snow->SetScalarParameterValue(TEXT("Roughness"), .7f);
			SetMaterial(0, Snow);
		}
	}
	// Each blade throws Amount flakes over a lifetime while it throws, and never has more than Amount in the air.
	int32 Alive[2] = {0, 0};
	for (const FFlake& F : Flakes)
	{
		++Alive[F.Blade];
	}
	for (int32 B = 0; B < 2; ++B)
	{
		if (!bOn[B])
		{
			Owed[B] = 0.f;
			continue;
		}
		Owed[B] += Dt * Amount / Lifetime;
		while (Owed[B] >= 1.f)
		{
			Owed[B] -= 1.f;
			if (Alive[B] >= Amount)
			{
				continue;
			}
			FFlake F;
			F.At = Source[B];
			F.Velocity = Random.VRandCone(Toward[B], FMath::DegreesToRadians(SpreadDegrees)) * Random.FRandRange(SlowestThrow, Fastest[B]) * IceSimSpace::CmPerM;
			F.Radius = Random.FRandRange(SmallestRadius, LargestRadius);
			F.Blade = B;
			Flakes.Add(F);
			++Alive[B];
		}
	}
	for (int32 I = Flakes.Num() - 1; I >= 0; --I)
	{
		FFlake& F = Flakes[I];
		F.Age += Dt;
		if (F.Age >= Lifetime)
		{
			Flakes.RemoveAtSwap(I);
			continue;
		}
		if (F.bSettled)
		{
			continue;
		}
		F.Velocity.Z -= Gravity * IceSimSpace::CmPerM * Dt;
		F.At += F.Velocity * Dt;
		// The ice's top is the sim's zero: a flake comes to rest on it.
		const float Rest = F.Radius * IceSimSpace::CmPerM;
		if (F.At.Z < Rest)
		{
			F.At.Z = Rest;
			F.Velocity = FVector::ZeroVector;
			F.bSettled = true;
		}
	}
	// The engine's sphere is 100 cm across: a flake of radius r metres is scaled 2r.
	Drawn.Reset(Flakes.Num());
	for (const FFlake& F : Flakes)
	{
		Drawn.Add(FTransform(FQuat::Identity, F.At, FVector(F.Radius * 2.f)));
	}
	const int32 Have = GetInstanceCount();
	if (Have > Drawn.Num())
	{
		for (int32 I = Have - 1; I >= Drawn.Num(); --I)
		{
			RemoveInstance(I);
		}
	}
	const int32 Kept = FMath::Min(Have, Drawn.Num());
	if (Kept > 0)
	{
		BatchUpdateInstancesTransforms(0, TArrayView<const FTransform>(Drawn.GetData(), Kept), true, true, true);
	}
	if (Drawn.Num() > Kept)
	{
		AddInstances(TArray<FTransform>(Drawn.GetData() + Kept, Drawn.Num() - Kept), false, true, false);
	}
}
