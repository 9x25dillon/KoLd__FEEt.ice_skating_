#pragma once

#include "CoreMinimal.h"

/**
 * A wired Xbox Elite Series 2's four back paddles, read from the kernel. Unreal's Linux input drops
 * SDL's paddle buttons, and SDL's own mapping for this pad has none (scripts/pad_map.gd). The xpad
 * driver reports them as BTN_GRIPR (top right), BTN_GRIPL (top left), BTN_GRIPR2 (bottom right) and
 * BTN_GRIPL2 (bottom left), measured on the owner's pad. The pad is found through sysfs, opened for
 * reading only, and its held keys polled: nothing is ever written to it. Linux only.
 */
class FIcePaddles
{
public:
	~FIcePaddles();
	/** Reads the paddles; while no pad is open, looks for one at most every two seconds. */
	void Poll(double Now);
	/** Held now, in pad_map.gd's order: P1 top right, P2 top left, P3 bottom right, P4 bottom left. */
	bool Held[4] = {false, false, false, false};
	bool Found() const { return Fd >= 0; }
	/** The pad's event node, for the settings page. */
	const FString& Where() const { return Node; }

private:
	void Close();
	int Fd = -1;
	FString Node;
	double NextLook = 0.0;
};
