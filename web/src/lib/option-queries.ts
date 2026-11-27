import "server-only";

import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";
import { OPTION_DEFINITIONS, formatInactiveLabel, type OptionGroup } from "@/lib/option-policy";

interface OptionRow extends RowDataPacket {
  code?: string;
  id?: number;
  name_th: string;
  description: string | null;
  is_active: number;
}

export interface SelectOption {
  value: string;
  label: string;
  inactive: boolean;
  description: string;
}

export interface ActivityOptionSets {
  departments: SelectOption[];
  activityTypes: SelectOption[];
  participantTypes: SelectOption[];
}

function keyOf(row: OptionRow, group: OptionGroup): string {
  return OPTION_DEFINITIONS[group].keyField === "id" ? String(row.id ?? "") : String(row.code ?? "");
}

async function readOptions(
  group: OptionGroup,
  mode: "create" | "edit" | "filter",
  inactiveSuffix: string,
  previous: readonly string[],
): Promise<SelectOption[]> {
  const definition = OPTION_DEFINITIONS[group];
  const description = definition.supportsDescription ? "COALESCE(description, '') AS description" : "'' AS description";
  const column = definition.keyField;
  let where = "";
  const values: (string | number)[] = [];
  if (mode === "create") {
    where = "WHERE is_active = 1";
  } else if (mode === "edit") {
    const selected = [...new Set(previous.map((key) => (
      column === "id" ? Number(key) : key
    )))].filter((key) => (column === "id" ? Number.isSafeInteger(key) : Boolean(key)));
    if (selected.length > 0) {
      const placeholders = selected.map(() => "?").join(", ");
      where = `WHERE is_active = 1 OR ${column} IN (${placeholders})`;
      values.push(...selected);
    } else {
      where = "WHERE is_active = 1";
    }
  }
  const [rows] = await getDb().execute<OptionRow[]>(
    `SELECT ${column}, name_th, ${description}, is_active
       FROM ${definition.table}
       ${where}
      ORDER BY sort_no, ${column}`,
    values,
  );
  return rows.map((row) => {
    const inactive = !row.is_active;
    return {
      value: keyOf(row, group),
      label: inactive ? formatInactiveLabel(row.name_th, inactiveSuffix) : row.name_th,
      inactive,
      description: definition.supportsDescription ? (row.description ?? "") : "",
    };
  });
}

export interface PreviousOptionValues {
  departments?: readonly string[];
  activityTypes?: readonly string[];
  participantTypes?: readonly string[];
}

export async function getActivityOptionSets(
  mode: "create" | "edit" | "filter",
  inactiveSuffix = "",
  previous: PreviousOptionValues = {},
): Promise<ActivityOptionSets> {
  const [departments, activityTypes, participantTypes] = await Promise.all([
    readOptions("departments", mode, inactiveSuffix, previous.departments ?? []),
    readOptions("activity_types", mode, inactiveSuffix, previous.activityTypes ?? []),
    readOptions("participant_types", mode, inactiveSuffix, previous.participantTypes ?? []),
  ]);
  return { departments, activityTypes, participantTypes };
}

export async function getDepartmentOptions(
  mode: "create" | "edit" | "filter",
  inactiveSuffix = "",
  previous: readonly string[] = [],
): Promise<SelectOption[]> {
  return readOptions("departments", mode, inactiveSuffix, previous);
}

interface ActivityOptionRow extends RowDataPacket {
  main_department: string;
  activity_type_id: number;
  participant_type_id: number;
}

interface CoOrganizerRow extends RowDataPacket {
  department_code: string;
}

export async function getPastActivityPreviousOptions(id: string): Promise<PreviousOptionValues> {
  const [rows] = await getDb().execute<ActivityOptionRow[]>(
    `SELECT main_department, activity_type_id, participant_type_id
       FROM past_activities
      WHERE id = ? AND deleted_at IS NULL AND purged_at IS NULL LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return {};
  const [coRows] = await getDb().execute<CoOrganizerRow[]>(
    "SELECT department_code FROM past_co_organizers WHERE past_id = ?",
    [id],
  );
  return {
    departments: [row.main_department, ...coRows.map((item) => item.department_code)],
    activityTypes: [String(row.activity_type_id)],
    participantTypes: [String(row.participant_type_id)],
  };
}

export async function getPlannedActivityPreviousOptions(id: string): Promise<PreviousOptionValues> {
  const [rows] = await getDb().execute<ActivityOptionRow[]>(
    `SELECT main_department, activity_type_id, participant_type_id
       FROM planned_activities
      WHERE id = ? AND deleted_at IS NULL AND purged_at IS NULL LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return {};
  const [coRows] = await getDb().execute<CoOrganizerRow[]>(
    "SELECT department_code FROM planned_co_organizers WHERE planned_id = ?",
    [id],
  );
  return {
    departments: [row.main_department, ...coRows.map((item) => item.department_code)],
    activityTypes: [String(row.activity_type_id)],
    participantTypes: [String(row.participant_type_id)],
  };
}

export async function isOptionSelectable(
  group: OptionGroup,
  key: string,
  previousKeys: readonly string[] = [],
): Promise<boolean> {
  const definition = OPTION_DEFINITIONS[group];
  const value = definition.keyField === "id" ? Number(key) : key;
  if (definition.keyField === "id" && !Number.isSafeInteger(value)) return false;
  const [rows] = await getDb().execute<OptionRow[]>(
    `SELECT ${definition.keyField}, is_active FROM ${definition.table} WHERE ${definition.keyField} = ? LIMIT 1`,
    [value],
  );
  const row = rows[0];
  if (!row) return false;
  if (row.is_active) return true;
  return previousKeys.some((previous) => String(previous) === key);
}
