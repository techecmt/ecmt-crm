import assert from "node:assert/strict";
import test from "node:test";

import { looksLikeNamedCourseQuery, scoreCourseMatch } from "./course-matching.ts";

test("matches civil engineer wording to civil engineering course", () => {
  const civilScore = scoreCourseMatch({
    text: "diploma in civil engineer course cost how much",
    leadCourse: "",
    courseName: "Diploma in Civil Engineering",
    aliases: ["civil engineering", "civil eng diploma"],
  });
  const meScore = scoreCourseMatch({
    text: "diploma in civil engineer course cost how much",
    leadCourse: "",
    courseName: "Diploma in Mechanical and Electrical (M&E) Engineering",
    aliases: ["m&e", "mechanical electrical engineering"],
  });

  assert.ok(civilScore > 0);
  assert.ok(civilScore > meScore);
});

test("returns zero score for missing course names", () => {
  const score = scoreCourseMatch({
    text: "can you share fee for diploma in data science",
    leadCourse: "",
    courseName: "Diploma in Civil Engineering",
    aliases: ["civil engineering", "civil eng diploma"],
  });
  assert.equal(score, 0);
});

test("detects named course phrases but not generic fee prompts", () => {
  assert.equal(looksLikeNamedCourseQuery("Diploma in civil engineer course cost"), true);
  assert.equal(looksLikeNamedCourseQuery("Can you share fees and installment options?"), false);
});
