const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/core.js");
const H = globalThis.Unreel;

// 2026-11-02 is a Monday.
const at = (day, hhmm) => new Date(`2026-11-0${day + 1}T${hhmm}:00`);
const scheduled = (over = {}) => H.normalize({ scheduleEnabled: true, ...over });
const school = { start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] };
const late = { start: "22:00", end: "02:00", days: [5] }; // Friday night

test("with no hours set, blocking runs all day", () => {
  assert.equal(H.isBlocking(H.defaults(), at(0, "03:00")), true);
});

test("schedule window edges: start included, end excluded", () => {
  const s = scheduled({ schedules: [school] });
  assert.equal(H.isBlocking(s, at(1, "08:59")), false);
  assert.equal(H.isBlocking(s, at(1, "09:00")), true);
  assert.equal(H.isBlocking(s, at(1, "16:59")), true);
  assert.equal(H.isBlocking(s, at(1, "17:00")), false);
  assert.equal(H.isBlocking(s, at(0, "12:00")), false);
});

test("overnight window spills into the next day only", () => {
  const s = scheduled({ schedules: [late] });
  assert.equal(H.isBlocking(s, at(5, "23:00")), true);
  assert.equal(H.isBlocking(s, at(6, "01:59")), true);
  assert.equal(H.isBlocking(s, at(6, "02:00")), false);
  assert.equal(H.isBlocking(s, at(5, "01:00")), false);
  assert.equal(H.isBlocking(s, at(6, "23:00")), false);
});

test("start equal to end covers 24 hours", () => {
  const s = scheduled({ schedules: [{ start: "00:00", end: "00:00", days: [3] }] });
  assert.equal(H.isBlocking(s, at(3, "00:00")), true);
  assert.equal(H.isBlocking(s, at(3, "23:59")), true);
  assert.equal(H.isBlocking(s, at(4, "00:00")), false);
});

test("a schedule with no days falls back to always blocking", () => {
  const s = scheduled({ schedules: [{ start: "09:00", end: "10:00", days: [] }] });
  assert.equal(H.isBlocking(s, at(1, "20:00")), true);
});

test("pause overrides everything until it expires", () => {
  const now = at(1, "12:00");
  const s = H.normalize({ pausedUntil: now.getTime() + 1000 });
  assert.equal(H.isBlocking(s, now), false);
  assert.equal(H.isBlocking(s, new Date(now.getTime() + 1000)), true);
  assert.equal(H.nextChange(s, now).getTime(), s.pausedUntil);
});

test("nextChange finds the next schedule boundary", () => {
  const s = scheduled({ schedules: [school] });
  assert.equal(H.nextChange(s, at(1, "12:00")).getHours(), 17);
  const fromFridayNight = H.nextChange(s, at(5, "18:00"));
  assert.equal(fromFridayNight.getDay(), 1);
  assert.equal(fromFridayNight.getHours(), 9);
  assert.equal(H.nextChange(H.defaults(), at(1, "12:00")), null);
});

test("bandsForDay splits overnight windows across days", () => {
  assert.deepEqual(H.bandsForDay([late], 5), [{ start: 1320, end: 1440 }]);
  assert.deepEqual(H.bandsForDay([late], 6), [{ start: 0, end: 120 }]);
  assert.deepEqual(H.bandsForDay([late], 4), []);
});

const url = (u) => new URL(u);
const noon = at(1, "12:00");

test("Shorts URLs redirect to the normal player", () => {
  const s = H.defaults();
  assert.equal(H.decide(s, url("https://www.youtube.com/shorts/abc123"), noon).redirect, "/watch?v=abc123");
  assert.equal(H.decide(s, url("https://www.youtube.com/shorts/"), noon).redirect, "/");
  assert.equal(H.decide(s, url("https://www.youtube.com/shortsfan"), noon).redirect, null);
  assert.equal(H.decide(s, url("https://www.youtube.com/watch?v=x"), noon).redirect, null);
});

test("rules that are off produce no block", () => {
  const s = H.normalize({ rules: { ytShorts: false, ytHome: false } });
  const d = H.decide(s, url("https://www.youtube.com/shorts/abc"), noon);
  assert.equal(d.redirect, null);
  assert.ok(d.allow.includes("ytShorts"));
  assert.equal(H.decide(s, url("https://www.youtube.com/"), noon).page, null);
});

test("outside schedule hours everything is allowed", () => {
  const s = scheduled({ schedules: [school] });
  const d = H.decide(s, url("https://www.youtube.com/shorts/abc"), at(0, "12:00"));
  assert.equal(d.redirect, null);
  assert.equal(d.page, null);
  assert.equal(d.allow.length, H.RULES.length);
});

test("Instagram page classification", () => {
  const s = H.defaults();
  const page = (p) => H.decide(s, url(`https://www.instagram.com${p}`), noon).page;
  assert.equal(page("/"), "igFeed");
  assert.equal(page("/reels/"), "igReels");
  assert.equal(page("/reels/DfPMs8fthbG/"), "igReels");
  assert.equal(page("/reel/DfPMs8fthbG/"), null);
  assert.equal(page("/explore/"), "igExplore");
  assert.equal(page("/explore/search/"), null);
  assert.equal(page("/direct/inbox/"), null);
  assert.equal(page("/reelsfan/"), null);
});

test("hours that are saved but switched off are ignored", () => {
  const s = H.normalize({ scheduleEnabled: false, schedules: [school] });
  assert.equal(H.isBlocking(s, at(0, "03:00")), true);
});
