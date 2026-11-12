// The modes beside the career (2026-11-11): Arcade, Exhibition & Free skate, Creation, create a
// skater, and the skaters' stories. The twin of main.gd's show_mode_page. Every action is a bridge
// op (sheet, studio, arcade, newCareer, careerStyle) or a run start; the data is game/modes.ts,
// game/creator.ts and game/backstories.ts, sent in the catalog and the snapshot.
//
// The pad has no keyboard, so a created skater's name is picked from NAMES with ◀ ▶ (AUTHORED,
// invented names, none a real athlete's: decision D6), and a kept program is named by its slot.
#include "IceRunGameMode.h"
#include "IceRun.h"
#include "IceSkater.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

using FMenuItem = AIceRunGameMode::FMenuItem;
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
	bool Flag(const TSharedPtr<FJsonObject>& O, const TCHAR* Key)
	{
		bool V = false;
		return O.IsValid() && O->TryGetBoolField(Key, V) && V;
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

	/** IceRunMenus.cpp's ModeAccent: career champagne, arcade coral, exhibition spotlight violet, creation teal. */
	FLinearColor Accent(const FString& Mode)
	{
		if (Mode == TEXT("arcade")) return FLinearColor::FromSRGBColor(FColor(0xf0, 0x74, 0x62));
		if (Mode == TEXT("exhibition")) return FLinearColor::FromSRGBColor(FColor(0xae, 0x96, 0xf0));
		if (Mode == TEXT("creation")) return FLinearColor::FromSRGBColor(FColor(0x66, 0xd0, 0xc4));
		return FLinearColor::FromSRGBColor(FColor(0xdb, 0xc2, 0x94));
	}

	const TCHAR* const StatIds[] = {TEXT("strength"), TEXT("spring"), TEXT("edgeControl"), TEXT("balance"), TEXT("stamina")};
	const TCHAR* const StatTitles[] = {TEXT("Strength"), TEXT("Spring"), TEXT("Edge control"), TEXT("Balance"), TEXT("Stamina")};

	/** Names a created skater can take on the pad. AUTHORED, invented. */
	const TCHAR* const Names[] = {
		TEXT("New skater"), TEXT("Wren Halloway"), TEXT("Iris Vantorre"), TEXT("Mila Sorensby"), TEXT("Saoirse Calder"), TEXT("Juno Arkwright"),
		TEXT("Ines Morrow"), TEXT("Tova Lindqvar"), TEXT("Esme Duquaine"), TEXT("Nadia Ferrow"), TEXT("Kaia Brennick"), TEXT("Ottilie Maresh"),
		TEXT("Sunniva Holte"), TEXT("Rae Castine"), TEXT("Liesel Okonkwo"), TEXT("Pia Valcourt"), TEXT("Yara Delmonde"), TEXT("Freya Ashcombe"),
	};

	/** The next id after `Now` in `Ids`, by `By`, wrapping. */
	FString Cycle(const TArray<FString>& Ids, const FString& Now, int32 By)
	{
		if (Ids.Num() == 0) return Now;
		return Ids[Wrap(Ids.IndexOfByKey(Now) + By, Ids.Num())];
	}

	TSharedRef<FJsonObject> Action(const TCHAR* Name)
	{
		TSharedRef<FJsonObject> O = MakeShared<FJsonObject>();
		O->SetStringField(TEXT("action"), Name);
		return O;
	}
}

// ── plumbing ─────────────────────────────────────────────────────────────────

void AIceRunGameMode::SheetOp(const TSharedRef<FJsonObject>& Options)
{
	TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
	Payload->SetObjectField(TEXT("options"), Options);
	SendOp(TEXT("sheet"), Payload);
}

void AIceRunGameMode::StudioOp(const TSharedRef<FJsonObject>& Options)
{
	TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
	Payload->SetObjectField(TEXT("options"), Options);
	SendOp(TEXT("studio"), Payload);
}

int32 AIceRunGameMode::FirstEmpty(const TCHAR* Shelf) const
{
	const TArray<TSharedPtr<FJsonValue>>& List = Arr(Obj(Latest.Raw, TEXT("studio")), Shelf);
	for (int32 I = 0; I < List.Num(); ++I)
	{
		if (!List[I].IsValid() || List[I]->Type == EJson::Null) return I;
	}
	return -1;
}

void AIceRunGameMode::StartWith(const FString& Mode, const TSharedRef<FJsonObject>& Extra)
{
	if (Mode == TEXT("arcade"))
	{
		// The climb starts in the bridge (engine.mjs arcadeStart) with its first round; the rounds after are plain starts.
		RunMode = TEXT("arcade");
		RunExtra.Reset();
		if (bWearingWho) { bWearingWho = false; LoadSkaterModel(); }
		ClearPodium();
		bPlaying = false;
		bSnapNext = true;
		FinishedFor = -1.0;
		SendOp(TEXT("arcade"), Extra);
		CloseMenu();
		return;
	}
	RunExtra = Extra;
	StartMode(Mode);
}

void AIceRunGameMode::StartPicked(const FString& Mode)
{
	TSharedRef<FJsonObject> Extra = MakeShared<FJsonObject>();
	Extra->SetStringField(TEXT("character"), PickCharacter);
	const TSharedPtr<FJsonObject> Studio = Obj(Latest.Raw, TEXT("studio"));
	const TSharedPtr<FJsonObject> Program = At(Arr(Studio, TEXT("programs")), PickProgram);
	TArray<TSharedPtr<FJsonValue>> Ids;
	if (Program.IsValid()) Ids = Arr(Program, TEXT("elements"));
	else if (Mode == TEXT("showcase")) for (const FString& Id : Sequence) Ids.Add(MakeShared<FJsonValueString>(Id));
	if (Ids.Num() > 0) Extra->SetArrayField(TEXT("program"), Ids);
	const TSharedPtr<FJsonObject> Dance = At(Arr(Studio, TEXT("dances")), PickDance);
	if (Dance.IsValid())
	{
		TSharedRef<FJsonObject> D = MakeShared<FJsonObject>();
		D->SetStringField(TEXT("style"), Str(Dance, TEXT("style")));
		D->SetNumberField(TEXT("track"), Num(Dance, TEXT("track")));
		D->SetNumberField(TEXT("seed"), Num(Dance, TEXT("seed"), 1));
		Extra->SetObjectField(TEXT("dance"), D);
	}
	StartWith(Mode, Extra);
}

void AIceRunGameMode::WearWho()
{
	const TSharedPtr<FJsonObject> Who = Obj(Latest.Raw, TEXT("who"));
	const FString Costume = Str(Who, TEXT("costume"));
	if (!Skater || Costume.IsEmpty()) return;
	bWearingWho = true;
	if (Costume.StartsWith(TEXT("rival:")))
	{
		if (const TSharedPtr<FJsonObject> Look = RivalLook(Costume.Mid(6)))
		{
			FString Model, Path;
			if (Look->TryGetStringField(TEXT("model"), Model)) Path = SkaterAsset(Model);
			Skater->LoadModel(Path.IsEmpty() ? SkaterAsset(TEXT("Athlete")) : Path);
			const TSharedPtr<FJsonObject>* Worn = nullptr;
			if (Look->TryGetObjectField(TEXT("costume"), Worn)) Skater->ApplyCostume(*Worn);
		}
		return;
	}
	// A preset by its id, or an atelier design (its skin's id is design-<slot>).
	const FString Id = Costume.StartsWith(TEXT("preset:")) ? Costume.Mid(7) : TEXT("design-") + Costume.Mid(7);
	for (const TSharedPtr<FJsonObject>& Skin : Costumes())
	{
		if (Str(Skin, TEXT("id")) == Id) { Skater->ApplyCostume(Skin); return; }
	}
}

// ── pages ────────────────────────────────────────────────────────────────────

void AIceRunGameMode::AddPickers(FMenuPage& P, const FString& DefaultProgram)
{
	TArray<FString> Who;
	FString WhoName = TEXT("Your career skater"), WhoDetail;
	for (const TSharedPtr<FJsonValue>& V : Arr(Latest.Raw, TEXT("characters")))
	{
		const TSharedPtr<FJsonObject> C = V->AsObject();
		Who.Add(Str(C, TEXT("id")));
		if (Str(C, TEXT("id")) == PickCharacter) { WhoName = Str(C, TEXT("name")); WhoDetail = Str(C, TEXT("origin")); }
	}
	P.Items.Add(Line(FString::Printf(TEXT("Skater   ◀  %s  ▶"), *WhoName), TEXT(""), WhoDetail + TEXT("\n\nYour career skater, anyone you've created, or a rival in their own model, stats and style."),
		[this, Who] { PickCharacter = Cycle(Who, PickCharacter, 1); RebuildPage(); },
		[this, Who](int32 By) { PickCharacter = Cycle(Who, PickCharacter, By); RebuildPage(); }));
	const TSharedPtr<FJsonObject> Studio = Obj(Latest.Raw, TEXT("studio"));
	TArray<int32> Programs = {-1}, Dances = {-1};
	const TArray<TSharedPtr<FJsonValue>>& PL = Arr(Studio, TEXT("programs"));
	const TArray<TSharedPtr<FJsonValue>>& DL = Arr(Studio, TEXT("dances"));
	for (int32 I = 0; I < PL.Num(); ++I) if (At(PL, I).IsValid()) Programs.Add(I);
	for (int32 I = 0; I < DL.Num(); ++I) if (At(DL, I).IsValid()) Dances.Add(I);
	if (!Programs.Contains(PickProgram)) PickProgram = -1;
	if (!Dances.Contains(PickDance)) PickDance = -1;
	const TSharedPtr<FJsonObject> Prog = At(PL, PickProgram);
	auto StepIn = [](const TArray<int32>& L, int32 Now, int32 By) { return L[Wrap(L.IndexOfByKey(Now) + By, L.Num())]; };
	P.Items.Add(Line(FString::Printf(TEXT("Program   ◀  %s  ▶"), Prog.IsValid() ? *Str(Prog, TEXT("name")) : *DefaultProgram), TEXT(""), TEXT("A program kept in Creation, or the default."),
		[this, Programs, StepIn] { PickProgram = StepIn(Programs, PickProgram, 1); RebuildPage(); },
		[this, Programs, StepIn](int32 By) { PickProgram = StepIn(Programs, PickProgram, By); RebuildPage(); }));
	const TSharedPtr<FJsonObject> Dance = At(DL, PickDance);
	P.Items.Add(Line(FString::Printf(TEXT("Dance   ◀  %s  ▶"), Dance.IsValid() ? *Str(Dance, TEXT("name")) : TEXT("the skater's own")), TEXT(""), TEXT("A dance sequence kept in Creation: its style, its music and its arrangement. Otherwise the skater dances their own style."),
		[this, Dances, StepIn] { PickDance = StepIn(Dances, PickDance, 1); RebuildPage(); },
		[this, Dances, StepIn](int32 By) { PickDance = StepIn(Dances, PickDance, By); RebuildPage(); }));
}

void AIceRunGameMode::BuildArcade(FMenuPage& P)
{
	P.Kicker = TEXT("ARCADE  ·  BEAT THE FIELD");
	P.Accent = Accent(TEXT("arcade"));
	P.Title = TEXT("Arcade");
	P.Subtitle = FString::Printf(TEXT("Six programs  ·  six rivals  ·  %d lives"), int32(Num(Obj(Catalog, TEXT("arcade")), TEXT("lives"), 3)));
	P.Story = TEXT("The career's own programs, one rival to beat at each, climbing to Teodora Wynn at Nationals. Beat their score with the program skated to its end. No XP, no wear, no rust: just the ladder.");
	const TSharedPtr<FJsonObject> A = Obj(Latest.Raw, TEXT("arcade"));
	if (A.IsValid() && !Flag(A, TEXT("over")))
	{
		const TSharedPtr<FJsonObject> R = At(Arr(A, TEXT("rounds")), int32(Num(A, TEXT("round"))));
		P.Items.Add(Line(FString::Printf(TEXT("Continue   ·   round %d, %s"), int32(Num(A, TEXT("round"))) + 1, *Str(R, TEXT("rival"))), FString::Printf(TEXT("%d lives"), int32(Num(A, TEXT("lives")))),
			FString::Printf(TEXT("%s. Beat %.2f. %d points so far."), *Str(R, TEXT("title")), Num(R, TEXT("target")), int32(Num(A, TEXT("points")))),
			[this] { RunMode = TEXT("arcade"); RunExtra.Reset(); StartRun(); CloseMenu(); }));
	}
	P.Items.Add(Header(TEXT("Pick your skater")));
	for (const TSharedPtr<FJsonValue>& V : Arr(Latest.Raw, TEXT("characters")))
	{
		const TSharedPtr<FJsonObject> C = V->AsObject();
		const FString Id = Str(C, TEXT("id"));
		FMenuItem Item = Line(Str(C, TEXT("name")), Id.StartsWith(TEXT("rival:")) ? TEXT("rival") : Id == TEXT("career") ? TEXT("career") : TEXT("created"), Str(C, TEXT("origin")), [this, Id]
		{
			TSharedRef<FJsonObject> Extra = MakeShared<FJsonObject>();
			Extra->SetStringField(TEXT("character"), Id);
			StartWith(TEXT("arcade"), Extra);
		});
		if (Id.StartsWith(TEXT("rival:")))
		{
			if (const TSharedPtr<FJsonObject> Look = RivalLook(Id.Mid(6))) Item.Chip = FLinearColor::FromSRGBColor(FColor::FromHex(Str(Obj(Look, TEXT("costume")), TEXT("bodice"))));
		}
		P.Items.Add(Item);
	}
	P.RowsTitle = TEXT("High scores");
	int32 N = 0;
	for (const TSharedPtr<FJsonValue>& V : Arr(Latest.Raw, TEXT("board")))
	{
		const TSharedPtr<FJsonObject> E = V->AsObject();
		P.Rows.Add({FString::FromInt(++N), FString::Printf(TEXT("%s   %s"), *Str(E, TEXT("name")), Flag(E, TEXT("cleared")) ? TEXT("· the whole ladder") : *FString::Printf(TEXT("· %d rounds"), int32(Num(E, TEXT("rounds"))))), FString::FromInt(int32(Num(E, TEXT("points")))), false});
	}
	for (const TSharedPtr<FJsonValue>& V : Arr(Obj(Catalog, TEXT("arcade")), TEXT("ladder")))
	{
		const TSharedPtr<FJsonObject> R = V->AsObject();
		P.Notes.Add(FString::Printf(TEXT("%s  ·  %s  ·  beat %.2f"), *Str(R, TEXT("title")), *Str(R, TEXT("rival")), Num(R, TEXT("target"))));
	}
	if (N == 0) P.Notes.Add(TEXT("Nobody on the board yet."));
}

void AIceRunGameMode::BuildExhibition(FMenuPage& P)
{
	P.Kicker = TEXT("EXHIBITION  ·  SKATE FOR THE CROWD");
	P.Accent = Accent(TEXT("exhibition"));
	P.Title = TEXT("Exhibition & Free skate");
	P.Subtitle = TEXT("Nobody judging");
	P.Story = TEXT("A gala under the lights: no required elements, a crowd that stayed, a protocol nobody counts. Or quiet ice with nothing on it but you.");
	P.Items.Add(Line(TEXT("Free skate"), TEXT("quiet ice"), TEXT("No judges, no clock; the practice list follows along."), [this] { StartMode(TEXT("free")); }));
	P.Items.Add(Header(TEXT("Exhibition")));
	AddPickers(P, TEXT("the gala's own"));
	P.Items.Add(Line(TEXT("Take the spotlight →"), TEXT("3:00"), TEXT("Skated, scored for show, placed against nobody."), [this] { StartPicked(TEXT("exhibition")); }));
}

void AIceRunGameMode::BuildCreation(FMenuPage& P)
{
	P.Kicker = TEXT("CREATION  ·  MAKE IT, THEN WATCH IT");
	P.Accent = Accent(TEXT("creation"));
	P.Title = TEXT("Creation");
	P.Subtitle = TEXT("Skaters  ·  costumes  ·  programs  ·  dances");
	P.Story = TEXT("Make skaters, costumes, programs and dance sequences. Then watch the computer skate them, through the same pad and the same physics you skate with.");
	P.Items.Add(Line(TEXT("Watch it skated   ·   the showcase →"), TEXT(""), TEXT("Pick a skater, a program and a dance, and watch."), [this] { PushPage(TEXT("showcase")); }));
	const TSharedPtr<FJsonObject> Studio = Obj(Latest.Raw, TEXT("studio"));
	P.Items.Add(Header(TEXT("Skaters")));
	const TArray<TSharedPtr<FJsonValue>>& Skaters = Arr(Studio, TEXT("skaters"));
	for (int32 I = 0; I < Skaters.Num(); ++I)
	{
		const TSharedPtr<FJsonObject> K = At(Skaters, I);
		if (!K.IsValid()) continue;
		P.Items.Add(Line(Str(K, TEXT("name")), TEXT("edit"), TEXT(""), [this, I]
		{
			SheetSlot = I;
			TSharedRef<FJsonObject> O = Action(TEXT("load"));
			O->SetNumberField(TEXT("slot"), I);
			SheetOp(O);
			PushPage(TEXT("create"));
		}));
	}
	P.Items.Add(Line(TEXT("+ Create a skater"), TEXT(""), TEXT("An origin, a body, a style and a costume."), [this]
	{
		SheetSlot = -1;
		SheetOp(Action(TEXT("drop")));
		PushPage(TEXT("create"));
	}, nullptr, FirstEmpty(TEXT("skaters")) >= 0));
	P.Items.Add(Header(TEXT("Costumes")));
	P.Items.Add(Line(TEXT("Wardrobe & atelier →"), TEXT(""), TEXT("Up to three costumes of your own, every choice a swatch."), [this] { PushPage(TEXT("wardrobe")); }));
	P.Items.Add(Header(TEXT("Programs")));
	const TArray<TSharedPtr<FJsonValue>>& Programs = Arr(Studio, TEXT("programs"));
	for (int32 I = 0; I < Programs.Num(); ++I)
	{
		const TSharedPtr<FJsonObject> Pr = At(Programs, I);
		if (!Pr.IsValid()) continue;
		TArray<FString> Ids, Titles;
		for (const TSharedPtr<FJsonValue>& E : Arr(Pr, TEXT("elements"))) { Ids.Add(E->AsString()); Titles.Add(ElementTitle(E->AsString())); }
		P.Items.Add(Line(Str(Pr, TEXT("name")), FString::Printf(TEXT("%d phrases"), Ids.Num()), FString::Join(Titles, TEXT(" → ")) + TEXT("\n\nA opens it in the Composer. ◀ takes it off the shelf."),
			[this, Ids] { Sequence = Ids; SavePreferences(); PushPage(TEXT("composer")); },
			[this, I](int32 By)
			{
				if (By >= 0) return;
				TSharedRef<FJsonObject> O = Action(TEXT("clear"));
				O->SetStringField(TEXT("shelf"), TEXT("programs"));
				O->SetNumberField(TEXT("slot"), I);
				StudioOp(O);
			}));
	}
	const int32 Free = FirstEmpty(TEXT("programs"));
	P.Items.Add(Line(TEXT("+ Keep the Composer's program"), FString::Printf(TEXT("%d phrases"), Sequence.Num()), TEXT("The program in the Composer now, kept on the shelf as Program N."), [this, Free]
	{
		TSharedRef<FJsonObject> V = MakeShared<FJsonObject>();
		V->SetStringField(TEXT("name"), FString::Printf(TEXT("Program %d"), Free + 1));
		TArray<TSharedPtr<FJsonValue>> Ids;
		for (const FString& Id : Sequence) Ids.Add(MakeShared<FJsonValueString>(Id));
		V->SetArrayField(TEXT("elements"), Ids);
		TSharedRef<FJsonObject> O = Action(TEXT("program"));
		O->SetNumberField(TEXT("slot"), Free);
		O->SetObjectField(TEXT("value"), V);
		StudioOp(O);
	}, nullptr, Free >= 0 && Sequence.Num() > 0));
	P.Items.Add(Line(TEXT("The Composer →"), TEXT(""), TEXT("Build a program phrase by phrase."), [this] { PushPage(TEXT("composer")); }));
	P.Items.Add(Header(TEXT("Dance sequences")));
	const TArray<TSharedPtr<FJsonValue>>& Dances = Arr(Studio, TEXT("dances"));
	for (int32 I = 0; I < Dances.Num(); ++I)
	{
		const TSharedPtr<FJsonObject> D = At(Dances, I);
		if (!D.IsValid()) continue;
		P.Items.Add(Line(Str(D, TEXT("name")), TEXT("edit"), TEXT(""), [this, I, D] { DanceSlot = I; DanceDraft = MakeShared<FJsonObject>(*D); PushPage(TEXT("dance")); }));
	}
	P.Items.Add(Line(TEXT("+ A dance sequence"), TEXT(""), TEXT("A style laid over a track's bars."), [this]
	{
		DanceSlot = -1;
		DanceDraft = MakeShared<FJsonObject>();
		const TSharedPtr<FJsonObject> First = At(Arr(Obj(Catalog, TEXT("motion")), TEXT("styles")), 0);
		DanceDraft->SetStringField(TEXT("name"), FString::Printf(TEXT("Dance %d"), FirstEmpty(TEXT("dances")) + 1));
		DanceDraft->SetStringField(TEXT("style"), Str(First, TEXT("id")));
		DanceDraft->SetNumberField(TEXT("track"), TrackIndex);
		DanceDraft->SetNumberField(TEXT("seed"), 1);
		PushPage(TEXT("dance"));
	}, nullptr, FirstEmpty(TEXT("dances")) >= 0));
}

void AIceRunGameMode::BuildDance(FMenuPage& P)
{
	P.Kicker = TEXT("CREATION  ·  DANCE");
	P.Accent = Accent(TEXT("creation"));
	if (!DanceDraft.IsValid()) { P.Title = TEXT("A dance sequence"); P.Items.Add(Line(TEXT("← Creation"), TEXT(""), TEXT(""), [this] { PopPage(); })); return; }
	P.Title = Str(DanceDraft, TEXT("name"));
	P.Subtitle = TEXT("A dance style laid over a track's bars");
	P.Story = TEXT("The arms and upper body a skater dances while hers are free: never in the air, a jump's load, a spin or a formal move, where the arms are physics. Roll it again for another arrangement of the same style.");
	TArray<FString> Ids;
	FString StyleName, StyleDetail;
	for (const TSharedPtr<FJsonValue>& V : Arr(Obj(Catalog, TEXT("motion")), TEXT("styles")))
	{
		const TSharedPtr<FJsonObject> S = V->AsObject();
		Ids.Add(Str(S, TEXT("id")));
		if (Str(S, TEXT("id")) == Str(DanceDraft, TEXT("style")))
		{
			StyleName = Str(S, TEXT("name"));
			StyleDetail = FString::Printf(TEXT("%s\n\n%d–%d bpm  ·  %s"), *Str(S, TEXT("blurb")), int32(Num(Obj(S, TEXT("tempo")), TEXT("min"))), int32(Num(Obj(S, TEXT("tempo")), TEXT("max"))), *Str(S, TEXT("music")));
		}
	}
	auto Style = [this, Ids](int32 By) { DanceDraft->SetStringField(TEXT("style"), Cycle(Ids, Str(DanceDraft, TEXT("style")), By)); RebuildPage(); };
	P.Items.Add(Line(FString::Printf(TEXT("Style   ◀  %s  ▶"), *StyleName), TEXT(""), StyleDetail, [Style] { Style(1); }, Style));
	const int32 Tracks = CatalogList(TEXT("tracks")).Num();
	auto Track = [this, Tracks](int32 By) { DanceDraft->SetNumberField(TEXT("track"), Wrap(int32(Num(DanceDraft, TEXT("track"))) + By, Tracks)); RebuildPage(); };
	P.Items.Add(Line(FString::Printf(TEXT("Music   ◀  %s  ▶"), *Str(At(CatalogList(TEXT("tracks")), int32(Num(DanceDraft, TEXT("track")))), TEXT("title"))), TEXT(""), TEXT("The track it's danced to, and its tempo."), [Track] { Track(1); }, Track));
	P.Items.Add(Line(TEXT("Roll it again"), FString::Printf(TEXT("arrangement %d"), int32(Num(DanceDraft, TEXT("seed"), 1))), TEXT("Another arrangement of the same style on the same music."), [this]
	{
		DanceDraft->SetNumberField(TEXT("seed"), int32(Num(DanceDraft, TEXT("seed"), 1)) % 999 + 1);
		RebuildPage();
	}));
	const int32 Slot = DanceSlot >= 0 ? DanceSlot : FirstEmpty(TEXT("dances"));
	P.Items.Add(Line(TEXT("Keep it"), TEXT(""), TEXT("On Creation's shelf, to dress an exhibition or a showcase."), [this, Slot]
	{
		TSharedRef<FJsonObject> O = Action(TEXT("dance"));
		O->SetNumberField(TEXT("slot"), Slot);
		O->SetObjectField(TEXT("value"), DanceDraft);
		StudioOp(O);
		DanceSlot = Slot;
	}, nullptr, Slot >= 0));
	if (DanceSlot >= 0)
	{
		P.Items.Add(Line(TEXT("Take it off the shelf"), TEXT(""), TEXT(""), [this]
		{
			TSharedRef<FJsonObject> O = Action(TEXT("clear"));
			O->SetStringField(TEXT("shelf"), TEXT("dances"));
			O->SetNumberField(TEXT("slot"), DanceSlot);
			StudioOp(O);
			DanceSlot = -1;
			PopPage();
		}));
	}
}

void AIceRunGameMode::BuildShowcase(FMenuPage& P)
{
	P.Kicker = TEXT("CREATION  ·  SHOWCASE");
	P.Accent = Accent(TEXT("creation"));
	P.Title = TEXT("The showcase");
	P.Subtitle = TEXT("The computer skates it");
	P.Story = TEXT("The computer skates your program through Simulation's pad and the same physics you skate with, and falls when the physics says so. It can skate glides, edges, crossovers, jumps, spins and poses. Anything else in the program it leaves out and tells you: those have no measured pad yet.");
	AddPickers(P, FString::Printf(TEXT("the Composer's (%d)"), Sequence.Num()));
	P.Items.Add(Line(TEXT("Watch →"), TEXT(""), TEXT("Sit back."), [this] { StartPicked(TEXT("showcase")); }));
}

void AIceRunGameMode::BuildCast(FMenuPage& P)
{
	P.Kicker = TEXT("THE FIELD");
	P.Title = TEXT("The skaters");
	P.Subtitle = TEXT("Where they come from");
	P.Story = TEXT("Each story is where a skater's numbers come from. A rival's stats are who they are when you pick them in Arcade, Exhibition or a showcase. Their scores in your career are measured, not these.");
	const TSharedPtr<FJsonObject> Stories = Obj(Catalog, TEXT("backstories"));
	if (!Stories.IsValid()) return;
	for (const auto& Pair : Stories->Values)
	{
		const FString Name(*Pair.Key);
		const TSharedPtr<FJsonObject> B = Pair.Value->AsObject();
		P.Items.Add(Header(Name));
		const TSharedPtr<FJsonObject> Stats = Obj(B, TEXT("stats"));
		const FString Detail = FString::Printf(TEXT("%s\n\n%s"), *Str(B, TEXT("story")), *Str(B, TEXT("shaped")));
		FString StyleName = Str(B, TEXT("style"));
		FMenuItem Origin = Line(Str(B, TEXT("origin")), StyleName.IsEmpty() ? FString() : StyleName.Left(1).ToUpper() + StyleName.Mid(1), Detail, [this, Name] { PickCharacter = TEXT("rival:") + Name; PushPage(TEXT("exhibition")); });
		if (const TSharedPtr<FJsonObject> Look = RivalLook(Name)) Origin.Chip = FLinearColor::FromSRGBColor(FColor::FromHex(Str(Obj(Look, TEXT("costume")), TEXT("bodice"))));
		P.Items.Add(Origin);
		for (int32 S = 0; S < 5; ++S)
		{
			FMenuItem Bar = Line(StatTitles[S], FString::FromInt(int32(Num(Stats, StatIds[S]))), Detail, [this, Name] { PickCharacter = TEXT("rival:") + Name; PushPage(TEXT("exhibition")); });
			Bar.Meter = float(Num(Stats, StatIds[S])) / 100.f;
			P.Items.Add(Bar);
		}
	}
}

void AIceRunGameMode::BuildCreate(FMenuPage& P)
{
	P.Kicker = TEXT("CREATE A SKATER");
	P.Accent = Accent(TEXT("creation"));
	const TSharedPtr<FJsonObject> Creator = Obj(Catalog, TEXT("creator"));
	const TSharedPtr<FJsonObject> Sh = Obj(Latest.Raw, TEXT("sheet"));
	if (!Sh.IsValid())
	{
		P.Title = TEXT("Where do they come from?");
		P.Subtitle = TEXT("An origin shapes the five stats, a style and a dance");
		P.Story = TEXT("An origin trades points between the stats; it never adds them. Every skater starts with the same overall and meets the season's training gates the same way. Everything after that, the season gives.");
		for (const TSharedPtr<FJsonValue>& V : Arr(Creator, TEXT("origins")))
		{
			const TSharedPtr<FJsonObject> O = V->AsObject();
			const FString Id = Str(O, TEXT("id"));
			const FString OStyle = Str(O, TEXT("style"));
			P.Items.Add(Line(Str(O, TEXT("origin")), OStyle.IsEmpty() ? TEXT("no style") : OStyle.Left(1).ToUpper() + OStyle.Mid(1), Str(O, TEXT("story")) + TEXT("\n\n") + Str(O, TEXT("shaped")), [this, Id]
			{
				TSharedRef<FJsonObject> A = Action(TEXT("new"));
				A->SetStringField(TEXT("origin"), Id);
				SheetOp(A);
			}));
		}
		return;
	}
	P.Title = Str(Sh, TEXT("name"));
	P.Subtitle = FString::Printf(TEXT("%s   ·   overall %.2f"), *Str(Sh, TEXT("originTitle")), Num(Sh, TEXT("overall")));
	P.Story = Str(Sh, TEXT("story"));
	P.Notes.Add(TEXT("Mara: ") + Str(Sh, TEXT("coach")));
	P.Notes.Add(Str(Sh, TEXT("shaped")));
	auto Set = [this](const TCHAR* Field, const TSharedPtr<FJsonValue>& Value)
	{
		TSharedRef<FJsonObject> A = Action(TEXT("set"));
		A->SetStringField(TEXT("field"), Field);
		A->SetField(TEXT("value"), Value);
		SheetOp(A);
	};
	// The name, from NAMES on the pad.
	TArray<FString> NameList;
	for (const TCHAR* N : Names) NameList.Add(N);
	if (!NameList.Contains(Str(Sh, TEXT("name")))) NameList.Insert(Str(Sh, TEXT("name")), 0);
	const FString NameNow = Str(Sh, TEXT("name"));
	auto Rename = [Set, NameList, NameNow](int32 By) { Set(TEXT("name"), MakeShared<FJsonValueString>(Cycle(NameList, NameNow, By))); };
	P.Items.Add(Line(FString::Printf(TEXT("Name   ◀  %s  ▶"), *NameNow), TEXT(""), TEXT("◀ ▶ through the names."), [Rename] { Rename(1); }, Rename));
	TArray<FString> Origins;
	for (const TSharedPtr<FJsonValue>& V : Arr(Creator, TEXT("origins"))) Origins.Add(Str(V->AsObject(), TEXT("id")));
	const FString OriginNow = Str(Sh, TEXT("origin"));
	auto Reorigin = [this, Origins, OriginNow](int32 By) { TSharedRef<FJsonObject> A = Action(TEXT("new")); A->SetStringField(TEXT("origin"), Cycle(Origins, OriginNow, By)); SheetOp(A); };
	P.Items.Add(Line(FString::Printf(TEXT("Origin   ◀  %s  ▶"), *Str(Sh, TEXT("originTitle"))), TEXT(""), TEXT("A new origin brings its own stats, build, style and dance; the name, height and costume stay."), [Reorigin] { Reorigin(1); }, Reorigin));
	// Stats: points come from one, A moves one to the focused stat.
	P.Items.Add(Header(TEXT("Stats")));
	int32 FromAt = 0;
	for (int32 S = 0; S < 5; ++S) if (SheetFrom == StatIds[S]) FromAt = S;
	auto From = [this, FromAt](int32 By) { SheetFrom = StatIds[Wrap(FromAt + By, 5)]; RebuildPage(); };
	P.Items.Add(Line(FString::Printf(TEXT("Points come from   ◀  %s  ▶"), StatTitles[FromAt]), TEXT(""), TEXT("Choose the stat to give; then A on another stat takes one point from it."), [From] { From(1); }, From));
	const TSharedPtr<FJsonObject> Stats = Obj(Sh, TEXT("stats"));
	const TSharedPtr<FJsonObject> Blocks = Obj(Sh, TEXT("blocks"));
	for (int32 S = 0; S < 5; ++S)
	{
		const bool bFrom = S == FromAt;
		const FString Why = bFrom ? FString() : Str(Blocks, *FString::Printf(TEXT("%s>%s"), StatIds[FromAt], StatIds[S]));
		const FString To = StatIds[S];
		FMenuItem Item = Line(StatTitles[S], FString::FromInt(int32(Num(Stats, StatIds[S]))),
			bFrom ? TEXT("Points are coming from this one.") : Why.IsEmpty() ? FString::Printf(TEXT("A: one point from %s to %s."), StatTitles[FromAt], StatTitles[S]) : Why,
			[this, To] { TSharedRef<FJsonObject> A = Action(TEXT("trade")); A->SetStringField(TEXT("from"), SheetFrom); A->SetStringField(TEXT("to"), To); SheetOp(A); },
			nullptr, !bFrom && Why.IsEmpty());
		Item.Meter = float(Num(Stats, StatIds[S])) / 100.f;
		P.Items.Add(Item);
	}
	P.Items.Add(Header(TEXT("Body")));
	const TSharedPtr<FJsonObject> Height = Obj(Creator, TEXT("height"));
	const double H = Num(Sh, TEXT("heightM"), 1.6);
	auto Grow = [Set, Height, H](int32 By) { Set(TEXT("heightM"), MakeShared<FJsonValueNumber>(FMath::Clamp(FMath::RoundToDouble((H + By * .01) * 100.0) / 100.0, Num(Height, TEXT("min"), 1.48), Num(Height, TEXT("max"), 1.78)))); };
	P.Items.Add(Line(FString::Printf(TEXT("Height   ◀  %.2f m  ▶"), H), TEXT(""), TEXT("Taller is a longer pendulum and more air to push through."), [Grow] { Grow(1); }, Grow));
	TArray<FString> Builds;
	FString BuildName, BuildBlurb;
	for (const TSharedPtr<FJsonValue>& V : Arr(Creator, TEXT("builds")))
	{
		const TSharedPtr<FJsonObject> B = V->AsObject();
		Builds.Add(Str(B, TEXT("id")));
		if (Str(B, TEXT("id")) == Str(Sh, TEXT("build"))) { BuildName = Str(B, TEXT("name")); BuildBlurb = Str(B, TEXT("blurb")); }
	}
	const FString BuildNow = Str(Sh, TEXT("build"));
	auto Rebuild = [Set, Builds, BuildNow](int32 By) { Set(TEXT("build"), MakeShared<FJsonValueString>(Cycle(Builds, BuildNow, By))); };
	P.Items.Add(Line(FString::Printf(TEXT("Build   ◀  %s  ▶"), *BuildName), TEXT(""), BuildBlurb, [Rebuild] { Rebuild(1); }, Rebuild));
	P.Items.Add(Header(TEXT("Look and style")));
	const int32 StyleNow = int32(Num(Sh, TEXT("style"), -1));
	const int32 Styles = CatalogList(TEXT("styles")).Num();
	const TSharedPtr<FJsonObject> St = At(CatalogList(TEXT("styles")), StyleNow);
	auto Restyle = [Set, StyleNow, Styles](int32 By) { Set(TEXT("style"), MakeShared<FJsonValueNumber>(Wrap(StyleNow + 1 + By, Styles + 1) - 1)); };
	P.Items.Add(Line(FString::Printf(TEXT("Skating style   ◀  %s  ▶"), St.IsValid() ? *Str(St, TEXT("title")) : TEXT("none")), TEXT(""), St.IsValid() ? Str(St, TEXT("blurb")) : TEXT("No style: nothing given, nothing taken."), [Restyle] { Restyle(1); }, Restyle));
	TArray<FString> DanceIds = {FString()};
	FString DanceName = TEXT("none");
	for (const TSharedPtr<FJsonValue>& V : Arr(Obj(Catalog, TEXT("motion")), TEXT("styles")))
	{
		DanceIds.Add(Str(V->AsObject(), TEXT("id")));
		if (Str(V->AsObject(), TEXT("id")) == Str(Sh, TEXT("dance"))) DanceName = Str(V->AsObject(), TEXT("name"));
	}
	const FString DanceNow = Str(Sh, TEXT("dance"));
	auto Redance = [Set, DanceIds, DanceNow](int32 By) { Set(TEXT("dance"), MakeShared<FJsonValueString>(Cycle(DanceIds, DanceNow, By))); };
	P.Items.Add(Line(FString::Printf(TEXT("Dance   ◀  %s  ▶"), *DanceName), TEXT(""), TEXT("The style their arms reach for while they're free."), [Redance] { Redance(1); }, Redance));
	TArray<FString> CostumeIds;
	FString CostumeName = Str(Sh, TEXT("costume"));
	for (const TSharedPtr<FJsonObject>& Skin : Costumes())
	{
		const FString Id = Str(Skin, TEXT("id"));
		const FString Key = Id.StartsWith(TEXT("design-")) ? TEXT("design:") + Id.Mid(7) : TEXT("preset:") + Id;
		CostumeIds.Add(Key);
		if (Key == Str(Sh, TEXT("costume"))) CostumeName = Str(Skin, TEXT("name"));
	}
	const FString CostumeNow = Str(Sh, TEXT("costume"));
	auto Redress = [Set, CostumeIds, CostumeNow](int32 By) { Set(TEXT("costume"), MakeShared<FJsonValueString>(Cycle(CostumeIds, CostumeNow, By))); };
	P.Items.Add(Line(FString::Printf(TEXT("Costume   ◀  %s  ▶"), *CostumeName), TEXT(""), TEXT("A preset, or one of your atelier designs."), [Redress] { Redress(1); }, Redress));
	P.Items.Add(Header(TEXT("Keep")));
	const int32 Slot = SheetSlot >= 0 ? SheetSlot : FirstEmpty(TEXT("skaters"));
	P.Items.Add(Line(FString::Printf(TEXT("Keep %s"), *NameNow), TEXT(""), TEXT("On Creation's shelf: skate them in Arcade and Exhibition, watch them in a showcase, or begin a career."), [this, Slot]
	{
		SheetSlot = Slot;
		TSharedRef<FJsonObject> A = Action(TEXT("save"));
		A->SetNumberField(TEXT("slot"), Slot);
		SheetOp(A);
	}, nullptr, Slot >= 0));
	if (SheetSlot >= 0)
	{
		P.Items.Add(Line(FString::Printf(TEXT("Begin a new career as %s →"), *NameNow), TEXT(""), TEXT("Your current career is kept in a dated file beside the save."), [this] { PushPage(TEXT("newcareer")); }));
	}
}

void AIceRunGameMode::BuildNewCareer(FMenuPage& P)
{
	P.Kicker = TEXT("CAREER");
	P.Accent = Accent(TEXT("career"));
	const TSharedPtr<FJsonObject> K = At(Arr(Obj(Latest.Raw, TEXT("studio")), TEXT("skaters")), SheetSlot);
	if (!K.IsValid()) { P.Title = TEXT("A new career"); P.Story = TEXT("Keep the skater first."); P.Items.Add(Line(TEXT("← Back"), TEXT(""), TEXT(""), [this] { PopPage(); })); return; }
	P.Title = TEXT("A new career");
	P.Subtitle = Str(K, TEXT("name"));
	P.Story = FString::Printf(TEXT("%s starts at the community rink with a new page in Mara's notebook: medals, XP, weeks and wear all begin again. Your current career is not lost: it is kept beside the save in a dated file."), *Str(K, TEXT("name")));
	P.Items.Add(Line(FString::Printf(TEXT("Begin as %s →"), *Str(K, TEXT("name"))), TEXT(""), TEXT(""), [this]
	{
		TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
		Payload->SetNumberField(TEXT("slot"), SheetSlot);
		SendOp(TEXT("newCareer"), Payload);
		NoticeText = TEXT("A new career begins. Your last one is kept beside the save, dated.");
		OpenMenu(TEXT("season"));
	}));
	P.Items.Add(Line(TEXT("Not yet"), TEXT(""), TEXT(""), [this] { PopPage(); }));
}

void AIceRunGameMode::BuildCareerStyle(FMenuPage& P)
{
	P.Kicker = TEXT("CAREER");
	P.Accent = Accent(TEXT("career"));
	const TSharedPtr<FJsonObject> Career = CareerObject();
	const int32 Now = int32(Num(Career, TEXT("style"), -1));
	const TArray<TSharedPtr<FJsonValue>>& Mastery = Arr(Career, TEXT("styleMastery"));
	P.Title = TEXT("Skating style");
	P.Subtitle = TEXT("What kind of skater you are");
	P.Story = TEXT("Each style gives and costs (game/styles.ts). Choosing is free and brings its cost at once and half its benefit; weeks of style drills bring the rest. A style you put down keeps what you drilled, but rusts at every season step.");
	const TArray<TSharedPtr<FJsonValue>>& Styles = CatalogList(TEXT("styles"));
	for (int32 I = -1; I < Styles.Num(); ++I)
	{
		const TSharedPtr<FJsonObject> S = At(Styles, I);
		FMenuItem Item = Line(FString::Printf(TEXT("%s%s"), I == Now ? TEXT("● ") : TEXT(""), S.IsValid() ? *Str(S, TEXT("title")) : TEXT("No style")),
			I >= 0 && Mastery.IsValidIndex(I) ? FString::Printf(TEXT("drilled %d%%"), FMath::RoundToInt(Mastery[I]->AsNumber() * 100.0)) : FString(),
			S.IsValid() ? Str(S, TEXT("blurb")) : TEXT("Nothing given, nothing taken."), [this, I]
			{
				TSharedRef<FJsonObject> O = MakeShared<FJsonObject>();
				O->SetNumberField(TEXT("style"), I);
				TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
				Payload->SetObjectField(TEXT("options"), O);
				SendOp(TEXT("careerStyle"), Payload);
			});
		if (I >= 0 && Mastery.IsValidIndex(I)) Item.Meter = float(Mastery[I]->AsNumber());
		P.Items.Add(Item);
	}
	if (Now >= 0 && Now < Styles.Num())
	{
		const bool bCan = Num(Career, TEXT("weeks")) >= 1 && Mastery.IsValidIndex(Now) && Mastery[Now]->AsNumber() < 1.0;
		P.Items.Add(Line(FString::Printf(TEXT("Drill %s"), *Str(At(Styles, Now), TEXT("title"))), TEXT("1 week"), TEXT("A quarter more of the style's benefit."), [this]
		{
			TSharedRef<FJsonObject> O = MakeShared<FJsonObject>();
			O->SetBoolField(TEXT("drill"), true);
			TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
			Payload->SetObjectField(TEXT("options"), O);
			SendOp(TEXT("careerStyle"), Payload);
		}, nullptr, bCan));
	}
}
