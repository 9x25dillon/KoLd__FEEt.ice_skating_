// game/pad-probe.ts — what the browser's Gamepad API actually reports, index by index.
//
// The Elite Series 2 has four back paddles, and Godot's SDL mapping names them
// (JoyButton.PADDLE1–4). Whether Firefox exposes them at all, and at which
// button or axis index, is a question only the operator's own pad can answer,
// so the controller workshop shows every raw index and logs every change. This
// file is the bookkeeping behind that readout; it binds nothing and maps
// nothing, because the point is to see the hardware before anything interprets
// it.
//
// Pure: it takes plain gamepad-shaped objects and a time, so the tests can feed
// it pads that a browser under Node does not have.

/** The fields of a browser Gamepad this readout needs. */
export interface PadLike {
  index: number;
  id: string;
  mapping: string;
  connected: boolean;
  buttons: ReadonlyArray<{ value: number; pressed: boolean }>;
  axes: ReadonlyArray<number>;
}

export interface PadChange {
  /** Seconds, on whatever clock the caller passes to update(). */
  t: number;
  /** Position in navigator.getGamepads(); one pad can hold two slots. */
  slot: number;
  kind: "button" | "axis" | "connected" | "disconnected";
  /** Button or axis index; -1 for connect and disconnect. */
  index: number;
  from: number;
  to: number;
  pressed: boolean;
}

/**
 * How far an axis must travel from its last logged value to log again. A stick
 * at rest jitters by a few hundredths, and logging that would push a paddle
 * press out of the ten-line log before the operator could read it.
 */
export const AXIS_STEP = 0.25;
/** Lines kept in the change log. */
export const LOG_LENGTH = 10;
/** The "standard" mapping defines buttons 0–16 and axes 0–3; anything past that is extra. */
export const STANDARD_BUTTONS = 17;
export const STANDARD_AXES = 4;

interface Reference { id: string; pressed: boolean[]; axes: number[] }

/** True for an index the standard mapping does not define, which is where a paddle would have to live. */
export function beyondStandard(mapping: string, kind: "button" | "axis", index: number): boolean {
  return mapping === "standard" && index >= (kind === "button" ? STANDARD_BUTTONS : STANDARD_AXES);
}

export class PadProbe {
  /** Newest first. */
  readonly log: PadChange[] = [];
  last: PadChange | null = null;
  private refs = new Map<number, Reference>();

  /** Compare the current getGamepads() list with what was last logged; return and log what changed. */
  update(list: ReadonlyArray<PadLike | null>, t: number): PadChange[] {
    const changes: PadChange[] = [];
    const seen = new Set<number>();
    list.forEach((pad, slot) => {
      if (!pad || !pad.connected) return;
      seen.add(slot);
      const ref = this.refs.get(slot);
      if (!ref || ref.id !== pad.id) {
        // A new pad is its own baseline: a trigger resting at -1 is not a change.
        this.refs.set(slot, { id: pad.id, pressed: pad.buttons.map((b) => b.pressed), axes: [...pad.axes] });
        changes.push({ t, slot, kind: "connected", index: -1, from: 0, to: 1, pressed: false });
        return;
      }
      pad.buttons.forEach((b, i) => {
        const was = ref.pressed[i] ?? false;
        if (b.pressed === was) return;
        ref.pressed[i] = b.pressed;
        changes.push({ t, slot, kind: "button", index: i, from: was ? 1 : 0, to: b.value, pressed: b.pressed });
      });
      pad.axes.forEach((v, i) => {
        const was = ref.axes[i] ?? 0;
        // Reaching either end always logs, so a paddle reported as a -1/+1 axis
        // shows up even if it happened to start within a step of the other end.
        if (Math.abs(v - was) < AXIS_STEP && !(Math.abs(v) > 0.99 && Math.abs(was) <= 0.99)) return;
        ref.axes[i] = v;
        changes.push({ t, slot, kind: "axis", index: i, from: was, to: v, pressed: false });
      });
    });
    for (const slot of [...this.refs.keys()]) {
      if (seen.has(slot)) continue;
      this.refs.delete(slot);
      changes.push({ t, slot, kind: "disconnected", index: -1, from: 1, to: 0, pressed: false });
    }
    for (const c of changes) this.log.unshift(c);
    this.log.length = Math.min(this.log.length, LOG_LENGTH);
    // The headline is the last press, not the last release: letting go of a
    // paddle should not replace "button 17 pressed" with a line that says less.
    this.last = changes.filter((c) => c.kind !== "button" || c.pressed).at(-1) ?? this.last;
    return changes;
  }
}

/** One log line, e.g. "t=12.34 s · slot 0 · button 17 pressed (1.00)". */
export function describeChange(c: PadChange): string {
  const head = `t=${c.t.toFixed(2)} s · slot ${c.slot}`;
  if (c.kind === "connected" || c.kind === "disconnected") return `${head} · ${c.kind}`;
  if (c.kind === "button") return `${head} · button ${c.index} ${c.pressed ? "pressed" : "released"} (${c.to.toFixed(2)})`;
  return `${head} · axis ${c.index} ${c.from.toFixed(2)} → ${c.to.toFixed(2)}`;
}

/** One line per getGamepads() entry, empty slots included, so a pad listed twice is visible. */
export function describeSlots(list: ReadonlyArray<PadLike | null>): string {
  if (list.length === 0) return "navigator.getGamepads() is empty · press a button on the pad";
  return list.map((pad, slot) => pad
    ? `slot ${slot} · index ${pad.index} · ${pad.connected ? "connected" : "not connected"} · mapping "${pad.mapping || "(none)"}" · ${pad.buttons.length} buttons · ${pad.axes.length} axes\n  ${pad.id}`
    : `slot ${slot} · empty`).join("\n");
}
