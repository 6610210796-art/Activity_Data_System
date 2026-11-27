export interface DashboardQueryFilters {
  departmentCode: string | null;
  activityTypeId: number | null;
}

export function buildDashboardPlannedConditions(
  filters: DashboardQueryFilters,
  planQuarter: { fiscalYear: number; quarterNo: number },
) {
  const conditions = [
    "pa.deleted_at IS NULL",
    "pa.fiscal_year = ?",
    "pa.quarter_no = ?",
  ];
  const values: (string | number)[] = [
    planQuarter.fiscalYear,
    planQuarter.quarterNo,
  ];
  if (filters.activityTypeId !== null) {
    conditions.push("pa.activity_type_id = ?");
    values.push(filters.activityTypeId);
  }
  if (filters.departmentCode !== null) {
    conditions.push(
      "(pa.main_department = ? OR EXISTS (SELECT 1 FROM planned_co_organizers pco WHERE pco.planned_id = pa.id AND pco.department_code = ?))",
    );
    values.push(filters.departmentCode, filters.departmentCode);
  }
  return { conditions, values };
}

export function addDashboardPastFilters(
  conditions: string[],
  params: (string | number)[],
  filters: DashboardQueryFilters,
  includeDepartment: boolean,
): void {
  if (filters.activityTypeId !== null) {
    conditions.push("pa.activity_type_id = ?");
    params.push(filters.activityTypeId);
  }
  if (includeDepartment && filters.departmentCode !== null) {
    conditions.push(
      "(pa.main_department = ? OR EXISTS (SELECT 1 FROM past_co_organizers pco WHERE pco.past_id = pa.id AND pco.department_code = ?))",
    );
    params.push(filters.departmentCode, filters.departmentCode);
  }
}
