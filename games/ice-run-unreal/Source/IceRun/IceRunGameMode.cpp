#include "IceRunGameMode.h"
#include "IceRun.h"
#include "IceSkater.h"
#include "IceRink.h"
#include "IceShotCamera.h"
#include "IceRunHUD.h"
#include "IceRunPlayerController.h"
#include "IceSound.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "GameFramework/GameUserSettings.h"
#include "HAL/PlatformMisc.h"
#include "Misc/CommandLine.h"
#include "Misc/Paths.h"
#include "Misc/Parse.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Kismet/KismetSystemLibrary.h"
#include "UnrealClient.h"
#include "Components/AudioComponent.h"
#include "Sound/SoundBase.h"

namespace
{
	/** The setups in the order Tab steps through them; "" is the original schemes with the coach. */
	const TCHAR* const Setups[] = {TEXT("explorer"), TEXT("simulation"), TEXT("experimental"), TEXT("diggate"), TEXT("repertoire"), TEXT("")};
	const TCHAR* const Modes[] = {TEXT("free"), TEXT("lesson"), TEXT("career"), TEXT("rookie"), TEXT("timed")};

	/** The career smoke's stage limit, in sim seconds: the event runs 75. */
	constexpr double SmokeLimit = 100.0;
}

AIceRunGameMode::AIceRunGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bTickEvenWhenPaused = true;
	DefaultPawnClass = nullptr;
	PlayerControllerClass = AIceRunPlayerController::StaticClass();
	HUDClass = AIceRunHUD::StaticClass();
}

AIceRunPlayerController* AIceRunGameMode::Player() const
{
	return GetWorld() ? Cast<AIceRunPlayerController>(GetWorld()->GetFirstPlayerController()) : nullptr;
}

int32 AIceRunGameMode::CameraMode() const
{
	return ShotCamera ? ShotCamera->Mode() : 0;
}

FString AIceRunGameMode::CameraName() const
{
	return AIceShotCamera::ModeName(CameraMode());
}

void AIceRunGameMode::StartPlay()
{
	Super::StartPlay();
	const TCHAR* Line = FCommandLine::Get();
	bSmoke = FParse::Param(Line, TEXT("IceSmoke"));
	bMenuTest = FParse::Param(Line, TEXT("IceMenuTest"));
	if (!bSmoke && !bMenuTest && FCString::Strifind(Line, TEXT("-IceShots=")) == nullptr)
	{
		LoadPreferences();
	}
	bAuto = FParse::Param(Line, TEXT("IceAuto"));
	FParse::Value(Line, TEXT("IceSetup="), SetupId);
	FParse::Value(Line, TEXT("IceMode="), RunMode);
	FParse::Value(Line, TEXT("IceEvent="), EventIndex);
	FParse::Value(Line, TEXT("IceCourse="), Course);
	FParse::Value(Line, TEXT("IceSteady="), SteadyChoice);
	FParse::Value(Line, TEXT("IceSkater="), SkaterName);
	FParse::Value(Line, TEXT("IceModel="), ModelPath);
	if (ModelPath.IsEmpty())
	{
		// tools/build_content.py records where Interchange put each skater.
		FString Manifest;
		TSharedPtr<FJsonObject> Skaters;
		const FString ManifestPath = FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Generated/skaters.json"));
		if (FFileHelper::LoadFileToString(Manifest, *ManifestPath) && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Manifest), Skaters) && Skaters.IsValid())
		{
			Skaters->TryGetStringField(SkaterName, ModelPath);
		}
		if (ModelPath.IsEmpty())
		{
			ModelPath = TEXT("/Game/Generated/Athlete/skater-athlete/SkeletalMeshes/skater-athlete.skater-athlete");
		}
	}
	FParse::Value(Line, TEXT("IceCamera="), StartCamera);
	FString Shots;
	// Not stopping at the commas between the times.
	if (FParse::Value(Line, TEXT("IceShots="), Shots, false))
	{
		if (GEngine)
		{
			GEngine->bEnableOnScreenDebugMessages = false;
		}
		TArray<FString> Parts;
		Shots.ParseIntoArray(Parts, TEXT(","));
		for (const FString& Part : Parts)
		{
			ShotTimes.Add(FCString::Atod(*Part));
		}
		FParse::Value(Line, TEXT("IceShotDir="), ShotDir);
		if (ShotDir.IsEmpty())
		{
			ShotDir = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Shots"));
		}
	}
	if (FParse::Param(Line, TEXT("IceNoSetup")) || SetupId == TEXT("none"))
	{
		SetupId.Reset();
	}
	if (bSmoke)
	{
		// main.gd's --smoke-test: the original schemes with the coach, the first career event.
		SetupId.Reset();
		RunMode = TEXT("career");
		EventIndex = 0;
	}
	if (bMenuTest)
	{
		// The same pad script skates the career event the menus start.
		SetupId.Reset();
	}

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Rink = GetWorld()->SpawnActor<AIceRink>(Params);
	Skater = GetWorld()->SpawnActor<AIceSkater>(Params);
	ShotCamera = GetWorld()->SpawnActor<AIceShotCamera>(Params);
	Music = NewObject<UAudioComponent>(this);
	Music->bAutoActivate = false;
	Music->RegisterComponent();
	Preview = NewObject<UAudioComponent>(this);
	Preview->bAutoActivate = false;
	Preview->RegisterComponent();
	// main.gd plays the blade at -22 dB under music at -12: the same 10 dB under the music here.
	IceSound = NewObject<UIceSound>(this);
	Ambience = NewObject<UAudioComponent>(this);
	Ambience->bAutoActivate = false;
	Ambience->RegisterComponent();
	Ambience->SetSound(IceSound);
	Ambience->SetVolumeMultiplier(.316f);
	Ambience->Play();
	ShotCamera->Watch(Skater);
	for (int32 I = 0; I < StartCamera % 4; ++I)
	{
		ShotCamera->Cycle(FIceState());
	}
	if (FCString::Strifind(Line, TEXT("-IceSkater=")) || FCString::Strifind(Line, TEXT("-IceModel=")) || !FPaths::FileExists(PreferencesPath()))
	{
		Skater->LoadModel(ModelPath);
	}
	else
	{
		LoadSkaterModel();
	}

	const FString Project = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir());
	FString Host = FPlatformMisc::GetEnvironmentVariable(TEXT("ICE_RUN_HOST"));
	if (Host.IsEmpty())
	{
		Host = FPaths::ConvertRelativePathToFull(FPaths::Combine(Project, TEXT("../ice-run-godot/bridge/host.mjs")));
	}
	if (!FPaths::FileExists(Host))
	{
		// A packaged build carries the bridge beside the project, as the Godot export does.
		Host = FPaths::Combine(Project, TEXT("bridge/host.mjs"));
	}
	const FString Runtime = FPaths::Combine(FPaths::GetPath(Host), TEXT("../runtime/sim/solver.js"));
	if (!FPaths::FileExists(Host) || !FPaths::FileExists(Runtime))
	{
		Fail(TEXT("Game runtime is missing. Run games/ice-run-unreal/tools/prepare.mjs before starting."));
		return;
	}
	FString Node = FPlatformMisc::GetEnvironmentVariable(TEXT("ICE_RUN_NODE"));
	if (Node.IsEmpty())
	{
		Node = TEXT("node");
	}
	FString SaveDir = FPaths::ConvertRelativePathToFull(FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("IceRun")));
	if (bSmoke || bMenuTest || ShotTimes.Num() > 0)
	{
		// Test runs and stills never touch the player's career.
		SaveDir = FPaths::Combine(SaveDir, TEXT("test-runs"), FString::FromInt(FPlatformProcess::GetCurrentProcessId()));
	}
	FString Error;
	if (!Bridge.Start(Node, Host, SaveDir, Error))
	{
		Fail(Error);
		return;
	}
	Bridge.Send(TEXT("hello"));
}

void AIceRunGameMode::EndPlay(const EEndPlayReason::Type Reason)
{
	Bridge.Stop();
	Super::EndPlay(Reason);
}

void AIceRunGameMode::Fail(const FString& Message)
{
	bFaulted = true;
	bOperational = false;
	bPlaying = false;
	NoticeText = Message;
	UE_LOG(LogIceRun, Error, TEXT("%s"), *Message);
	if (bSmoke)
	{
		UE_LOG(LogIceRun, Error, TEXT("UNREAL_SMOKE_FAIL: %s"), *Message);
		FPlatformMisc::RequestExitWithStatus(false, 1);
	}
}

void AIceRunGameMode::Configure()
{
	// main.gd start_game's configure, with its rules for what each setup implies.
	if (!SetupId.IsEmpty())
	{
		Scheme = 3;
		bBeginner = false;
		bCruise = false;
	}
	else
	{
		Scheme = 1;
		bBeginner = true;
		bCruise = true;
	}
	TSharedRef<FJsonObject> Options = MakeShared<FJsonObject>();
	if (SetupId.IsEmpty())
	{
		Options->SetField(TEXT("setup"), MakeShared<FJsonValueNull>());
	}
	else
	{
		Options->SetStringField(TEXT("setup"), SetupId);
	}
	Options->SetNumberField(TEXT("assistance"), Assistance);
	Options->SetNumberField(TEXT("profile"), ProfileIndex);
	Options->SetNumberField(TEXT("track"), TrackIndex);
	Options->SetNumberField(TEXT("scheme"), Scheme);
	Options->SetBoolField(TEXT("beginner"), bBeginner);
	Options->SetBoolField(TEXT("cruise"), bCruise);
	if (SteadyChoice.IsEmpty())
	{
		Options->SetField(TEXT("steady"), MakeShared<FJsonValueNull>());
	}
	else
	{
		Options->SetStringField(TEXT("steady"), SteadyChoice);
	}
	TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
	Payload->SetObjectField(TEXT("options"), Options);
	Bridge.Send(TEXT("configure"), Payload);
}

void AIceRunGameMode::StartRun()
{
	TSharedRef<FJsonObject> Options = MakeShared<FJsonObject>();
	Options->SetStringField(TEXT("mode"), RunMode);
	Options->SetNumberField(TEXT("event"), EventIndex);
	if (RunMode == TEXT("lesson"))
	{
		Options->SetStringField(TEXT("course"), Course);
	}
	if (RunMode == TEXT("composer"))
	{
		TArray<TSharedPtr<FJsonValue>> Ids;
		for (const FString& Id : Sequence) Ids.Add(MakeShared<FJsonValueString>(Id));
		Options->SetArrayField(TEXT("sequence"), Ids);
	}
	TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
	Payload->SetObjectField(TEXT("options"), Options);
	bPlaying = false;
	bSnapNext = true;
	FinishedFor = -1.0;
	Bridge.Send(TEXT("start"), Payload);
}

FString AIceRunGameMode::SetupName(const FString& Id) const
{
	if (Id.IsEmpty())
	{
		return TEXT("Original schemes, coached");
	}
	const TArray<TSharedPtr<FJsonValue>>* List = nullptr;
	if (Catalog.IsValid() && Catalog->TryGetArrayField(TEXT("setups"), List))
	{
		for (const TSharedPtr<FJsonValue>& V : *List)
		{
			const TSharedPtr<FJsonObject> O = V->AsObject();
			if (O.IsValid() && O->GetStringField(TEXT("id")) == Id)
			{
				return O->GetStringField(TEXT("name"));
			}
		}
	}
	return Id;
}

void AIceRunGameMode::StartLesson(const FString& LessonCourse, const FString& NeededSetup)
{
	if (!NeededSetup.IsEmpty() && NeededSetup != SetupId)
	{
		SetupId = NeededSetup;
		Configure();
	}
	RunMode = TEXT("lesson");
	Course = LessonCourse;
	StartRun();
	CloseMenu();
}

void AIceRunGameMode::StartMode(const FString& Mode, int32 Event)
{
	RunMode = Mode;
	EventIndex = Event;
	StartRun();
	CloseMenu();
}

void AIceRunGameMode::ChangeSetup(int32 By)
{
	int32 At = 0;
	while (At < UE_ARRAY_COUNT(Setups) && SetupId != Setups[At]) ++At;
	const int32 Count = UE_ARRAY_COUNT(Setups);
	SetupId = Setups[((At + By) % Count + Count) % Count];
	// A setup's own course does not run on another setup's pad: the tutorial does.
	if (RunMode == TEXT("lesson") && Course != TEXT("trust"))
	{
		Course = TEXT("trust");
	}
	NoticeText = FString::Printf(TEXT("Setup: %s"), *SetupName(SetupId));
	Configure();
	StartRun();
}

void AIceRunGameMode::Present(const FIceFrame& Frame, bool bSnap)
{
	if (!Frame.bValid)
	{
		return;
	}
	Latest = Frame;
	Skater->ApplyFrame(Latest, bSnap);
	Rink->AddTraces(Latest.Trace, Skater->LiftedBlade());
	// A lesson's travel targets (game/tutorial.ts), the next one glowing, and an arrow on the ice toward it.
	TArray<FIceTarget> Targets;
	int32 Next = -1;
	const TSharedPtr<FJsonObject>* Tutorial = nullptr;
	if (Latest.Raw->TryGetObjectField(TEXT("tutorial"), Tutorial))
	{
		const TArray<TSharedPtr<FJsonValue>>* List = nullptr;
		if ((*Tutorial)->TryGetArrayField(TEXT("targets"), List))
		{
			for (const TSharedPtr<FJsonValue>& V : *List)
			{
				const TSharedPtr<FJsonObject> T = V->AsObject();
				Targets.Add({T->GetNumberField(TEXT("x")), T->GetNumberField(TEXT("y")), T->GetNumberField(TEXT("r")), T->GetStringField(TEXT("kind"))});
			}
		}
		const TSharedPtr<FJsonObject>* Target = nullptr;
		if ((*Tutorial)->TryGetObjectField(TEXT("target"), Target))
		{
			const double X = (*Target)->GetNumberField(TEXT("x")), Y = (*Target)->GetNumberField(TEXT("y"));
			for (int32 I = 0; I < Targets.Num(); ++I)
			{
				if (Targets[I].X == X && Targets[I].Y == Y) { Next = I; break; }
			}
		}
	}
	Rink->SetTutorialTargets(Targets, Next);
	// No arrow at a cone: the point is to go round it, not at it.
	const bool bPoint = Targets.IsValidIndex(Next) && Targets[Next].Kind != TEXT("cone") && !Latest.bFinished;
	Rink->PointArrow(Skater->GetActorLocation(), bPoint ? TOptional<FVector2D>(FVector2D(Targets[Next].X, Targets[Next].Y)) : TOptional<FVector2D>());
	// The course's next marker glows: the rookie's gate, the light course's light.
	const TSharedPtr<FJsonObject>* Progress = nullptr;
	if (Latest.Mode == TEXT("rookie") && Latest.Raw->TryGetObjectField(TEXT("rookie"), Progress))
	{
		Rink->SetTarget(int32((*Progress)->GetNumberField(TEXT("index"))));
	}
	else if (Latest.Mode == TEXT("timed") && Latest.Raw->TryGetObjectField(TEXT("run"), Progress))
	{
		Rink->SetTarget(int32((*Progress)->GetNumberField(TEXT("collected"))));
	}
}

void AIceRunGameMode::OnReply(const FIceBridge::FReply& Reply)
{
	if (!Reply.bOk)
	{
		NoticeText = Reply.Error;
		UE_LOG(LogIceRun, Warning, TEXT("Engine refused %s: %s"), *Reply.Op, *Reply.Error);
		if (bPaused)
		{
			// Said on the page where it was asked.
			PageNotice = Reply.Error;
			RebuildPage();
		}
		if (bSmoke)
		{
			Fail(FString::Printf(TEXT("%s failed: %s"), *Reply.Op, *Reply.Error));
		}
		return;
	}
	bOperational = true;
	if (!Reply.SaveError.IsEmpty())
	{
		NoticeText = Reply.SaveError;
	}
	if (Reply.Op == TEXT("hello"))
	{
		const TSharedPtr<FJsonObject>* Found = nullptr;
		if (Reply.Data->TryGetObjectField(TEXT("catalog"), Found))
		{
			Catalog = *Found;
		}
		const TSharedPtr<FJsonObject>* RinkShape = nullptr;
		if (Catalog.IsValid() && Catalog->TryGetObjectField(TEXT("rink"), RinkShape))
		{
			const TSharedPtr<FJsonObject>& R = *RinkShape;
			Rink->Build(R->GetNumberField(TEXT("minX")), R->GetNumberField(TEXT("maxX")), R->GetNumberField(TEXT("minY")), R->GetNumberField(TEXT("maxY")), R->GetNumberField(TEXT("corner")));
		}
		else
		{
			Fail(TEXT("The engine's catalog has no rink."));
			return;
		}
		const TSharedPtr<FJsonObject>* First = nullptr;
		if (Reply.Data->TryGetObjectField(TEXT("frame"), First))
		{
			Present(FIceFrame::Parse(*First), true);
		}
		if (RunMode == TEXT("career") && FParse::Param(FCommandLine::Get(), TEXT("IceOnMusic")))
		{
			// For looking at a career program on its music: the event's own program, spread over its bars and kept.
			FocusEvent = EventIndex;
			for (const TCHAR* Action : {TEXT("open"), TEXT("save"), TEXT("close")})
			{
				TSharedRef<FJsonObject> Step = MakeShared<FJsonObject>();
				Step->SetStringField(TEXT("action"), Action);
				TimelineOp(Step);
			}
		}
		Configure();
		StartRun();
		if (!bPrefsLoaded)
		{
			// A first launch wears Northlight, as the Godot game's new sessions do.
			const TArray<TSharedPtr<FJsonValue>>& Skins = CatalogList(TEXT("skins"));
			for (int32 I = 0; I < Skins.Num(); ++I)
			{
				if (Skins[I]->AsObject()->GetStringField(TEXT("id")) == TEXT("northlight")) CostumeIndex = I;
			}
		}
		WearCostume();
	}
	else if (Reply.Op == TEXT("start"))
	{
		Rink->ClearTraces();
		Rink->SetCourse(RunMode, Catalog);
		Present(FIceFrame::Parse(Reply.Data), true);
		bPlaying = true;
		TickDebt = 0.0;
		LastLandingTick = -1;
		StartMusic();
		Announce(TEXT("TAKE THE ICE"), RunPlace());
		UE_LOG(LogIceRun, Log, TEXT("Skating: mode %s, setup %s, scheme %d."), *RunMode, SetupId.IsEmpty() ? TEXT("(original schemes)") : *SetupId, Scheme);
		FString OpenPage;
		if (ShotTimes.Num() > 0 && FParse::Value(FCommandLine::Get(), TEXT("IceOpenMenu="), OpenPage))
		{
			// For a still of a menu page itself; the music page opens the first event's program on its music.
			if (OpenPage == TEXT("music"))
			{
				TSharedRef<FJsonObject> Open = MakeShared<FJsonObject>();
				Open->SetStringField(TEXT("action"), TEXT("open"));
				TimelineOp(Open);
			}
			OpenMenu(OpenPage);
		}
		else if (!bTitleShown && !bSmoke && ShotTimes.Num() == 0)
		{
			// The title screen, once, over the first run.
			OpenMenu(TEXT("home"));
		}
		bTitleShown = true;
		int32 Skips = 0;
		if (RunMode == TEXT("lesson") && FParse::Value(FCommandLine::Get(), TEXT("IceSkipSteps="), Skips))
		{
			// For looking at a later lesson step without skating the ones before it.
			for (int32 I = 0; I < Skips; ++I)
			{
				Bridge.Send(TEXT("skipStep"));
			}
		}
	}
	else if (Reply.Op == TEXT("frame"))
	{
		Present(FIceFrame::Parse(Reply.Data), false);
		SenseLanding();
		if (Latest.bFinished)
		{
			bPlaying = false;
			// The program is over: the music lets go.
			if (Music && Music->IsPlaying())
			{
				Music->FadeOut(3.f, 0.f);
			}
		}
	}
	else if (Reply.Op == TEXT("export"))
	{
		FString Path;
		Reply.Data->TryGetStringField(TEXT("path"), Path);
		NoticeText = FString::Printf(TEXT("Replay saved: %s"), *Path);
	}
	else if (Reply.Op == TEXT("replay"))
	{
		// The run again from its own inputs: the menu goes, the playback skates.
		Rink->ClearTraces();
		Present(FIceFrame::Parse(Reply.Data), true);
		bPlaying = true;
		FinishedFor = -1.0;
		LastLandingTick = -1;
		CloseMenu();
		StartMusic();
		Announce(TEXT("THE REPLAY"), RunPlace());
	}
	else if (Reply.Op == TEXT("dress"))
	{
		// The atelier's preview: the design as a skin, worn but not kept.
		const TSharedPtr<FJsonObject>* Skin = nullptr;
		if (Reply.Data->TryGetObjectField(TEXT("skin"), Skin))
		{
			Skater->ApplyCostume(*Skin);
		}
	}
	else if (Reply.Data.IsValid() && Reply.Data->HasField(TEXT("state")))
	{
		// train, drill, rest, plan, armFocus, design, configure, skipStep: the career and wardrobe as they now are.
		const FIceFrame Updated = FIceFrame::Parse(Reply.Data);
		if (Updated.bValid)
		{
			Latest = Updated;
		}
		if (Reply.Op == TEXT("design") && PendingWearSlot >= 0)
		{
			// Wear the design just kept: presets first, then the slots that hold one.
			int32 Index = CatalogList(TEXT("skins")).Num();
			const TSharedPtr<FJsonObject>* Wardrobe = nullptr;
			const TArray<TSharedPtr<FJsonValue>>* Skins = nullptr;
			if (Latest.Raw->TryGetObjectField(TEXT("wardrobe"), Wardrobe) && (*Wardrobe)->TryGetArrayField(TEXT("skins"), Skins))
			{
				for (int32 I = 0; I < PendingWearSlot && I < Skins->Num(); ++I)
				{
					Index += (*Skins)[I]->Type == EJson::Object ? 1 : 0;
				}
			}
			CostumeIndex = Index;
			PendingWearSlot = -1;
			WearCostume();
			SavePreferences();
		}
		if (bPaused)
		{
			PageNotice.Reset();
			RebuildPage();
		}
	}
}

void AIceRunGameMode::HandleMenus()
{
	AIceRunPlayerController* PC = Player();
	if (!PC)
	{
		return;
	}
	if (PC->GetViewTarget() != ShotCamera)
	{
		PC->SetViewTarget(ShotCamera);
		PC->SetInputMode(FInputModeGameOnly());
	}
	const FIceMenuPresses Presses = PC->TakeMenuPresses();
	if (Presses.bFullscreen && GEngine && GEngine->GetGameUserSettings())
	{
		UGameUserSettings* Settings = GEngine->GetGameUserSettings();
		Settings->SetFullscreenMode(Settings->GetFullscreenMode() == EWindowMode::Windowed ? EWindowMode::WindowedFullscreen : EWindowMode::Windowed);
		Settings->ApplyResolutionSettings(false);
	}
	if (Presses.bCycleCamera && Latest.bValid)
	{
		ShotCamera->Cycle(Latest.State);
	}
	// The Rink camera looks down from above the roof, through it.
	for (const TWeakObjectPtr<UPrimitiveComponent>& Part : Rink->Roof())
	{
		if (ShotCamera->Mode() == 2)
		{
			PC->HiddenPrimitiveComponents.AddUnique(Part);
		}
		else
		{
			PC->HiddenPrimitiveComponents.Remove(Part);
		}
	}
	if (!bOperational || bSmoke)
	{
		return;
	}
	if (bPaused)
	{
		if (Presses.bPause || Presses.bBack)
		{
			PopPage();
			return;
		}
		TArray<FMenuItem>& Items = MenuPage.Items;
		if (Items.Num() == 0)
		{
			return;
		}
		if (Presses.bUp)
		{
			MoveFocus(-1);
		}
		if (Presses.bDown)
		{
			MoveFocus(1);
		}
		if (!Items.IsValidIndex(MenuAt))
		{
			return;
		}
		if ((Presses.bLeft || Presses.bRight) && Items[MenuAt].Adjust && Items[MenuAt].bEnabled)
		{
			const TFunction<void(int32)> Adjust = Items[MenuAt].Adjust;
			Adjust(Presses.bLeft ? -1 : 1);
		}
		else if (Presses.bAccept && Items[MenuAt].Accept && Items[MenuAt].bEnabled)
		{
			// Copied first: an action may rebuild the page it came from.
			const TFunction<void()> Accept = Items[MenuAt].Accept;
			Accept();
		}
		return;
	}
	if (Presses.bPause)
	{
		OpenMenu();
		return;
	}
	if (Presses.bCycleSetup)
	{
		ChangeSetup(1);
	}
	else if (Presses.bCycleMode)
	{
		int32 At = 0;
		while (At < UE_ARRAY_COUNT(Modes) && RunMode != Modes[At]) ++At;
		RunMode = Modes[(At + 1) % UE_ARRAY_COUNT(Modes)];
		EventIndex = 0;
		Course = TEXT("trust");
		NoticeText = FString::Printf(TEXT("Mode: %s"), *RunMode);
		StartRun();
	}
	else if (Presses.bRestart)
	{
		StartRun();
	}
	if (Presses.bExport)
	{
		Bridge.Send(TEXT("export"));
	}
}

void AIceRunGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	TArray<FIceBridge::FReply> Replies;
	FString Error;
	const bool bHealthy = Bridge.Poll(Replies, Error);
	for (const FIceBridge::FReply& Reply : Replies)
	{
		OnReply(Reply);
	}
	if (bFaulted)
	{
		return;
	}
	if (!bHealthy)
	{
		Fail(Error);
		return;
	}
	if (Bridge.Busy() && Bridge.Waiting() > 10.0)
	{
		Fail(FString::Printf(TEXT("Ice Lab did not respond to %s. %s"), *Bridge.PendingOps(), *Bridge.ErrorText()));
		return;
	}
	HandleMenus();
	if (PreviewLeft > 0.0)
	{
		PreviewLeft -= DeltaSeconds;
		if (PreviewLeft <= 0.0 && Preview) Preview->FadeOut(.6f, 0.f);
	}
	AnnounceLeft = FMath::Max(0.0, AnnounceLeft - DeltaSeconds);
	if (IceSound && Latest.bValid)
	{
		// main.gd fill_audio's inputs: the blade's level by speed (quiet in the air, down, or under a menu), the slip's scrape.
		const FIceState& S = Latest.State;
		const bool bLive = bPlaying && !bPaused;
		const float Speed = float(S.Vel.Size());
		const float Level = bLive && S.JumpPhase != IceJumpPhase::Air && !S.bFallen ? FMath::Clamp(Speed / 12.f, 0.f, .55f) : 0.f;
		const float Scrape = FMath::Clamp(float(S.Blade[0].LatSlipAccel + S.Blade[1].LatSlipAccel), 0.f, 4.f) * .08f;
		IceSound->Set(Speed, Level, Scrape, bLive);
	}
	// The music waits with the run while a menu is up.
	const bool bHold = bPaused && RunLive();
	if (Music && bHold != bMusicPaused)
	{
		bMusicPaused = bHold;
		Music->SetPaused(bHold);
	}
	if (Latest.bValid && Latest.bFinished && !bPaused && !bSmoke && ShotTimes.Num() == 0)
	{
		// The result stays on the ice a moment, then the menu offers what is next.
		FinishedFor = FinishedFor < 0.0 ? 0.0 : FinishedFor + DeltaSeconds;
		if (FinishedFor > 2.5)
		{
			OpenMenu(TEXT("result"));
		}
	}
	if (!bPlaying || !bOperational || bPaused)
	{
		TickDebt = 0.0;
	}
	else
	{
		// main.gd _physics_process: 120 Hz owed, at most 12 at once, one request in flight.
		TickDebt = FMath::Min(12.0, TickDebt + DeltaSeconds * 120.0);
		const int32 Ticks = FMath::Min(12, FMath::FloorToInt32(TickDebt));
		AIceRunPlayerController* PC = Player();
		if (!Bridge.Busy() && Ticks >= 1 && PC)
		{
			TickDebt -= Ticks;
			TSharedRef<FJsonObject> Controls = PC->Controls(DeltaSeconds, Scheme);
			bool bLow = Scheme != 3 && PC->LowHeld();
			if ((bSmoke || bMenuTest) && Latest.bValid)
			{
				// main.gd's boot test: carve for the edge element, crouch for the pose.
				double Index = 0;
				const TSharedPtr<FJsonObject>* Routine = nullptr;
				if (Latest.Raw->TryGetObjectField(TEXT("routine"), Routine))
				{
					(*Routine)->TryGetNumberField(TEXT("index"), Index);
				}
				Controls->SetNumberField(TEXT("kx"), Index == 1 ? -1.0 : 0.0);
				bLow = Index == 2;
			}
			if (bAuto && Latest.bValid)
			{
				// Three seconds on each side, for watching a build with nobody at the pad.
				const bool bLeft = FMath::Fmod(Latest.Elapsed, 6.0) < 3.0;
				if (Scheme == 3)
				{
					TArray<TSharedPtr<FJsonValue>> Keys = {MakeShared<FJsonValueString>(bLeft ? TEXT("a") : TEXT("d"))};
					Controls->GetObjectField(TEXT("hardware"))->SetArrayField(TEXT("keys"), Keys);
				}
				else
				{
					Controls->SetNumberField(TEXT("kx"), bLeft ? -1.0 : 1.0);
				}
			}
			TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
			Payload->SetObjectField(TEXT("controls"), Controls);
			Payload->SetNumberField(TEXT("ticks"), Ticks);
			Payload->SetBoolField(TEXT("low"), bLow);
			Bridge.Send(TEXT("frame"), Payload);
		}
	}
	if (bSmoke)
	{
		SmokeStep(DeltaSeconds);
	}
	if (bMenuTest)
	{
		MenuTestStep(DeltaSeconds);
	}
	if (ShotTimes.Num() > 0)
	{
		ShotStep(DeltaSeconds);
	}
}

void AIceRunGameMode::ShotStep(float Dt)
{
	// Stills on a clock that starts with the run, for looking at a build without a person at it.
	if (!bPlaying && !bPaused && ShotsTaken == 0)
	{
		return;
	}
	ShotClock += Dt;
	if (ShotsTaken < ShotTimes.Num() && ShotClock >= ShotTimes[ShotsTaken])
	{
		const FString Path = FPaths::Combine(ShotDir, FString::Printf(TEXT("ice-run-unreal-%02d.png"), ShotsTaken));
		FScreenshotRequest::RequestScreenshot(Path, true, false);
		UE_LOG(LogIceRun, Display, TEXT("ICE_SHOT %s at %.2f s (sim %.2f s)"), *Path, ShotClock, Latest.Elapsed);
		++ShotsTaken;
	}
	else if (ShotsTaken == ShotTimes.Num() && ShotClock >= ShotTimes.Last() + 1.0)
	{
		ShotTimes.Reset();
		FPlatformMisc::RequestExit(false);
	}
}

void AIceRunGameMode::SmokeStep(float Dt)
{
	SmokeSeconds += Dt;
	if (!Latest.bValid || SmokeStage != 0)
	{
		return;
	}
	double Index = -1;
	const TSharedPtr<FJsonObject>* Routine = nullptr;
	if (Latest.Raw->TryGetObjectField(TEXT("routine"), Routine))
	{
		(*Routine)->TryGetNumberField(TEXT("index"), Index);
	}
	if (Latest.bFinished)
	{
		SmokeStage = 1;
		if (Index == 3)
		{
			UE_LOG(LogIceRun, Display, TEXT("UNREAL_SMOKE_PASS: live Ice Lab completed the three-element career routine; traces=%d model=%s elapsed=%.1f"),
				Rink->TraceCount(), Skater->HasModel() ? TEXT("yes") : TEXT("stand-in"), Latest.Elapsed);
			FPlatformMisc::RequestExitWithStatus(false, 0);
		}
		else
		{
			Fail(FString::Printf(TEXT("Career smoke test did not finish the routine (element %d of 3)."), int32(Index) + 1));
		}
	}
	else if (Latest.Elapsed > SmokeLimit)
	{
		SmokeStage = 1;
		Fail(FString::Printf(TEXT("Career smoke test ran past %.0f s at element %d."), SmokeLimit, int32(Index) + 1));
	}
}

const AIceRunGameMode::FMenuItem* AIceRunGameMode::FindItem(const FString& Prefix) const
{
	for (const FMenuItem& Item : MenuPage.Items)
	{
		if (!Item.bHeader && Item.Label.StartsWith(Prefix))
		{
			return &Item;
		}
	}
	return nullptr;
}

bool AIceRunGameMode::AcceptItem(const FString& Prefix)
{
	const FMenuItem* Item = FindItem(Prefix);
	if (!Item || !Item->bEnabled || !Item->Accept)
	{
		return false;
	}
	MenuAt = int32(Item - MenuPage.Items.GetData());
	const TFunction<void()> Accept = Item->Accept;
	Accept();
	return true;
}

bool AIceRunGameMode::AdjustItem(const FString& Prefix, int32 By)
{
	const FMenuItem* Item = FindItem(Prefix);
	if (!Item || !Item->Adjust)
	{
		return false;
	}
	MenuAt = int32(Item - MenuPage.Items.GetData());
	const TFunction<void(int32)> Adjust = Item->Adjust;
	Adjust(By);
	return true;
}

void AIceRunGameMode::MenuTestStep(float Dt)
{
	MenuTestClock += Dt;
	auto Pass = [this]
	{
		UE_LOG(LogIceRun, Display, TEXT("UNREAL_MENUS_PASS: season, event plan, the program laid on its music, a career run to its result and story, training, wardrobe, atelier and Composer, through the live bridge"));
		FPlatformMisc::RequestExitWithStatus(false, 0);
		MenuTestStage = 99;
	};
	auto Stop = [this](const TCHAR* Why)
	{
		UE_LOG(LogIceRun, Error, TEXT("UNREAL_MENUS_FAIL at stage %d (%s): %s"), MenuTestStage, *MenuPage.Id, Why);
		FPlatformMisc::RequestExitWithStatus(false, 1);
		MenuTestStage = 99;
	};
	if (MenuTestStage >= 99 || Bridge.Busy())
	{
		return;
	}
	if (MenuTestClock > 400.0)
	{
		Stop(TEXT("ran out of time"));
		return;
	}
	const TSharedPtr<FJsonObject> Career = Latest.Raw.IsValid() ? Latest.Raw->GetObjectField(TEXT("career")) : nullptr;
	auto PlanLength = [&Career]
	{
		const TArray<TSharedPtr<FJsonValue>>* Plans = nullptr;
		return Career.IsValid() && Career->TryGetArrayField(TEXT("plans"), Plans) && Plans->IsValidIndex(0) && (*Plans)[0]->Type == EJson::Array ? (*Plans)[0]->AsArray().Num() : -1;
	};
	switch (MenuTestStage)
	{
	case 0:
		if (bPaused && MenuPage.Id == TEXT("home") && Catalog.IsValid())
		{
			MenuTestStage = AcceptItem(TEXT("The Season")) ? 1 : (Stop(TEXT("no Season on the title")), 99);
		}
		break;
	case 1:
		if (MenuPage.Id != TEXT("season")) { Stop(TEXT("the Season did not open")); break; }
		if (MenuPage.Story.IsEmpty()) { Stop(TEXT("the Season has no story")); break; }
		MenuTestStage = AcceptItem(TEXT("01")) ? 2 : (Stop(TEXT("no first event")), 99);
		break;
	case 2:
		if (MenuPage.Id != TEXT("event")) { Stop(TEXT("the briefing did not open")); break; }
		AdjustItem(TEXT("+ Add"), 3);
		MenuTestStage = AcceptItem(TEXT("+ Add")) ? 3 : (Stop(TEXT("no + Add")), 99);
		break;
	case 3:
		if (PlanLength() != 4) { Stop(TEXT("the plan did not take the added element")); break; }
		MenuTestStage = AcceptItem(TEXT("Use the event's own program")) ? 4 : (Stop(TEXT("no way back to the event's program")), 99);
		break;
	case 4:
		if (PlanLength() != -1) { Stop(TEXT("the plan did not go back")); break; }
		MenuTestStage = AcceptItem(TEXT("♪  Lay it on the music")) ? 20 : (Stop(TEXT("no way onto the music")), 99);
		break;
	case 20:
	{
		// The program on its music: the first element a bar later, then saved.
		const TSharedPtr<FJsonObject>* Draft = nullptr;
		if (MenuPage.Id != TEXT("music") || !Latest.Raw->TryGetObjectField(TEXT("draft"), Draft) || (*Draft)->GetArrayField(TEXT("cues")).Num() == 0) { Stop(TEXT("the music page did not open on a draft")); break; }
		if (MenuPage.Strip.Bars <= 0 || MenuPage.Strip.Cues.Num() == 0) { Stop(TEXT("the music page has no strip")); break; }
		MenuTestValue = (*Draft)->GetArrayField(TEXT("cues"))[0]->AsObject()->GetNumberField(TEXT("bar"));
		MenuTestStage = AdjustItem(TEXT("Bar "), 1) ? 21 : (Stop(TEXT("no cue to move")), 99);
		break;
	}
	case 21:
	{
		const TSharedPtr<FJsonObject>* Draft = nullptr;
		if (!Latest.Raw->TryGetObjectField(TEXT("draft"), Draft) || (*Draft)->GetArrayField(TEXT("cues"))[0]->AsObject()->GetNumberField(TEXT("bar")) != MenuTestValue + 1) { Stop(TEXT("the first element did not move a bar later")); break; }
		MenuTestStage = AcceptItem(TEXT("Save this program")) ? 22 : (Stop(TEXT("could not save the program on its music")), 99);
		break;
	}
	case 22:
	{
		const TArray<TSharedPtr<FJsonValue>>* Timelines = nullptr;
		if (!Career->TryGetArrayField(TEXT("timelines"), Timelines) || !Timelines->IsValidIndex(0) || (*Timelines)[0]->Type != EJson::Object) { Stop(TEXT("the career did not keep the timeline")); break; }
		PopPage();
		if (MenuPage.Id != TEXT("event") || !FindItem(TEXT("♪  Edit it on the music"))) { Stop(TEXT("the briefing does not say the program is on its music")); break; }
		MenuTestStage = AcceptItem(TEXT("Skate this program")) ? 5 : (Stop(TEXT("could not skate the event")), 99);
		break;
	}
	case 5:
		// The run, skated by the pad script, then its result after a moment on the ice.
		if (!bPaused && Latest.Raw.IsValid())
		{
			const TSharedPtr<FJsonObject>* Routine = nullptr;
			const TArray<TSharedPtr<FJsonValue>>* Cues = nullptr;
			bMenuTestSawCues |= Latest.Raw->TryGetObjectField(TEXT("routine"), Routine) && (*Routine)->TryGetArrayField(TEXT("cues"), Cues) && Cues->Num() > 0;
		}
		if (bPaused && MenuPage.Id == TEXT("result"))
		{
			const TSharedPtr<FJsonObject>* Result = nullptr;
			FString Detail;
			if (Latest.Raw->TryGetObjectField(TEXT("result"), Result)) (*Result)->TryGetStringField(TEXT("detail"), Detail);
			UE_LOG(LogIceRun, Display, TEXT("Menu walk: the career run ended at %.1f s of skating, %s"), Latest.Elapsed, *Detail);
			if (!bMenuTestSawCues) { Stop(TEXT("the run did not carry its music cues")); break; }
			if (MenuPage.Story.IsEmpty()) { Stop(TEXT("the result has no chapter ending")); break; }
			MenuTestStage = AcceptItem(TEXT("Back to the Season")) ? 6 : (Stop(TEXT("no way back to the Season")), 99);
		}
		break;
	case 6:
		if (MenuPage.Id != TEXT("season")) { Stop(TEXT("back to the Season failed")); break; }
		MenuTestStage = AcceptItem(TEXT("Training")) ? 7 : (Stop(TEXT("no Training")), 99);
		break;
	case 7:
		if (MenuPage.Id != TEXT("training")) { Stop(TEXT("Training did not open")); break; }
		MenuTestValue = Career->GetObjectField(TEXT("stats"))->GetNumberField(TEXT("edgeControl"));
		MenuTestStage = AcceptItem(TEXT("Edge control")) ? 8 : (Stop(TEXT("Edge control could not be trained after a medal")), 99);
		break;
	case 8:
		if (Career->GetObjectField(TEXT("stats"))->GetNumberField(TEXT("edgeControl")) != MenuTestValue + 1) { Stop(TEXT("the stat did not rise")); break; }
		PopPage();
		PopPage();
		MenuTestStage = AcceptItem(TEXT("Wardrobe")) ? 9 : (Stop(TEXT("no Wardrobe")), 99);
		break;
	case 9:
	{
		if (MenuPage.Id != TEXT("wardrobe")) { Stop(TEXT("the Wardrobe did not open")); break; }
		const int32 Before = CostumeIndex;
		AdjustItem(TEXT("Costume"), 1);
		if (CostumeIndex == Before) { Stop(TEXT("the costume did not change")); break; }
		MenuTestStage = AcceptItem(TEXT("Slot 1")) ? 10 : (Stop(TEXT("no atelier slot")), 99);
		break;
	}
	case 10:
		if (MenuPage.Id != TEXT("design")) { Stop(TEXT("the atelier did not open")); break; }
		AdjustItem(TEXT("Bodice"), 1);
		MenuTestStage = 11;
		break;
	case 11:
		MenuTestStage = AcceptItem(TEXT("Keep it")) ? 12 : (Stop(TEXT("could not keep the design")), 99);
		break;
	case 12:
	{
		const TArray<TSharedPtr<FJsonValue>>& Skins = Latest.Raw->GetObjectField(TEXT("wardrobe"))->GetArrayField(TEXT("skins"));
		if (Skins.Num() == 0 || Skins[0]->Type != EJson::Object) { Stop(TEXT("the design was not kept")); break; }
		if (CostumeIndex != CatalogList(TEXT("skins")).Num()) { Stop(TEXT("the kept design is not worn")); break; }
		PopPage();
		MenuTestStage = AcceptItem(TEXT("The Composer")) ? 13 : (Stop(TEXT("no Composer")), 99);
		break;
	}
	case 13:
	{
		if (MenuPage.Id != TEXT("composer")) { Stop(TEXT("the Composer did not open")); break; }
		const int32 Before = Sequence.Num();
		AcceptItem(TEXT("+ Add"));
		if (Sequence.Num() != Before + 1) { Stop(TEXT("the Composer did not add a phrase")); break; }
		Pass();
		break;
	}
	default:
		break;
	}
}

void AIceRunGameMode::StartMusic()
{
	if (!Music)
	{
		return;
	}
	Music->Stop();
	bMusicPaused = false;
	if (!bMusicOn || !Latest.Raw.IsValid())
	{
		return;
	}
	double Track = TrackIndex;
	Latest.Raw->TryGetNumberField(TEXT("track"), Track);
	const TArray<TSharedPtr<FJsonValue>>& Tracks = CatalogList(TEXT("tracks"));
	if (!Tracks.IsValidIndex(int32(Track)))
	{
		return;
	}
	const FString Id = Tracks[int32(Track)]->AsObject()->GetStringField(TEXT("id"));
	USoundBase* Sound = TrackSound(int32(Track));
	if (!Sound)
	{
		return;
	}
	Music->SetSound(Sound);
	Music->Play(0.f);
	UE_LOG(LogIceRun, Log, TEXT("Music: %s from its start."), *Id);
}

void AIceRunGameMode::Announce(const FString& Title, const FString& Detail)
{
	// main.gd broadcast.announce: three and a half seconds on the broadcast plate.
	AnnounceTitle = Title;
	AnnounceDetail = Detail;
	AnnounceLeft = 3.5;
}

FString AIceRunGameMode::RunPlace() const
{
	if (RunMode == TEXT("career"))
	{
		const TArray<TSharedPtr<FJsonValue>>& Events = CatalogList(TEXT("events"));
		if (Events.IsValidIndex(EventIndex) && Events[EventIndex]->Type == EJson::Object)
		{
			const TSharedPtr<FJsonObject> E = Events[EventIndex]->AsObject();
			return FString::Printf(TEXT("%s   /   %s"), *E->GetStringField(TEXT("venue")), *E->GetStringField(TEXT("title")));
		}
	}
	if (RunMode == TEXT("lesson")) return TEXT("Lessons");
	if (RunMode == TEXT("rookie")) return TEXT("Rookie gates");
	if (RunMode == TEXT("timed")) return TEXT("The light course");
	if (RunMode == TEXT("composer")) return TEXT("Your own program");
	if (RunMode == TEXT("armdrill")) return TEXT("The arm drill");
	return TEXT("Free skate");
}

void AIceRunGameMode::SenseLanding()
{
	// main.gd: a landing the engine has not reported before (its tick), clean or not.
	const TSharedPtr<FJsonObject>* State = nullptr;
	const TSharedPtr<FJsonObject>* Landed = nullptr;
	if (!Latest.bValid || !Latest.Raw->TryGetObjectField(TEXT("state"), State) || !(*State)->TryGetObjectField(TEXT("landed"), Landed))
	{
		return;
	}
	double Tick = -1.0;
	(*Landed)->TryGetNumberField(TEXT("tick"), Tick);
	if (int32(Tick) <= LastLandingTick || Tick < 0.0)
	{
		return;
	}
	LastLandingTick = int32(Tick);
	bool bFall = false, bStepOut = false;
	(*Landed)->TryGetBoolField(TEXT("fall"), bFall);
	(*Landed)->TryGetBoolField(TEXT("stepOut"), bStepOut);
	const bool bClean = !bFall && !bStepOut;
	double Turned = 0.0;
	(*Landed)->TryGetNumberField(TEXT("turned"), Turned);
	if (IceSound)
	{
		IceSound->Land(bClean);
	}
	Announce(bClean ? TEXT("CLEAN LANDING") : TEXT("FIND YOUR EDGE"), FString::Printf(TEXT("%.2f rotations   /   Jump TES %.2f"), Turned, Latest.Technical));
	AIceRunPlayerController* PC = Player();
	if (bRumbleOn && PC)
	{
		// main.gd's vibration: the strong (large, low) motor and the weak (small, high) one, longer and harder for a fall.
		const float For = bClean ? .16f : .28f;
		PC->PlayDynamicForceFeedback(bClean ? .30f : .7f, For, true, false, true, false);
		PC->PlayDynamicForceFeedback(bClean ? .18f : .48f, For, false, true, false, true);
	}
}

USoundBase* AIceRunGameMode::TrackSound(int32 Track) const
{
	const TArray<TSharedPtr<FJsonValue>>& Tracks = CatalogList(TEXT("tracks"));
	if (!Tracks.IsValidIndex(Track))
	{
		return nullptr;
	}
	const FString Id = Tracks[Track]->AsObject()->GetStringField(TEXT("id"));
	// tools/build_content.py records where each track went.
	FString Manifest, Path;
	TSharedPtr<FJsonObject> Paths;
	if (FFileHelper::LoadFileToString(Manifest, *FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Generated/music.json"))) && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Manifest), Paths) && Paths.IsValid())
	{
		Paths->TryGetStringField(Id, Path);
	}
	return Path.IsEmpty() ? nullptr : LoadObject<USoundBase>(nullptr, *Path, nullptr, LOAD_NoWarn | LOAD_Quiet);
}

void AIceRunGameMode::PreviewMusic(int32 Track, double At)
{
	// Asked for by name, so it plays with the run's music off too (main.gd preview_music).
	USoundBase* Sound = Preview ? TrackSound(Track) : nullptr;
	if (!Sound)
	{
		return;
	}
	const double From = FMath::Max(0.0, At - .5);
	Preview->Stop();
	Preview->SetSound(Sound);
	Preview->Play(float(From));
	PreviewLeft = 8.0;
	UE_LOG(LogIceRun, Log, TEXT("Music: preview from %.1f s."), From);
}
