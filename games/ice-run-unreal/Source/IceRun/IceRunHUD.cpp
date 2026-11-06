#include "IceRunHUD.h"
#include "IceRunGameMode.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"

namespace
{
	const FLinearColor Ink(.92f, .96f, 1.f, 1.f);
	const FLinearColor Soft(.72f, .80f, .88f, 1.f);
	const FLinearColor Champagne(.86f, .76f, .58f, 1.f);
	const FLinearColor Warning(1.f, .62f, .48f, 1.f);

	FString Clock(double Seconds)
	{
		const int32 S = FMath::Max(0, FMath::FloorToInt32(Seconds));
		return FString::Printf(TEXT("%02d:%02d"), S / 60, S % 60);
	}

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
}

void AIceRunHUD::Line(const FString& Text, float X, float& Y, const FLinearColor& Color, float Scale, UFont* Font)
{
	if (Text.IsEmpty())
	{
		return;
	}
	if (!bMeasuring)
	{
		FCanvasTextItem Item(FVector2D(X, Y), FText::FromString(Text), Font, Color);
		Item.Scale = FVector2D(Scale, Scale);
		Item.EnableShadow(FLinearColor(0.f, 0.f, 0.f, .65f));
		Canvas->DrawItem(Item);
	}
	float W = 0.f, H = 0.f;
	Canvas->StrLen(Font, Text, W, H);
	Y += H * Scale * 1.15f;
}

void AIceRunHUD::Panel(float X, float Y, float W, float H, const FLinearColor& Color)
{
	FCanvasTileItem Tile(FVector2D(X, Y), FVector2D(W, H), Color);
	Tile.BlendMode = SE_BLEND_Translucent;
	Canvas->DrawItem(Tile);
}

void AIceRunHUD::TutorialCard(const TSharedPtr<FJsonObject>& T, float U)
{
	UFont* Large = GEngine->GetLargeFont();
	UFont* Medium = GEngine->GetMediumFont();
	const float Margin = 36.f * U;
	const float Width = FMath::Min(Canvas->ClipX * .34f, 560.f * U);
	// Laid out once to measure, then drawn, so the card fits its words and sits on the bottom edge.
	float Height = 0.f;
	for (const bool bDraw : {false, true})
	{
		bMeasuring = !bDraw;
		const float Top = bDraw ? Canvas->ClipY - Margin - 40.f * U - Height : 0.f;
		if (bDraw)
		{
			Panel(Margin - 14.f * U, Top - 12.f * U, Width + 28.f * U, Height + 20.f * U, FLinearColor(.02f, .04f, .07f, .5f));
		}
		float Y = Top;
	const int32 Index = int32(Num(T, TEXT("index")));
	const int32 Total = int32(Num(T, TEXT("total")));
	const FString Stage = Str(T, TEXT("stage")).ToUpper();
	Line(FString::Printf(TEXT("STEP %d OF %d%s%s"), FMath::Min(Index + 1, Total), Total, Stage.IsEmpty() ? TEXT("") : TEXT("   ·   "), *Stage), Margin, Y, Champagne, .85f * U, Medium);
	Line(Str(T, TEXT("title")), Margin, Y, Ink, 1.3f * U, Large);
	Paragraph(Str(T, TEXT("prose")), Margin, Y, Width, Soft, .9f * U, Medium);
	Y += 6.f * U;
	const FString Message = Str(T, TEXT("message"));
	if (!Message.IsEmpty())
	{
		Paragraph(TEXT("✓ ") + Message, Margin, Y, Width, Champagne, 1.f * U, Medium);
	}
	Paragraph(Str(T, TEXT("how")), Margin, Y, Width, Ink, 1.f * U, Medium);
	Paragraph(Str(T, TEXT("keys")), Margin, Y, Width, Soft, .85f * U, Medium);
	Paragraph(Str(T, TEXT("unproven")), Margin, Y, Width, Warning, .85f * U, Medium);
	Paragraph(Str(T, TEXT("offer")), Margin, Y, Width, Champagne, .9f * U, Medium);
	// The hold: how long the step's condition has held, of how long it must.
	Y += 8.f * U;
	const float Fraction = FMath::Clamp(float(Num(T, TEXT("fraction"))), 0.f, 1.f);
	if (bDraw)
	{
		Panel(Margin, Y, Width, 8.f * U, FLinearColor(1.f, 1.f, 1.f, .14f));
		Panel(Margin, Y, Width * Fraction, 8.f * U, FLinearColor(.86f, .76f, .58f, .95f));
	}
	Y += 16.f * U;
	Paragraph(Str(T, TEXT("status")) + TEXT("    ·    Esc / Menu: skip or change lesson"), Margin, Y, Width, Soft, .85f * U, Medium);
	Height = Y - Top;
	}
	bMeasuring = false;
}

void AIceRunHUD::PauseMenu(const AIceRunGameMode* Mode, float U)
{
	DrawPage(Mode, U);
}

void AIceRunHUD::DrawPage(const AIceRunGameMode* Mode, float U)
{
	UFont* Large = GEngine->GetLargeFont();
	UFont* Medium = GEngine->GetMediumFont();
	const AIceRunGameMode::FMenuPage& Page = Mode->Page();
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	// The list on the left, the story and tables on the right; the skater turns in the gap.
	const float LeftX = W * .035f, LeftW = W * .36f, RightX = W * .62f, RightW = W * .345f;
	Panel(0.f, 0.f, LeftX + LeftW + 24.f * U, H, FLinearColor(.01f, .02f, .04f, .72f));
	Panel(RightX - 24.f * U, 0.f, W - RightX + 24.f * U, H, FLinearColor(.01f, .02f, .04f, .55f));
	float Y = H * .07f;
	Line(Page.Title, LeftX, Y, Ink, 1.7f * U, Large);
	Paragraph(Page.Subtitle, LeftX, Y, LeftW, Champagne, .95f * U, Medium);
	Y += 14.f * U;
	// The list scrolls to keep the focus in view.
	const float RowH = 31.f * U;
	const float ListTop = Y, ListBottom = H * .74f;
	const int32 Fits = FMath::Max(1, int32((ListBottom - ListTop) / RowH));
	const int32 Focus = Mode->MenuIndex();
	const int32 First = FMath::Clamp(Focus - Fits / 2, 0, FMath::Max(0, Page.Items.Num() - Fits));
	for (int32 I = First; I < Page.Items.Num() && I < First + Fits; ++I)
	{
		const AIceRunGameMode::FMenuItem& Item = Page.Items[I];
		float RY = ListTop + (I - First) * RowH;
		if (Item.bHeader)
		{
			float HY = RY + 8.f * U;
			Line(Item.Label.ToUpper(), LeftX, HY, Champagne, .8f * U, Medium);
			continue;
		}
		const bool bAt = I == Focus;
		if (bAt)
		{
			Panel(LeftX - 12.f * U, RY - 3.f * U, LeftW + 24.f * U, RowH - 2.f * U, FLinearColor(.86f, .76f, .58f, .22f));
		}
		float X = LeftX;
		if (Item.Chip.A > 0.f)
		{
			Panel(X, RY + 2.f * U, 18.f * U, 18.f * U, FLinearColor(Item.Chip.R, Item.Chip.G, Item.Chip.B, 1.f));
			X += 26.f * U;
		}
		const FLinearColor Colour = !Item.bEnabled ? FLinearColor(.5f, .55f, .6f, 1.f) : bAt ? Ink : Soft;
		float LY = RY;
		Line(Item.Label, X, LY, Colour, 1.02f * U, Medium);
		if (!Item.Value.IsEmpty())
		{
			float VW = 0.f, VH = 0.f;
			Canvas->StrLen(Medium, Item.Value, VW, VH);
			float VY = RY + 2.f * U;
			Line(Item.Value, LeftX + LeftW - VW * .9f * U, VY, Item.bEnabled ? Champagne : FLinearColor(.5f, .55f, .6f, 1.f), .9f * U, Medium);
		}
	}
	if (First > 0)
	{
		float AY = ListTop - 18.f * U;
		Line(TEXT("▲"), LeftX + LeftW * .5f, AY, Soft, .8f * U, Medium);
	}
	if (First + Fits < Page.Items.Num())
	{
		float AY = ListTop + Fits * RowH;
		Line(TEXT("▼"), LeftX + LeftW * .5f, AY, Soft, .8f * U, Medium);
	}
	// The focused line's words, under the list.
	float DY = H * .77f;
	if (Page.Items.IsValidIndex(Focus))
	{
		Paragraph(Page.Items[Focus].Detail, LeftX, DY, LeftW, Soft, .9f * U, Medium);
	}
	float KY = H - 34.f * U;
	Line(TEXT("A / Enter chooses   ·   ◀ ▶ changes   ·   B / Esc back"), LeftX, KY, FLinearColor(.6f, .66f, .72f, 1.f), .8f * U, Medium);
	// The right side: the story, then notes, then a table.
	float SY = H * .07f;
	if (!Page.Story.IsEmpty())
	{
		Paragraph(Page.Story, RightX, SY, RightW, Ink, .95f * U, Medium);
		SY += 12.f * U;
	}
	for (const FString& Note : Page.Notes)
	{
		Paragraph(Note, RightX, SY, RightW, Champagne, .9f * U, Medium);
		SY += 4.f * U;
	}
	if (Page.Strip.Bars > 0 && Page.Strip.Seconds > 0.0)
	{
		// Room above the band for the names that sit over it.
		SY += 26.f * U;
		Strip(Page.Strip, Mode->MenuIndex() - Page.Strip.FirstCueItem, RightX, SY, RightW, U);
	}
	if (!Page.RowsTitle.IsEmpty() && Page.Rows.Num() > 0)
	{
		SY += 14.f * U;
		Line(Page.RowsTitle.ToUpper(), RightX, SY, Champagne, .8f * U, Medium);
		for (const AIceRunGameMode::FMenuRow& Row : Page.Rows)
		{
			if (SY > H - 60.f * U)
			{
				break;
			}
			const FLinearColor C = Row.bYou ? Champagne : Soft;
			float RY = SY;
			Line(Row.Left, RightX, RY, C, .9f * U, Medium);
			float MY = SY;
			Line(Row.Middle, RightX + 34.f * U, MY, C, .9f * U, Medium);
			if (!Row.Right.IsEmpty())
			{
				float RW = 0.f, RH = 0.f;
				Canvas->StrLen(Medium, Row.Right, RW, RH);
				float TY = SY;
				Line(Row.Right, RightX + RightW - RW * .9f * U, TY, C, .9f * U, Medium);
			}
			SY = FMath::Max(RY, MY);
		}
	}
}

void AIceRunHUD::Strip(const AIceRunGameMode::FMenuStrip& S, int32 Focused, float X, float& Y, float W, float U)
{
	// main.gd timeline_strip: the program's seconds across, a tick per bar (taller each phrase), the half-time line, a block per element.
	UFont* Medium = GEngine->GetMediumFont();
	const float Top = Y, Band = 40.f * U;
	auto XOf = [&](double T) { return X + float(FMath::Clamp(T / S.Seconds, 0.0, 1.0)) * W; };
	Panel(X, Top, W, Band, FLinearColor(.04f, .08f, .12f, .9f));
	const float Half = XOf(S.Seconds * .5);
	Panel(Half - .5f * U, Top - 4.f * U, 1.f * U, Band + 8.f * U, FLinearColor(.86f, .76f, .58f, .5f));
	for (int32 B = 0; B <= S.Bars; ++B)
	{
		const bool bPhrase = B % S.BarsPerPhrase == 0;
		const float BX = XOf(S.Offset + B * S.BarSeconds);
		const float From = bPhrase ? 0.f : Band * .6f;
		Panel(BX, Top + From, (bPhrase ? 2.f : 1.f) * U, Band - From, FLinearColor(1.f, 1.f, 1.f, bPhrase ? .35f : .12f));
	}
	const FLinearColor Asked = S.bOk ? FLinearColor(.62f, .85f, .77f, 1.f) : FLinearColor(.94f, .54f, .48f, 1.f);
	const float BarW = FMath::Max(4.f * U, XOf(S.BarSeconds) - X - 2.f * U);
	for (int32 I = 0; I < S.Cues.Num(); ++I)
	{
		const AIceRunGameMode::FMenuStrip::FCue& C = S.Cues[I];
		const float CX = XOf(C.At);
		if (I == Focused)
		{
			Panel(CX - 2.f * U, Top + 2.f * U, BarW + 4.f * U, Band - 4.f * U, FLinearColor(1.f, 1.f, 1.f, .9f));
		}
		Panel(CX, Top + 4.f * U, BarW, Band - 8.f * U, C.bRequired ? Asked : Champagne);
		// Names alternate above and below the band so neighbours two bars apart stay readable.
		float TY = I % 2 == 0 ? Top + Band + 3.f * U : Top - 18.f * U;
		Line(C.Title.Len() > 16 ? C.Title.Left(15) + TEXT("…") : C.Title, CX, TY, I == Focused ? Ink : Soft, .7f * U, Medium);
	}
	Y = Top + Band + 26.f * U;
}

void AIceRunHUD::Paragraph(const FString& Text, float X, float& Y, float Width, const FLinearColor& Color, float Scale, UFont* Font)
{
	// Word-wrapped to Width, line by line; the engine's coaching runs to a sentence or three.
	TArray<FString> Paragraphs;
	Text.ParseIntoArray(Paragraphs, TEXT("\n"), false);
	for (const FString& P : Paragraphs)
	{
		TArray<FString> Words;
		P.ParseIntoArrayWS(Words);
		FString Current;
		for (const FString& Word : Words)
		{
			const FString Next = Current.IsEmpty() ? Word : Current + TEXT(" ") + Word;
			float W = 0.f, H = 0.f;
			Canvas->StrLen(Font, Next, W, H);
			if (W * Scale > Width && !Current.IsEmpty())
			{
				Line(Current, X, Y, Color, Scale, Font);
				Current = Word;
			}
			else
			{
				Current = Next;
			}
		}
		Line(Current, X, Y, Color, Scale, Font);
	}
}

void AIceRunHUD::DrawHUD()
{
	Super::DrawHUD();
	const AIceRunGameMode* Mode = GetWorld() ? GetWorld()->GetAuthGameMode<AIceRunGameMode>() : nullptr;
	if (!Mode || !Canvas)
	{
		return;
	}
	UFont* Large = GEngine->GetLargeFont();
	UFont* Medium = GEngine->GetMediumFont();
	const float U = Canvas->ClipY / 900.f;
	const float Margin = 36.f * U;
	const FIceFrame& F = Mode->Frame();

	float Y = Margin;
	if (!F.bValid)
	{
		Line(Mode->Faulted() ? TEXT("The skating engine stopped.") : TEXT("Starting Ice Lab…"), Margin, Y, Ink, 1.6f * U, Large);
		Paragraph(Mode->Notice(), Margin, Y, Canvas->ClipX - 2 * Margin, Warning, 1.1f * U, Medium);
		return;
	}
	if (Mode->Paused())
	{
		// A menu page is the whole screen's words; the skating readouts wait underneath.
		DrawPage(Mode, U);
		return;
	}
	const FIceState& S = F.State;
	const TSharedPtr<FJsonObject>& Raw = F.Raw;

	// Top left: the move and the speed, the edges, the technical running total.
	FString Move = FString::Printf(TEXT("%s   ·   %.1f m/s"), *F.MoveLabel, S.Vel.Size());
	bool bFootChange = false;
	if (Raw->TryGetBoolField(TEXT("footChange"), bFootChange) && bFootChange)
	{
		Move += TEXT("   ·   FOOT CHANGE!");
	}
	if (!F.Combo.IsEmpty())
	{
		Move += FString::Printf(TEXT("   ·   COMBINATION %s"), *F.Combo);
	}
	Line(Move, Margin, Y, Ink, 1.25f * U, Large);
	Line(FString::Printf(TEXT("Left %s   ·   Right %s"), *F.Edge[0], *F.Edge[1]), Margin, Y, Soft, 1.05f * U, Medium);
	FString Technical = FString::Printf(TEXT("Jump TES %.2f"), F.Technical);
	if (F.SpinLevel >= 0)
	{
		Technical += FString::Printf(TEXT("   ·   Last spin: level %s"), F.SpinLevel > 0 ? *FString::FromInt(F.SpinLevel) : TEXT("B"));
	}
	const TSharedPtr<FJsonObject> Routine = Obj(Raw, TEXT("routine"));
	const TSharedPtr<FJsonObject> Pcs = Obj(Routine, TEXT("pcsScore"));
	if (Pcs.IsValid())
	{
		Technical += FString::Printf(TEXT("   ·   PCS %.2f"), Num(Pcs, TEXT("total")));
	}
	Line(Technical, Margin, Y, Champagne, 1.05f * U, Medium);
	const TSharedPtr<FJsonObject> Landed = Obj(Raw, TEXT("jump"));
	if (Landed.IsValid())
	{
		bool bClean = false;
		Landed->TryGetBoolField(TEXT("clean"), bClean);
		Line(FString::Printf(TEXT("Last jump: %s, %.2f rev, %s"), *Str(Landed, TEXT("kind")), Num(Landed, TEXT("rotations")), bClean ? TEXT("clean") : TEXT("not clean")), Margin, Y, Soft, .95f * U, Medium);
	}

	// Top right: what is being skated, on what, through which camera, and the clock.
	{
		const FString Setup = Mode->Setup().IsEmpty() ? FString(TEXT("Original schemes")) : Mode->Setup();
		const double Seconds = Routine.IsValid() ? Num(Routine, TEXT("seconds")) : F.Elapsed;
		const FString Right = FString::Printf(TEXT("%s   ·   %s   ·   %s camera   ·   %s"), *F.Mode, *Setup, *Mode->CameraName(), *Clock(Seconds));
		float W = 0.f, H = 0.f;
		Canvas->StrLen(Medium, Right, W, H);
		float RY = Margin;
		Line(Right, Canvas->ClipX - Margin - W * 1.05f * U, RY, Soft, 1.05f * U, Medium);
	}

	// Bottom: the coach line for this mode, as main.gd update_hud chooses it.
	FString Title, Tip, Progress, Cue;
	const TSharedPtr<FJsonObject> Result = Obj(Raw, TEXT("result"));
	if (F.bFinished && Result.IsValid())
	{
		Title = Str(Result, TEXT("title"));
		Tip = Str(Result, TEXT("detail"));
		const FString BodyNote = Str(Result, TEXT("body"));
		if (!BodyNote.IsEmpty())
		{
			Tip += TEXT("\n") + BodyNote;
		}
		Progress = TEXT("R to skate again   ·   M for another mode");
	}
	else if (Routine.IsValid())
	{
		const TArray<TSharedPtr<FJsonValue>>* Sequence = nullptr;
		const int32 Index = int32(Num(Routine, TEXT("index")));
		const int32 Count = Routine->TryGetArrayField(TEXT("sequence"), Sequence) ? Sequence->Num() : 0;
		if (Index < Count)
		{
			Title = (*Sequence)[Index]->AsString();
			Tip = Str(Routine, TEXT("how"));
			Progress = FString::Printf(TEXT("%02d / %02d    ·    %s"), Index + 1, Count, *Str(Routine, TEXT("title")));
			// On its music: when this element's bar comes round, and how the last one went (main.gd cue_line; shown, not scored).
			const TArray<TSharedPtr<FJsonValue>>* Cues = nullptr;
			if (Routine->TryGetArrayField(TEXT("cues"), Cues) && Cues->IsValidIndex(Index))
			{
				const TSharedPtr<FJsonObject> Next = (*Cues)[Index]->AsObject();
				const double Elapsed = Num(Routine, TEXT("elapsed"));
				const double Wait = Num(Next, TEXT("at")) - Elapsed;
				Cue = Wait > .5 ? FString::Printf(TEXT("♪  Your bar in %d s"), FMath::CeilToInt32(Wait))
					: Elapsed <= Num(Next, TEXT("late")) ? FString(TEXT("♪  Your bar is now")) : FString(TEXT("♪  Past your bar"));
				const FString Last = Index > 0 ? Str((*Cues)[Index - 1]->AsObject(), TEXT("result")) : FString();
				const TCHAR* Said = Last == TEXT("on") ? TEXT("on the music") : Last == TEXT("early") ? TEXT("early") : Last == TEXT("late") ? TEXT("late") : nullptr;
				if (Said)
				{
					Cue += FString::Printf(TEXT("   ·   last: %s"), Said);
				}
			}
		}
		else
		{
			Title = TEXT("Program skated");
			Tip = TEXT("Skate it out to the end of the music.");
		}
	}
	else if (F.Mode == TEXT("rookie"))
	{
		const TSharedPtr<FJsonObject> Rookie = Obj(Raw, TEXT("rookie"));
		Title = Str(Rookie, TEXT("title"));
		Tip = Str(Rookie, TEXT("hint"));
		Progress = FString::Printf(TEXT("%d / 8 gates · %d clean"), int32(Num(Rookie, TEXT("index"))), int32(Num(Rookie, TEXT("cleared"))));
	}
	else if (F.Mode == TEXT("timed"))
	{
		const TSharedPtr<FJsonObject> Run = Obj(Raw, TEXT("run"));
		Title = TEXT("Follow the lights");
		Tip = TEXT("Carve toward the next marker. Push through the curve and keep your line.");
		Progress = FString::Printf(TEXT("%d lights · %d points"), int32(Num(Run, TEXT("collected"))), int32(Num(Run, TEXT("score"))));
	}
	else if (F.Mode == TEXT("free"))
	{
		const TSharedPtr<FJsonObject> Lesson = Obj(Raw, TEXT("lesson"));
		Title = Str(Lesson, TEXT("title"));
		Tip = Str(Lesson, TEXT("hint"));
		int32 Learned = 0;
		const TArray<TSharedPtr<FJsonValue>>* Done = nullptr;
		if (Lesson.IsValid() && Lesson->TryGetArrayField(TEXT("done"), Done))
		{
			for (const TSharedPtr<FJsonValue>& D : *Done)
			{
				Learned += D->AsBool() ? 1 : 0;
			}
		}
		Progress = FString::Printf(TEXT("%02d / 07  practice elements"), Learned);
	}
	if (S.bFallen && !F.bFinished)
	{
		Title = TEXT("Find your feet.");
		Tip = TEXT("A fall is part of skating. ") + F.Recover;
	}
	const float Width = FMath::Min(Canvas->ClipX - 2 * Margin, 980.f * U);
	const TSharedPtr<FJsonObject> Tutorial = Obj(Raw, TEXT("tutorial"));
	if (Tutorial.IsValid() && !F.bFinished)
	{
		TutorialCard(Tutorial, U);
	}
	else
	{
		float BY = Canvas->ClipY - Margin - 150.f * U;
		Line(Title, Margin, BY, Ink, 1.3f * U, Large);
		Paragraph(Tip, Margin, BY, Width, Soft, 1.0f * U, Medium);
		Line(Progress, Margin, BY, Champagne, .95f * U, Medium);
		Line(Cue, Margin, BY, Ink, .95f * U, Medium);
	}

	float NY = Canvas->ClipY - Margin - 20.f * U;
	if (!Mode->Notice().IsEmpty())
	{
		float NoteY = Canvas->ClipY - Margin - 190.f * U;
		Paragraph(Mode->Notice(), Margin, NoteY, Width, Mode->Faulted() ? Warning : Soft, .95f * U, Medium);
	}
	const FString Keys = TEXT("Esc / Menu: lessons and more  ·  Tab setup  ·  M mode  ·  R restart  ·  V camera  ·  F9 save replay  ·  F11 fullscreen");
	float W = 0.f, H = 0.f;
	Canvas->StrLen(Medium, Keys, W, H);
	Line(Keys, Canvas->ClipX - Margin - W * .85f * U, NY, FLinearColor(.6f, .66f, .72f, 1.f), .85f * U, Medium);
	BalanceMeter(Obj(Raw, TEXT("balance")), Obj(Raw, TEXT("steady")), U);
}

void AIceRunHUD::BalanceMeter(const TSharedPtr<FJsonObject>& B, const TSharedPtr<FJsonObject>& Steady, float U)
{
	if (!B.IsValid())
	{
		return;
	}
	UFont* Medium = GEngine->GetMediumFont();
	const double FallLean = FMath::Max(.1, Num(B, TEXT("fallLean"), 1.13));
	const double Lean = Num(B, TEXT("lean"));
	const double Edge = FMath::Min(Num(B, TEXT("edge")), FallLean);
	double Limit = -1.0;
	B->TryGetNumberField(TEXT("limit"), Limit);
	const float W = 420.f * U, H = 10.f * U;
	const float X0 = (Canvas->ClipX - W) * .5f, Y0 = Canvas->ClipY - 70.f * U;
	const float Mid = X0 + W * .5f;
	// The sim's lean is positive toward her left: from behind, the screen's left.
	auto At = [&](double L) { return Mid - float(FMath::Clamp(L / FallLean, -1.0, 1.0)) * W * .5f; };
	Panel(X0, Y0, W, H, FLinearColor(.9f, .35f, .3f, .35f));
	Panel(At(Edge), Y0, At(-Edge) - At(Edge), H, FLinearColor(.45f, .85f, .6f, .55f));
	if (Limit > 0.0)
	{
		for (const double L : {Limit, -Limit})
		{
			Panel(At(L) - 1.f * U, Y0 - 4.f * U, 2.f * U, H + 8.f * U, FLinearColor(.86f, .76f, .58f, .95f));
		}
	}
	Panel(Mid - .5f * U, Y0 - 2.f * U, 1.f * U, H + 4.f * U, FLinearColor(1.f, 1.f, 1.f, .5f));
	const bool bOver = FMath::Abs(Lean) > Edge;
	Panel(At(Lean) - 4.f * U, Y0 - 5.f * U, 8.f * U, H + 10.f * U, bOver ? FLinearColor(1.f, .55f, .45f, 1.f) : FLinearColor(1.f, 1.f, 1.f, 1.f));
	FString Label = TEXT("Balance: green is the lean your speed can hold");
	if (Steady.IsValid())
	{
		const double Held = Num(Steady, TEXT("held"));
		Label += FString::Printf(TEXT("   ·   steadying hand: %s%s"), *Str(Steady, TEXT("name")), Held > .01 ? TEXT(", holding") : TEXT(""));
	}
	float LW = 0.f, LH = 0.f;
	Canvas->StrLen(Medium, Label, LW, LH);
	float LY = Y0 + H + 6.f * U;
	Line(Label, Mid - LW * .8f * U * .5f, LY, Soft, .8f * U, Medium);
}
