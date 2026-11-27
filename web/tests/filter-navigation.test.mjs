import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildFilterQuery,
  isLatestRequest,
  resetFilterPage,
} from "../src/lib/filter-navigation.ts";
import { buildMineActivityConditions } from "../src/lib/mine-activity-filter.ts";
import { addDashboardPastFilters } from "../src/lib/admin-dashboard-query.ts";

const [clearButtonSource, clearButtonStyles, mineSource, dashboardFiltersSource, dashboardSource, activitiesSource, usersSource] = await Promise.all([
  readFile(new URL("../src/components/clear-filters-button.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../src/components/mine-activities.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/dashboard-filter-controls.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/admin-dashboard.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/admin-activities.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/admin-users.tsx", import.meta.url), "utf8"),
]);

test("clear-filter controls share the icon, label layout, and sizing on all list pages", () => {
  assert.match(clearButtonSource, /FilterX/);
  assert.match(clearButtonSource, /clear-filters-button/);
  for (const source of [mineSource, dashboardFiltersSource, dashboardSource, activitiesSource, usersSource]) {
    assert.match(source, /<ClearFiltersButton\b/);
  }
  assert.match(clearButtonStyles, /\.clear-filters-button\s*\{[^}]*min-height:\s*40px;[^}]*gap:\s*8px;[^}]*white-space:\s*nowrap;/s);
  assert.match(clearButtonStyles, /\.clear-filters-button:hover\s*\{[^}]*border-color:\s*#cbd5e1;[^}]*background:\s*#f8fafc;/s);
});

test("filter query omits empty values and resets pagination", () => {
  const filters = resetFilterPage({ status: "active", role: "", page: "8" });
  assert.equal(filters.page, "1");
  assert.equal(buildFilterQuery(filters), "status=active");
});

test("filter query preserves every selected condition together", () => {
  const query = new URLSearchParams(buildFilterQuery({
    q: "activity",
    fiscalYear: "2570",
    quarterNo: "2",
    department: "STI",
  }));
  assert.deepEqual([...query.entries()], [
    ["q", "activity"],
    ["fiscalYear", "2570"],
    ["quarterNo", "2"],
    ["department", "STI"],
  ]);
});

test("late request results are marked stale", () => {
  assert.equal(isLatestRequest(5, 5), true);
  assert.equal(isLatestRequest(4, 5), false);
});

test("mine list and both tab counts share parameterized AND filters", () => {
  const result = buildMineActivityConditions({
    fiscalYear: 2570,
    quarterNo: 3,
    activityTypeId: 4,
    departmentCode: "STI",
    search: "seminar",
  });
  assert.equal(
    result.sql,
    "a.deleted_at IS NULL AND a.main_department = ? AND a.fiscal_year = ? AND a.quarter_no = ? AND a.activity_type_id = ? AND a.title LIKE ?",
  );
  assert.deepEqual(result.values, ["STI", 2570, 3, 4, "%seminar%"]);
});

test("dashboard past filters combine fiscal period, type, and main/co-organizer department", () => {
  const where = ["pa.deleted_at IS NULL", "pa.fiscal_year = ?", "pa.quarter_no = ?"];
  const values = [2570, 4];
  addDashboardPastFilters(where, values, {
    departmentCode: "STI",
    activityTypeId: 3,
  }, true);
  assert.deepEqual(values, [2570, 4, 3, "STI", "STI"]);
  assert.match(where.join(" AND "), /pa\.activity_type_id = \?/);
  assert.match(where.join(" AND "), /pa\.main_department = \? OR EXISTS/);

  const chartWhere = ["pa.deleted_at IS NULL", "pa.fiscal_year = ?", "pa.quarter_no = ?"];
  const chartValues = [2570, 4];
  addDashboardPastFilters(chartWhere, chartValues, {
    departmentCode: "STI",
    activityTypeId: 3,
  }, false);
  assert.deepEqual(chartValues, [2570, 4, 3]);
  assert.ok(!chartWhere.join(" AND ").includes("pa.main_department"));
});
