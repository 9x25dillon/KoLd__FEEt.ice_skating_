#include "IceRunGameMode.h"
#include "IceRun.h"
#include "IceSkater.h"
#include "IceRink.h"
#include "IceShotCamera.h"
#include "IceRunHUD.h"
#include "IceRunPlayerController.h"
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

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Rink = GetWorld()->SpawnActor<AIceRink>(Params);
	Skater = GetWorld()->SpawnActor<AIceSkater>(Params);
	ShotCamera = GetWorld()->SpawnActor<AIceShotCamera>(Params);
	ShotCamera->Watch(Skater);
	for (int32 I = 0; I < StartCamera % 4; ++I)
	{
		ShotCamera->Cycle(FIceState());
	}
	Skater->LoadModel(ModelPath);

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
	if (bSmoke)
	{
		// Smoke runs never touch the player's career.
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

void AIceRunGameMode::OpenMenu()
{
	bPaused = true;
	TickDebt = 0.0;
	BuildMenu();
	MenuAt = 0;
}

void AIceRunGameMode::CloseMenu()
{
	bPaused = false;
	TickDebt = 0.0;
	if (AIceRunPlayerController* PC = Player())
	{
		PC->ClearPending();
	}
}

void AIceRunGameMode::BuildMenu()
{
	Menu.Reset();
	const bool bRunning = Latest.bValid && !Latest.bFinished;
	if (bRunning)
	{
		Menu.Add({TEXT("Continue skating"), FString(), [this] { CloseMenu(); }, nullptr});
	}
	else
	{
		Menu.Add({TEXT("Skate it again"), FString(), [this] { StartRun(); CloseMenu(); }, nullptr});
	}
	const TSharedPtr<FJsonObject>* Tutorial = nullptr;
	if (bRunning && Latest.Raw.IsValid() && Latest.Raw->TryGetObjectField(TEXT("tutorial"), Tutorial))
	{
		Menu.Add({TEXT("Skip this step"), TEXT("Earns no XP; the next step starts at once."), [this] { Bridge.Send(TEXT("skipStep")); CloseMenu(); }, nullptr});
	}
	double TrustSteps = 0;
	if (Catalog.IsValid())
	{
		Catalog->TryGetNumberField(TEXT("trustSteps"), TrustSteps);
	}
	Menu.Add({FString::Printf(TEXT("Trust the ice   ·   tutorial, %d steps"), int32(TrustSteps)),
		TEXT("Skating itself, in your setup's words: stand still on something that moves, then edges, getting where you mean to go, stops, and only then the air."),
		[this] { StartLesson(TEXT("trust"), FString()); }, nullptr});
	const TArray<TSharedPtr<FJsonValue>>* Courses = nullptr;
	if (Catalog.IsValid() && Catalog->TryGetArrayField(TEXT("courses"), Courses))
	{
		for (const TSharedPtr<FJsonValue>& V : *Courses)
		{
			const TSharedPtr<FJsonObject> C = V->AsObject();
			const FString Id = C->GetStringField(TEXT("id"));
			if (Id == TEXT("paddles"))
			{
				continue;
			}
			TArray<FString> Fits;
			C->TryGetStringArrayField(TEXT("setups"), Fits);
			const bool bMine = Fits.Contains(SetupId);
			const FString Needed = bMine || Fits.Num() == 0 ? FString() : Fits[0];
			FString Detail = C->GetStringField(TEXT("blurb"));
			if (!Needed.IsEmpty())
			{
				Detail += FString::Printf(TEXT(" Starts on %s."), *SetupName(Needed));
			}
			Menu.Add({FString::Printf(TEXT("%s%s   ·   lesson"), bMine ? TEXT("● ") : TEXT(""), *C->GetStringField(TEXT("title"))), Detail,
				[this, Id, Needed] { StartLesson(Id, Needed); }, nullptr});
		}
	}
	Menu.Add({TEXT("Free skate"), TEXT("Quiet ice: skate as you like; the practice list follows along."), [this] { StartMode(TEXT("free")); }, nullptr});
	int32 Unlocked = 0;
	FString EventTitle = TEXT("First ice");
	const TSharedPtr<FJsonObject>* Career = nullptr;
	if (Latest.Raw.IsValid() && Latest.Raw->TryGetObjectField(TEXT("career"), Career))
	{
		Unlocked = int32((*Career)->GetNumberField(TEXT("unlocked")));
	}
	const TArray<TSharedPtr<FJsonValue>>* Events = nullptr;
	if (Catalog.IsValid() && Catalog->TryGetArrayField(TEXT("events"), Events) && Events->IsValidIndex(Unlocked))
	{
		EventTitle = (*Events)[Unlocked]->AsObject()->GetStringField(TEXT("title"));
	}
	Menu.Add({FString::Printf(TEXT("Career   ·   %s"), *EventTitle), TEXT("The next event of your season."), [this, Unlocked] { StartMode(TEXT("career"), Unlocked); }, nullptr});
	Menu.Add({TEXT("Rookie gates"), TEXT("Follow the curved lane through eight gates; jump the two foam bars."), [this] { StartMode(TEXT("rookie")); }, nullptr});
	Menu.Add({TEXT("Light course   ·   90 s"), TEXT("Carve from light to light against the clock."), [this] { StartMode(TEXT("timed")); }, nullptr});
	FString SetupDetail;
	const TArray<TSharedPtr<FJsonValue>>* SetupList = nullptr;
	if (Catalog.IsValid() && Catalog->TryGetArrayField(TEXT("setups"), SetupList))
	{
		for (const TSharedPtr<FJsonValue>& V : *SetupList)
		{
			if (V->AsObject()->GetStringField(TEXT("id")) == SetupId)
			{
				SetupDetail = V->AsObject()->GetStringField(TEXT("description"));
			}
		}
	}
	if (SetupId.IsEmpty())
	{
		SetupDetail = TEXT("The original schemes with the coach: Cruise pushes for you, and a landing assist checks your rotation.");
	}
	Menu.Add({FString::Printf(TEXT("Setup   ◀  %s  ▶"), *SetupName(SetupId)), SetupDetail,
		[this] { ChangeSetup(1); BuildMenu(); },
		[this](int32 By) { ChangeSetup(By); BuildMenu(); }});
	{
		// game/steady.ts: off by default where the setup promises minimal assistance, light elsewhere.
		FString Level, Name;
		const TSharedPtr<FJsonObject>* Steady = nullptr;
		if (Latest.Raw.IsValid() && Latest.Raw->TryGetObjectField(TEXT("steady"), Steady))
		{
			(*Steady)->TryGetStringField(TEXT("name"), Name);
		}
		Level = SteadyChoice.IsEmpty() ? FString::Printf(TEXT("%s (setup default)"), *Name) : Name;
		auto Step = [this](int32 By)
		{
			static const TCHAR* const Choices[] = {TEXT(""), TEXT("off"), TEXT("light"), TEXT("firm")};
			int32 At = 0;
			while (At < 4 && SteadyChoice != Choices[At]) ++At;
			SteadyChoice = Choices[((At + By) % 4 + 4) % 4];
			Configure();
		};
		Menu.Add({FString::Printf(TEXT("Steadying hand   ◀  %s  ▶"), *Level),
			TEXT("A hand on your stick, never the physics: it keeps the lean you ask for to what your speed can carry. Off where a setup promises minimal assistance; Light elsewhere; Firm holds you to the safe lean."),
			[this, Step] { Step(1); BuildMenu(); },
			[this, Step](int32 By) { Step(By); BuildMenu(); }});
	}
	Menu.Add({FString::Printf(TEXT("Camera   ◀  %s  ▶"), *CameraName()), TEXT("View / V changes it while skating, except in the air."),
		[this] { if (Latest.bValid) ShotCamera->Cycle(Latest.State); BuildMenu(); },
		[this](int32) { if (Latest.bValid) ShotCamera->Cycle(Latest.State); BuildMenu(); }});
	Menu.Add({TEXT("Quit"), TEXT("The career is saved as you skate."), [this] {
		if (AIceRunPlayerController* PC = Player())
		{
			UKismetSystemLibrary::QuitGame(this, PC, EQuitPreference::Quit, false);
		}
	}, nullptr});
	MenuAt = FMath::Clamp(MenuAt, 0, Menu.Num() - 1);
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
		Configure();
		StartRun();
	}
	else if (Reply.Op == TEXT("start"))
	{
		Rink->ClearTraces();
		Rink->SetCourse(RunMode, Catalog);
		Present(FIceFrame::Parse(Reply.Data), true);
		bPlaying = true;
		TickDebt = 0.0;
		UE_LOG(LogIceRun, Log, TEXT("Skating: mode %s, setup %s, scheme %d."), *RunMode, SetupId.IsEmpty() ? TEXT("(original schemes)") : *SetupId, Scheme);
		if (ShotTimes.Num() > 0 && FParse::Param(FCommandLine::Get(), TEXT("IceOpenMenu")))
		{
			// For a still of the menu itself.
			OpenMenu();
		}
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
		if (Latest.bFinished)
		{
			bPlaying = false;
		}
	}
	else if (Reply.Op == TEXT("export"))
	{
		FString Path;
		Reply.Data->TryGetStringField(TEXT("path"), Path);
		NoticeText = FString::Printf(TEXT("Replay saved: %s"), *Path);
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
			CloseMenu();
			return;
		}
		if (Menu.Num() == 0)
		{
			return;
		}
		if (Presses.bUp)
		{
			MenuAt = (MenuAt + Menu.Num() - 1) % Menu.Num();
		}
		if (Presses.bDown)
		{
			MenuAt = (MenuAt + 1) % Menu.Num();
		}
		if ((Presses.bLeft || Presses.bRight) && Menu[MenuAt].Adjust)
		{
			const TFunction<void(int32)> Adjust = Menu[MenuAt].Adjust;
			Adjust(Presses.bLeft ? -1 : 1);
		}
		else if (Presses.bAccept && Menu[MenuAt].Accept)
		{
			// Copied first: an action may rebuild the menu it came from.
			const TFunction<void()> Accept = Menu[MenuAt].Accept;
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
	if (Latest.bValid && Latest.bFinished && !bPaused && !bSmoke && ShotTimes.Num() == 0)
	{
		// The result stays on the ice a moment, then the menu offers what is next.
		FinishedFor = FinishedFor < 0.0 ? 0.0 : FinishedFor + DeltaSeconds;
		if (FinishedFor > 2.5)
		{
			OpenMenu();
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
			if (bSmoke && Latest.bValid)
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
