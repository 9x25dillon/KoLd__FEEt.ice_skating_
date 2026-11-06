#include "IceRunPlayerController.h"
#include "IceSimSpace.h"
#include "GameFramework/PlayerInput.h"
#include "Framework/Application/SlateApplication.h"
#include "Camera/PlayerCameraManager.h"
#include "InputCoreTypes.h"

namespace
{
	/** main.gd shaped_stick: a 0.22 dead zone, then a gentle curve. */
	FVector2D ShapedStick(const FVector2D& Raw)
	{
		const double Length = FMath::Min(Raw.Size(), 1.0);
		return Length < .22 ? FVector2D::ZeroVector : Raw.GetSafeNormal() * FMath::Pow((Length - .22) / .78, 1.35);
	}

	TArray<TSharedPtr<FJsonValue>> Numbers(std::initializer_list<double> Values)
	{
		TArray<TSharedPtr<FJsonValue>> Out;
		for (const double V : Values)
		{
			Out.Add(MakeShared<FJsonValueNumber>(V));
		}
		return Out;
	}
}

AIceRunPlayerController::AIceRunPlayerController()
{
	bShowMouseCursor = false;
}

float AIceRunPlayerController::Axis(const FKey& Key) const
{
	// Raw: the engine's own dead zones are the sim's business (game/full-controls.ts TUNING).
	return PlayerInput ? PlayerInput->GetRawKeyValue(Key) : 0.f;
}

bool AIceRunPlayerController::Down(const FKey& Key) const
{
	return IsInputKeyDown(Key);
}

void AIceRunPlayerController::PlayerTick(float DeltaTime)
{
	Super::PlayerTick(DeltaTime);
	auto Pressed = [this](const FKey& Key) { return WasInputKeyJustPressed(Key); };
	if (Pressed(EKeys::SpaceBar) || Pressed(EKeys::Gamepad_FaceButton_Bottom)) bPushPending = true;
	if (Pressed(EKeys::F)) bToePending = true;
	if (Pressed(EKeys::J) || Pressed(EKeys::Gamepad_DPad_Up)) bTrickPending = true;
	if (Pressed(EKeys::G) || Pressed(EKeys::Gamepad_DPad_Left)) bPairHoldPending = true;
	if (Pressed(EKeys::T) || Pressed(EKeys::Gamepad_DPad_Right)) bPairLiftPending = true;
	if (Pressed(EKeys::R)) Menu.bRestart = true;
	if (Pressed(EKeys::V) || Pressed(EKeys::Gamepad_Special_Left)) Menu.bCycleCamera = true;
	if (Pressed(EKeys::Tab)) Menu.bCycleSetup = true;
	if (Pressed(EKeys::M)) Menu.bCycleMode = true;
	if (Pressed(EKeys::F11)) Menu.bFullscreen = true;
	if (Pressed(EKeys::F9)) Menu.bExport = true;
	if (Pressed(EKeys::Escape) || Pressed(EKeys::Gamepad_Special_Right)) Menu.bPause = true;
	if (Pressed(EKeys::Up) || Pressed(EKeys::W) || Pressed(EKeys::Gamepad_DPad_Up) || Pressed(EKeys::Gamepad_LeftStick_Up)) Menu.bUp = true;
	if (Pressed(EKeys::Down) || Pressed(EKeys::S) || Pressed(EKeys::Gamepad_DPad_Down) || Pressed(EKeys::Gamepad_LeftStick_Down)) Menu.bDown = true;
	if (Pressed(EKeys::Left) || Pressed(EKeys::A) || Pressed(EKeys::Gamepad_DPad_Left) || Pressed(EKeys::Gamepad_LeftStick_Left)) Menu.bLeft = true;
	if (Pressed(EKeys::Right) || Pressed(EKeys::D) || Pressed(EKeys::Gamepad_DPad_Right) || Pressed(EKeys::Gamepad_LeftStick_Right)) Menu.bRight = true;
	if (Pressed(EKeys::Enter) || Pressed(EKeys::SpaceBar) || Pressed(EKeys::Gamepad_FaceButton_Bottom)) Menu.bAccept = true;
	if (Pressed(EKeys::BackSpace) || Pressed(EKeys::Gamepad_FaceButton_Right)) Menu.bBack = true;
}

void AIceRunPlayerController::ClearPending()
{
	bPushPending = bToePending = bTrickPending = bPairHoldPending = bPairLiftPending = false;
	Menu = FIceMenuPresses();
}

FIceMenuPresses AIceRunPlayerController::TakeMenuPresses()
{
	const FIceMenuPresses Out = Menu;
	Menu = FIceMenuPresses();
	return Out;
}

bool AIceRunPlayerController::LowHeld() const
{
	return Down(EKeys::U) || Down(EKeys::Gamepad_DPad_Down);
}

TSharedRef<FJsonObject> AIceRunPlayerController::Hardware() const
{
	// The browser Gamepad API's standard order, as main.gd full_hardware sends it: Y axes down.
	const bool bConnected = FSlateApplication::IsInitialized() && FSlateApplication::Get().IsGamepadAttached();
	const FKey Buttons[16] = {
		EKeys::Gamepad_FaceButton_Bottom, EKeys::Gamepad_FaceButton_Right, EKeys::Gamepad_FaceButton_Left, EKeys::Gamepad_FaceButton_Top,
		EKeys::Gamepad_LeftShoulder, EKeys::Gamepad_RightShoulder, EKeys::Invalid, EKeys::Invalid,
		EKeys::Gamepad_Special_Left, EKeys::Gamepad_Special_Right, EKeys::Gamepad_LeftThumbstick, EKeys::Gamepad_RightThumbstick,
		EKeys::Gamepad_DPad_Up, EKeys::Gamepad_DPad_Down, EKeys::Gamepad_DPad_Left, EKeys::Gamepad_DPad_Right};
	TArray<TSharedPtr<FJsonValue>> Pressed;
	for (int32 I = 0; I < 16; ++I)
	{
		double Value = 0.0;
		if (I == 6)
		{
			Value = FMath::Clamp(Axis(EKeys::Gamepad_LeftTriggerAxis), 0.f, 1.f);
		}
		else if (I == 7)
		{
			Value = FMath::Clamp(Axis(EKeys::Gamepad_RightTriggerAxis), 0.f, 1.f);
		}
		else if (Down(Buttons[I]))
		{
			Value = 1.0;
		}
		Pressed.Add(MakeShared<FJsonValueNumber>(Value));
	}
	struct FKeyName { FKey Key; const TCHAR* Name; };
	static const FKeyName Keys[] = {
		{EKeys::A, TEXT("a")}, {EKeys::D, TEXT("d")}, {EKeys::W, TEXT("w")}, {EKeys::S, TEXT("s")}, {EKeys::Q, TEXT("q")}, {EKeys::E, TEXT("e")},
		{EKeys::LeftShift, TEXT("shift")}, {EKeys::RightShift, TEXT("shift")}, {EKeys::SpaceBar, TEXT(" ")}, {EKeys::X, TEXT("x")}, {EKeys::C, TEXT("c")},
		{EKeys::Comma, TEXT(",")}, {EKeys::B, TEXT("b")}, {EKeys::N, TEXT("n")}, {EKeys::Z, TEXT("z")}, {EKeys::Y, TEXT("y")}, {EKeys::F, TEXT("f")},
		{EKeys::J, TEXT("j")}, {EKeys::K, TEXT("k")}, {EKeys::L, TEXT("l")}, {EKeys::H, TEXT("h")}, {EKeys::I, TEXT("i")}, {EKeys::O, TEXT("o")},
		{EKeys::U, TEXT("u")}, {EKeys::Left, TEXT("arrowleft")}, {EKeys::Right, TEXT("arrowright")}, {EKeys::Up, TEXT("arrowup")}, {EKeys::Down, TEXT("arrowdown")}};
	TArray<TSharedPtr<FJsonValue>> Held;
	TSet<FString> Seen;
	for (const FKeyName& K : Keys)
	{
		if (Down(K.Key) && !Seen.Contains(K.Name))
		{
			Seen.Add(K.Name);
			Held.Add(MakeShared<FJsonValueString>(K.Name));
		}
	}
	TSharedRef<FJsonObject> Out = MakeShared<FJsonObject>();
	Out->SetArrayField(TEXT("axes"), Numbers({Axis(EKeys::Gamepad_LeftX), -Axis(EKeys::Gamepad_LeftY), Axis(EKeys::Gamepad_RightX), -Axis(EKeys::Gamepad_RightY)}));
	Out->SetArrayField(TEXT("buttons"), Pressed);
	Out->SetArrayField(TEXT("keys"), Held);
	Out->SetBoolField(TEXT("connected"), bConnected);
	return Out;
}

TSharedRef<FJsonObject> AIceRunPlayerController::Controls(float Dt, int32 Scheme)
{
	TSharedRef<FJsonObject> C = MakeShared<FJsonObject>();
	if (Scheme == 3)
	{
		C->SetObjectField(TEXT("hardware"), Hardware());
	}
	else
	{
		// main.gd controls(): the original schemes' named inputs.
		FVector2D Left = ShapedStick(FVector2D(Axis(EKeys::Gamepad_LeftX), Axis(EKeys::Gamepad_LeftY)));
		const FVector2D RightStick = ShapedStick(FVector2D(Axis(EKeys::Gamepad_RightX), Axis(EKeys::Gamepad_RightY)));
		const float Rt = FMath::Max(0.f, Axis(EKeys::Gamepad_RightTriggerAxis));
		const float Lt = FMath::Max(0.f, Axis(EKeys::Gamepad_LeftTriggerAxis));
		const bool bHeldLt = Lt > .35f;
		if (bHeldLt && !bPreviousLt)
		{
			bToePending = true;
		}
		LtTime = bHeldLt ? LtTime + Dt : 0.f;
		bPreviousLt = bHeldLt;
		const FVector2D RawLeft = Left;
		if (Scheme == 1 && PlayerCameraManager)
		{
			// Camera-relative: the stick points across the ice as the screen shows it.
			const FRotator View(0.0, PlayerCameraManager->GetCameraRotation().Yaw, 0.0);
			const FVector Aim = View.RotateVector(FVector(Left.Y, Left.X, 0.0));
			Left = FVector2D(Aim.X, -Aim.Y);
		}
		const bool bLb = Down(EKeys::Q) || Down(EKeys::Gamepad_LeftShoulder);
		const bool bRb = Down(EKeys::E) || Down(EKeys::Gamepad_RightShoulder);
		const float K1 = float(Down(EKeys::D)) - float(Down(EKeys::A));
		const float K2 = float(Down(EKeys::Right)) - float(Down(EKeys::Left));
		C->SetNumberField(TEXT("lx"), Left.X);
		C->SetNumberField(TEXT("ly"), Left.Y);
		C->SetNumberField(TEXT("rx"), RightStick.X);
		C->SetNumberField(TEXT("ry"), RightStick.Y);
		C->SetNumberField(TEXT("lean"), RawLeft.X);
		C->SetNumberField(TEXT("pitch"), RawLeft.Y);
		C->SetNumberField(TEXT("kx"), FMath::Clamp(K1 + K2, -1.f, 1.f));
		C->SetNumberField(TEXT("ky"), float(Down(EKeys::W) || Down(EKeys::Up)) - float(Down(EKeys::S) || Down(EKeys::Down)));
		C->SetNumberField(TEXT("kPrimaryX"), K1);
		C->SetNumberField(TEXT("kAltX"), K2);
		C->SetNumberField(TEXT("knee"), FMath::Max(Down(EKeys::LeftShift) ? .95f : .35f, Rt));
		C->SetNumberField(TEXT("weight"), bLb && !bRb ? 0.0 : bRb && !bLb ? 1.0 : .5);
		C->SetNumberField(TEXT("carriage"), Down(EKeys::C) ? 1.0 : RightStick.Size());
		C->SetNumberField(TEXT("windup"), Down(EKeys::Comma) ? 1.0 : 0.0);
		C->SetBoolField(TEXT("push"), bPushPending);
		C->SetBoolField(TEXT("pushHeld"), Down(EKeys::SpaceBar) || Down(EKeys::Gamepad_FaceButton_Bottom));
		C->SetBoolField(TEXT("brake"), Down(EKeys::X) || LtTime > .15f);
		C->SetBoolField(TEXT("toe"), bToePending);
		C->SetBoolField(TEXT("turn"), Down(EKeys::B) || Down(EKeys::Gamepad_FaceButton_Right));
		C->SetBoolField(TEXT("bracket"), Down(EKeys::N) || Down(EKeys::Gamepad_RightThumbstick));
		C->SetBoolField(TEXT("twizzle"), Down(EKeys::Z) || Down(EKeys::Gamepad_FaceButton_Left));
		C->SetBoolField(TEXT("spin"), Down(EKeys::Y) || Down(EKeys::Gamepad_FaceButton_Top));
		C->SetBoolField(TEXT("inaBauer"), Down(EKeys::I) || (bLb && bRb));
		C->SetBoolField(TEXT("cycleJump"), bTrickPending);
	}
	C->SetBoolField(TEXT("pairHold"), bPairHoldPending);
	C->SetBoolField(TEXT("pairLift"), bPairLiftPending);
	bPushPending = bToePending = bTrickPending = bPairHoldPending = bPairLiftPending = false;
	return C;
}
