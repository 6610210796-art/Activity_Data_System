import "server-only";

import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";
import { getActivityOptionSets } from "@/lib/option-queries";
import { formatInactiveLabel } from "@/lib/option-policy";
import {
  ADMIN_ACTIVITIES_EXPORT_LIMIT,
  buildAdminActivitiesQueries,
  type AdminActivitiesFilters,
} from "@/lib/admin-activities-query";

interface QuarterRow extends RowDataPacket {
  no: number | string;
  label_th: string;
}

interface FiscalYearRow extends RowDataPacket {
  fiscal_year: number | string;
}

interface CountRow extends RowDataPacket {
  total: number | string;
}

interface ActivityDbRow extends RowDataPacket {
  kind: "past" | "planned";
  id: number | string;
  fiscal_year: number | string;
  quarter_no: number | string;
  title: string;
  main_department: string;
  main_department_name: string;
  main_department_active: number;
  activity_type_id: number | string;
  activity_type_name: string;
  activity_type_active: number;
  participant_type_name: string;
  participant_type_active: number;
  start_date: string;
  end_date: string;
  participants: number | string;
  satisfaction_percent: number | string | null;
  status: "past" | "confirmed" | "unconfirmed";
  result_summary: string | null;
  location: string | null;
  ref_link: string | null;
  created_by: string;
  creator_name: string | null;
  created_at: string;
  co_organizers: string | null;
}

export interface AdminActivitiesOptions {
  fiscalYears: number[];
  quarters: { no: number; label: string }[];
  departments: { code: string; name: string }[];
  activityTypes: { id: number; name: string }[];
  participantTypes: { id: number; name: string }[];
}

export interface AdminActivity {
  kind: "past" | "planned";
  id: string;
  fiscalYear: number;
  quarterNo: number;
  title: string;
  mainDepartment: string;
  mainDepartmentName: string;
  activityTypeId: number;
  activityTypeName: string;
  participantTypeName: string;
  startDate: string;
  endDate: string;
  participants: number;
  satisfactionPercent: number | null;
  status: "past" | "confirmed" | "unconfirmed";
  resultSummary: string | null;
  location: string | null;
  refLink: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
  coOrganizers: string[];
}

export interface AdminActivitiesPageData {
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  items: AdminActivity[];
}

export class AdminActivitiesExportLimitError extends Error {
  constructor() {
    super(`Export exceeds the ${ADMIN_ACTIVITIES_EXPORT_LIMIT}-row limit.`);
    this.name = "AdminActivitiesExportLimitError";
  }
}

function toNumber(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapActivity(row: ActivityDbRow, inactiveSuffix = ""): AdminActivity {
  return {
    kind: row.kind,
    id: String(row.id),
    fiscalYear: toNumber(row.fiscal_year),
    quarterNo: toNumber(row.quarter_no),
    title: row.title,
    mainDepartment: row.main_department,
    mainDepartmentName: Number(row.main_department_active) === 1
      ? row.main_department_name
      : formatInactiveLabel(row.main_department_name, inactiveSuffix),
    activityTypeId: toNumber(row.activity_type_id),
    activityTypeName: Number(row.activity_type_active) === 1
      ? row.activity_type_name
      : formatInactiveLabel(row.activity_type_name, inactiveSuffix),
    participantTypeName: Number(row.participant_type_active) === 1
      ? row.participant_type_name
      : formatInactiveLabel(row.participant_type_name, inactiveSuffix),
    startDate: row.start_date,
    endDate: row.end_date,
    participants: toNumber(row.participants),
    satisfactionPercent:
      row.satisfaction_percent === null
        ? null
        : toNumber(row.satisfaction_percent),
    status: row.status,
    resultSummary: row.result_summary,
    location: row.location,
    refLink: row.ref_link,
    createdBy: row.created_by,
    creatorName: row.creator_name,
    createdAt: row.created_at,
    coOrganizers: row.co_organizers
      ? row.co_organizers.split(", ").filter(Boolean)
      : [],
  };
}

export async function getAdminActivitiesOptions(
  inactiveSuffix = "",
): Promise<AdminActivitiesOptions> {
  const db = getDb();
  const [
    [fiscalYearRows],
    [quarterRows],
    options,
  ] = await Promise.all([
    db.execute<FiscalYearRow[]>(
      `SELECT fiscal_year
       FROM past_activities
       WHERE deleted_at IS NULL
       GROUP BY fiscal_year
       UNION
       SELECT fiscal_year
       FROM planned_activities
       WHERE deleted_at IS NULL
       GROUP BY fiscal_year
       ORDER BY fiscal_year DESC`,
      [],
    ),
    db.execute<QuarterRow[]>(
      "SELECT no, label_th FROM quarters ORDER BY no",
      [],
    ),
    getActivityOptionSets("filter", inactiveSuffix),
  ]);

  return {
    fiscalYears: fiscalYearRows.map((row) => toNumber(row.fiscal_year)),
    quarters: quarterRows.map((row) => ({
      no: toNumber(row.no),
      label: row.label_th,
    })),
    departments: options.departments.map((row) => ({
      code: row.value,
      name: row.label,
    })),
    activityTypes: options.activityTypes.map((row) => ({
      id: toNumber(row.value),
      name: row.label,
    })),
    participantTypes: options.participantTypes.map((row) => ({
      id: toNumber(row.value),
      name: row.label,
    })),
  };
}

async function countActivities(
  filters: AdminActivitiesFilters,
): Promise<number> {
  const db = getDb();
  const queries = buildAdminActivitiesQueries(filters);
  const [rows] = await db.execute<CountRow[]>(
    queries.countSql,
    queries.values,
  );
  return toNumber(rows[0]?.total ?? 0);
}

export async function getAdminActivitiesPage(
  filters: AdminActivitiesFilters,
  inactiveSuffix = "",
): Promise<AdminActivitiesPageData> {
  const total = await countActivities(filters);
  const totalPages = Math.max(
    1,
    Math.ceil(total / 20),
  );
  const page = Math.min(filters.page, totalPages);
  const queries = buildAdminActivitiesQueries({ ...filters, page });
  const [rows] = await getDb().execute<ActivityDbRow[]>(
    queries.pageSql,
    queries.pageValues,
  );

  return {
    total,
    page,
    totalPages,
    pageSize: 20,
    items: rows.map((row) => mapActivity(row, inactiveSuffix)),
  };
}

export async function getAdminActivitiesForExport(
  filters: AdminActivitiesFilters,
  inactiveSuffix = "",
): Promise<{ total: number; items: AdminActivity[] }> {
  const total = await countActivities(filters);
  if (total > ADMIN_ACTIVITIES_EXPORT_LIMIT) {
    throw new AdminActivitiesExportLimitError();
  }

  const queries = buildAdminActivitiesQueries(filters);
  const [rows] = await getDb().execute<ActivityDbRow[]>(
    queries.exportSql,
    queries.exportValues,
  );
  return { total, items: rows.map((row) => mapActivity(row, inactiveSuffix)) };
}
