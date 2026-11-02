import { strict as assert } from "node:assert";
import { test } from "node:test";

import { CAREER_EVENTS, CareerState, ELEMENTS, PLAN_EXTRA, validPlan } from "../game/career.ts";
import type { ElementId } from "../game/career.ts";
import { addElement, canAdd, layout, moveEarlier, planRows, removeAt } from "../game/programplan.ts";

const event = CAREER_EVENTS[2];
const own = event.routine;
const other = (Object.keys(ELEMENTS) as ElementId[]).find(id => !own.includes(id))!;

test("with no plan, the rows are the event's own and all required", () => {
  const rows = planRows(event, null);
  assert.deepEqual(rows.map(r => r.id), [...own]);
  assert.ok(rows.every(r => r.required));
  assert.notEqual(layout(event, null), own, "a copy: editing it cannot touch the event");
});

test("an added element is the skater's own and can come out again; the event's cannot", () => {
  const plan = addElement(event, null, other)!;
  const rows = planRows(event, plan);
  assert.equal(rows.at(-1)!.required, false);
  assert.deepEqual(removeAt(event, plan, plan.length - 1), [...own]);
  assert.equal(removeAt(event, plan, 0), null);
  assert.equal(removeAt(event, null, 0), null);
});

test("a repeat of a required element: only the extra one is the skater's", () => {
  const plan = addElement(event, null, own[0])!;
  const rows = planRows(event, plan);
  assert.equal(rows.filter(r => r.id === own[0] && !r.required).length, 1);
  assert.equal(rows.filter(r => r.required).length, own.length);
});

test("order can change; the first row cannot go earlier, and a bad index is refused", () => {
  const moved = moveEarlier(event, null, 1)!;
  assert.deepEqual(moved.slice(0, 2), [own[1], own[0]]);
  assert.ok(validPlan(event, moved));
  assert.equal(moveEarlier(event, null, 0), null);
  assert.equal(moveEarlier(event, null, own.length), null);
  assert.equal(removeAt(event, null, -1), null);
});

test("no more than PLAN_EXTRA can be added", () => {
  let plan: ElementId[] | null = null;
  for (let i = 0; i < PLAN_EXTRA; i++) {
    assert.ok(canAdd(event, plan));
    plan = addElement(event, plan, other);
    assert.ok(plan);
  }
  assert.equal(canAdd(event, plan), false);
  assert.equal(addElement(event, plan, other), null);
});

test("every edit it offers is one the career accepts", () => {
  const career = new CareerState();
  const plan = moveEarlier(event, addElement(event, null, other), own.length)!;
  assert.equal(career.setPlan(2, plan), true);
  assert.deepEqual(career.planned(2).routine, plan);
});
