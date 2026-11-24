import assert from "node:assert/strict";
import test from "node:test";
import {
  getQuarterDateRange,
  validateActivityDates,
} from "../src/lib/activity-date-validation.ts";

function validatePastActivityDates(input, today) {
  return validateActivityDates({
    ...input,
    startField: "start_date",
    endField: "end_date",
    startRule: "not_after_today",
    today,
  });
}

test("fiscal quarter 1 uses October through December of the previous Gregorian year", () => {
  assert.deepEqual(getQuarterDateRange(2569, 1), {
    start: "2025-10-01",
    end: "2025-12-31",
  });
});

test("quarter date validation accepts its final day and rejects the next quarter", () => {
  assert.equal(
    validatePastActivityDates(
      {
        fiscalYear: 2569,
        quarterNo: 1,
        startDate: "2025-12-30",
        endDate: "2025-12-31",
      },
      "2025-12-31",
    ),
    null,
  );
  assert.deepEqual(
    validatePastActivityDates(
      {
        fiscalYear: 2569,
        quarterNo: 1,
        startDate: "2026-01-01",
        endDate: "2026-01-02",
      },
      "2026-01-02",
    ),
    { field: "start_date", key: "err.date.quarter" },
  );
});

test("date validation rejects future starts and an end before the start", () => {
  assert.deepEqual(
    validatePastActivityDates(
      {
        fiscalYear: 2569,
        quarterNo: 1,
        startDate: "2025-12-31",
        endDate: "2025-12-31",
      },
      "2025-12-30",
    ),
    { field: "start_date", key: "err.date.future" },
  );
  assert.deepEqual(
    validatePastActivityDates(
      {
        fiscalYear: 2569,
        quarterNo: 1,
        startDate: "2025-12-30",
        endDate: "2025-12-29",
      },
      "2025-12-31",
    ),
    { field: "end_date", key: "err.date.order" },
  );
});
