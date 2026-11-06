#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "Dom/JsonObject.h"
#include "IcePaddles.h"
#include "IceRunPlayerController.generated.h"

/** What the player asked of the game itself, this frame: not skating input. */
struct FIceMenuPresses
{
	bool bRestart = false;
	bool bCycleCamera = false;
	bool bCycleSetup = false;
	bool bCycleMode = false;
	bool bFullscreen = false;
	bool bExport = false;
	/** Esc / the pad's Menu button: the pause menu. */
	bool bPause = false;
	// Menu navigation; the game reads these only while its menu is open.
	bool bUp = false;
	bool bDown = false;
	bool bLeft = false;
	bool bRight = false;
	bool bAccept = false;
	bool bBack = false;
};

/**
 * Reads the keyboard and the first gamepad into the bridge's `controls`,
 * exactly as scripts/main.gd builds them: in a setup (scheme 3) the raw pad
 * as the browser Gamepad API orders it ({axes, buttons, keys, connected}, Y
 * down), so game/full-controls.ts does every mapping; in the original schemes
 * the shaped sticks and named buttons main.gd's controls() sends.
 */
UCLASS()
class AIceRunPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AIceRunPlayerController();
	virtual void PlayerTick(float DeltaTime) override;

	/** The controls for one `frame` request; clears the presses it reports. */
	TSharedRef<FJsonObject> Controls(float Dt, int32 Scheme);
	/** Whether the original schemes' low pose (U / D-pad down) is held. */
	bool LowHeld() const;
	/** The game's own keys pressed since the last call. */
	FIceMenuPresses TakeMenuPresses();
	/** Forgets skating presses made while the menu was open, so resuming is not a push. */
	void ClearPending();

	/**
	 * main.gd's Elite paddle layouts: 0 the controller's own profile (the game leaves them alone),
	 * 1 Footwork (LB, RB, A, R3), 2 Moves (X, B, A, Y), 3 the game's own layer (buttons 18-21,
	 * game/full-controls.ts PADDLE_POSITIONS). The names are main.gd's.
	 */
	static constexpr int32 PaddleLayer = 3;
	int32 PaddleLayout = 0;
	const FIcePaddles& Paddles() const { return Elite; }

private:
	TSharedRef<FJsonObject> Hardware() const;
	float Axis(const FKey& Key) const;
	bool Down(const FKey& Key) const;

	FIcePaddles Elite;
	bool bPushPending = false;
	bool bToePending = false;
	bool bTrickPending = false;
	bool bPairHoldPending = false;
	bool bPairLiftPending = false;
	bool bPreviousLt = false;
	float LtTime = 0.f;
	FIceMenuPresses Menu;
};
