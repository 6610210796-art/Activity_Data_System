import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAverageSatisfaction,
  formatFiscalQuarterMonths,
  formatPlannedDateMonth,
  formatPlannedDateRange,
  getNextFiscalQuarter,
  getPreviousFiscalQuarter,
  mergeDepartmentActivityCounts,
  sortFeaturedActivities,
} from "../src/lib/admin-dashboard-metrics.ts";
import { buildDashboardPlannedConditions } from "../src/lib/admin-dashboard-query.ts";

test("previous and next fiscal quarters cross fiscal-year boundaries", () => {
  assert.deepEqual(
    getPreviousFiscalQuarter({ fiscalYear: 2570, quarterNo: 1 }),
    { fiscalYear: 2569, quarterNo: 4 },
  );
  assert.deepEqual(
    getNextFiscalQuarter({ fiscalYear: 2569, quarterNo: 4 }),
    { fiscalYear: 2570, quarterNo: 1 },
  );
});

test("dashboard planned summary and table use next quarter across fiscal year", () => {
  const selected = { fiscalYear: 2569, quarterNo: 4 };
  const planQuarter = getNextFiscalQuarter(selected);
  assert.deepEqual(planQuarter, { fiscalYear: 2570, quarterNo: 1 });

  const planned = buildDashboardPlannedConditions(
    { departmentCode: "STI", activityTypeId: 2 },
    planQuarter,
  );
  assert.deepEqual(planned.values, [2570, 1, 2, "STI", "STI"]);
  assert.match(planned.conditions.join(" AND "), /pa\.fiscal_year = \?/);
  assert.match(planned.conditions.join(" AND "), /pa\.quarter_no = \?/);
  assert.match(planned.conditions.join(" AND "), /planned_co_organizers/);
});

test("quarter and planned-event labels use Thai fiscal dates", () => {
  assert.equal(
    formatFiscalQuarterMonths({ fiscalYear: 2569, quarterNo: 1 }),
    "ต.ค. – ธ.ค. 2568",
  );
  assert.equal(
    formatPlannedDateRange("2025-10-30", "2025-11-02"),
    "30 ต.ค. – 2 พ.ย.",
  );
  assert.equal(formatPlannedDateMonth("2025-12-01"), "ธ.ค.");
});

test("department counts include main and co-organizer affiliations", () => {
  const result = mergeDepartmentActivityCounts(
    [
      { code: "A", name_th: "หน่วย A", sort_no: 1 },
      { code: "B", name_th: "หน่วย B", sort_no: 2 },
      { code: "C", name_th: "หน่วย C", sort_no: 3 },
    ],
    [
      { department_code: "A", activity_count: 2 },
      { department_code: "B", activity_count: "1" },
    ],
    [
      { department_code: "A", activity_count: 1 },
      { department_code: "B", activity_count: 3 },
    ],
  );

  assert.deepEqual(
    result.map(({ code, activity_count }) => [code, activity_count]),
    [
      ["B", 4],
      ["A", 3],
      ["C", 0],
    ],
  );
});

test("average satisfaction uses only activities with an evaluation", () => {
  assert.equal(calculateAverageSatisfaction(170, 2), 85);
  assert.equal(calculateAverageSatisfaction(0, 0), null);
});

test("featured activities sort by satisfaction, participants, then null satisfaction", () => {
  const result = sortFeaturedActivities([
    { id: 1, satisfaction_percent: null, total_participants: 100 },
    { id: 2, satisfaction_percent: 90, total_participants: 20 },
    { id: 3, satisfaction_percent: 90, total_participants: 40 },
    { id: 4, satisfaction_percent: 80, total_participants: 200 },
    { id: 5, satisfaction_percent: null, total_participants: 150 },
  ]);

  assert.deepEqual(
    result.map(({ id }) => id),
    [3, 2, 4, 5, 1],
  );
});
