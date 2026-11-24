export const ADMIN_ACTIVITIES_PAGE_SIZE = 20;
export const ADMIN_ACTIVITIES_EXPORT_LIMIT = 10_000;

export type ActivityStatusFilter =
  | "all"
  | "past"
  | "planned"
  | "confirmed"
  | "unconfirmed";
export type ActivitySortField = "date" | "participants" | "satisfaction";
export type ActivitySortDirection = "asc" | "desc";

export interface AdminActivitiesFilters {
  search: string;
  fiscalYear: number | null;
  quarterNo: number | null;
  departmentCode: string | null;
  activityTypeId: number | null;
  status: ActivityStatusFilter;
  sort: ActivitySortField;
  direction: ActivitySortDirection;
  page: number;
}

export interface AdminActivitiesFilterOptions {
  fiscalYears: readonly number[];
  departments: readonly { code: string }[];
  activityTypes: readonly { id: number }[];
}

export interface AdminActivitiesQueries {
  unionSql: string;
  values: (string | number)[];
  countSql: string;
  pageSql: string;
  pageValues: (string | number)[];
  exportSql: string;
  exportValues: (string | number)[];
}

type SearchParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function getParam(params: SearchParams, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key);
  const value = params[key];
  return typeof value === "string" ? value : null;
}

function parseInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseAdminActivitiesFilters(
  params: SearchParams,
  options: AdminActivitiesFilterOptions,
): AdminActivitiesFilters {
  const year = parseInteger(getParam(params, "fy"));
  const quarter = parseInteger(getParam(params, "quarter"));
  const activityTypeId = parseInteger(getParam(params, "activity_type"));
  const requestedStatus = getParam(params, "status");
  const requestedSort = getParam(params, "sort");
  const requestedDirection = getParam(params, "direction");
  const requestedPage = parseInteger(getParam(params, "page"));

  const statuses: readonly ActivityStatusFilter[] = [
    "all",
    "past",
    "planned",
    "confirmed",
    "unconfirmed",
  ];
  const sortFields: readonly ActivitySortField[] = [
    "date",
    "participants",
    "satisfaction",
  ];

  return {
    search: (getParam(params, "q") ?? "").trim().slice(0, 150),
    fiscalYear:
      year !== null && options.fiscalYears.includes(year) ? year : null,
    quarterNo: quarter !== null && quarter >= 1 && quarter <= 4 ? quarter : null,
    departmentCode: options.departments.some(
      (department) => department.code === getParam(params, "department"),
    )
      ? getParam(params, "department")
      : null,
    activityTypeId:
      activityTypeId !== null &&
      options.activityTypes.some((activityType) => activityType.id === activityTypeId)
        ? activityTypeId
        : null,
    status: statuses.includes(requestedStatus as ActivityStatusFilter)
      ? (requestedStatus as ActivityStatusFilter)
      : "all",
    sort: sortFields.includes(requestedSort as ActivitySortField)
      ? (requestedSort as ActivitySortField)
      : "date",
    direction: requestedDirection === "asc" ? "asc" : "desc",
    page: requestedPage !== null && requestedPage > 0 ? requestedPage : 1,
  };
}

export function escapeLikeLiteral(value: string): string {
  return value.replace(/[!%_]/g, "!$&");
}

function addSharedFilters(
  conditions: string[],
  values: (string | number)[],
  filters: AdminActivitiesFilters,
  coOrganizerTable: "past_co_organizers" | "planned_co_organizers",
  coOrganizerForeignKey: "past_id" | "planned_id",
): void {
  if (filters.fiscalYear !== null) {
    conditions.push("a.fiscal_year = ?");
    values.push(filters.fiscalYear);
  }
  if (filters.quarterNo !== null) {
    conditions.push("a.quarter_no = ?");
    values.push(filters.quarterNo);
  }
  if (filters.activityTypeId !== null) {
    conditions.push("a.activity_type_id = ?");
    values.push(filters.activityTypeId);
  }
  if (filters.departmentCode !== null) {
    conditions.push(
      `(a.main_department = ? OR EXISTS (
        SELECT 1 FROM ${coOrganizerTable} co_filter
        WHERE co_filter.${coOrganizerForeignKey} = a.id
          AND co_filter.department_code = ?
      ))`,
    );
    values.push(filters.departmentCode, filters.departmentCode);
  }
  if (filters.search) {
    const search = `%${escapeLikeLiteral(filters.search)}%`;
    conditions.push(
      `(a.title LIKE ? ESCAPE '!'
        OR pt.name_th LIKE ? ESCAPE '!'
        OR d.code LIKE ? ESCAPE '!'
        OR d.name_th LIKE ? ESCAPE '!'
        OR EXISTS (
          SELECT 1
          FROM ${coOrganizerTable} co_search
          INNER JOIN departments co_department
            ON co_department.code = co_search.department_code
          WHERE co_search.${coOrganizerForeignKey} = a.id
            AND (co_department.code LIKE ? ESCAPE '!'
              OR co_department.name_th LIKE ? ESCAPE '!')
        ))`,
    );
    values.push(search, search, search, search, search, search);
  }
}

function buildSelect(
  kind: "past" | "planned",
  filters: AdminActivitiesFilters,
): { sql: string; values: (string | number)[] } {
  const isPast = kind === "past";
  const coOrganizerTable = isPast
    ? "past_co_organizers"
    : "planned_co_organizers";
  const coOrganizerForeignKey = isPast ? "past_id" : "planned_id";
  const conditions = ["a.deleted_at IS NULL"];
  const values: (string | number)[] = [];

  addSharedFilters(
    conditions,
    values,
    filters,
    coOrganizerTable,
    coOrganizerForeignKey,
  );

  if (isPast && !["all", "past"].includes(filters.status)) {
    conditions.push("1 = 0");
  } else if (!isPast) {
    if (filters.status === "past") {
      conditions.push("1 = 0");
    } else if (
      filters.status === "confirmed" ||
      filters.status === "unconfirmed"
    ) {
      conditions.push("a.date_status = ?");
      values.push(filters.status);
    }
  }

  const selectSql = isPast
    ? `SELECT
         'past' AS kind,
         a.id,
         a.fiscal_year,
         a.quarter_no,
         a.title,
         a.main_department,
         d.name_th AS main_department_name,
         a.activity_type_id,
         at.name_th AS activity_type_name,
         pt.name_th AS participant_type_name,
         DATE_FORMAT(a.start_date, '%Y-%m-%d') AS start_date,
         DATE_FORMAT(a.end_date, '%Y-%m-%d') AS end_date,
         a.total_participants AS participants,
         a.satisfaction_percent,
         'past' AS status,
         a.result_summary,
         a.location,
         a.ref_link,
         a.created_by,
         creator.full_name AS creator_name,
         DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         (SELECT GROUP_CONCAT(co.department_code ORDER BY co.department_code SEPARATOR ', ')
          FROM past_co_organizers co WHERE co.past_id = a.id) AS co_organizers
       FROM past_activities a
       INNER JOIN departments d ON d.code = a.main_department
       INNER JOIN activity_types at ON at.id = a.activity_type_id
       INNER JOIN participant_types pt ON pt.id = a.participant_type_id
       LEFT JOIN profiles creator ON creator.id = a.created_by`
    : `SELECT
         'planned' AS kind,
         a.id,
         a.fiscal_year,
         a.quarter_no,
         a.title,
         a.main_department,
         d.name_th AS main_department_name,
         a.activity_type_id,
         at.name_th AS activity_type_name,
         pt.name_th AS participant_type_name,
         DATE_FORMAT(a.expected_start, '%Y-%m-%d') AS start_date,
         DATE_FORMAT(a.expected_end, '%Y-%m-%d') AS end_date,
         a.expected_participants AS participants,
         CAST(NULL AS DECIMAL(4,1)) AS satisfaction_percent,
         a.date_status AS status,
         CAST(NULL AS CHAR(500)) AS result_summary,
         a.location,
         a.ref_link,
         a.created_by,
         creator.full_name AS creator_name,
         DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         (SELECT GROUP_CONCAT(co.department_code ORDER BY co.department_code SEPARATOR ', ')
          FROM planned_co_organizers co WHERE co.planned_id = a.id) AS co_organizers
       FROM planned_activities a
       INNER JOIN departments d ON d.code = a.main_department
       INNER JOIN activity_types at ON at.id = a.activity_type_id
       INNER JOIN participant_types pt ON pt.id = a.participant_type_id
       LEFT JOIN profiles creator ON creator.id = a.created_by`;

  return {
    sql: `${selectSql}\nWHERE ${conditions.join(" AND ")}`,
    values,
  };
}

export function buildAdminActivitiesQueries(
  filters: AdminActivitiesFilters,
): AdminActivitiesQueries {
  const past = buildSelect("past", filters);
  const planned = buildSelect("planned", filters);
  const unionSql = `${past.sql}\nUNION ALL\n${planned.sql}`;
  const values = [...past.values, ...planned.values];
  const sortColumn: Record<ActivitySortField, string> = {
    date: "start_date",
    participants: "participants",
    satisfaction: "satisfaction_percent",
  };
  const sort =
    Object.hasOwn(sortColumn, filters.sort) ? filters.sort : "date";
  const direction = filters.direction === "asc" ? "ASC" : "DESC";
  const orderSql = `ORDER BY ${sortColumn[sort]} ${direction}, start_date DESC, kind ASC, id DESC`;
  const offset = (Math.max(1, filters.page) - 1) * ADMIN_ACTIVITIES_PAGE_SIZE;

  return {
    unionSql,
    values,
    countSql: `SELECT COUNT(*) AS total FROM (${unionSql}) AS activity_rows`,
    pageSql: `SELECT * FROM (${unionSql}) AS activity_rows ${orderSql} LIMIT ? OFFSET ?`,
    pageValues: [...values, ADMIN_ACTIVITIES_PAGE_SIZE, offset],
    exportSql: `SELECT * FROM (${unionSql}) AS activity_rows ${orderSql} LIMIT ?`,
    exportValues: [...values, ADMIN_ACTIVITIES_EXPORT_LIMIT],
  };
}
