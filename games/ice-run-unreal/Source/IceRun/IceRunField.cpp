// The career's field on the ice: the warm-up group before a program (game/warmup.ts) and the
// podium after a result (game/podium.ts). The twin of main.gd's apply_warmup and scripts/podium.gd.
// Every skater here is posed by AIceSkater from a sim state the bridge sent, like the player and
// the pairs partner; nothing here scores, places or moves anyone.
#include "IceRunGameMode.h"
#include "IceRun.h"
#include "IceSkater.h"
#include "IceRink.h"
#include "IceSimSpace.h"
#include "Engine/World.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInterface.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/Paths.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
	/** IceRunMenus.cpp's Characters, by key, in main.gd's CHARACTERS order. */
	const TCHAR* const CharacterKeys[] = {TEXT("Athlete"), TEXT("Competition"), TEXT("Berserker"), TEXT("Violet")};
	/** scripts/podium.gd's band colours, by place. */
	const FLinearColor PlaceColours[] = {FLinearColor(FColor(0xd8, 0xb2, 0x5a)), FLinearColor(FColor(0xc4, 0xcc, 0xd4)), FLinearColor(FColor(0xb9, 0x82, 0x50))};
}

FString AIceRunGameMode::SkaterAsset(const FString& Folder) const
{
	FString Manifest, Path;
	TSharedPtr<FJsonObject> Skaters;
	if (FFileHelper::LoadFileToString(Manifest, *FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Generated/skaters.json")))
		&& FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Manifest), Skaters) && Skaters.IsValid())
	{
		Skaters->TryGetStringField(Folder, Path);
	}
	return Path;
}

TSharedPtr<FJsonObject> AIceRunGameMode::RivalLook(const FString& Name) const
{
	const TSharedPtr<FJsonObject>* Story = nullptr;
	const TArray<TSharedPtr<FJsonValue>>* Cast = nullptr;
	if (!Catalog.IsValid() || !Catalog->TryGetObjectField(TEXT("story"), Story) || !(*Story)->TryGetArrayField(TEXT("cast"), Cast)) return nullptr;
	for (const TSharedPtr<FJsonValue>& V : *Cast)
	{
		const TSharedPtr<FJsonObject> C = V->AsObject();
		const TSharedPtr<FJsonObject>* Look = nullptr;
		if (C.IsValid() && C->GetStringField(TEXT("name")) == Name && C->TryGetObjectField(TEXT("look"), Look)) return *Look;
	}
	return nullptr;
}

AIceSkater* AIceRunGameMode::SpawnFieldSkater(const FString& Name, bool bYou)
{
	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AIceSkater* S = GetWorld()->SpawnActor<AIceSkater>(Params);
	if (!S) return nullptr;
	FString Path;
	TSharedPtr<FJsonObject> Costume;
	if (bYou)
	{
		Path = SkaterAsset(CharacterKeys[FMath::Clamp(CharacterIndex, 0, int32(UE_ARRAY_COUNT(CharacterKeys)) - 1)]);
		const TArray<TSharedPtr<FJsonObject>> List = Costumes();
		if (List.IsValidIndex(CostumeIndex)) Costume = List[CostumeIndex];
	}
	else if (const TSharedPtr<FJsonObject> Look = RivalLook(Name))
	{
		FString Model;
		// A rival without a model of their own yet (game/cast.ts: null) wears the athlete's, in their costume.
		if (Look->TryGetStringField(TEXT("model"), Model)) Path = SkaterAsset(Model);
		const TSharedPtr<FJsonObject>* Worn = nullptr;
		if (Look->TryGetObjectField(TEXT("costume"), Worn)) Costume = *Worn;
	}
	if (Path.IsEmpty()) Path = SkaterAsset(TEXT("Athlete"));
	S->LoadModel(Path);
	if (Costume.IsValid()) S->ApplyCostume(Costume);
	return S;
}

void AIceRunGameMode::PresentWarmup(bool bSnap)
{
	const TSharedPtr<FJsonObject>* Group = nullptr;
	const TArray<TSharedPtr<FJsonValue>>* List = nullptr;
	const bool bWarm = Latest.Raw.IsValid() && Latest.Raw->TryGetObjectField(TEXT("warmup"), Group) && (*Group)->TryGetArrayField(TEXT("skaters"), List);
	if (!bWarm)
	{
		if (WarmupSkaters.Num() > 0)
		{
			// The group leaves the ice; the program starts fresh, from its own start.
			for (const TPair<FString, TObjectPtr<AIceSkater>>& K : WarmupSkaters) if (K.Value) K.Value->Destroy();
			WarmupSkaters.Empty();
			Skater->ApplyFrame(Latest, true);
			Rink->ClearTraces();
			Announce(TEXT("THE GROUP LEAVES THE ICE"), TEXT("Your program"));
		}
		return;
	}
	for (const TSharedPtr<FJsonValue>& V : *List)
	{
		const TSharedPtr<FJsonObject> K = V->AsObject();
		if (!K.IsValid()) continue;
		const FString Name = K->GetStringField(TEXT("name"));
		const bool bFresh = !WarmupSkaters.Contains(Name);
		if (bFresh) WarmupSkaters.Add(Name, SpawnFieldSkater(Name, false));
		AIceSkater* S = WarmupSkaters[Name];
		const FIceFrame Theirs = FIceFrame::Parse(K);
		if (S && Theirs.bValid)
		{
			S->SetEffects(bPlaying && !bPaused);
			S->ApplyFrame(Theirs, bSnap || bFresh);
		}
	}
}

void AIceRunGameMode::BuildPodium()
{
	const TSharedPtr<FJsonObject>* Result = nullptr;
	const TArray<TSharedPtr<FJsonValue>>* Rows = nullptr;
	if (bPodiumBuilt || !Latest.Raw.IsValid() || !Latest.Raw->TryGetObjectField(TEXT("result"), Result) || !(*Result)->TryGetArrayField(TEXT("podium"), Rows)) return;
	BuildPodiumFrom(*Rows);
}

void AIceRunGameMode::BuildPodiumFrom(const TArray<TSharedPtr<FJsonValue>>& InRows)
{
	const TArray<TSharedPtr<FJsonValue>>* Rows = &InRows;
	bPodiumBuilt = true;
	UStaticMesh* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	UMaterialInterface* Plain = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	for (const TSharedPtr<FJsonValue>& V : *Rows)
	{
		const TSharedPtr<FJsonObject> Row = V->AsObject();
		const FIceFrame Theirs = FIceFrame::Parse(Row);
		if (!Theirs.bValid) continue;
		const int32 Place = int32(Row->GetNumberField(TEXT("place")));
		const double Height = Row->GetNumberField(TEXT("height"));
		bool bYou = false;
		Row->TryGetBoolField(TEXT("you"), bYou);
		const FVector Foot = IceSimSpace::Point(Theirs.State.Pos.X, Theirs.State.Pos.Y);
		if (Place == 1) PodiumCentre = Foot;
		// The block: white, with a band of the place's colour round its top (scripts/podium.gd).
		for (int32 Part = 0; Part < 2 && Cube; ++Part)
		{
			AStaticMeshActor* Block = GetWorld()->SpawnActor<AStaticMeshActor>(Params);
			if (!Block) continue;
			Block->SetMobility(EComponentMobility::Movable);
			UStaticMeshComponent* C = Block->GetStaticMeshComponent();
			C->SetStaticMesh(Cube);
			const double Tall = Part == 0 ? Height : .05;
			// The engine's cube is a metre a side: 0.9 m along the sheet, 0.7 m deep; the band a little proud.
			Block->SetActorScale3D(Part == 0 ? FVector(.9, .7, Tall) : FVector(.92, .72, Tall));
			Block->SetActorLocation(Foot + FVector(0, 0, (Part == 0 ? Height * .5 : Height - .03) * IceSimSpace::CmPerM));
			if (Plain)
			{
				UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(Plain, Block);
				M->SetVectorParameterValue(TEXT("Color"), Part == 0 ? FLinearColor(FColor(0xf2, 0xf4, 0xf6)) : PlaceColours[FMath::Clamp(Place - 1, 0, 2)]);
				C->SetMaterial(0, M);
			}
			PodiumBlocks.Add(Block);
		}
		FString Name = Row->GetStringField(TEXT("name"));
		AIceSkater* S = SpawnFieldSkater(Name, bYou);
		if (!S) continue;
		// Standing on the block: the bridge's settled standing state, carried up by the block's height.
		S->SetLift(Height);
		S->SetEffects(false);
		S->ApplyFrame(Theirs, true);
		PodiumSkaters.Add(S);
	}
	if (PodiumSkaters.Num() > 0 && Skater) Skater->SetActorHiddenInGame(true);
	UE_LOG(LogIceRun, Log, TEXT("Podium: %d skaters."), PodiumSkaters.Num());
}

void AIceRunGameMode::ClearPodium()
{
	for (AIceSkater* S : PodiumSkaters) if (S) S->Destroy();
	for (AActor* B : PodiumBlocks) if (B) B->Destroy();
	PodiumSkaters.Empty();
	PodiumBlocks.Empty();
	bPodiumBuilt = false;
	if (Skater) Skater->SetActorHiddenInGame(false);
}
