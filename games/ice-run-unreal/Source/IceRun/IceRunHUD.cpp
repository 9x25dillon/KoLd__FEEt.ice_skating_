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
	UFont* Large = GEngine->GetLargeFont();
	UFont* Medium = GEngine->GetMediumFont();
	Panel(0.f, 0.f, Canvas->ClipX, Canvas->ClipY, FLinearColor(.01f, .02f, .04f, .62f));
	const float X = Canvas->ClipX * .5f - 330.f * U;
	float Y = Canvas->ClipY * .14f;
	const FIceFrame& F = Mode->Frame();
	FString Title = TEXT("Paused");
	FString Sub = TEXT("A / Enter chooses  ·  ◀ ▶ changes  ·  B / Esc goes back to the ice");
	const TSharedPtr<FJsonObject> Result = Obj(F.Raw, TEXT("result"));
	if (F.bValid && F.bFinished && Result.IsValid())
	{
		Title = Str(Result, TEXT("title"));
		Sub = Str(Result, TEXT("detail"));
	}
	Line(Title, X, Y, Ink, 1.6f * U, Large);
	Paragraph(Sub, X, Y, 660.f * U, Soft, .95f * U, Medium);
	Y += 14.f * U;
	const TArray<AIceRunGameMode::FMenuItem>& Items = Mode->MenuItems();
	for (int32 I = 0; I < Items.Num(); ++I)
	{
		const bool bAt = I == Mode->MenuIndex();
		if (bAt)
		{
			Panel(X - 12.f * U, Y - 3.f * U, 680.f * U, 30.f * U, FLinearColor(.86f, .76f, .58f, .22f));
		}
		Line(Items[I].Label, X, Y, bAt ? Ink : Soft, 1.05f * U, Medium);
		Y += 4.f * U;
	}
	if (Items.IsValidIndex(Mode->MenuIndex()))
	{
		Y += 12.f * U;
		Paragraph(Items[Mode->MenuIndex()].Detail, X, Y, 660.f * U, Champagne, .9f * U, Medium);
	}
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
	FString Title, Tip, Progress;
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
	if (Mode->Paused())
	{
		PauseMenu(Mode, U);
	}
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
