export interface MineActivityFilterInput {
  fiscalYear: number | null;
  quarterNo: number | null;
  activityTypeId: number | null;
  departmentCode: string | null;
  search: string;
}

export function buildMineActivityConditions(filters: MineActivityFilterInput) {
  const conditions = ["a.deleted_at IS NULL"];
  const values: (number | string)[] = [];
  if (filters.departmentCode !== null) {
    conditions.push("a.main_department = ?");
    values.push(filters.departmentCode);
  }
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
  if (filters.search) {
    conditions.push("a.title LIKE ?");
    values.push(`%${filters.search}%`);
  }
  return { sql: conditions.join(" AND "), values };
}
