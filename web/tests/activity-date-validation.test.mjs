import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBuddhistCalendarDate,
  formatQuarterDateRangeMessage,
  getVisibleActivityDateError,
  formatQuarterDateError,
  getDateInputYear,
  getBangkokToday,
  getQuarterDateRange,
  validateActivityDates,
} from "../src/lib/activity-date-validation.ts";

const quarters = [
  {
    quarterNo: 1,
    start: "2025-10-01",
    before: "2025-09-30",
    end: "2025-12-31",
    after: "2026-01-01",
  },
  {
    quarterNo: 2,
    start: "2026-01-01",
    before: "2025-12-31",
    end: "2026-03-31",
    after: "2026-04-01",
  },
  {
    quarterNo: 3,
    start: "2026-04-01",
    before: "2026-03-31",
    end: "2026-06-30",
    after: "2026-07-01",
  },
  {
    quarterNo: 4,
    start: "2026-07-01",
    before: "2026-06-30",
    end: "2026-09-30",
    after: "2026-10-01",
  },
];

function validateQuarter(quarterNo, startDate, endDate) {
  return validateActivityDates({
    fiscalYear: 2569,
    quarterNo,
    startDate,
    endDate,
    startField: "start_date",
    endField: "end_date",
    startRule: "not_after_today",
    today: "2027-01-01",
  });
}

for (const quarter of quarters) {
  test(`fiscal quarter ${quarter.quarterNo} accepts both inclusive boundaries`, () => {
    assert.equal(
      validateQuarter(quarter.quarterNo, quarter.start, quarter.end),
      null,
    );
    assert.equal(
      validateQuarter(quarter.quarterNo, quarter.start, quarter.start),
      null,
    );
    assert.equal(
      validateQuarter(quarter.quarterNo, quarter.end, quarter.end),
      null,
    );
  });

  test(`fiscal quarter ${quarter.quarterNo} rejects dates one day outside either boundary`, () => {
    assert.deepEqual(
      validateQuarter(quarter.quarterNo, quarter.before, quarter.start),
      { field: "start_date", key: "err.date.quarter" },
    );
    assert.deepEqual(
      validateQuarter(quarter.quarterNo, quarter.start, quarter.after),
      { field: "end_date", key: "err.date.quarter" },
    );
  });
}

test("fiscal year 2569 quarter 1 spans October through December 2025", () => {
  assert.deepEqual(getQuarterDateRange(2569, 1), {
    start: "2025-10-01",
    end: "2025-12-31",
  });
});

test("quarter date errors include the valid Thai date range", () => {
  const rangeTemplate =
    "ไตรมาสนี้คือ {beRange} (พ.ศ.) / ช่องวันที่ด้านล่างใช้ปี ค.ศ.: {adRange}";
  assert.equal(
    formatQuarterDateRangeMessage(rangeTemplate, 2569, 1),
    "ไตรมาสนี้คือ 1 ต.ค. 2568 – 31 ธ.ค. 2568 (พ.ศ.) / ช่องวันที่ด้านล่างใช้ปี ค.ศ.: 01/10/2025 – 31/12/2025",
  );
  assert.equal(
    formatQuarterDateError(
      "วันที่ต้องอยู่ในไตรมาสที่เลือก",
      2569,
      1,
      rangeTemplate,
    ),
    "วันที่ต้องอยู่ในไตรมาสที่เลือก (ไตรมาสนี้คือ 1 ต.ค. 2568 – 31 ธ.ค. 2568 (พ.ศ.) / ช่องวันที่ด้านล่างใช้ปี ค.ศ.: 01/10/2025 – 31/12/2025)",
  );
  assert.equal(formatBuddhistCalendarDate("2025-10-01"), "1 ต.ค. 2568");
  assert.equal(getDateInputYear("2568-12-31"), 2568);
  assert.deepEqual(
    validateQuarter(4, "2026-07-01", "2026-10-03"),
    { field: "end_date", key: "err.date.quarter" },
  );
  assert.deepEqual(
    validateQuarter(1, "2568-12-31", "2025-12-31"),
    { field: "start_date", key: "err.date.quarter" },
  );
  assert.deepEqual(
    validateActivityDates({
      fiscalYear: 2569,
      quarterNo: 4,
      startDate: "2026-07-01",
      endDate: "2026-10-03",
      startField: "expected_start",
      endField: "expected_end",
      startRule: "none",
    }),
    { field: "expected_end", key: "err.date.quarter" },
  );
});

test("today and start-date rules use the Bangkok calendar date", () => {
  const now = new Date("2026-11-22T18:00:00.000Z");
  assert.equal(getBangkokToday(now), "2026-11-23");

  const input = {
    fiscalYear: 2569,
    quarterNo: 1,
    startDate: "2025-12-31",
    endDate: "2025-12-31",
    startField: "start_date",
    endField: "end_date",
    today: "2025-12-31",
  };
  assert.equal(
    validateActivityDates({ ...input, startRule: "not_after_today" }),
    null,
  );
  assert.deepEqual(
    validateActivityDates({
      ...input,
      startDate: "2025-12-30",
      startRule: "not_before_today",
    }),
    { field: "start_date", key: "err.date.planned_future" },
  );
  assert.equal(
    validateActivityDates({
      ...input,
      startDate: "2025-12-30",
      startRule: "none",
    }),
    null,
  );
});

test("date error is recalculated from current values after quarter, year, or date changes", () => {
  const values = {
    fiscalYear: 2569,
    quarterNo: 2,
    startDate: "2025-10-02",
    endDate: "2025-12-31",
    startField: "start_date",
    endField: "end_date",
    startRule: "not_after_today",
    today: "2026-11-23",
  };
  const touched = { start_date: true, end_date: true };
  const visibleError = () =>
    getVisibleActivityDateError(values, touched);
  const visibleMessage = () => {
    const error = visibleError();
    return error
      ? formatQuarterDateError("วันที่อยู่นอกช่วง", values.fiscalYear, values.quarterNo)
      : null;
  };

  assert.deepEqual(visibleError(), {
    field: "start_date",
    key: "err.date.quarter",
  });
  assert.equal(
    visibleMessage(),
    "วันที่อยู่นอกช่วง (ไตรมาสนี้คือ 1 ม.ค. 2569 – 31 มี.ค. 2569)",
  );

  values.quarterNo = 1;
  assert.equal(visibleError(), null);
  assert.equal(visibleMessage(), null);

  values.quarterNo = 2;
  assert.deepEqual(visibleError(), {
    field: "start_date",
    key: "err.date.quarter",
  });

  values.quarterNo = 1;
  values.fiscalYear = 2570;
  assert.deepEqual(visibleError(), {
    field: "start_date",
    key: "err.date.quarter",
  });
  assert.equal(
    visibleMessage(),
    "วันที่อยู่นอกช่วง (ไตรมาสนี้คือ 1 ต.ค. 2569 – 31 ธ.ค. 2569)",
  );

  values.fiscalYear = 2569;
  values.startDate = "2025-10-02";
  values.endDate = "2026-01-01";
  assert.deepEqual(visibleError(), {
    field: "end_date",
    key: "err.date.quarter",
  });

  values.endDate = "2025-12-31";
  assert.equal(visibleError(), null);

  values.quarterNo = 2;
  values.startDate = "2026-01-02";
  values.endDate = "2026-03-31";
  assert.equal(visibleError(), null);

  values.endDate = "2026-04-01";
  assert.deepEqual(visibleError(), {
    field: "end_date",
    key: "err.date.quarter",
  });
});

test("planned edit date errors follow current quarter values without the create-date restriction", () => {
  const values = {
    fiscalYear: 2569,
    quarterNo: 2,
    startDate: "2025-10-02",
    endDate: "2025-12-31",
    startField: "expected_start",
    endField: "expected_end",
    startRule: "none",
    today: "2026-11-23",
  };
  const touched = { expected_start: true, expected_end: true };
  const visibleError = () =>
    getVisibleActivityDateError(values, touched);

  assert.deepEqual(visibleError(), {
    field: "expected_start",
    key: "err.date.quarter",
  });
  values.quarterNo = 1;
  assert.equal(visibleError(), null);

  values.quarterNo = 2;
  values.startDate = "2026-01-02";
  values.endDate = "2026-03-31";
  assert.equal(visibleError(), null);
});
