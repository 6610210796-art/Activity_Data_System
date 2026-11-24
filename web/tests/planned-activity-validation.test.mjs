import test from "node:test";
import assert from "node:assert/strict";
import {
  getNextQuarter,
} from "../src/lib/planned-activity-validation.ts";
import { validateActivityDates } from "../src/lib/activity-date-validation.ts";

function validatePlannedActivityDates(input, today, allowPastStart = false) {
  return validateActivityDates({
    ...input,
    startField: "expected_start",
    endField: "expected_end",
    startRule: allowPastStart ? "none" : "not_before_today",
    today,
  });
}

test("planned quarter 1 uses October through December of the previous Gregorian year", () => {
  assert.equal(
    validatePlannedActivityDates({
      fiscalYear: 2569,
      quarterNo: 1,
      startDate: "2025-10-01",
      endDate: "2025-12-31",
    }, "2025-09-01"),
    null,
  );
});

test("planned date validation rejects start before today", () => {
  assert.deepEqual(
    validatePlannedActivityDates({
      fiscalYear: 2569,
      quarterNo: 4,
      startDate: "2026-06-30",
      endDate: "2026-07-01",
    }, "2026-07-01"),
    { field: "expected_start", key: "err.date.quarter" },
  );
});

test("planned date validation rejects end before start", () => {
  assert.deepEqual(
    validatePlannedActivityDates({
      fiscalYear: 2569,
      quarterNo: 4,
      startDate: "2026-07-02",
      endDate: "2026-07-01",
    }, "2026-07-01"),
    { field: "expected_end", key: "err.date.order" },
  );
});

test("planned edits allow past starts but still reject an end before the start", () => {
  assert.equal(
    validatePlannedActivityDates({
      fiscalYear: 2569,
      quarterNo: 4,
      startDate: "2026-07-01",
      endDate: "2026-07-20",
    }, "2026-08-01", true),
    null,
  );
  assert.deepEqual(
    validatePlannedActivityDates({
      fiscalYear: 2569,
      quarterNo: 4,
      startDate: "2026-07-20",
      endDate: "2026-07-01",
    }, "2026-08-01", true),
    { field: "expected_end", key: "err.date.order" },
  );
});

test("next quarter advances from quarter 4 to quarter 1", () => {
  assert.deepEqual(
    getNextQuarter(new Date("2026-09-15T00:00:00+07:00")),
    { fiscalYear: 2570, quarterNo: 1 },
  );
});
