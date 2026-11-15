import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DEFAULT_VENUE, EVENT_VENUE, MODE_VENUE, VENUES, venueById, venueFor } from "../game/venues.ts";
import { CAREER_EVENTS } from "../game/career.ts";

const HEX = /^[0-9a-f]{6}$/;

test("six venues, unique ids, every field in range", () => {
  assert.equal(VENUES.length, 6);
  assert.equal(new Set(VENUES.map(v => v.id)).size, VENUES.length);
  for (const v of VENUES) {
    assert.ok(v.name && v.description, `${v.id} is named and described`);
    assert.ok(v.crowd >= 0 && v.crowd <= 1, `${v.id} crowd ${v.crowd}`);
    const l = v.light;
    for (const c of [l.sky, l.ambient, l.fog, l.key, l.fixtureColor, ...l.wash]) assert.match(c, HEX, `${v.id} colour ${c}`);
    for (const k of ["ambientScale", "fogScale", "keyScale", "fixtureScale", "exposure", "stringLights"] as const) {
      assert.ok(Number.isFinite(l[k]) && l[k] >= 0, `${v.id}.${k}`);
    }
    assert.ok(l.fixtures >= 0 && l.fixtures <= 1, `${v.id} fixtures`);
    // A column stands at the fascia's centre: indoors the text must split there (the Grand Prix's own halves differ by 5).
    if (!v.outdoor) {
      const [left, right] = v.fascia.split("     /     ");
      assert.ok(right !== undefined && Math.abs(left.length - right.length) <= 5, `${v.id} fascia "${v.fascia}" is not split evenly at the centre`);
    }
  }
});

test("the Grand Prix venue is today's arena exactly: every scale 1, the stands' 86%", () => {
  const gp = venueById(DEFAULT_VENUE)!;
  assert.equal(gp.name, "Northlight Arena");
  assert.equal(gp.crowd, 0.86);
  const l = gp.light;
  for (const k of ["ambientScale", "fogScale", "keyScale", "fixtureScale", "exposure"] as const) assert.equal(l[k], 1, k);
  assert.equal(l.fixtures, 1);
  assert.deepEqual(l.wash, []);
});

test("the set the brief asked for: dawn practice, club, Grand Prix, championship with Kiss & Cry, outdoor night, gala", () => {
  const lit = Object.fromEntries(VENUES.map(v => [v.lighting, v]));
  assert.equal(lit.dawn.crowd, 0, "empty stands at dawn");
  assert.ok(lit.club.crowd > 0 && lit.club.crowd < 0.3, "a club crowd is parents, not a house");
  assert.ok(lit.broadcast.kissAndCry && lit.broadcast.crowd > lit.arena.crowd, "a bigger house, Kiss & Cry dressed");
  assert.ok(lit.night.outdoor && lit.night.light.fixtures === 0 && lit.night.light.stringLights > 0, "no roof, no roof lights, bulbs");
  assert.equal(lit.night.crowd, 0, "no stands outdoors, so nobody seated");
  assert.ok(lit.gala.light.wash.length >= 2 && lit.gala.light.ambientScale < 0.5, "a dark room and a coloured wash");
  assert.equal(VENUES.filter(v => v.outdoor).length, 1);
});

test("every career event, and every arcade round through it, has a venue that exists", () => {
  for (const [i, ev] of CAREER_EVENTS.entries()) {
    assert.ok(EVENT_VENUE[ev.id], `${ev.id} has no venue`);
    assert.equal(venueFor("career", i).id, EVENT_VENUE[ev.id]);
    assert.equal(venueFor("arcade", i).id, EVENT_VENUE[ev.id]);
    assert.equal(venueFor("career", ev.id).id, EVENT_VENUE[ev.id], "by id as well as by index");
  }
  for (const id of Object.values(EVENT_VENUE)) assert.ok(venueById(id), id);
  assert.equal(venueFor("career", 0).id, "dawn-practice", "the career starts on practice ice");
  assert.equal(venueFor("career", CAREER_EVENTS.findIndex(e => e.id === "nationals")).id, "championship");
  assert.equal(venueFor("career", CAREER_EVENTS.findIndex(e => e.exhibition)).id, "gala", "the season's gala is a gala");
});

test("every other mode has its own venue, and anything unknown gets the arena", () => {
  for (const [mode, id] of Object.entries(MODE_VENUE)) {
    assert.ok(venueById(id), `${mode} -> ${id}`);
    assert.equal(venueFor(mode).id, id);
  }
  assert.equal(venueFor("no-such-mode").id, DEFAULT_VENUE);
  assert.equal(venueFor("career", 999).id, DEFAULT_VENUE, "an event out of range falls back, it does not throw");
  assert.equal(venueFor("career", null).id, DEFAULT_VENUE);
});
