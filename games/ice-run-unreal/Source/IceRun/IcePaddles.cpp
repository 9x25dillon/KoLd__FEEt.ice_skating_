#include "IcePaddles.h"
#include "IceRun.h"

#if PLATFORM_LINUX
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/input.h>
#endif

namespace
{
	// linux/input-event-codes.h: the Elite's paddles under xpad.
	constexpr int GripL = 0x224;
	constexpr int GripR = 0x225;
	constexpr int GripL2 = 0x226;
	constexpr int GripR2 = 0x227;
	// pad_map.gd ELITE_VENDOR, ELITE_WIRED_PRODUCT: the owner plays wired.
	const TCHAR* const Microsoft = TEXT("045e");
	const TCHAR* const EliteWired = TEXT("0b00");

	bool Bit(const unsigned char* Bits, int Code)
	{
		return (Bits[Code / 8] >> (Code % 8)) & 1;
	}

#if PLATFORM_LINUX
	/** A sysfs attribute's text. Its files claim 4096 bytes and hold a few, which the engine's file reader calls a failure. */
	FString Attribute(const FString& Path)
	{
		char Text[64] = {};
		const int File = open(TCHAR_TO_UTF8(*Path), O_RDONLY | O_CLOEXEC);
		if (File < 0)
		{
			return FString();
		}
		const ssize_t Got = read(File, Text, sizeof(Text) - 1);
		close(File);
		return Got > 0 ? FString(UTF8_TO_TCHAR(Text)).TrimStartAndEnd() : FString();
	}
#endif
}

FIcePaddles::~FIcePaddles()
{
	Close();
}

void FIcePaddles::Close()
{
#if PLATFORM_LINUX
	if (Fd >= 0)
	{
		close(Fd);
	}
#endif
	Fd = -1;
	for (bool& B : Held)
	{
		B = false;
	}
}

void FIcePaddles::Poll(double Now)
{
#if PLATFORM_LINUX
	if (Fd < 0)
	{
		if (Now < NextLook)
		{
			return;
		}
		NextLook = Now + 2.0;
		for (int32 I = 0; I < 64 && Fd < 0; ++I)
		{
			// sysfs names the device without opening any other one.
			const FString Sys = FString::Printf(TEXT("/sys/class/input/event%d/device/id/"), I);
			if (Attribute(Sys + TEXT("vendor")) != Microsoft || Attribute(Sys + TEXT("product")) != EliteWired)
			{
				continue;
			}
			const FString Path = FString::Printf(TEXT("/dev/input/event%d"), I);
			const int Try = open(TCHAR_TO_UTF8(*Path), O_RDONLY | O_NONBLOCK | O_CLOEXEC);
			unsigned char Keys[KEY_MAX / 8 + 1] = {};
			if (Try >= 0 && ioctl(Try, EVIOCGBIT(EV_KEY, sizeof(Keys)), Keys) >= 0 && Bit(Keys, GripR) && Bit(Keys, GripL2))
			{
				Fd = Try;
				Node = Path;
				UE_LOG(LogIceRun, Log, TEXT("Elite paddles: the wired Elite 2 at %s, read only."), *Node);
			}
			else if (Try >= 0)
			{
				close(Try);
			}
		}
		if (Fd < 0)
		{
			return;
		}
	}
	unsigned char Keys[KEY_MAX / 8 + 1] = {};
	if (ioctl(Fd, EVIOCGKEY(sizeof(Keys)), Keys) < 0)
	{
		UE_LOG(LogIceRun, Log, TEXT("Elite paddles: %s went away."), *Node);
		Close();
		return;
	}
	Held[0] = Bit(Keys, GripR);
	Held[1] = Bit(Keys, GripL);
	Held[2] = Bit(Keys, GripR2);
	Held[3] = Bit(Keys, GripL2);
#endif
}
