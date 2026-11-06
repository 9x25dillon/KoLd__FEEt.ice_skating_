#include "IceBridge.h"
#include "IceRun.h"
#include "HAL/PlatformTime.h"
#include "HAL/PlatformProcess.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Policies/CondensedJsonPrintPolicy.h"

#if PLATFORM_LINUX
#include <spawn.h>
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#include <sys/wait.h>
#include <errno.h>
extern char** environ;
#endif

namespace
{
	/** A reply line larger than this is a broken engine, as in engine_link.gd. */
	constexpr int32 MaxBuffered = 1 << 20;
	/** host.mjs refuses a request line larger than this. */
	constexpr int32 MaxRequest = 64 * 1024;
	constexpr int32 MaxErrorText = 4096;

#if PLATFORM_LINUX
	void SetNonBlocking(int Fd)
	{
		const int Flags = fcntl(Fd, F_GETFL, 0);
		fcntl(Fd, F_SETFL, Flags | O_NONBLOCK);
	}

	/** Reads everything available without waiting. False once the other end has closed. */
	bool ReadAvailable(int Fd, TArray<uint8>& Into)
	{
		uint8 Chunk[65536];
		for (;;)
		{
			const ssize_t Got = read(Fd, Chunk, sizeof(Chunk));
			if (Got > 0)
			{
				Into.Append(Chunk, int32(Got));
				continue;
			}
			if (Got == 0)
			{
				return false;
			}
			return errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR;
		}
	}
#endif
}

FIceBridge::~FIceBridge()
{
	Stop();
}

bool FIceBridge::Start(const FString& Node, const FString& HostScript, const FString& SaveDir, FString& OutError)
{
#if PLATFORM_LINUX
	if (Pid > 0)
	{
		OutError = TEXT("The skating engine is already running.");
		return false;
	}
	// A write to a pipe whose reader has gone must fail, not end the game.
	signal(SIGPIPE, SIG_IGN);

	int In[2], Out[2], Err[2];
	if (pipe2(In, O_CLOEXEC) != 0 || pipe2(Out, O_CLOEXEC) != 0 || pipe2(Err, O_CLOEXEC) != 0)
	{
		OutError = FString::Printf(TEXT("Could not open pipes to the skating engine (errno %d)."), errno);
		return false;
	}

	const FTCHARToUTF8 NodeUtf8(*Node);
	const FTCHARToUTF8 HostUtf8(*HostScript);
	const FTCHARToUTF8 SaveUtf8(*SaveDir);
	char NoWarnings[] = "--no-warnings";
	char* Argv[] = {
		const_cast<char*>(NodeUtf8.Get()),
		NoWarnings,
		const_cast<char*>(HostUtf8.Get()),
		const_cast<char*>(SaveUtf8.Get()),
		nullptr};

	posix_spawn_file_actions_t Actions;
	posix_spawn_file_actions_init(&Actions);
	// dup2 clears close-on-exec on the child's 0, 1 and 2; every other pipe end closes at exec.
	posix_spawn_file_actions_adddup2(&Actions, In[0], STDIN_FILENO);
	posix_spawn_file_actions_adddup2(&Actions, Out[1], STDOUT_FILENO);
	posix_spawn_file_actions_adddup2(&Actions, Err[1], STDERR_FILENO);

	pid_t Child = -1;
	const int Spawned = posix_spawnp(&Child, NodeUtf8.Get(), &Actions, nullptr, Argv, environ);
	posix_spawn_file_actions_destroy(&Actions);
	close(In[0]);
	close(Out[1]);
	close(Err[1]);
	if (Spawned != 0)
	{
		close(In[1]);
		close(Out[0]);
		close(Err[0]);
		OutError = FString::Printf(TEXT("Ice Lab could not start (%s: errno %d). Install Node 24 or newer, or set ICE_RUN_NODE to its executable."), *Node, Spawned);
		return false;
	}

	Pid = Child;
	InFd = In[1];
	OutFd = Out[0];
	ErrFd = Err[0];
	SetNonBlocking(InFd);
	SetNonBlocking(OutFd);
	SetNonBlocking(ErrFd);
	Outgoing.Reset();
	Incoming.Reset();
	Errors.Reset();
	Pending.Reset();
	UE_LOG(LogIceRun, Log, TEXT("Ice Lab engine started: pid %d, %s %s %s"), Pid, *Node, *HostScript, *SaveDir);
	return true;
#else
	OutError = TEXT("This build starts the Ice Lab engine on Linux only.");
	return false;
#endif
}

bool FIceBridge::Send(const FString& Op, const TSharedRef<FJsonObject>& Payload)
{
	if (Pid <= 0)
	{
		return false;
	}
	if (Pending.Num() == 0)
	{
		// The wait starts now: time spent idle is not a late reply.
		WaitStart = FPlatformTime::Seconds();
	}
	++Serial;
	Payload->SetStringField(TEXT("op"), Op);
	Payload->SetNumberField(TEXT("id"), Serial);
	FString Line;
	const TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> Writer =
		TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&Line);
	FJsonSerializer::Serialize(Payload, Writer);
	Line.AppendChar(TEXT('\n'));
	const FTCHARToUTF8 Utf8(*Line);
	if (Utf8.Length() > MaxRequest)
	{
		UE_LOG(LogIceRun, Error, TEXT("Request %s is %d bytes; the engine takes at most %d."), *Op, Utf8.Length(), MaxRequest);
		return false;
	}
	Pending.Add(Serial, Op);
	Outgoing.Append(reinterpret_cast<const uint8*>(Utf8.Get()), Utf8.Length());
	Flush();
	return true;
}

void FIceBridge::Flush()
{
#if PLATFORM_LINUX
	while (InFd >= 0 && Outgoing.Num() > 0)
	{
		const ssize_t Wrote = write(InFd, Outgoing.GetData(), Outgoing.Num());
		if (Wrote > 0)
		{
			Outgoing.RemoveAt(0, int32(Wrote), EAllowShrinking::No);
			continue;
		}
		if (Wrote < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR))
		{
			return;
		}
		// The engine has stopped reading: Poll() reports it.
		Outgoing.Reset();
		return;
	}
#endif
}

void FIceBridge::DrainErrors()
{
#if PLATFORM_LINUX
	if (ErrFd >= 0)
	{
		ReadAvailable(ErrFd, Errors);
		if (Errors.Num() > MaxErrorText)
		{
			Errors.RemoveAt(0, Errors.Num() - MaxErrorText, EAllowShrinking::No);
		}
	}
#endif
}

bool FIceBridge::Poll(TArray<FReply>& OutReplies, FString& OutError)
{
#if PLATFORM_LINUX
	if (Pid <= 0)
	{
		return true;
	}
	Flush();
	DrainErrors();
	const bool bOpen = ReadAvailable(OutFd, Incoming);
	for (;;)
	{
		const int32 End = Incoming.Find(uint8('\n'));
		if (End == INDEX_NONE)
		{
			break;
		}
		const FString Text = FString::ConstructFromPtrSize(reinterpret_cast<const UTF8CHAR*>(Incoming.GetData()), End);
		Incoming.RemoveAt(0, End + 1, EAllowShrinking::No);
		TSharedPtr<FJsonObject> Value;
		if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Value) || !Value.IsValid())
		{
			OutError = TEXT("Invalid engine response.");
			return false;
		}
		FReply Reply;
		const int32 Id = int32(Value->GetNumberField(TEXT("id")));
		Pending.RemoveAndCopyValue(Id, Reply.Op);
		WaitStart = FPlatformTime::Seconds();
		Reply.bOk = Value->GetBoolField(TEXT("ok"));
		if (Reply.bOk)
		{
			const TSharedPtr<FJsonObject>* Data = nullptr;
			if (Value->TryGetObjectField(TEXT("data"), Data))
			{
				Reply.Data = *Data;
			}
			Value->TryGetStringField(TEXT("saveError"), Reply.SaveError);
		}
		else
		{
			Reply.Error = Value->GetStringField(TEXT("error"));
		}
		OutReplies.Add(MoveTemp(Reply));
	}
	if (Incoming.Num() > MaxBuffered)
	{
		OutError = TEXT("Engine response exceeded its limit.");
		return false;
	}
	if (!bOpen)
	{
		OutError = FString::Printf(TEXT("The skating engine stopped. %s"), *ErrorText());
		return false;
	}
#endif
	return true;
}

double FIceBridge::Waiting() const
{
	return Pending.Num() > 0 ? FPlatformTime::Seconds() - WaitStart : 0.0;
}

FString FIceBridge::PendingOps() const
{
	TArray<FString> Ops;
	Pending.GenerateValueArray(Ops);
	return FString::Join(Ops, TEXT(", "));
}

bool FIceBridge::IsRunning() const
{
	// Poll() reports a stopped engine when its stdout closes; this only says whether one was started.
	return Pid > 0 && OutFd >= 0;
}

FString FIceBridge::ErrorText()
{
	DrainErrors();
	return FString::ConstructFromPtrSize(reinterpret_cast<const UTF8CHAR*>(Errors.GetData()), Errors.Num()).Right(400);
}

void FIceBridge::CloseAll()
{
#if PLATFORM_LINUX
	for (int* Fd : {&InFd, &OutFd, &ErrFd})
	{
		if (*Fd >= 0)
		{
			close(*Fd);
			*Fd = -1;
		}
	}
#endif
}

void FIceBridge::Stop()
{
#if PLATFORM_LINUX
	if (Pid > 0)
	{
		// host.mjs saves the career and exits on quit; give it a moment, then make sure.
		Send(TEXT("quit"));
		Flush();
		const double Deadline = FPlatformTime::Seconds() + 2.0;
		int Status = 0;
		bool bGone = false;
		while (FPlatformTime::Seconds() < Deadline)
		{
			if (waitpid(Pid, &Status, WNOHANG) == Pid)
			{
				bGone = true;
				break;
			}
			FPlatformProcess::Sleep(0.01f);
		}
		if (!bGone)
		{
			// Only ever this game's own child, by its pid.
			UE_LOG(LogIceRun, Warning, TEXT("Ice Lab engine %d did not quit; stopping it."), Pid);
			kill(Pid, SIGTERM);
			const double Hard = FPlatformTime::Seconds() + 1.0;
			while (FPlatformTime::Seconds() < Hard && waitpid(Pid, &Status, WNOHANG) != Pid)
			{
				FPlatformProcess::Sleep(0.01f);
			}
			if (waitpid(Pid, &Status, WNOHANG) == 0)
			{
				kill(Pid, SIGKILL);
				waitpid(Pid, &Status, 0);
			}
		}
		Pid = -1;
	}
	CloseAll();
	Pending.Reset();
	Outgoing.Reset();
#endif
}
