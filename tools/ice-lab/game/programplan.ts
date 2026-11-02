// game/programplan.ts — editing a planned program, without any page attached.
//
// The rules are career.ts's validPlan: every element the event asks for, in any
// order, and up to PLAN_EXTRA more. These only say which edits a page offers, and
// each returns the new layout, or null when that edit is not allowed.
import { ELEMENTS, PLAN_EXTRA, validPlan } from "./career.ts";
import type { CareerEvent, ElementId } from "./career.ts";

export interface PlanRow {
  id: ElementId;
  title: string;
  /** The event asks for this one: it can move, but it cannot be taken out. */
  required: boolean;
}

/** The layout this event is skated with: the plan, or the event's own. */
export const layout = (event: CareerEvent, plan: readonly ElementId[] | null): ElementId[] =>
  [...(plan ?? event.routine)];

/** The layout as rows. Of repeats, the earliest ones fill what the event asks for. */
export function planRows(event: CareerEvent, plan: readonly ElementId[] | null): PlanRow[] {
  const needed = [...event.routine];
  return layout(event, plan).map(id => {
    const at = needed.indexOf(id);
    if (at >= 0) needed.splice(at, 1);
    return { id, title: ELEMENTS[id].title, required: at >= 0 };
  });
}

export const canAdd = (event: CareerEvent, plan: readonly ElementId[] | null): boolean =>
  layout(event, plan).length < event.routine.length + PLAN_EXTRA;

const checked = (event: CareerEvent, next: ElementId[]): ElementId[] | null => validPlan(event, next) ? next : null;

/** Row `i` one place earlier. */
export function moveEarlier(event: CareerEvent, plan: readonly ElementId[] | null, i: number): ElementId[] | null {
  const next = layout(event, plan);
  if (i < 1 || i >= next.length) return null;
  [next[i - 1], next[i]] = [next[i], next[i - 1]];
  return checked(event, next);
}

/** Row `i` out. Refused for what the event asks for. */
export function removeAt(event: CareerEvent, plan: readonly ElementId[] | null, i: number): ElementId[] | null {
  const next = layout(event, plan);
  if (i < 0 || i >= next.length) return null;
  next.splice(i, 1);
  return checked(event, next);
}

/** One more element at the end. */
export function addElement(event: CareerEvent, plan: readonly ElementId[] | null, id: ElementId): ElementId[] | null {
  return checked(event, [...layout(event, plan), id]);
}
