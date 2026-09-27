import type { ControllerHardware } from "../app/pad.ts";

export interface MenuActions {
  vertical: number;
  horizontal: number;
  accept: boolean;
  back: boolean;
  start: boolean;
  disconnected: boolean;
}

/** Menu input is separate from skating: held buttons never activate every frame. */
export class MenuInput {
  private previous = new Set<number>();
  private direction = "";
  private repeatAt = 0;
  private connected = false;

  read(hardware: ControllerHardware | undefined, now: number): MenuActions {
    const connected = hardware?.connected ?? false;
    const disconnected = this.connected && !connected;
    this.connected = connected;
    const held = new Set(connected ? hardware!.buttons.flatMap((v, i) => v > 0.5 ? [i] : []) : []);
    const pressed = (button: number) => held.has(button) && !this.previous.has(button);
    let vertical = 0, horizontal = 0;
    if (connected) {
      const [x = 0, y = 0] = hardware!.axes;
      vertical = held.has(12) ? -1 : held.has(13) ? 1 : Math.abs(y) > 0.6 ? Math.sign(y) : 0;
      horizontal = held.has(14) ? -1 : held.has(15) ? 1 : Math.abs(x) > 0.6 ? Math.sign(x) : 0;
      if (vertical) horizontal = 0;
    }
    const direction = `${vertical},${horizontal}`;
    const changed = direction !== this.direction;
    const repeat = changed || now >= this.repeatAt;
    if (repeat) this.repeatAt = now + (changed ? 400 : 140);
    this.direction = direction;
    const result = { vertical: repeat ? vertical : 0, horizontal: repeat ? horizontal : 0,
      accept: pressed(0), back: pressed(1), start: pressed(9), disconnected };
    this.previous = held;
    return result;
  }
}

/** Operate existing native controls, so mouse, keyboard and pad use the same handlers. */
export function navigateMenu(root: HTMLElement, actions: MenuActions): void {
  const items = Array.from(root.querySelectorAll<HTMLElement>("button, a[href], select, input[type=range], input[type=checkbox], summary"))
    .filter(item => !item.matches(":disabled") && item.getClientRects().length > 0);
  if (!items.length) return;
  let index = items.indexOf(document.activeElement as HTMLElement);
  if (index < 0) { index = 0; items[index].focus(); }
  const focused = items[index];
  if (actions.horizontal && focused instanceof HTMLSelectElement) {
    const options = Array.from(focused.options).filter(option => !option.disabled);
    const current = options.findIndex(option => option.selected);
    const next = options[Math.max(0, Math.min(options.length - 1, current + actions.horizontal))];
    if (next && next.value !== focused.value) {
      focused.value = next.value; focused.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } else if (actions.horizontal && focused instanceof HTMLInputElement && focused.type === "range") {
    const next = Math.max(Number(focused.min), Math.min(Number(focused.max),
      Number(focused.value) + actions.horizontal * (Number(focused.step) || 1)));
    if (next !== Number(focused.value)) {
      focused.value = String(next); focused.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } else if (actions.vertical || actions.horizontal) {
    index = (index + (actions.vertical || actions.horizontal) + items.length) % items.length;
    items[index].focus(); items[index].scrollIntoView({ block: "nearest" });
  }
  if (actions.accept && !(items[index] instanceof HTMLSelectElement) && (!(items[index] instanceof HTMLInputElement) || (items[index] as HTMLInputElement).type === "checkbox")) items[index].click();
}
