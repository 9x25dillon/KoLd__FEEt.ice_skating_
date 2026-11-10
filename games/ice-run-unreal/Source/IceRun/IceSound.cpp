#include "IceSound.h"
#include "IceRun.h"

UIceSound::UIceSound(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	// As the engine's own synth sounds are set up: two channels, endless, and still made while quiet.
	NumChannels = 2;
	SampleRate = Rate;
	Duration = INDEFINITELY_LOOPING_DURATION;
	bLooping = true;
	bCanProcessAsync = true;
	VirtualizationMode = EVirtualizationMode::PlayWhenSilent;
	Noise.Initialize(0x1CE);
}

void UIceSound::Set(float InSpeed, float InLevel, float InScrape, bool bInLive)
{
	Speed.store(InSpeed, std::memory_order_relaxed);
	Level.store(InLevel, std::memory_order_relaxed);
	Scrape.store(InScrape, std::memory_order_relaxed);
	bLive.store(bInLive, std::memory_order_relaxed);
}

void UIceSound::Land(bool bClean)
{
	bLastClean.store(bClean, std::memory_order_relaxed);
	Landings.fetch_add(1, std::memory_order_release);
}

int32 UIceSound::OnGeneratePCMAudio(TArray<uint8>& OutAudio, int32 NumSamples)
{
	OutAudio.Reset();
	OutAudio.AddZeroed(NumSamples * sizeof(float));
	float* Out = reinterpret_cast<float*>(OutAudio.GetData());
	if (!bStarted)
	{
		bStarted = true;
		UE_LOG(LogIceRun, Log, TEXT("Blade and crowd sound: made live, %d Hz, %d samples a call."), Rate, NumSamples);
	}
	const float NowSpeed = Speed.load(std::memory_order_relaxed);
	const float NowLevel = Level.load(std::memory_order_relaxed);
	const float NowScrape = Scrape.load(std::memory_order_relaxed);
	const bool bNowLive = bLive.load(std::memory_order_relaxed);
	const int32 Count = Landings.load(std::memory_order_acquire);
	if (Count != Heard)
	{
		// main.gd on a landing: the thud's envelope, and the crowd's swell by how clean it was.
		Heard = Count;
		LandingEnvelope = .32f;
		CrowdSwell = bLastClean.load(std::memory_order_relaxed) ? 1.f : .35f;
	}
	const float Step = .045f + NowSpeed * .0008f;
	// The thud is sin(Phase * .7): Phase wraps on its period, so a long session keeps its precision.
	const float Period = UE_TWO_PI / .7f;
	for (int32 I = 0; I + 1 < NumSamples; I += 2)
	{
		Phase += Step;
		if (Phase > Period)
		{
			Phase -= Period;
		}
		const float N = Noise.FRandRange(-1.f, 1.f);
		BladeFilter += (N - BladeFilter) * .25f;
		CrowdFilter += (N - CrowdFilter) * .014f;
		CrowdSwell = FMath::Max(0.f, CrowdSwell - 1.f / Rate / 4.f);
		LandingEnvelope = FMath::Max(0.f, LandingEnvelope - 1.f / Rate);
		const float Blade = (N - BladeFilter) * NowLevel * (.35f + NowScrape);
		const float Crowd = bNowLive ? CrowdFilter * (.16f + CrowdSwell * 2.3f) : 0.f;
		const float Thud = bNowLive ? FMath::Sin(Phase * .7f) * LandingEnvelope * 1.5f : 0.f;
		Out[I] = Blade + Crowd + Thud;
		Out[I + 1] = Blade * .92f + Crowd + Thud;
	}
	return NumSamples;
}
