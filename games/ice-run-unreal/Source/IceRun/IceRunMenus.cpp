// The menus: every page of scripts/main.gd's overlay, as data the HUD draws.
// A page is rebuilt from the latest bridge snapshot whenever it changes; every
// action is a bridge op or a run start, so the career, training, wardrobe and
// plans live where they always have: in game/career.ts and game/atelier.ts,
// saved by host.mjs. The story is game/story.ts's, sent in the catalog.

#include "IceRunGameMode.h"
#include "IceRun.h"
#include "IceSkater.h"
#include "IceShotCamera.h"
#include "IceRunPlayerController.h"
#include "Engine/Engine.h"
#include "GameFramework/GameUserSettings.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Policies/PrettyJsonPrintPolicy.h"
#include "Components/AudioComponent.h"

using FMenuItem = AIceRunGameMode::FMenuItem;
using FMenuRow = AIceRunGameMode::FMenuRow;
using FMenuPage = AIceRunGameMode::FMenuPage;

namespace
{
	const TArray<TSharedPtr<FJsonValue>> NoValues;

	FString Str(const TSharedPtr<FJsonObject>& O, const TCHAR* Key)
	{
		FString V;
		return O.IsValid() && O->TryGetStringField(Key, V) ? V : FString();
	}

	double Num(const TSharedPtr<FJsonObject>& O, const TCHAR* Key, double Fallback = 0.0)
	{
		double V = Fallback;
		return O.IsValid() && O->TryGetNumberField(Key, V) ? V : Fallback;
	}

	TSharedPtr<FJsonObject> Obj(const TSharedPtr<FJsonObject>& O, const TCHAR* Key)
	{
		const TSharedPtr<FJsonObject>* Found = nullptr;
		return O.IsValid() && O->TryGetObjectField(Key, Found) ? *Found : nullptr;
	}

	const TArray<TSharedPtr<FJsonValue>>& Arr(const TSharedPtr<FJsonObject>& O, const TCHAR* Key)
	{
		const TArray<TSharedPtr<FJsonValue>>* Found = nullptr;
		return O.IsValid() && O->TryGetArrayField(Key, Found) ? *Found : NoValues;
	}

	TSharedPtr<FJsonObject> At(const TArray<TSharedPtr<FJsonValue>>& List, int32 I)
	{
		return List.IsValidIndex(I) && List[I].IsValid() && List[I]->Type == EJson::Object ? List[I]->AsObject() : nullptr;
	}

	/** A JSON object's keys, in the order they arrived (the catalog's elements are an object). */
	TArray<FString> Keys(const TSharedPtr<FJsonObject>& O)
	{
		TArray<FString> Out;
		if (O.IsValid())
		{
			// The key is an FString or a shared string, by engine build; both read through *.
			for (const auto& Pair : O->Values)
			{
				Out.Add(FString(*Pair.Key));
			}
		}
		return Out;
	}

	FLinearColor Swatch(const FString& Hex)
	{
		return FLinearColor::FromSRGBColor(FColor::FromHex(Hex));
	}

	FMenuItem Header(const FString& Label)
	{
		FMenuItem I;
		I.Label = Label;
		I.bHeader = true;
		I.bEnabled = false;
		return I;
	}

	FMenuItem Line(const FString& Label, const FString& Value, const FString& Detail, TFunction<void()> Accept, TFunction<void(int32)> Adjust = nullptr, bool bEnabled = true)
	{
		FMenuItem I;
		I.Label = Label;
		I.Value = Value;
		I.Detail = Detail;
		I.Accept = MoveTemp(Accept);
		I.Adjust = MoveTemp(Adjust);
		I.bEnabled = bEnabled;
		return I;
	}

	int32 Wrap(int32 V, int32 N) { return N <= 0 ? 0 : ((V % N) + N) % N; }

	/** The skater models tools/build_content.py imports, in main.gd's CHARACTERS order. */
	struct FCharacter { const TCHAR* Key; const TCHAR* Name; };
	const FCharacter Characters[] = {
		{TEXT("Athlete"), TEXT("Athlete")},
		{TEXT("Competition"), TEXT("Competition athlete")},
		{TEXT("Berserker"), TEXT("Black Berserker")},
		{TEXT("Violet"), TEXT("Original Violet")},
	};

	const TCHAR* const StatOrder[] = {TEXT("edgeControl"), TEXT("balance"), TEXT("spring"), TEXT("strength"), TEXT("stamina")};
}

// ── the stack ────────────────────────────────────────────────────────────────

void AIceRunGameMode::OpenMenu(const FString& PageId)
{
	bPaused = true;
	TickDebt = 0.0;
	PageStack = {TEXT("home")};
	FocusStack.Reset();
	MenuAt = 0;
	if (PageId != TEXT("home"))
	{
		PushPage(PageId);
		return;
	}
	RebuildPage();
	MoveFocus(0);
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

void AIceRunGameMode::PushPage(const FString& PageId)
{
	FocusStack.Add(MenuAt);
	PageStack.Add(PageId);
	MenuAt = 0;
	RebuildPage();
	MoveFocus(0);
}

void AIceRunGameMode::PopPage()
{
	const FString Leaving = PageStack.Num() > 0 ? PageStack.Last() : FString();
	if (Leaving == TEXT("design"))
	{
		// Leaving the atelier without keeping: back into what you were wearing.
		WearCostume();
	}
	if (PageStack.Num() > 1)
	{
		PageStack.Pop();
		MenuAt = FocusStack.Num() > 0 ? FocusStack.Pop() : 0;
		RebuildPage();
		return;
	}
	if (RunLive())
	{
		CloseMenu();
	}
}

void AIceRunGameMode::RebuildPage()
{
	if (PageStack.Num() == 0)
	{
		PageStack = {TEXT("home")};
	}
	FMenuPage Next;
	BuildPage(PageStack.Last(), Next);
	MenuPage = MoveTemp(Next);
	MenuAt = FMath::Clamp(MenuAt, 0, FMath::Max(0, MenuPage.Items.Num() - 1));
	if (MenuPage.Items.IsValidIndex(MenuAt) && MenuPage.Items[MenuAt].bHeader)
	{
		MoveFocus(1);
	}
}

void AIceRunGameMode::MoveFocus(int32 By)
{
	const int32 N = MenuPage.Items.Num();
	if (N == 0)
	{
		return;
	}
	const int32 Step = By == 0 ? 1 : FMath::Sign(By);
	int32 I = By == 0 ? MenuAt : MenuAt + Step;
	for (int32 Tries = 0; Tries < N; ++Tries, I += Step)
	{
		const int32 W = Wrap(I, N);
		if (!MenuPage.Items[W].bHeader)
		{
			MenuAt = W;
			return;
		}
	}
}

void AIceRunGameMode::BuildPage(const FString& Id, FMenuPage& P)
{
	P.Id = Id;
	if (Id == TEXT("season")) BuildSeason(P);
	else if (Id == TEXT("event")) BuildEvent(P);
	else if (Id == TEXT("training")) BuildTraining(P);
	else if (Id == TEXT("style")) BuildStyle(P);
	else if (Id == TEXT("composer")) BuildComposer(P);
	else if (Id == TEXT("wardrobe")) BuildWardrobe(P);
	else if (Id == TEXT("design")) BuildDesign(P);
	else if (Id == TEXT("lessons")) BuildLessons(P);
	else if (Id == TEXT("settings")) BuildSettings(P);
	else if (Id == TEXT("result")) BuildResult(P);
	else BuildHome(P);
}

void AIceRunGameMode::SendOp(const FString& Op, const TSharedRef<FJsonObject>& Payload)
{
	Bridge.Send(Op, Payload);
}

// ── data ─────────────────────────────────────────────────────────────────────

const TArray<TSharedPtr<FJsonValue>>& AIceRunGameMode::CatalogList(const TCHAR* Key) const
{
	return Arr(Catalog, Key);
}

TSharedPtr<FJsonObject> AIceRunGameMode::CareerObject() const
{
	return Latest.Raw.IsValid() ? Obj(Latest.Raw, TEXT("career")) : nullptr;
}

FString AIceRunGameMode::ElementTitle(const FString& Id) const
{
	const TSharedPtr<FJsonObject> E = Obj(Obj(Catalog, TEXT("elements")), *Id);
	return E.IsValid() ? Str(E, TEXT("title")) : Id;
}

TArray<TSharedPtr<FJsonObject>> AIceRunGameMode::Costumes() const
{
	TArray<TSharedPtr<FJsonObject>> Out;
	for (const TSharedPtr<FJsonValue>& V : CatalogList(TEXT("skins")))
	{
		Out.Add(V->AsObject());
	}
	for (const TSharedPtr<FJsonValue>& V : Arr(Obj(Latest.Raw, TEXT("wardrobe")), TEXT("skins")))
	{
		if (V.IsValid() && V->Type == EJson::Object)
		{
			Out.Add(V->AsObject());
		}
	}
	return Out;
}

void AIceRunGameMode::WearCostume()
{
	const TArray<TSharedPtr<FJsonObject>> List = Costumes();
	if (List.Num() == 0 || !Skater)
	{
		return;
	}
	CostumeIndex = Wrap(CostumeIndex, List.Num());
	Skater->ApplyCostume(List[CostumeIndex]);
}

void AIceRunGameMode::LoadSkaterModel()
{
	CharacterIndex = Wrap(CharacterIndex, UE_ARRAY_COUNT(Characters));
	FString Path;
	FString Manifest;
	TSharedPtr<FJsonObject> Skaters;
	const FString ManifestPath = FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Generated/skaters.json"));
	if (FFileHelper::LoadFileToString(Manifest, *ManifestPath) && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Manifest), Skaters) && Skaters.IsValid())
	{
		Skaters->TryGetStringField(Characters[CharacterIndex].Key, Path);
	}
	if (!Path.IsEmpty() && Skater && Skater->LoadModel(Path))
	{
		ModelPath = Path;
		WearCostume();
	}
}

FString AIceRunGameMode::PreferencesPath() const
{
	return FPaths::ConvertRelativePathToFull(FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("IceRun/preferences.json")));
}

void AIceRunGameMode::LoadPreferences()
{
	FString Text;
	TSharedPtr<FJsonObject> P;
	if (!FFileHelper::LoadFileToString(Text, *PreferencesPath()) || !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), P) || !P.IsValid())
	{
		return;
	}
	bPrefsLoaded = true;
	FString Setup;
	if (P->TryGetStringField(TEXT("setup"), Setup))
	{
		SetupId = Setup == TEXT("none") ? FString() : Setup;
	}
	P->TryGetStringField(TEXT("steady"), SteadyChoice);
	double V = 0;
	if (P->TryGetNumberField(TEXT("assistance"), V)) Assistance = FMath::Clamp(V, .5, 1.0);
	if (P->TryGetNumberField(TEXT("profile"), V)) ProfileIndex = FMath::Clamp(int32(V), 0, 3);
	if (P->TryGetNumberField(TEXT("character"), V)) CharacterIndex = Wrap(int32(V), UE_ARRAY_COUNT(Characters));
	if (P->TryGetNumberField(TEXT("costume"), V)) CostumeIndex = FMath::Max(0, int32(V));
	if (P->TryGetNumberField(TEXT("track"), V)) TrackIndex = FMath::Max(0, int32(V));
	P->TryGetBoolField(TEXT("music"), bMusicOn);
	TArray<FString> Ids;
	if (P->TryGetStringArrayField(TEXT("sequence"), Ids) && Ids.Num() <= 16)
	{
		Sequence = Ids;
	}
}

void AIceRunGameMode::SavePreferences() const
{
	if (bSmoke || bMenuTest || ShotTimes.Num() > 0)
	{
		return;
	}
	TSharedRef<FJsonObject> P = MakeShared<FJsonObject>();
	P->SetStringField(TEXT("setup"), SetupId.IsEmpty() ? TEXT("none") : SetupId);
	P->SetStringField(TEXT("steady"), SteadyChoice);
	P->SetNumberField(TEXT("assistance"), Assistance);
	P->SetNumberField(TEXT("profile"), ProfileIndex);
	P->SetNumberField(TEXT("character"), CharacterIndex);
	P->SetNumberField(TEXT("costume"), CostumeIndex);
	P->SetNumberField(TEXT("track"), TrackIndex);
	P->SetBoolField(TEXT("music"), bMusicOn);
	TArray<TSharedPtr<FJsonValue>> Ids;
	for (const FString& Id : Sequence)
	{
		Ids.Add(MakeShared<FJsonValueString>(Id));
	}
	P->SetArrayField(TEXT("sequence"), Ids);
	FString Text;
	FJsonSerializer::Serialize(P, TJsonWriterFactory<TCHAR, TPrettyJsonPrintPolicy<TCHAR>>::Create(&Text));
	FFileHelper::SaveStringToFile(Text, *PreferencesPath());
}

// ── pages ────────────────────────────────────────────────────────────────────

void AIceRunGameMode::BuildHome(FMenuPage& P)
{
	P.Title = TEXT("EDGEWORK  ·  Ice Run");
	const TSharedPtr<FJsonObject> Steady = Obj(Latest.Raw, TEXT("steady"));
	P.Subtitle = FString::Printf(TEXT("%s   ·   steadying hand %s"), *SetupName(SetupId), *Str(Steady, TEXT("name")).ToLower());
	P.Story = TEXT("Your time on the ice. One rink, every edge, and a season to make your own.");
	if (RunLive() && Latest.Mode != TEXT("free"))
	{
		P.Items.Add(Line(TEXT("Continue"), Latest.Mode, TEXT("Back onto the ice, where you left it."), [this] { CloseMenu(); }));
		if (Obj(Latest.Raw, TEXT("tutorial")).IsValid())
		{
			P.Items.Add(Line(TEXT("Skip this step"), TEXT(""), TEXT("Earns no XP; the next step starts at once."), [this] { SendOp(TEXT("skipStep"), MakeShared<FJsonObject>()); CloseMenu(); }));
		}
		P.Items.Add(Line(TEXT("Start it again"), TEXT(""), TEXT("From the first push."), [this] { StartRun(); CloseMenu(); }));
	}
	const TSharedPtr<FJsonObject> Career = CareerObject();
	const int32 Unlocked = int32(Num(Career, TEXT("unlocked")));
	const TSharedPtr<FJsonObject> Next = At(CatalogList(TEXT("events")), Unlocked);
	P.Items.Add(Line(TEXT("The Season"), Str(Next, TEXT("title")), TEXT("Your first season: five events, a coach, and the skaters you'll be measured against. Train between them."), [this] { PushPage(TEXT("season")); }));
	P.Items.Add(Line(TEXT("Lessons"), TEXT(""), TEXT("Trust the ice, the tutorial: balance, edges, getting where you mean to go, stops, the air. And a course for each setup's pad."), [this] { PushPage(TEXT("lessons")); }));
	P.Items.Add(Line(TEXT("The Composer"), FString::Printf(TEXT("%d phrases"), Sequence.Num()), TEXT("Build your own program, phrase by phrase, and skate it."), [this] { PushPage(TEXT("composer")); }));
	P.Items.Add(Line(RunLive() && Latest.Mode == TEXT("free") ? TEXT("Skate freely") : TEXT("Free skate"), TEXT(""), TEXT("Quiet ice. No judges, no clock; the practice list follows along."), [this]
	{
		if (RunLive() && Latest.Mode == TEXT("free")) CloseMenu();
		else StartMode(TEXT("free"));
	}));
	P.Items.Add(Line(TEXT("Rookie gates"), TEXT(""), TEXT("A curved lane of eight gates and two foam bars to jump."), [this] { StartMode(TEXT("rookie")); }));
	P.Items.Add(Line(TEXT("Light course"), TEXT("90 s"), TEXT("Carve from light to light against the clock."), [this] { StartMode(TEXT("timed")); }));
	const TArray<TSharedPtr<FJsonObject>> Worn = Costumes();
	P.Items.Add(Line(TEXT("Wardrobe"), Worn.IsValidIndex(CostumeIndex) ? Str(Worn[CostumeIndex], TEXT("name")) : FString(), TEXT("Your skater, your costume, and an atelier for three of your own."), [this] { PushPage(TEXT("wardrobe")); }));
	P.Items.Add(Line(TEXT("Settings"), TEXT(""), TEXT("Setup, steadying hand, assistance, skater level, camera, display."), [this] { PushPage(TEXT("settings")); }));
	P.Items.Add(Line(TEXT("Quit"), TEXT(""), TEXT("The career saves as you skate."), [this]
	{
		if (AIceRunPlayerController* PC = Player())
		{
			UKismetSystemLibrary::QuitGame(this, PC, EQuitPreference::Quit, false);
		}
	}));
}

void AIceRunGameMode::BuildSeason(FMenuPage& P)
{
	const TSharedPtr<FJsonObject> Career = CareerObject();
	const TSharedPtr<FJsonObject> Story = Obj(Catalog, TEXT("story"));
	const TArray<TSharedPtr<FJsonValue>>& Events = CatalogList(TEXT("events"));
	const TArray<TSharedPtr<FJsonValue>>& Medals = CatalogList(TEXT("medals"));
	const TArray<TSharedPtr<FJsonValue>>& Chapters = Arr(Story, TEXT("chapters"));
	const int32 Unlocked = int32(Num(Career, TEXT("unlocked")));
	const int32 Weeks = int32(Num(Career, TEXT("weeks")));
	P.Title = TEXT("The Season");
	P.Subtitle = FString::Printf(TEXT("%d XP   ·   %d training weeks   ·   overall %.1f"), int32(Num(Career, TEXT("xp"))), Weeks, Num(Career, TEXT("overall")));
	const TArray<TSharedPtr<FJsonValue>>& Won = Arr(Career, TEXT("medals"));
	bool bAny = false;
	for (const TSharedPtr<FJsonValue>& M : Won) bAny |= M->AsNumber() > 0;
	const TSharedPtr<FJsonObject> Season = Obj(Story, TEXT("season"));
	P.Story = !bAny ? Str(Season, TEXT("opening")) : Str(At(Chapters, FMath::Min(Unlocked, Chapters.Num() - 1)), TEXT("before"));
	const TSharedPtr<FJsonObject> Coach = Obj(Story, TEXT("coach"));
	if (Coach.IsValid())
	{
		P.Notes.Add(FString::Printf(TEXT("%s, %s:"), *Str(Coach, TEXT("name")), *Str(Coach, TEXT("role"))));
	}
	for (const TSharedPtr<FJsonValue>& A : Arr(Career, TEXT("advice")))
	{
		P.Notes.Add(A->AsString());
	}
	P.Items.Add(Header(TEXT("Events")));
	const TArray<TSharedPtr<FJsonValue>>& Plans = Arr(Career, TEXT("plans"));
	const TArray<TSharedPtr<FJsonValue>>& Locks = Arr(Career, TEXT("locks"));
	for (int32 I = 0; I < Events.Num(); ++I)
	{
		const TSharedPtr<FJsonObject> E = At(Events, I);
		const int32 Medal = Won.IsValidIndex(I) ? int32(Won[I]->AsNumber()) : 0;
		const FString Lock = Locks.IsValidIndex(I) ? Locks[I]->AsString() : FString();
		TArray<FString> Program;
		const TArray<TSharedPtr<FJsonValue>>* Plan = nullptr;
		if (Plans.IsValidIndex(I) && Plans[I]->Type == EJson::Array)
		{
			Plan = &Plans[I]->AsArray();
		}
		for (const TSharedPtr<FJsonValue>& Id : Plan ? *Plan : Arr(E, TEXT("routine")))
		{
			Program.Add(ElementTitle(Id->AsString()));
		}
		const FString Detail = FString::Printf(TEXT("%s   ·   %d s\n%s%s"), *Str(E, TEXT("venue")), int32(Num(E, TEXT("seconds"))), *FString::Join(Program, TEXT(" → ")), Lock.IsEmpty() ? TEXT("") : *(TEXT("\n\n") + Lock));
		const FString Value = I > Unlocked ? FString(TEXT("locked")) : Medal > 0 && Medals.IsValidIndex(Medal) ? Medals[Medal]->AsString() : FString(TEXT("to skate"));
		P.Items.Add(Line(FString::Printf(TEXT("%02d   %s"), I + 1, *Str(E, TEXT("title"))), Value, Detail, [this, I] { FocusEvent = I; PushPage(TEXT("event")); }));
	}
	P.Items.Add(Header(TEXT("Between events")));
	P.Items.Add(Line(TEXT("Training"), FString::Printf(TEXT("%d weeks"), Weeks), TEXT("Raise your stats with XP, drill the jumps that have gone rusty, rest what the falls have worn. Each costs a week; a better medal buys two."), [this] { PushPage(TEXT("training")); }));
	const TSharedPtr<FJsonObject> Focus = At(CatalogList(TEXT("armFocus")), int32(Num(Career, TEXT("armFocus"))));
	P.Items.Add(Line(TEXT("Skating style"), Str(Focus, TEXT("title")), TEXT("What your arms do most in competition: Function, Shared or Expression. Drills shrink the trade-off for the style you drill."), [this] { PushPage(TEXT("style")); }));
	P.Items.Add(Line(TEXT("Lessons"), FString::Printf(TEXT("+%d XP a step"), int32(Num(Catalog, TEXT("lessonXp")))), TEXT("Each new lesson step you pass pays XP toward training."), [this] { PushPage(TEXT("lessons")); }));
	P.RowsTitle = TEXT("Season standings");
	for (const TSharedPtr<FJsonValue>& V : Arr(Career, TEXT("season")))
	{
		const TSharedPtr<FJsonObject> R = V->AsObject();
		bool bYou = false;
		R->TryGetBoolField(TEXT("you"), bYou);
		P.Rows.Add({FString::FromInt(int32(Num(R, TEXT("place")))), Str(R, TEXT("name")), FString::FromInt(int32(Num(R, TEXT("points")))), bYou});
	}
}

void AIceRunGameMode::BuildEvent(FMenuPage& P)
{
	const TSharedPtr<FJsonObject> Career = CareerObject();
	const TSharedPtr<FJsonObject> E = At(CatalogList(TEXT("events")), FocusEvent);
	const TSharedPtr<FJsonObject> Chapter = At(Arr(Obj(Catalog, TEXT("story")), TEXT("chapters")), FocusEvent);
	const int32 Extra = int32(Num(Catalog, TEXT("planExtra"), 2));
	P.Title = Str(E, TEXT("title"));
	P.Subtitle = FString::Printf(TEXT("%s   ·   %d s"), *Str(E, TEXT("venue")), int32(Num(E, TEXT("seconds"))));
	P.Story = Str(Chapter, TEXT("before"));
	const TArray<TSharedPtr<FJsonValue>>& Locks = Arr(Career, TEXT("locks"));
	const FString Lock = Locks.IsValidIndex(FocusEvent) ? Locks[FocusEvent]->AsString() : FString();
	if (!Lock.IsEmpty())
	{
		P.Notes.Add(Lock);
	}
	P.Notes.Add(FString::Printf(TEXT("Your program must hold everything this event asks for, in any order, and up to %d more of your own. More to skate is more to score, and more to fall on."), Extra));
	TArray<FString> Required, Plan;
	for (const TSharedPtr<FJsonValue>& V : Arr(E, TEXT("routine"))) Required.Add(V->AsString());
	const TArray<TSharedPtr<FJsonValue>>& Plans = Arr(Career, TEXT("plans"));
	const bool bSaved = Plans.IsValidIndex(FocusEvent) && Plans[FocusEvent]->Type == EJson::Array;
	if (bSaved) for (const TSharedPtr<FJsonValue>& V : Plans[FocusEvent]->AsArray()) Plan.Add(V->AsString());
	else Plan = Required;
	auto Send = [this](const TArray<FString>& Next)
	{
		TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
		Payload->SetNumberField(TEXT("event"), FocusEvent);
		TArray<TSharedPtr<FJsonValue>> Ids;
		for (const FString& Id : Next) Ids.Add(MakeShared<FJsonValueString>(Id));
		Payload->SetArrayField(TEXT("plan"), Ids);
		SendOp(TEXT("plan"), Payload);
	};
	P.Items.Add(Header(TEXT("Your program")));
	TArray<FString> Left = Required;
	for (int32 I = 0; I < Plan.Num(); ++I)
	{
		const bool bRequired = Left.RemoveSingle(Plan[I]) > 0;
		const FString Hint = Str(Obj(Obj(Catalog, TEXT("elements")), *Plan[I]), TEXT("hint"));
		P.Items.Add(Line(FString::Printf(TEXT("%02d   %s%s"), I + 1, *ElementTitle(Plan[I]), bRequired ? TEXT("") : TEXT("   (yours)")), TEXT("◀ ▶ moves"),
			Hint + (bRequired ? TEXT("\n\nThe event asks for this one.") : TEXT("\n\nYour own: A takes it out.")),
			[Plan, I, bRequired, Send] { if (!bRequired) { TArray<FString> Next = Plan; Next.RemoveAt(I); Send(Next); } },
			[Plan, I, Send](int32 By) { const int32 J = I + By; if (Plan.IsValidIndex(J)) { TArray<FString> Next = Plan; Next.Swap(I, J); Send(Next); } }));
	}
	const TArray<FString> Ids = Keys(Obj(Catalog, TEXT("elements")));
	if (Plan.Num() < Required.Num() + Extra && Ids.Num() > 0)
	{
		const FString Pick = Ids[Wrap(AddPick, Ids.Num())];
		P.Items.Add(Line(FString::Printf(TEXT("+ Add   ◀  %s  ▶"), *ElementTitle(Pick)), TEXT(""), TEXT("Added before the closing pose, which ends the program (game/programplan.ts)."),
			[Plan, Pick, Send]
			{
				TArray<FString> Next = Plan;
				Next.Insert(Pick, Next.Num() > 0 && Next.Last() == TEXT("pose") ? Next.Num() - 1 : Next.Num());
				Send(Next);
			},
			[this](int32 By) { AddPick += By; RebuildPage(); }));
	}
	if (bSaved)
	{
		P.Items.Add(Line(TEXT("Use the event's own program"), TEXT(""), TEXT("Back to what the event asks for, nothing more."), [this]
		{
			TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
			Payload->SetNumberField(TEXT("event"), FocusEvent);
			Payload->SetField(TEXT("plan"), MakeShared<FJsonValueNull>());
			SendOp(TEXT("plan"), Payload);
		}));
	}
	P.Items.Add(Line(TEXT("Skate this program →"), TEXT(""), Lock.IsEmpty() ? TEXT("Every career program runs its full time. Gold: no falls. Silver: at most two. Bronze: finish.") : Lock,
		[this] { StartMode(TEXT("career"), FocusEvent); }, nullptr, Lock.IsEmpty()));
	P.RowsTitle = TEXT("The field  ·  they don't decide your medal");
	const TArray<TSharedPtr<FJsonValue>>& Field = Arr(Career, TEXT("field"));
	if (Field.IsValidIndex(FocusEvent))
	{
		for (const TSharedPtr<FJsonValue>& V : Field[FocusEvent]->AsArray())
		{
			const TSharedPtr<FJsonObject> R = V->AsObject();
			bool bYou = false;
			R->TryGetBoolField(TEXT("you"), bYou);
			P.Rows.Add({FString::FromInt(int32(Num(R, TEXT("place")))), Str(R, TEXT("name")), FString::Printf(TEXT("%.2f"), Num(R, TEXT("score"))), bYou});
		}
	}
}

void AIceRunGameMode::BuildTraining(FMenuPage& P)
{
	const TSharedPtr<FJsonObject> Career = CareerObject();
	const TSharedPtr<FJsonObject> Titles = Obj(Obj(Catalog, TEXT("story")), TEXT("statTitles"));
	const int32 Xp = int32(Num(Career, TEXT("xp")));
	const int32 Weeks = int32(Num(Career, TEXT("weeks")));
	P.Title = TEXT("Training");
	P.Subtitle = FString::Printf(TEXT("%d XP   ·   %d weeks left   ·   overall %.1f"), Xp, Weeks, Num(Career, TEXT("overall")));
	P.Story = TEXT("Each costs a week. A jump family you don't drill between events goes rusty, and a rusty jump is harder to land. Every fall costs your body something; enough of it becomes an injury, and a week's rest wins it back.");
	for (const TSharedPtr<FJsonValue>& A : Arr(Career, TEXT("advice"))) P.Notes.Add(A->AsString());
	P.Items.Add(Header(TEXT("Stats   ·   XP and a week each")));
	const TSharedPtr<FJsonObject> Stats = Obj(Career, TEXT("stats"));
	const TSharedPtr<FJsonObject> Costs = Obj(Career, TEXT("costs"));
	for (const TCHAR* Stat : StatOrder)
	{
		const int32 Value = int32(Num(Stats, Stat));
		const int32 Cost = int32(Num(Costs, Stat));
		const FString Title = Str(Titles, Stat).IsEmpty() ? FString(Stat) : Str(Titles, Stat);
		const bool bCan = Xp >= Cost && Value < 100 && Weeks >= 1;
		const FString Why = Value >= 100 ? TEXT("At its peak.") : Weeks < 1 ? TEXT("No weeks left: a better medal buys two.") : Xp < Cost ? FString::Printf(TEXT("Needs %d XP; you have %d."), Cost, Xp) : FString::Printf(TEXT("Raise it to %d for %d XP and a week."), Value + 1, Cost);
		P.Items.Add(Line(Title, FString::Printf(TEXT("%d → %d   ·   %d XP"), Value, Value + 1, Cost), Why, [this, Stat]
		{
			TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
			Payload->SetStringField(TEXT("stat"), Stat);
			SendOp(TEXT("train"), Payload);
		}, nullptr, bCan));
	}
	P.Items.Add(Header(TEXT("Jump families   ·   rust")));
	const TSharedPtr<FJsonObject> Rust = Obj(Career, TEXT("rust"));
	for (const TSharedPtr<FJsonValue>& V : CatalogList(TEXT("families")))
	{
		const TSharedPtr<FJsonObject> F = V->AsObject();
		const FString Id = Str(F, TEXT("id"));
		P.Items.Add(Line(Str(F, TEXT("title")), FString::Printf(TEXT("rust %d%%   ·   drill 1 week"), FMath::RoundToInt32(Num(Rust, *Id) * 100.0)), Str(F, TEXT("blurb")), [this, Id]
		{
			TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
			Payload->SetStringField(TEXT("family"), Id);
			SendOp(TEXT("drill"), Payload);
		}, nullptr, Weeks >= 1));
	}
	P.Items.Add(Header(TEXT("Your body   ·   wear")));
	const TSharedPtr<FJsonObject> Wear = Obj(Career, TEXT("wear"));
	const TSharedPtr<FJsonObject> Injured = Obj(Career, TEXT("injured"));
	for (const TSharedPtr<FJsonValue>& V : CatalogList(TEXT("bodyRegions")))
	{
		const TSharedPtr<FJsonObject> R = V->AsObject();
		const FString Id = Str(R, TEXT("id"));
		bool bHurt = false;
		if (Injured.IsValid()) Injured->TryGetBoolField(Id, bHurt);
		const double Worn = Num(Wear, *Id);
		P.Items.Add(Line(bHurt ? Str(R, TEXT("injury")) : Str(R, TEXT("title")), bHurt ? FString(TEXT("injured   ·   rest 1 week")) : FString::Printf(TEXT("wear %d%%   ·   rest 1 week"), FMath::RoundToInt32(Worn * 100.0)), Str(R, TEXT("blurb")), [this, Id]
		{
			TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
			Payload->SetStringField(TEXT("region"), Id);
			SendOp(TEXT("rest"), Payload);
		}, nullptr, Weeks >= 1 && Worn > 0.0));
	}
}

void AIceRunGameMode::BuildStyle(FMenuPage& P)
{
	const TSharedPtr<FJsonObject> Career = CareerObject();
	const int32 Focus = int32(Num(Career, TEXT("armFocus")));
	const TArray<TSharedPtr<FJsonValue>>& Best = Arr(Career, TEXT("armBest"));
	const TArray<TSharedPtr<FJsonValue>>& Tiers = CatalogList(TEXT("armFocus"));
	P.Title = TEXT("Skating style");
	P.Subtitle = TEXT("What your arms do most in competition");
	P.Story = TEXT("Function keeps the arms working for balance; Expression lets them carry the program, and the panel sees it in Presentation, with less to catch an edge with. Shared is half and half. Drills shrink the trade-off for the style you drill; free skate and every other mode have both.");
	for (int32 I = 0; I < Tiers.Num(); ++I)
	{
		const TSharedPtr<FJsonObject> T = Tiers[I]->AsObject();
		P.Items.Add(Line(FString::Printf(TEXT("%s%s"), I == Focus ? TEXT("● ") : TEXT(""), *Str(T, TEXT("title"))), Best.IsValidIndex(I) ? FString::Printf(TEXT("drill best %d"), int32(Best[I]->AsNumber())) : FString(), Str(T, TEXT("blurb")), [this, I]
		{
			TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
			Payload->SetNumberField(TEXT("focus"), I);
			SendOp(TEXT("armFocus"), Payload);
		}));
	}
	const TSharedPtr<FJsonObject> Chosen = At(Tiers, Focus);
	P.Items.Add(Line(FString::Printf(TEXT("Drill %s"), *Str(Chosen, TEXT("title"))), TEXT("45 s"), TEXT("The drill calls a line and scores how your arms hold it. A new best gives up less of the trade-off."), [this] { StartMode(TEXT("armdrill")); }));
}

void AIceRunGameMode::BuildComposer(FMenuPage& P)
{
	P.Title = TEXT("The Composer");
	P.Subtitle = FString::Printf(TEXT("%d of 16 phrases"), Sequence.Num());
	P.Story = TEXT("Author an ordered program: add phrases, move them, take them out, then skate it on the ice. A rehearsal lasts up to three minutes, and it earns no career XP.");
	P.Items.Add(Header(TEXT("Your program")));
	for (int32 I = 0; I < Sequence.Num(); ++I)
	{
		P.Items.Add(Line(FString::Printf(TEXT("%02d   %s"), I + 1, *ElementTitle(Sequence[I])), TEXT("◀ ▶ moves"), Str(Obj(Obj(Catalog, TEXT("elements")), *Sequence[I]), TEXT("hint")) + TEXT("\n\nA takes it out."),
			[this, I] { Sequence.RemoveAt(I); SavePreferences(); RebuildPage(); },
			[this, I](int32 By) { const int32 J = I + By; if (Sequence.IsValidIndex(J)) { Sequence.Swap(I, J); MenuAt += By; SavePreferences(); RebuildPage(); } }));
	}
	const TArray<FString> Ids = Keys(Obj(Catalog, TEXT("elements")));
	if (Sequence.Num() < 16 && Ids.Num() > 0)
	{
		const FString Pick = Ids[Wrap(AddPick, Ids.Num())];
		P.Items.Add(Line(FString::Printf(TEXT("+ Add   ◀  %s  ▶"), *ElementTitle(Pick)), TEXT(""), Str(Obj(Obj(Catalog, TEXT("elements")), *Pick), TEXT("hint")),
			[this, Pick] { Sequence.Add(Pick); SavePreferences(); RebuildPage(); },
			[this](int32 By) { AddPick += By; RebuildPage(); }));
	}
	P.Items.Add(Line(TEXT("Skate this program →"), TEXT(""), TEXT("On the ice, in this order."), [this] { StartMode(TEXT("composer")); }, nullptr, Sequence.Num() > 0));
	if (Sequence.Num() > 0)
	{
		P.Items.Add(Line(TEXT("Clear it"), TEXT(""), TEXT("Start an empty program."), [this] { Sequence.Reset(); SavePreferences(); RebuildPage(); }));
	}
}

void AIceRunGameMode::BuildWardrobe(FMenuPage& P)
{
	const TArray<TSharedPtr<FJsonObject>> List = Costumes();
	const TSharedPtr<FJsonObject> Atelier = Obj(Catalog, TEXT("atelier"));
	const TSharedPtr<FJsonObject> Wardrobe = Obj(Latest.Raw, TEXT("wardrobe"));
	const int32 Presets = CatalogList(TEXT("skins")).Num();
	CostumeIndex = Wrap(CostumeIndex, FMath::Max(1, List.Num()));
	P.Title = TEXT("Wardrobe");
	P.Subtitle = FString::Printf(TEXT("%s   ·   %s"), Characters[Wrap(CharacterIndex, UE_ARRAY_COUNT(Characters))].Name, List.IsValidIndex(CostumeIndex) ? *Str(List[CostumeIndex], TEXT("name")) : TEXT(""));
	P.Story = TEXT("The skater in front of you wears every change as you make it. Costumes recolour the athletes; the Black Berserker keeps its own look.");
	P.Items.Add(Line(FString::Printf(TEXT("Skater   ◀  %s  ▶"), Characters[Wrap(CharacterIndex, UE_ARRAY_COUNT(Characters))].Name), TEXT(""), TEXT("Four models, one skeleton: every one is posed from the same physics."),
		[this] { CharacterIndex++; LoadSkaterModel(); SavePreferences(); RebuildPage(); },
		[this](int32 By) { CharacterIndex += By; LoadSkaterModel(); SavePreferences(); RebuildPage(); }));
	P.Items.Add(Line(FString::Printf(TEXT("Costume   ◀  %s  ▶"), List.IsValidIndex(CostumeIndex) ? *Str(List[CostumeIndex], TEXT("name")) : TEXT("")), TEXT(""),
		List.IsValidIndex(CostumeIndex) ? Str(List[CostumeIndex], TEXT("description")) : FString(),
		[this] { CostumeIndex++; WearCostume(); SavePreferences(); RebuildPage(); },
		[this](int32 By) { CostumeIndex += By; WearCostume(); SavePreferences(); RebuildPage(); }));
	P.Items.Add(Header(TEXT("Atelier   ·   costumes of your own")));
	const TArray<TSharedPtr<FJsonValue>>& Skins = Arr(Wardrobe, TEXT("skins"));
	const TArray<TSharedPtr<FJsonValue>>& Designs = Arr(Wardrobe, TEXT("designs"));
	const TArray<TSharedPtr<FJsonValue>>& Starts = Arr(Atelier, TEXT("starts"));
	const int32 Slots = int32(Num(Atelier, TEXT("maxDesigns"), 3));
	int32 Made = 0;
	for (int32 Slot = 0; Slot < Slots; ++Slot)
	{
		const TSharedPtr<FJsonObject> Skin = At(Skins, Slot);
		if (!Skin.IsValid())
		{
			const TSharedPtr<FJsonObject> From = At(Starts, Wrap(DesignStart, Starts.Num()));
			P.Items.Add(Line(FString::Printf(TEXT("Slot %d   ·   empty"), Slot + 1), FString::Printf(TEXT("start from ◀ %s ▶"), *Str(From, TEXT("name"))), TEXT("Make a costume of your own from the atelier's swatches, starting from a preset."),
				[this, Slot, From]
				{
					DesignSlot = Slot;
					Design = MakeShared<FJsonObject>(*From);
					PushPage(TEXT("design"));
					TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
					Payload->SetObjectField(TEXT("design"), Design);
					SendOp(TEXT("dress"), Payload);
				},
				[this](int32 By) { DesignStart += By; RebuildPage(); }));
			continue;
		}
		const bool bWearing = CostumeIndex == Presets + Made;
		const TSharedPtr<FJsonObject> Saved = At(Designs, Slot);
		P.Items.Add(Line(FString::Printf(TEXT("Slot %d   ·   %s"), Slot + 1, *Str(Skin, TEXT("name"))), bWearing ? TEXT("wearing") : TEXT(""), Str(Skin, TEXT("description")) + TEXT("\n\nA to change it."),
			[this, Slot, Saved]
			{
				if (!Saved.IsValid()) return;
				DesignSlot = Slot;
				Design = MakeShared<FJsonObject>(*Saved);
				PushPage(TEXT("design"));
				TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
				Payload->SetObjectField(TEXT("design"), Design);
				SendOp(TEXT("dress"), Payload);
			}));
		++Made;
	}
}

void AIceRunGameMode::BuildDesign(FMenuPage& P)
{
	const TSharedPtr<FJsonObject> Atelier = Obj(Catalog, TEXT("atelier"));
	P.Title = FString::Printf(TEXT("Atelier   ·   slot %d"), DesignSlot + 1);
	P.Subtitle = Str(Design, TEXT("name"));
	P.Story = TEXT("Every choice is a swatch from the list, and the skater wears it as you choose. B leaves without keeping it.");
	if (!Design.IsValid())
	{
		return;
	}
	auto Dress = [this]
	{
		TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
		Payload->SetObjectField(TEXT("design"), Design);
		SendOp(TEXT("dress"), Payload);
		RebuildPage();
	};
	auto Cycle = [this, Dress](const FString& Key, const TArray<TSharedPtr<FJsonValue>>& List, int32 By)
	{
		int32 Now = 0;
		for (int32 I = 0; I < List.Num(); ++I) if (Str(List[I]->AsObject(), TEXT("id")) == Str(Design, *Key)) Now = I;
		Design->SetStringField(Key, Str(At(List, Wrap(Now + By, List.Num())), TEXT("id")));
		Dress();
	};
	for (const TSharedPtr<FJsonValue>& V : Arr(Atelier, TEXT("parts")))
	{
		const TSharedPtr<FJsonObject> Part = V->AsObject();
		const FString Id = Str(Part, TEXT("id"));
		const TArray<TSharedPtr<FJsonValue>> Swatches = Arr(Part, TEXT("swatches"));
		TSharedPtr<FJsonObject> Now;
		for (const TSharedPtr<FJsonValue>& S : Swatches) if (Str(S->AsObject(), TEXT("id")) == Str(Design, *Id)) Now = S->AsObject();
		FMenuItem Item = Line(Str(Part, TEXT("title")), FString::Printf(TEXT("◀  %s  ▶"), *Str(Now, TEXT("name"))), TEXT("◀ ▶ through the swatches."),
			[Cycle, Id, Swatches] { Cycle(Id, Swatches, 1); },
			[Cycle, Id, Swatches](int32 By) { Cycle(Id, Swatches, By); });
		if (Now.IsValid()) Item.Chip = Swatch(Str(Now, TEXT("hex")));
		P.Items.Add(Item);
	}
	for (const TCHAR* Key : {TEXT("fabric"), TEXT("crystals")})
	{
		const TArray<TSharedPtr<FJsonValue>> List = Arr(Atelier, FString(Key) == TEXT("fabric") ? TEXT("fabrics") : TEXT("crystals"));
		TSharedPtr<FJsonObject> Now;
		for (const TSharedPtr<FJsonValue>& S : List) if (Str(S->AsObject(), TEXT("id")) == Str(Design, Key)) Now = S->AsObject();
		const FString K = Key;
		P.Items.Add(Line(K == TEXT("fabric") ? TEXT("Fabric") : TEXT("Crystals"), FString::Printf(TEXT("◀  %s  ▶"), *Str(Now, TEXT("name"))), Str(Now, TEXT("description")),
			[Cycle, K, List] { Cycle(K, List, 1); },
			[Cycle, K, List](int32 By) { Cycle(K, List, By); }));
	}
	P.Items.Add(Line(TEXT("Keep it"), TEXT(""), TEXT("Saved to this slot, and worn now."), [this]
	{
		TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
		Payload->SetNumberField(TEXT("slot"), DesignSlot);
		Payload->SetObjectField(TEXT("design"), Design);
		SendOp(TEXT("design"), Payload);
		// Worn once the wardrobe comes back with it (OnReply "design").
		PendingWearSlot = DesignSlot;
		PageStack.Pop();
		MenuAt = FocusStack.Num() > 0 ? FocusStack.Pop() : 0;
		RebuildPage();
	}));
	P.Items.Add(Line(TEXT("Leave without keeping"), TEXT(""), TEXT("Back to the wardrobe, in what you were wearing."), [this] { PopPage(); }));
}

void AIceRunGameMode::BuildLessons(FMenuPage& P)
{
	P.Title = TEXT("Lessons");
	P.Subtitle = SetupName(SetupId);
	P.Story = TEXT("Trust the ice is skating itself, in your setup's words: stand still on something that moves, then edges, getting where you mean to go, stops, and only then the air. Each setup's own course teaches that pad.");
	P.Items.Add(Line(TEXT("Trust the ice"), FString::Printf(TEXT("%d steps"), int32(Num(Catalog, TEXT("trustSteps")))), TEXT("Balance, edges, travel, stops and the air, on any setup."), [this] { StartLesson(TEXT("trust"), FString()); }));
	P.Items.Add(Header(TEXT("A course for each pad")));
	for (const TSharedPtr<FJsonValue>& V : CatalogList(TEXT("courses")))
	{
		const TSharedPtr<FJsonObject> C = V->AsObject();
		const FString Id = Str(C, TEXT("id"));
		if (Id == TEXT("paddles"))
		{
			continue;
		}
		TArray<FString> Fits;
		C->TryGetStringArrayField(TEXT("setups"), Fits);
		const bool bMine = Fits.Contains(SetupId);
		const FString Needed = bMine || Fits.Num() == 0 ? FString() : Fits[0];
		P.Items.Add(Line(FString::Printf(TEXT("%s%s"), bMine ? TEXT("● ") : TEXT(""), *Str(C, TEXT("title"))), Needed.IsEmpty() ? FString() : FString::Printf(TEXT("on %s"), *SetupName(Needed)),
			Str(C, TEXT("blurb")) + (Needed.IsEmpty() ? FString() : FString::Printf(TEXT("\n\nStarting it makes %s your setup."), *SetupName(Needed))),
			[this, Id, Needed] { StartLesson(Id, Needed); }));
	}
}

void AIceRunGameMode::BuildSettings(FMenuPage& P)
{
	P.Title = TEXT("Settings");
	P.Subtitle = TEXT("Changes apply as you make them; a new setup starts a new run.");
	FString SetupDetail = TEXT("The original schemes with the coach: Cruise pushes for you, and a landing assist checks your rotation.");
	for (const TSharedPtr<FJsonValue>& V : CatalogList(TEXT("setups")))
	{
		if (Str(V->AsObject(), TEXT("id")) == SetupId) SetupDetail = Str(V->AsObject(), TEXT("description"));
	}
	P.Items.Add(Line(FString::Printf(TEXT("Setup   ◀  %s  ▶"), *SetupName(SetupId)), TEXT(""), SetupDetail, [this] { ChangeSetup(1); SavePreferences(); RebuildPage(); }, [this](int32 By) { ChangeSetup(By); SavePreferences(); RebuildPage(); }));
	const TSharedPtr<FJsonObject> Steady = Obj(Latest.Raw, TEXT("steady"));
	const FString Name = Str(Steady, TEXT("name"));
	auto Step = [this](int32 By)
	{
		static const TCHAR* const Choices[] = {TEXT(""), TEXT("off"), TEXT("light"), TEXT("firm")};
		int32 Now = 0;
		while (Now < 4 && SteadyChoice != Choices[Now]) ++Now;
		SteadyChoice = Choices[Wrap(Now + By, 4)];
		Configure();
		SavePreferences();
	};
	P.Items.Add(Line(FString::Printf(TEXT("Steadying hand   ◀  %s  ▶"), SteadyChoice.IsEmpty() ? *FString::Printf(TEXT("%s (setup default)"), *Name) : *Name), TEXT(""),
		TEXT("A hand on your stick, never the physics: it keeps the lean you ask for to what your speed can carry. Off by default where a setup promises minimal assistance; Light elsewhere; Firm holds you to the safe lean."),
		[Step] { Step(1); }, [Step](int32 By) { Step(By); }));
	if (SetupId == TEXT("explorer"))
	{
		auto Assist = [this](int32 By) { Assistance = FMath::Clamp(Assistance + By * .05, .5, 1.0); Configure(); SavePreferences(); RebuildPage(); };
		P.Items.Add(Line(FString::Printf(TEXT("Explorer assistance   ◀  %d%%  ▶"), FMath::RoundToInt32(Assistance * 100.0)), TEXT(""), TEXT("Blade Explorer's own balance and lean support, 50 to 100%. Applies from your next run."), [Assist] { Assist(1); }, [Assist](int32 By) { Assist(By); }));
	}
	const TArray<TSharedPtr<FJsonValue>>& Profiles = CatalogList(TEXT("profiles"));
	if (Profiles.Num() > 0)
	{
		auto Level = [this, Count = Profiles.Num()](int32 By) { ProfileIndex = Wrap(ProfileIndex + By, Count); Configure(); SavePreferences(); RebuildPage(); };
		P.Items.Add(Line(FString::Printf(TEXT("Skater level   ◀  %s  ▶"), *Profiles[Wrap(ProfileIndex, Profiles.Num())]->AsString()), TEXT("free skate"),
			TEXT("Who skates outside the career, from a club novice to a worlds medallist: their stats, mass and blades. The career skates the skater you train."),
			[Level] { Level(1); }, [Level](int32 By) { Level(By); }));
	}
	const TArray<TSharedPtr<FJsonValue>>& Tracks = CatalogList(TEXT("tracks"));
	if (Tracks.Num() > 0)
	{
		const TSharedPtr<FJsonObject> T = At(Tracks, Wrap(TrackIndex, Tracks.Num()));
		auto Pick = [this, Count = Tracks.Num()](int32 By)
		{
			TrackIndex = Wrap(TrackIndex + By, Count);
			Configure();
			SavePreferences();
			// The beat grid is the run's from its start: a free skate starts again on the new music.
			if (RunMode == TEXT("free")) StartRun();
			RebuildPage();
		};
		P.Items.Add(Line(FString::Printf(TEXT("Music   ◀  %s  ▶"), *Str(T, TEXT("title"))), FString::Printf(TEXT("%.0f bpm"), Num(T, TEXT("bpm"))),
			TEXT("Free skate's music, and its beat: a crossover push on the beat is a full one. A career program skates to the music you laid it on."), [Pick] { Pick(1); }, [Pick](int32 By) { Pick(By); }));
		auto Toggle = [this]
		{
			bMusicOn = !bMusicOn;
			SavePreferences();
			if (bMusicOn) StartMusic(); else if (Music) Music->Stop();
			RebuildPage();
		};
		P.Items.Add(Line(FString::Printf(TEXT("Music playing   ◀  %s  ▶"), bMusicOn ? TEXT("On") : TEXT("Off")), TEXT(""), TEXT("The beat still counts when it is off."), [Toggle] { Toggle(); }, [Toggle](int32) { Toggle(); }));
	}
	P.Items.Add(Line(FString::Printf(TEXT("Camera   ◀  %s  ▶"), *CameraName()), TEXT(""), TEXT("View / V changes it while skating, except in the air."),
		[this] { if (Latest.bValid) ShotCamera->Cycle(Latest.State); RebuildPage(); },
		[this](int32) { if (Latest.bValid) ShotCamera->Cycle(Latest.State); RebuildPage(); }));
	const bool bFull = GEngine && GEngine->GetGameUserSettings() && GEngine->GetGameUserSettings()->GetFullscreenMode() != EWindowMode::Windowed;
	auto Display = [this]
	{
		if (GEngine && GEngine->GetGameUserSettings())
		{
			UGameUserSettings* S = GEngine->GetGameUserSettings();
			S->SetFullscreenMode(S->GetFullscreenMode() == EWindowMode::Windowed ? EWindowMode::WindowedFullscreen : EWindowMode::Windowed);
			S->ApplyResolutionSettings(false);
		}
		RebuildPage();
	};
	P.Items.Add(Line(FString::Printf(TEXT("Display   ◀  %s  ▶"), bFull ? TEXT("Fullscreen") : TEXT("Windowed")), TEXT("F11"), TEXT("Fullscreen or a window."), [Display] { Display(); }, [Display](int32) { Display(); }));
}

void AIceRunGameMode::BuildResult(FMenuPage& P)
{
	const TSharedPtr<FJsonObject> R = Obj(Latest.Raw, TEXT("result"));
	P.Title = Str(R, TEXT("title"));
	P.Subtitle = Str(R, TEXT("detail"));
	const FString Finale = Str(R, TEXT("finale"));
	P.Story = Str(R, TEXT("story")) + (Finale.IsEmpty() ? FString() : TEXT("\n\n") + Finale);
	const TSharedPtr<FJsonObject> Protocol = Obj(R, TEXT("protocol"));
	if (Protocol.IsValid())
	{
		double Pcs = 0;
		const bool bPcs = Protocol->TryGetNumberField(TEXT("pcs"), Pcs);
		P.Notes.Add(FString::Printf(TEXT("TES %.2f   ·   PCS %s   ·   deductions %.2f   ·   total %.2f"), Num(Protocol, TEXT("tes")), bPcs ? *FString::Printf(TEXT("%.2f"), Pcs) : TEXT("—"), Num(Protocol, TEXT("deductions")), Num(Protocol, TEXT("total"))));
	}
	const int32 Xp = int32(Num(R, TEXT("xp")));
	if (Xp > 0) P.Notes.Add(FString::Printf(TEXT("+%d XP"), Xp));
	const TSharedPtr<FJsonObject> Stopped = Obj(R, TEXT("stopped"));
	if (Stopped.IsValid()) P.Notes.Add(FString::Printf(TEXT("It stopped at %s. %s"), *Str(Stopped, TEXT("element")), *Str(Stopped, TEXT("how"))));
	if (!Str(R, TEXT("body")).IsEmpty()) P.Notes.Add(Str(R, TEXT("body")));
	const FString Mode = Latest.Mode;
	if (Mode == TEXT("career"))
	{
		P.Items.Add(Line(TEXT("Back to the Season →"), TEXT(""), TEXT("Train, plan the next program, see where you stand."), [this] { OpenMenu(TEXT("season")); }));
	}
	else if (Mode == TEXT("composer"))
	{
		P.Items.Add(Line(TEXT("Back to the Composer →"), TEXT(""), TEXT("Change the program and skate it again."), [this] { OpenMenu(TEXT("composer")); }));
	}
	else if (Mode == TEXT("lesson"))
	{
		P.Items.Add(Line(TEXT("More lessons →"), TEXT(""), TEXT("Another course, or the tutorial again."), [this] { OpenMenu(TEXT("lessons")); }));
	}
	P.Items.Add(Line(TEXT("Skate it again"), TEXT(""), TEXT("From the first push."), [this] { StartRun(); CloseMenu(); }));
	P.Items.Add(Line(TEXT("Watch the replay"), TEXT(""), TEXT("The run again, played back from its own inputs through the same solver."), [this]
	{
		SendOp(TEXT("export"), MakeShared<FJsonObject>());
		SendOp(TEXT("replay"), MakeShared<FJsonObject>());
	}));
	P.Items.Add(Line(TEXT("Home"), TEXT(""), TEXT(""), [this] { OpenMenu(TEXT("home")); }));
	const TArray<TSharedPtr<FJsonValue>>& Standings = Arr(R, TEXT("standings"));
	if (Standings.Num() > 0)
	{
		P.RowsTitle = TEXT("The field");
		for (const TSharedPtr<FJsonValue>& V : Standings)
		{
			const TSharedPtr<FJsonObject> Row = V->AsObject();
			bool bYou = false;
			Row->TryGetBoolField(TEXT("you"), bYou);
			P.Rows.Add({FString::FromInt(int32(Num(Row, TEXT("place")))), Str(Row, TEXT("name")), FString::Printf(TEXT("%.2f"), Num(Row, TEXT("score"))), bYou});
		}
	}
	else if (Protocol.IsValid())
	{
		P.RowsTitle = TEXT("Protocol");
		int32 N = 0;
		for (const TSharedPtr<FJsonValue>& V : Arr(Protocol, TEXT("lines")))
		{
			P.Rows.Add({FString::FromInt(++N), V->Type == EJson::String ? V->AsString() : FString(), FString(), false});
		}
	}
}
