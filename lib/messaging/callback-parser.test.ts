import test from "node:test";
import assert from "node:assert/strict";

import { parseCallbackChoice } from "./callback-parser.ts";

const NOW = new Date("2026-09-29T07:00:00.000Z");

test("parses option 1 as today evening", () => {
  const result = parseCallbackChoice({ userText: "1", now: NOW });
  assert.equal(result.kind, "matched");
  if (result.kind !== "matched") return;
  assert.equal(result.slot.preset, "today_evening");
  assert.equal(result.slot.dateKey, "2026-09-29");
  assert.equal(result.slot.timeKey, "18:30");
});

test("parses option 2 as tonight", () => {
  const result = parseCallbackChoice({ userText: "2", now: NOW });
  assert.equal(result.kind, "matched");
  if (result.kind !== "matched") return;
  assert.equal(result.slot.preset, "tonight");
  assert.equal(result.slot.dateKey, "2026-09-29");
  assert.equal(result.slot.timeKey, "21:30");
});

test("parses natural-language time tomorrow 3 PM", () => {
  const result = parseCallbackChoice({
    userText: "Tomorrow 3 PM is good for callback",
    now: NOW,
  });
  assert.equal(result.kind, "matched");
  if (result.kind !== "matched") return;
  assert.equal(result.slot.preset, "custom");
  assert.equal(result.slot.dateKey, "2026-09-30");
  assert.equal(result.slot.timeKey, "15:00");
});

test("marks vague callback request as ambiguous", () => {
  const result = parseCallbackChoice({
    userText: "Please schedule a callback next week",
    now: NOW,
  });
  assert.equal(result.kind, "ambiguous");
});

test("rejects invalid numbered choice", () => {
  const result = parseCallbackChoice({ userText: "5", now: NOW });
  assert.equal(result.kind, "invalid");
});
