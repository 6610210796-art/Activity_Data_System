import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminActivitiesQueries,
  escapeLikeLiteral,
  parseAdminActivitiesFilters,
  ADMIN_ACTIVITIES_PAGE_SIZE,
  ADMIN_ACTIVITIES_EXPORT_LIMIT,
} from "../src/lib/admin-activities-query.ts";
import { getAdminActivityAccessStatus } from "../src/lib/admin-activities-access.ts";
import { excelSafeText } from "../src/lib/excel-safe.ts";

const options = {
  fiscalYears: [2570, 2569],
  departments: [{ code: "PSUBIC" }, { code: "IPOP" }],
  activityTypes: [{ id: 1 }, { id: 2 }],
};

test("combines past and planned tables and counts before pagination", () => {
  const filters = parseAdminActivitiesFilters({}, options);
  const queries = buildAdminActivitiesQueries(filters);

  assert.match(queries.unionSql, /FROM past_activities/);
  assert.match(queries.unionSql, /UNION ALL/);
  assert.match(queries.unionSql, /FROM planned_activities/);
  assert.match(queries.countSql, /SELECT COUNT\(\*\) AS total FROM \(/);
  assert.match(queries.pageSql, /LIMIT \? OFFSET \?/);
  assert.equal(ADMIN_ACTIVITIES_PAGE_SIZE, 20);
});

test("combined filters use parameters for year, quarter, department, type and status", () => {
  const filters = parseAdminActivitiesFilters(
    new URLSearchParams({
      fy: "2569",
      quarter: "4",
      department: "PSUBIC",
      activity_type: "1",
      status: "planned",
      q: "นวัตกรรม",
    }),
    options,
  );
  const queries = buildAdminActivitiesQueries(filters);

  assert.equal(filters.fiscalYear, 2569);
  assert.equal(filters.quarterNo, 4);
  assert.equal(filters.departmentCode, "PSUBIC");
  assert.equal(filters.activityTypeId, 1);
  assert.equal(filters.status, "planned");
  assert.ok(queries.values.includes(2569));
  assert.ok(queries.values.includes(4));
  assert.ok(queries.values.includes("PSUBIC"));
  assert.ok(queries.values.includes(1));
  assert.ok(queries.values.every((value) => typeof value !== "object"));
});

test("department co-organizer filter is checked for both tables", () => {
  const filters = {
    ...parseAdminActivitiesFilters({}, options),
    departmentCode: "IPOP",
  };
  const queries = buildAdminActivitiesQueries(filters);

  assert.match(queries.unionSql, /past_co_organizers/);
  assert.match(queries.unionSql, /planned_co_organizers/);
  assert.match(
    queries.unionSql,
    /co_filter\.department_code = \?/,
  );
});

test("sorting rejects unknown fields and uses a whitelist", () => {
  const filters = parseAdminActivitiesFilters(
    new URLSearchParams({ sort: "title;DROP TABLE", direction: "sideways" }),
    options,
  );
  const queries = buildAdminActivitiesQueries(filters);

  assert.equal(filters.sort, "date");
  assert.equal(filters.direction, "desc");
  assert.match(queries.pageSql, /ORDER BY start_date DESC/);
  assert.doesNotMatch(queries.pageSql, /DROP TABLE/i);
});

test("LIKE searches escape percent and underscore", () => {
  assert.equal(escapeLikeLiteral("A%B_C"), "A!%B!_C");
  assert.equal(escapeLikeLiteral("50%"), "50!%");

  const filters = parseAdminActivitiesFilters(
    new URLSearchParams({ q: "50%" }),
    options,
  );
  const queries = buildAdminActivitiesQueries(filters);
  assert.ok(queries.values.includes("%50!%%"));
});

test("Excel formula-injection strings become text", () => {
  assert.equal(excelSafeText("=1+1"), "'=1+1");
  assert.equal(excelSafeText("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(excelSafeText("+SUM(A1)"), "'+SUM(A1)");
  assert.equal(excelSafeText("-1"), "'-1");
  assert.equal(excelSafeText("\nกิจกรรม"), "'\nกิจกรรม");
  assert.equal(excelSafeText("กิจกรรมปกติ"), "กิจกรรมปกติ");
});

test("export limit is 10,000 rows", () => {
  assert.equal(ADMIN_ACTIVITIES_EXPORT_LIMIT, 10_000);
});

test("only admin users receive access to admin activities", () => {
  assert.equal(getAdminActivityAccessStatus(null), 401);
  assert.equal(
    getAdminActivityAccessStatus({ role: "unit_user" }),
    403,
  );
  assert.equal(getAdminActivityAccessStatus({ role: "admin" }), 200);
});
