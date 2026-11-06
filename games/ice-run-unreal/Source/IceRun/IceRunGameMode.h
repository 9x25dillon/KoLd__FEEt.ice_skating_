#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "IceBridge.h"
#include "IceFrame.h"
#include "IceRunGameMode.generated.h"

class AIceSkater;
class AIceRink;
class AIceShotCamera;
class AIceRunPlayerController;

/**
 * One skating session against the Ice Lab engine: starts the bridge, builds
 * the rink from its catalog, and each frame sends the player's controls for
 * the 120 Hz ticks owed (at most 12, one request in flight) as main.gd's
 * _physics_process does. The renderer never writes physics.
 *
 * Command line: -IceSetup=simulation|explorer|experimental|diggate|repertoire
 * (or none for the original schemes), -IceMode=free|career|rookie|timed,
 * -IceEvent=N, -IceSteady=off|light|firm, -IceSkater=Athlete|Competition|Berserker|Violet (or -IceModel=/Game/...),
 * -IceSmoke (the headless check), -IceCamera=N, and for stills -IceShots=2,5.5,9 -IceShotDir=<dir>
 * (the game quits after the last one); -IceAuto carves left and right on a clock instead of the pad.
 */
UCLASS()
class AIceRunGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AIceRunGameMode();
	virtual void StartPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

	/** One line of the pause menu: Accept on A / Enter, Adjust on left / right. */
	struct FMenuItem
	{
		FString Label;
		FString Detail;
		TFunction<void()> Accept;
		TFunction<void(int32)> Adjust;
	};

	bool Paused() const { return bPaused; }
	const TArray<FMenuItem>& MenuItems() const { return Menu; }
	int32 MenuIndex() const { return MenuAt; }

	const FIceFrame& Frame() const { return Latest; }
	const FString& Notice() const { return NoticeText; }
	const FString& Setup() const { return SetupId; }
	bool Operational() const { return bOperational; }
	bool Faulted() const { return bFaulted; }
	int32 CameraMode() const;
	FString CameraName() const;

private:
	void Configure();
	void StartRun();
	void OnReply(const FIceBridge::FReply& Reply);
	void Fail(const FString& Message);
	void Present(const FIceFrame& Frame, bool bSnap);
	void HandleMenus();
	void OpenMenu();
	void CloseMenu();
	void BuildMenu();
	/** A lesson needs its setup in force first: the course and its words are that pad's (main.gd start_lesson). */
	void StartLesson(const FString& Course, const FString& NeededSetup);
	void StartMode(const FString& Mode, int32 Event = 0);
	void ChangeSetup(int32 By);
	FString SetupName(const FString& Id) const;
	void SmokeStep(float Dt);
	void ShotStep(float Dt);
	AIceRunPlayerController* Player() const;

	FIceBridge Bridge;
	TSharedPtr<FJsonObject> Catalog;
	FIceFrame Latest;
	double TickDebt = 0.0;
	bool bOperational = false;
	bool bFaulted = false;
	bool bPlaying = false;
	bool bSnapNext = true;
	FString NoticeText;

	FString SetupId = TEXT("explorer");
	double Assistance = .75;
	int32 Scheme = 3;
	bool bBeginner = false;
	bool bCruise = false;
	FString RunMode = TEXT("free");
	int32 EventIndex = 0;
	/** A lesson's course: "trust" (game/tutorial.ts) or a setup's own (game/padcourse.ts). */
	FString Course = TEXT("trust");
	/** The steadying hand (game/steady.ts): empty follows the setup's default, else off / light / firm. */
	FString SteadyChoice;

	bool bPaused = false;
	TArray<FMenuItem> Menu;
	int32 MenuAt = 0;
	/** Seconds since the run finished, or -1: the menu opens once the result has been seen. */
	double FinishedFor = -1.0;
	/** Content/Generated/skaters.json's name for the model, or an object path with -IceModel=. */
	FString SkaterName = TEXT("Athlete");
	FString ModelPath;

	TArray<double> ShotTimes;
	FString ShotDir;
	double ShotClock = 0.0;
	int32 ShotsTaken = 0;
	int32 StartCamera = 0;

	bool bAuto = false;
	bool bSmoke = false;
	double SmokeSeconds = 0.0;
	int32 SmokeStage = 0;

	UPROPERTY()
	TObjectPtr<AIceSkater> Skater;

	UPROPERTY()
	TObjectPtr<AIceRink> Rink;

	UPROPERTY()
	TObjectPtr<AIceShotCamera> ShotCamera;
};
