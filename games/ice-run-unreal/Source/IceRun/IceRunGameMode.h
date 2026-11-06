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
class USoundBase;
class UIceSound;

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
 * (the game quits after the last one); -IceAuto carves left and right on a clock instead of the pad;
 * -IceMenuTest walks the menus headless (UNREAL_MENUS_PASS); -IceOpenMenu=<page> for a still of a page.
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

	/** One line of a menu page: Accept on A / Enter, Adjust on left / right. */
	struct FMenuItem
	{
		FString Label;
		/** Right-aligned: a medal, a cost, a setting's value. */
		FString Value;
		/** The side panel's words while it has focus. */
		FString Detail;
		TFunction<void()> Accept;
		TFunction<void(int32)> Adjust;
		bool bEnabled = true;
		/** A section title: drawn, never focused. */
		bool bHeader = false;
		/** A colour swatch before the label, when it has any alpha. */
		FLinearColor Chip = FLinearColor(0, 0, 0, 0);
	};
	/** A table line: standings, a protocol. */
	struct FMenuRow
	{
		FString Left;
		FString Middle;
		FString Right;
		bool bYou = false;
	};
	/** A program on its music, drawn as bars (main.gd timeline_strip): gold bars are your own elements. */
	struct FMenuStrip
	{
		struct FCue
		{
			double At = 0.0;
			FString Title;
			bool bRequired = true;
		};
		double Seconds = 0.0;
		double Offset = 0.0;
		double BarSeconds = 0.0;
		int32 Bars = 0;
		int32 BarsPerPhrase = 8;
		/** The check passes: the event's elements green, else red. */
		bool bOk = true;
		/** The list line of the first cue, so the focused cue is marked on the strip. */
		int32 FirstCueItem = -1;
		TArray<FCue> Cues;
	};
	/** A whole menu page, rebuilt from the latest snapshot whenever it changes. */
	struct FMenuPage
	{
		FString Id;
		FString Title;
		FString Subtitle;
		/** A paragraph for the side panel: the chapter, the season. */
		FString Story;
		/** Lines under it: the coach, a protocol's totals. */
		TArray<FString> Notes;
		TArray<FMenuItem> Items;
		FString RowsTitle;
		TArray<FMenuRow> Rows;
		FMenuStrip Strip;
	};

	bool Paused() const { return bPaused; }
	const FMenuPage& Page() const { return MenuPage; }
	int32 MenuIndex() const { return MenuAt; }
	/** The camera turns slowly round the skater while a menu is up (main.gd's showcase). */
	bool Showcase() const { return bPaused && !bShotsWithoutMenu; }

	const FIceFrame& Frame() const { return Latest; }
	/** The broadcast's announcement (main.gd broadcast.announce): a title, its detail, and the seconds it has left. */
	const FString& AnnouncementTitle() const { return AnnounceTitle; }
	const FString& AnnouncementDetail() const { return AnnounceDetail; }
	double AnnouncementLeft() const { return AnnounceLeft; }
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
	/** Opens the menu on a page (the bottom of its stack); the run waits underneath. */
	void OpenMenu(const FString& PageId = TEXT("home"));
	void CloseMenu();
	void PushPage(const FString& PageId);
	/** Back: the page before, or the ice when there is a run to go back to. */
	void PopPage();
	/** The current page again, from the latest snapshot, keeping the focus where it was. */
	void RebuildPage();
	void BuildPage(const FString& Id, FMenuPage& Out);
	void BuildHome(FMenuPage& P);
	void BuildSeason(FMenuPage& P);
	void BuildEvent(FMenuPage& P);
	void BuildTraining(FMenuPage& P);
	void BuildStyle(FMenuPage& P);
	void BuildComposer(FMenuPage& P);
	void BuildWardrobe(FMenuPage& P);
	void BuildDesign(FMenuPage& P);
	void BuildLessons(FMenuPage& P);
	void BuildSettings(FMenuPage& P);
	void BuildResult(FMenuPage& P);
	/** A career program laid on its music (game/composer.ts through the bridge's timeline op). */
	void BuildMusic(FMenuPage& P);
	void TimelineOp(const TSharedRef<FJsonObject>& Options);
	/** A few seconds of a track from a point in it, to hear where a bar falls. */
	void PreviewMusic(int32 Track, double At);
	void MoveFocus(int32 By);
	void SendOp(const FString& Op, const TSharedRef<FJsonObject>& Payload);
	/** The costume list: the catalog's presets, then your atelier designs that exist. */
	TArray<TSharedPtr<FJsonObject>> Costumes() const;
	void WearCostume();
	void LoadSkaterModel();
	void LoadPreferences();
	void SavePreferences() const;
	FString PreferencesPath() const;
	/** A catalog list by key, or empty. */
	const TArray<TSharedPtr<FJsonValue>>& CatalogList(const TCHAR* Key) const;
	TSharedPtr<FJsonObject> CareerObject() const;
	FString ElementTitle(const FString& Id) const;
	/** A lesson needs its setup in force first: the course and its words are that pad's (main.gd start_lesson). */
	void StartLesson(const FString& Course, const FString& NeededSetup);
	void StartMode(const FString& Mode, int32 Event = 0);
	void ChangeSetup(int32 By);
	bool RunLive() const { return Latest.bValid && !Latest.bFinished; }
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
	FMenuPage MenuPage;
	TArray<FString> PageStack;
	TArray<int32> FocusStack;
	int32 MenuAt = 0;
	bool bShotsWithoutMenu = false;
	/** The career event the briefing page shows. */
	int32 FocusEvent = 0;
	/** The element the "+ Add" lines would add, by catalog order. */
	int32 AddPick = 0;
	/** The atelier: the slot being designed, and the design as it stands (game/atelier.ts). */
	int32 DesignSlot = 0;
	int32 DesignStart = 0;
	TSharedPtr<FJsonObject> Design;
	/** The Composer's program (main.gd's sequence), up to 16 phrases. */
	TArray<FString> Sequence = {TEXT("glide"), TEXT("edge"), TEXT("jump"), TEXT("spin"), TEXT("pose")};
	/** The wardrobe: which skater model, which costume (presets first, then your designs). */
	int32 CharacterIndex = 0;
	int32 CostumeIndex = 0;
	/** Free skate's skater level (sim/profile.ts SAMPLE_PROFILES), sent as configure's profile. */
	int32 ProfileIndex = 0;
	/** Free skate's music (catalog tracks), sent as configure's track; the career plays its own. */
	int32 TrackIndex = 0;
	bool bMusicOn = true;
	bool bMusicPaused = false;
	/** Plays the run's own track from its start (the snapshot's track: a career program's laid music, else yours). */
	void StartMusic();
	USoundBase* TrackSound(int32 Track) const;
	/** Seconds the bar's preview has left to play (it fades then). */
	double PreviewLeft = 0.0;
	/** The engine's refusal of the last thing asked on this page (No room, The event asks for that one). */
	FString PageNotice;
	/** The cue being taken out on the music page, among your own. */
	int32 RemovePick = 0;
	void Announce(const FString& Title, const FString& Detail);
	/** Where a run is, for its first announcement: a career event's venue, else the mode. */
	FString RunPlace() const;
	/** After each frame: a landing's thud, the crowd's swell, the pad's rumble, and its announcement (main.gd). */
	void SenseLanding();
	FString AnnounceTitle;
	FString AnnounceDetail;
	double AnnounceLeft = 0.0;
	int32 LastLandingTick = -1;
	/** The pad shakes on a landing (main.gd rumble_enabled; Settings → Controller vibration). */
	bool bRumbleOn = true;
	/** An atelier slot just kept: worn once the wardrobe comes back with it. */
	int32 PendingWearSlot = -1;
	/** The title screen comes up once, over the first run. */
	bool bTitleShown = false;
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

	/** -IceMenuTest: the menus driven headless, a player's way through them; prints UNREAL_MENUS_PASS. */
	bool bMenuTest = false;
	int32 MenuTestStage = 0;
	double MenuTestClock = 0.0;
	double MenuTestValue = 0.0;
	/** The career run in the walk carried its music cues. */
	bool bMenuTestSawCues = false;
	void MenuTestStep(float Dt);
	const FMenuItem* FindItem(const FString& Prefix) const;
	bool AcceptItem(const FString& Prefix);
	bool AdjustItem(const FString& Prefix, int32 By);
	bool bPrefsLoaded = false;

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

	UPROPERTY()
	TObjectPtr<class UAudioComponent> Music;

	/** The music page's bar preview: its own voice, so the run's paused music keeps its place. */
	UPROPERTY()
	TObjectPtr<class UAudioComponent> Preview;

	/** The blade, the crowd and a landing's thud, made live (IceSound), and the voice it plays on. */
	UPROPERTY()
	TObjectPtr<UIceSound> IceSound;

	UPROPERTY()
	TObjectPtr<class UAudioComponent> Ambience;
};
