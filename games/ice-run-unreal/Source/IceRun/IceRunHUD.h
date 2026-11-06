#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "IceRunGameMode.h"
#include "IceRunHUD.generated.h"

/**
 * The live readout of scripts/main.gd update_hud: the move and speed, the
 * edges, the running jump TES and last spin level, the coach line for the
 * mode being skated, and the result when a run ends. Words come from the
 * engine; nothing here recalculates a score.
 */
UCLASS()
class AIceRunHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

private:
	void Line(const FString& Text, float X, float& Y, const FLinearColor& Color, float Scale, UFont* Font);
	void Paragraph(const FString& Text, float X, float& Y, float Width, const FLinearColor& Color, float Scale, UFont* Font);
	void Panel(float X, float Y, float W, float H, const FLinearColor& Color);
	/** A lesson's card (game/tutorial.ts via the bridge): the step, its words on this pad, its hold. */
	void TutorialCard(const TSharedPtr<FJsonObject>& Tutorial, float U);
	void PauseMenu(const class AIceRunGameMode* Mode, float U);
	void DrawPage(const class AIceRunGameMode* Mode, float U);
	/** The music page's program on its bars; Focused is the cue under the list's focus, or out of range. */
	void Strip(const AIceRunGameMode::FMenuStrip& S, int32 Focused, float X, float& Y, float W, float U);
	/** The balance meter: the lean now against what this speed's edge can hold, the hand's limit, where she falls. */
	void BalanceMeter(const TSharedPtr<FJsonObject>& Balance, const TSharedPtr<FJsonObject>& Steady, float U);
	/** True while laying a card out to measure it: Line and Paragraph only advance. */
	bool bMeasuring = false;
};
