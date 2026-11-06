#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"

/**
 * The Ice Lab engine, out of process: games/ice-run-godot/bridge/host.mjs,
 * one JSON request per line on its stdin, one reply per line on its stdout
 * ({id, ok, data, saveError} or {id, ok:false, error}). The protocol
 * scripts/engine_link.gd already speaks; this client adds nothing to it.
 *
 * Never blocks the game thread: requests queue and flush as the pipe takes
 * them, and Poll() drains whatever replies have arrived. The engine's stderr
 * is kept apart from its replies, for failure messages.
 */
class FIceBridge
{
public:
	struct FReply
	{
		FString Op;
		bool bOk = false;
		TSharedPtr<FJsonObject> Data;
		FString Error;
		FString SaveError;
	};

	FIceBridge() = default;
	FIceBridge(const FIceBridge&) = delete;
	FIceBridge& operator=(const FIceBridge&) = delete;
	~FIceBridge();

	/** Starts `Node --no-warnings HostScript SaveDir`. False, with a reason, when it cannot. */
	bool Start(const FString& Node, const FString& HostScript, const FString& SaveDir, FString& OutError);
	/** Queues one request; the payload gains `op` and `id`. False once the engine has stopped. */
	bool Send(const FString& Op, const TSharedRef<FJsonObject>& Payload);
	bool Send(const FString& Op) { return Send(Op, MakeShared<FJsonObject>()); }
	/** Every complete reply that has arrived, oldest first. False if the engine broke the protocol. */
	bool Poll(TArray<FReply>& OutReplies, FString& OutError);
	bool Busy() const { return Pending.Num() > 0; }
	/** Seconds the oldest outstanding request has waited; 0 when nothing is outstanding. */
	double Waiting() const;
	/** The requests still waiting, by op, for a failure message. */
	FString PendingOps() const;
	bool IsRunning() const;
	/** The last of what the engine wrote to stderr. */
	FString ErrorText();
	/** Asks the engine to save and quit, then makes sure it has. */
	void Stop();

private:
	void Flush();
	void DrainErrors();
	void CloseAll();

	int32 Pid = -1;
	int InFd = -1;
	int OutFd = -1;
	int ErrFd = -1;
	TArray<uint8> Outgoing;
	TArray<uint8> Incoming;
	TArray<uint8> Errors;
	TMap<int32, FString> Pending;
	int32 Serial = 0;
	double WaitStart = 0.0;
};
