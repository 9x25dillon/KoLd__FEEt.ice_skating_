#pragma once

#include "CoreMinimal.h"
#include "Sound/SoundWaveProcedural.h"
#include <atomic>
#include "IceSound.generated.h"

/**
 * main.gd fill_audio, made live on the audio thread: the blade on the ice (white noise less its
 * low end, louder with speed and when an edge slips sideways), the hall's crowd (the low end of
 * the same noise, swelling after a landing), and a landing's thud. It reads only what the game
 * thread last handed it, and nothing here reaches the sim.
 */
UCLASS()
class UIceSound : public USoundWaveProcedural
{
	GENERATED_BODY()

public:
	UIceSound(const FObjectInitializer& ObjectInitializer);

	/**
	 * Game thread: the skater as last seen. Level is the blade's loudness (0 in the air, fallen,
	 * or under a menu), Scrape the sideways slip's share, Live whether a run is being skated.
	 */
	void Set(float InSpeed, float InLevel, float InScrape, bool bInLive);
	/** Game thread: a landing. A clean one swells the crowd more. */
	void Land(bool bClean);

	virtual int32 OnGeneratePCMAudio(TArray<uint8>& OutAudio, int32 NumSamples) override;
	virtual Audio::EAudioMixerStreamDataFormat::Type GetGeneratedPCMDataFormat() const override { return Audio::EAudioMixerStreamDataFormat::Float; }

	/** main.gd's generator rate: the filters below are per sample at this rate. */
	static constexpr int32 Rate = 22050;

private:
	std::atomic<float> Speed{0.f};
	std::atomic<float> Level{0.f};
	std::atomic<float> Scrape{0.f};
	std::atomic<bool> bLive{false};
	std::atomic<int32> Landings{0};
	std::atomic<bool> bLastClean{true};

	// The audio thread's own.
	bool bStarted = false;
	int32 Heard = 0;
	float Phase = 0.f;
	float BladeFilter = 0.f;
	float CrowdFilter = 0.f;
	float CrowdSwell = 0.f;
	float LandingEnvelope = 0.f;
	FRandomStream Noise;
};
