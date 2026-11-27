import "server-only";

import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";
import { formatInactiveLabel } from "@/lib/option-policy";
import {
  addDashboardPastFilters,
  buildDashboardPlannedConditions,
} from "@/lib/admin-dashboard-query";
import {
  calculateAverageSatisfaction,
  getNextFiscalQuarter,
  getPreviousFiscalQuarter,
  mergeDepartmentActivityCounts,
  sortFeaturedActivities,
  type DepartmentCountRow,
} from "@/lib/admin-dashboard-metrics";

export interface DashboardFilters {
  fiscalYear: number;
  quarterNo: number;
  departmentCode: string | null;
  activityTypeId: number | null;
}

interface QuarterRow extends RowDataPacket {
  no: number;
  label_th: string;
}

interface DepartmentRow extends RowDataPacket {
  code: string;
  name_th: string;
  sort_no: number;
  is_active: number | boolean;
}

interface ActivityTypeRow extends RowDataPacket {
  id: number;
  name_th: string;
  is_active: number | boolean;
  sort_no: number;
}

interface ParticipantTypeRow extends RowDataPacket {
  id: number;
  name_th: string;
  is_active: number | boolean;
  sort_no: number;
}

interface FiscalYearRow extends RowDataPacket {
  fiscal_year: number;
}

interface QuarterStatsRow extends RowDataPacket {
  fiscal_year: number;
  quarter_no: number;
  activity_count: number | string;
  participants_sum: number | string;
  satisfaction_sum: number | string;
  satisfaction_count: number | string;
}

interface GroupCountRow extends RowDataPacket {
  group_id: number | string;
  activity_count: number | string;
}

interface DepartmentCountDbRow extends RowDataPacket, DepartmentCountRow {}

interface SubmittedDepartmentRow extends RowDataPacket {
  main_department: string;
}

interface FeaturedActivityRow extends RowDataPacket {
  id: number | string;
  title: string;
  main_department: string;
  activity_type_id: number;
  total_participants: number | string;
  satisfaction_percent: number | string | null;
  result_summary: string | null;
}

interface CoOrganizerRow extends RowDataPacket {
  past_id: number | string;
  department_code: string;
}

interface ImageRow extends RowDataPacket {
  past_id: number | string;
  id: number | string;
}

interface PlannedSummaryRow extends RowDataPacket {
  activity_count: number | string;
  confirmed_count: number | string;
  expected_participants_sum: number | string;
}

interface PlannedActivityRow extends RowDataPacket {
  id: number | string;
  title: string;
  main_department: string;
  activity_type_id: number;
  date_status: "confirmed" | "unconfirmed";
  expected_start: string;
  expected_end: string;
  expected_participants: number | string;
}

export interface DashboardOptions {
  fiscalYears: number[];
  quarters: { no: number; label_th: string }[];
  activeDepartments: { code: string; name_th: string }[];
  activeActivityTypes: { id: number; name_th: string }[];
  filterDepartments: { code: string; name_th: string }[];
  filterActivityTypes: { id: number; name_th: string }[];
  activityTypes: { id: number; name_th: string }[];
  participantTypes: { id: number; name_th: string }[];
}

export interface DashboardQuarterMetrics {
  activityCount: number;
  participants: number;
  satisfactionSum: number;
  satisfactionCount: number;
  satisfactionAverage: number | null;
}

export interface DashboardFeaturedActivity {
  id: string;
  title: string;
  mainDepartment: string;
  coOrganizers: string[];
  activityTypeId: number;
  totalParticipants: number;
  satisfactionPercent: number | null;
  resultSummary: string | null;
  firstImageId: string | null;
}

export interface DashboardPlannedActivity {
  id: string;
  title: string;
  mainDepartment: string;
  activityTypeId: number;
  dateStatus: "confirmed" | "unconfirmed";
  expectedStart: string;
  expectedEnd: string;
  expectedParticipants: number;
}

export interface AdminDashboardData {
  filters: DashboardFilters;
  previousQuarter: { fiscalYear: number; quarterNo: number };
  planQuarter: { fiscalYear: number; quarterNo: number };
  current: DashboardQuarterMetrics;
  previous: DashboardQuarterMetrics | null;
  departmentCounts: {
    code: string;
    name: string;
    activityCount: number;
  }[];
  departmentChartActivityCount: number;
  departmentAffiliations: number;
  activityTypeCounts: { id: number; activityCount: number }[];
  participantTypeCounts: { id: number; activityCount: number }[];
  trends: {
    quarterNo: number;
    activityCount: number;
    participants: number;
  }[];
  submittedDepartmentCodes: string[];
  activeDepartmentCount: number;
  featuredActivities: DashboardFeaturedActivity[];
  plannedSummary: {
    activityCount: number;
    confirmedCount: number;
    expectedParticipants: number;
  };
  plannedActivities: DashboardPlannedActivity[];
}

function toNumber(value: number | string | null): number {
  if (value === null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricsFromRow(
  row: QuarterStatsRow | undefined,
): DashboardQuarterMetrics {
  const activityCount = row ? toNumber(row.activity_count) : 0;
  const participants = row ? toNumber(row.participants_sum) : 0;
  const satisfactionSum = row ? toNumber(row.satisfaction_sum) : 0;
  const satisfactionCount = row ? toNumber(row.satisfaction_count) : 0;
  return {
    activityCount,
    participants,
    satisfactionSum,
    satisfactionCount,
    satisfactionAverage: calculateAverageSatisfaction(
      satisfactionSum,
      satisfactionCount,
    ),
  };
}

export async function getAdminDashboardOptions(
  defaultFiscalYear: number,
  inactiveSuffix = "",
): Promise<DashboardOptions> {
  const db = getDb();
  const [
    [quarterRows],
    [departmentRows],
    [activityTypeRows],
    [participantTypeRows],
    [fiscalYearRows],
  ] = await Promise.all([
    db.execute<QuarterRow[]>(
      "SELECT no, label_th FROM quarters ORDER BY no",
      [],
    ),
    db.execute<DepartmentRow[]>(
      "SELECT code, name_th, sort_no, is_active FROM departments ORDER BY sort_no, code",
      [],
    ),
    db.execute<ActivityTypeRow[]>(
      "SELECT id, name_th, is_active, sort_no FROM activity_types ORDER BY sort_no, id",
      [],
    ),
    db.execute<ParticipantTypeRow[]>(
      "SELECT id, name_th, is_active, sort_no FROM participant_types ORDER BY sort_no, id",
      [],
    ),
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
  ]);
  const fiscalYears = new Set(
    fiscalYearRows.map((row) => Number(row.fiscal_year)),
  );
  fiscalYears.add(defaultFiscalYear);

  return {
    fiscalYears: [...fiscalYears].sort((left, right) => right - left),
    quarters: quarterRows.map((row) => ({
      no: Number(row.no),
      label_th: row.label_th,
    })),
    activeDepartments: departmentRows
      .filter((row) => Number(row.is_active) === 1)
      .map((row) => ({ code: row.code, name_th: row.name_th })),
    activeActivityTypes: activityTypeRows
      .filter((row) => Number(row.is_active) === 1)
      .map((row) => ({ id: Number(row.id), name_th: row.name_th })),
    filterDepartments: departmentRows.map((row) => ({
      code: row.code,
      name_th: Number(row.is_active) === 1
        ? row.name_th
        : formatInactiveLabel(row.name_th, inactiveSuffix),
    })),
    filterActivityTypes: activityTypeRows.map((row) => ({
      id: Number(row.id),
      name_th: Number(row.is_active) === 1
        ? row.name_th
        : formatInactiveLabel(row.name_th, inactiveSuffix),
    })),
    activityTypes: activityTypeRows.map((row) => ({
      id: Number(row.id),
      name_th: row.name_th,
    })),
    participantTypes: participantTypeRows.map((row) => ({
      id: Number(row.id),
      name_th: row.name_th,
    })),
  };
}

export async function getAdminDashboardData(
  filters: DashboardFilters,
  options: DashboardOptions,
): Promise<AdminDashboardData> {
  const db = getDb();
  const previousQuarter = getPreviousFiscalQuarter(filters);
  const planQuarter = getNextFiscalQuarter(filters);

  const statsConditions = [
    "pa.deleted_at IS NULL",
    "((pa.fiscal_year = ? AND pa.quarter_no = ?) OR (pa.fiscal_year = ? AND pa.quarter_no = ?))",
  ];
  const statsParams: (number | string)[] = [
    filters.fiscalYear,
    filters.quarterNo,
    previousQuarter.fiscalYear,
    previousQuarter.quarterNo,
  ];
  addDashboardPastFilters(statsConditions, statsParams, filters, true);

  const trendConditions = [
    "pa.deleted_at IS NULL",
    "pa.fiscal_year = ?",
  ];
  const trendParams: (number | string)[] = [filters.fiscalYear];
  addDashboardPastFilters(trendConditions, trendParams, filters, true);

  const scopedPastConditions = [
    "pa.deleted_at IS NULL",
    "pa.fiscal_year = ?",
    "pa.quarter_no = ?",
  ];
  const scopedPastParams: (number | string)[] = [
    filters.fiscalYear,
    filters.quarterNo,
  ];
  addDashboardPastFilters(scopedPastConditions, scopedPastParams, filters, true);

  const departmentChartConditions = [
    "pa.deleted_at IS NULL",
    "pa.fiscal_year = ?",
    "pa.quarter_no = ?",
  ];
  const departmentChartParams: (number | string)[] = [
    filters.fiscalYear,
    filters.quarterNo,
  ];
  addDashboardPastFilters(
    departmentChartConditions,
    departmentChartParams,
    filters,
    false,
  );

  const submissionConditions = [
    "deleted_at IS NULL",
    "fiscal_year = ?",
    "quarter_no = ?",
  ];
  const submissionParams = [filters.fiscalYear, filters.quarterNo];

  const { conditions: plannedConditions, values: plannedParams } =
    buildDashboardPlannedConditions(filters, planQuarter);

  const [
    [statsRows],
    [trendRows],
    [activityTypeRows],
    [participantTypeRows],
    [mainDepartmentRows],
    [coOrganizerDepartmentRows],
    [submittedRows],
    [featuredRows],
    [plannedSummaryRows],
    [plannedRows],
  ] = await Promise.all([
    db.execute<QuarterStatsRow[]>(
      `SELECT pa.fiscal_year, pa.quarter_no,
              COUNT(*) AS activity_count,
              COALESCE(SUM(pa.total_participants), 0) AS participants_sum,
              COALESCE(SUM(pa.satisfaction_percent), 0) AS satisfaction_sum,
              COUNT(pa.satisfaction_percent) AS satisfaction_count
       FROM past_activities pa
       WHERE ${statsConditions.join(" AND ")}
       GROUP BY pa.fiscal_year, pa.quarter_no`,
      statsParams,
    ),
    db.execute<QuarterStatsRow[]>(
      `SELECT pa.fiscal_year, pa.quarter_no,
              COUNT(*) AS activity_count,
              COALESCE(SUM(pa.total_participants), 0) AS participants_sum,
              COALESCE(SUM(pa.satisfaction_percent), 0) AS satisfaction_sum,
              COUNT(pa.satisfaction_percent) AS satisfaction_count
       FROM past_activities pa
       WHERE ${trendConditions.join(" AND ")}
       GROUP BY pa.fiscal_year, pa.quarter_no`,
      trendParams,
    ),
    db.execute<GroupCountRow[]>(
      `SELECT pa.activity_type_id AS group_id, COUNT(*) AS activity_count
       FROM past_activities pa
       WHERE ${scopedPastConditions.join(" AND ")}
       GROUP BY pa.activity_type_id`,
      scopedPastParams,
    ),
    db.execute<GroupCountRow[]>(
      `SELECT pa.participant_type_id AS group_id, COUNT(*) AS activity_count
       FROM past_activities pa
       WHERE ${scopedPastConditions.join(" AND ")}
       GROUP BY pa.participant_type_id`,
      scopedPastParams,
    ),
    db.execute<DepartmentCountDbRow[]>(
      `SELECT pa.main_department AS department_code,
              COUNT(DISTINCT pa.id) AS activity_count
       FROM past_activities pa
       WHERE ${departmentChartConditions.join(" AND ")}
       GROUP BY pa.main_department`,
      departmentChartParams,
    ),
    db.execute<DepartmentCountDbRow[]>(
      `SELECT pco.department_code AS department_code,
              COUNT(DISTINCT pa.id) AS activity_count
       FROM past_co_organizers pco
       INNER JOIN past_activities pa ON pa.id = pco.past_id
       WHERE ${departmentChartConditions.join(" AND ")}
         AND pco.department_code <> pa.main_department
       GROUP BY pco.department_code`,
      departmentChartParams,
    ),
    db.execute<SubmittedDepartmentRow[]>(
      `SELECT DISTINCT main_department
       FROM past_activities
       WHERE ${submissionConditions.join(" AND ")}`,
      submissionParams,
    ),
    db.execute<FeaturedActivityRow[]>(
      `SELECT pa.id, pa.title, pa.main_department, pa.activity_type_id,
              pa.total_participants, pa.satisfaction_percent, pa.result_summary
       FROM past_activities pa
       WHERE ${scopedPastConditions.join(" AND ")}
       ORDER BY pa.satisfaction_percent IS NULL ASC,
                pa.satisfaction_percent DESC,
                pa.total_participants DESC,
                pa.id DESC
       LIMIT 3`,
      scopedPastParams,
    ),
    db.execute<PlannedSummaryRow[]>(
      `SELECT COUNT(*) AS activity_count,
              COALESCE(SUM(CASE WHEN pa.date_status = 'confirmed' THEN 1 ELSE 0 END), 0) AS confirmed_count,
              COALESCE(SUM(pa.expected_participants), 0) AS expected_participants_sum
       FROM planned_activities pa
       WHERE ${plannedConditions.join(" AND ")}`,
      plannedParams,
    ),
    db.execute<PlannedActivityRow[]>(
      `SELECT pa.id, pa.title, pa.main_department, pa.activity_type_id,
              pa.date_status,
              DATE_FORMAT(pa.expected_start, '%Y-%m-%d') AS expected_start,
              DATE_FORMAT(pa.expected_end, '%Y-%m-%d') AS expected_end,
              pa.expected_participants
       FROM planned_activities pa
       WHERE ${plannedConditions.join(" AND ")}
       ORDER BY CASE WHEN pa.date_status = 'unconfirmed' THEN 1 ELSE 0 END,
                pa.expected_start ASC, pa.id ASC
       LIMIT 6`,
      plannedParams,
    ),
  ]);

  const currentRow = statsRows.find(
    (row) =>
      Number(row.fiscal_year) === filters.fiscalYear &&
      Number(row.quarter_no) === filters.quarterNo,
  );
  const previousRow = statsRows.find(
    (row) =>
      Number(row.fiscal_year) === previousQuarter.fiscalYear &&
      Number(row.quarter_no) === previousQuarter.quarterNo,
  );
  const current = metricsFromRow(currentRow);
  const previous =
    previousRow && toNumber(previousRow.activity_count) > 0
      ? metricsFromRow(previousRow)
      : null;

  const departmentByCode = new Map(
    options.activeDepartments.map((department) => [
      department.code,
      department.name_th,
    ]),
  );
  const allDepartmentRows = await db.execute<DepartmentRow[]>(
    "SELECT code, name_th, sort_no, is_active FROM departments ORDER BY sort_no, code",
    [],
  );
  const allDepartmentCounts = mergeDepartmentActivityCounts(
    allDepartmentRows[0].map((department) => ({
      code: department.code,
      name_th: department.name_th,
      sort_no: Number(department.sort_no),
    })),
    mainDepartmentRows,
    coOrganizerDepartmentRows,
  ).map((department) => ({
    code: department.code,
    name: department.name_th,
    activityCount: department.activity_count,
  }));
  const departmentCounts = filters.departmentCode === null
    ? allDepartmentCounts
    : allDepartmentCounts.filter((department) => department.code === filters.departmentCode);
  const departmentChartActivityCount = mainDepartmentRows.reduce(
    (total, department) => total + toNumber(department.activity_count),
    0,
  );
  const filteredDepartmentChartActivityCount = filters.departmentCode === null
    ? departmentChartActivityCount
    : departmentCounts.reduce((total, department) => total + department.activityCount, 0);
  const departmentAffiliations = departmentCounts.reduce(
    (total, department) => total + department.activityCount,
    0,
  );

  const activityTypeCounts = new Map(
    activityTypeRows.map((row) => [
      Number(row.group_id),
      toNumber(row.activity_count),
    ]),
  );
  const participantTypeCounts = new Map(
    participantTypeRows.map((row) => [
      Number(row.group_id),
      toNumber(row.activity_count),
    ]),
  );
  const trendCounts = new Map(
    trendRows.map((row) => [
      Number(row.quarter_no),
      {
        activityCount: toNumber(row.activity_count),
        participants: toNumber(row.participants_sum),
      },
    ]),
  );

  const featuredIds = featuredRows.map((row) => String(row.id));
  const coOrganizersByActivity = new Map<string, string[]>();
  const imageByActivity = new Map<string, string>();
  if (featuredIds.length > 0) {
    const placeholders = featuredIds.map(() => "?").join(", ");
    const [coRows, imageRows] = await Promise.all([
      db.execute<CoOrganizerRow[]>(
        `SELECT pco.past_id, pco.department_code
         FROM past_co_organizers pco
         WHERE pco.past_id IN (${placeholders})
           AND EXISTS (
             SELECT 1 FROM past_activities pa
             WHERE pa.id = pco.past_id AND pa.deleted_at IS NULL
           )
         ORDER BY pco.department_code`,
        featuredIds,
      ),
      db.execute<ImageRow[]>(
        `SELECT pai.past_id, pai.id
         FROM past_activity_images pai
         WHERE pai.past_id IN (${placeholders})
           AND pai.sort_no = 1
           AND EXISTS (
             SELECT 1 FROM past_activities pa
             WHERE pa.id = pai.past_id AND pa.deleted_at IS NULL
           )`,
        featuredIds,
      ),
    ]);
    for (const row of coRows[0]) {
      const key = String(row.past_id);
      coOrganizersByActivity.set(key, [
        ...(coOrganizersByActivity.get(key) ?? []),
        row.department_code,
      ]);
    }
    for (const row of imageRows[0]) {
      imageByActivity.set(String(row.past_id), String(row.id));
    }
  }

  const featuredActivities = sortFeaturedActivities(featuredRows).map(
    (row) => ({
      id: String(row.id),
      title: row.title,
      mainDepartment: row.main_department,
      coOrganizers: coOrganizersByActivity.get(String(row.id)) ?? [],
      activityTypeId: Number(row.activity_type_id),
      totalParticipants: toNumber(row.total_participants),
      satisfactionPercent:
        row.satisfaction_percent === null
          ? null
          : toNumber(row.satisfaction_percent),
      resultSummary: row.result_summary,
      firstImageId: imageByActivity.get(String(row.id)) ?? null,
    }),
  );

  const plannedSummary = plannedSummaryRows[0];
  const activeDepartmentCount = options.activeDepartments.length;
  const submittedDepartmentCodes = submittedRows
    .map((row) => row.main_department)
    .filter((code) => departmentByCode.has(code));

  return {
    filters,
    previousQuarter,
    planQuarter,
    current,
    previous,
    departmentCounts,
    departmentChartActivityCount: filteredDepartmentChartActivityCount,
    departmentAffiliations,
    activityTypeCounts: options.activityTypes
      .filter((type) => filters.activityTypeId === null || type.id === filters.activityTypeId)
      .map((type) => ({
      id: type.id,
      activityCount: activityTypeCounts.get(type.id) ?? 0,
      })),
    participantTypeCounts: options.participantTypes.map((type) => ({
      id: type.id,
      activityCount: participantTypeCounts.get(type.id) ?? 0,
    })),
    trends: [1, 2, 3, 4].map((quarterNo) => ({
      quarterNo,
      activityCount: trendCounts.get(quarterNo)?.activityCount ?? 0,
      participants: trendCounts.get(quarterNo)?.participants ?? 0,
    })),
    submittedDepartmentCodes,
    activeDepartmentCount,
    featuredActivities,
    plannedSummary: {
      activityCount: toNumber(plannedSummary?.activity_count ?? 0),
      confirmedCount: toNumber(plannedSummary?.confirmed_count ?? 0),
      expectedParticipants: toNumber(
        plannedSummary?.expected_participants_sum ?? 0,
      ),
    },
    plannedActivities: plannedRows.map((row) => ({
      id: String(row.id),
      title: row.title,
      mainDepartment: row.main_department,
      activityTypeId: Number(row.activity_type_id),
      dateStatus: row.date_status,
      expectedStart: row.expected_start,
      expectedEnd: row.expected_end,
      expectedParticipants: toNumber(row.expected_participants),
    })),
  };
}
