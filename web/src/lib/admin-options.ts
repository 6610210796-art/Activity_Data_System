import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDb } from "@/lib/db";
import {
  OPTION_DEFINITIONS,
  OPTION_GROUPS,
  computeGroupVersion,
  nextOptionId,
  validateBatchShape,
  validateCompleteOrder,
  type OptionChange,
  type OptionCore,
  type OptionErrorCode,
  type OptionGroup,
  type OptionGroupView,
  type OptionView,
  type OptionsSnapshot,
} from "@/lib/option-policy";

export type { OptionsSnapshot } from "@/lib/option-policy";

interface OptionRow extends RowDataPacket {
  code?: string;
  id?: number;
  name_th: string;
  description: string;
  example: string;
  sort_no: number;
  is_active: number;
}

interface UsageRow extends RowDataPacket {
  key_value: string | number;
  usage_count: number | string;
}

function rowKey(row: OptionRow, group: OptionGroup): string {
  return OPTION_DEFINITIONS[group].keyField === "id" ? String(row.id ?? "") : String(row.code ?? "");
}

function toCore(row: OptionRow, group: OptionGroup): OptionCore {
  const definition = OPTION_DEFINITIONS[group];
  return {
    key: rowKey(row, group),
    nameTh: row.name_th,
    description: definition.supportsDescription ? (row.description ?? "") : "",
    example: definition.supportsExample ? (row.example ?? "") : "",
    sortNo: Number(row.sort_no),
    isActive: Boolean(row.is_active),
  };
}

function selectColumns(group: OptionGroup): string {
  const definition = OPTION_DEFINITIONS[group];
  const description = definition.supportsDescription ? "COALESCE(description, '') AS description" : "'' AS description";
  const example = definition.supportsExample ? "COALESCE(example, '') AS example" : "'' AS example";
  return `${definition.keyField}, name_th, ${description}, ${example}, sort_no, is_active`;
}

function keyValue(group: OptionGroup, key: string): string | number {
  return OPTION_DEFINITIONS[group].keyField === "id" ? Number(key) : key;
}

function stripUsage(item: OptionView): OptionCore {
  return {
    key: item.key ?? "",
    nameTh: item.nameTh,
    description: item.description ?? "",
    example: item.example ?? "",
    sortNo: item.sortNo,
    isActive: item.isActive,
  };
}

async function readUsageCounts(
  connection: Pick<PoolConnection, "execute">,
  group: OptionGroup,
): Promise<Map<string, number>> {
  const activeActivity = (table: "past_activities" | "planned_activities") =>
    `SELECT a.${group === "departments" ? "main_department" : group === "activity_types" ? "activity_type_id" : "participant_type_id"} AS key_value
       FROM ${table} a
      WHERE a.deleted_at IS NULL AND a.purged_at IS NULL`;

  const activeCoOrganizer = (
    table: "past_co_organizers" | "planned_co_organizers",
    activityTable: "past_activities" | "planned_activities",
    idColumn: "past_id" | "planned_id",
  ) =>
    `SELECT c.department_code AS key_value
       FROM ${table} c
       JOIN ${activityTable} a ON a.id = c.${idColumn}
      WHERE a.deleted_at IS NULL AND a.purged_at IS NULL`;

  const union = group === "departments"
    ? [
      activeActivity("past_activities"),
      activeActivity("planned_activities"),
      activeCoOrganizer("past_co_organizers", "past_activities", "past_id"),
      activeCoOrganizer("planned_co_organizers", "planned_activities", "planned_id"),
    ]
    : [activeActivity("past_activities"), activeActivity("planned_activities")];

  const [rows] = await connection.execute<UsageRow[]>(
    `SELECT key_value, COUNT(*) AS usage_count FROM (${union.join(" UNION ALL ")}) AS used GROUP BY key_value`,
    [],
  );
  return new Map(rows.map((row) => [String(row.key_value), Number(row.usage_count)]));
}

async function readGroup(
  connection: Pick<PoolConnection, "execute">,
  group: OptionGroup,
  lock: boolean,
): Promise<OptionGroupView> {
  const definition = OPTION_DEFINITIONS[group];
  const [rows] = await connection.execute<OptionRow[]>(
    `SELECT ${selectColumns(group)}
       FROM ${definition.table}
      ORDER BY sort_no, ${definition.keyField}${lock ? " FOR UPDATE" : ""}`,
    [],
  );
  const usage = await readUsageCounts(connection, group);
  const items = rows.map((row) => {
    const core = toCore(row, group);
    return { ...core, usageCount: usage.get(core.key) ?? 0 };
  });
  const view: OptionGroupView = {
    group,
    total: items.length,
    activeCount: items.filter((item) => item.isActive).length,
    items,
    version: "",
  };
  view.version = computeGroupVersion(group, items.map(stripUsage));
  return view;
}

export async function listOptionGroups(): Promise<OptionsSnapshot> {
  const db = getDb();
  const groups: OptionGroupView[] = [];
  for (const group of OPTION_GROUPS) {
    groups.push(await readGroup(db, group, false));
  }
  return { groups, version: groups.map((group) => group.version).join("|") };
}

export type SaveOptionsResult =
  | { ok: true; snapshot: OptionsSnapshot }
  | { ok: false; error: OptionErrorCode };

interface PendingGroup {
  group: OptionGroup;
  changes: OptionChange[];
  statements: { sql: string; values: (string | number)[] }[];
}

function isDuplicateError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error.code === "ER_DUP_ENTRY" || error.code === "ER_DUP_KEY");
}

export async function saveOptions(
  input: unknown,
  actorId: string,
  ipAddress: string | null,
): Promise<SaveOptionsResult> {
  const shape = validateBatchShape(input);
  if (!shape.ok) return shape;
  const drafts = shape.value;

  const connection = await getDb().getConnection();
  const lockedNames: string[] = [];
  try {
    await connection.beginTransaction();

    const currentGroups: OptionGroupView[] = [];
    const currentByGroup = {} as Record<OptionGroup, OptionCore[]>;
    for (const group of OPTION_GROUPS) {
      const view = await readGroup(connection, group, true);
      currentGroups.push(view);
      currentByGroup[group] = view.items.map(stripUsage);
    }
    const versionMismatch = OPTION_GROUPS.some((group) => {
      const view = currentGroups.find((item) => item.group === group);
      return !view || drafts[group].version !== view.version;
    });
    if (versionMismatch) {
      await connection.rollback();
      return { ok: false, error: "conflict" };
    }

    const pending: PendingGroup[] = [];
    for (const group of OPTION_GROUPS) {
      const current = currentByGroup[group];
      const groupDrafts = drafts[group].items;
      const complete = validateCompleteOrder(group, current, groupDrafts);
      if (!complete.ok) {
        await connection.rollback();
        return complete;
      }

      const byKey = new Map(current.map((item) => [item.key, item]));
      let nextId = 0;
      if (OPTION_DEFINITIONS[group].keyField === "id") {
        const newCount = groupDrafts.filter((draft) => !draft.key).length;
        if (newCount > 0) {
          const lockName = `activity_options_${group}`;
          const [lockRows] = await connection.execute<RowDataPacket[]>(
            "SELECT GET_LOCK(?, 10) AS acquired",
            [lockName],
          );
          if (Number(lockRows[0]?.acquired) !== 1) {
            await connection.rollback();
            return { ok: false, error: "conflict" };
          }
          lockedNames.push(lockName);
          const allocated = nextOptionId(current, newCount);
          if (!allocated.ok) {
            await connection.rollback();
            return allocated;
          }
          nextId = allocated.value;
        }
      }

      const changes: OptionChange[] = [];
      const statements: PendingGroup["statements"] = [];
      for (const [index, draft] of groupDrafts.entries()) {
        const sortNo = index + 1;
        let key = draft.key;
        if (!key) {
          if (OPTION_DEFINITIONS[group].keyField === "code") key = draft.code;
          else {
            key = String(nextId);
            nextId += 1;
          }
        }
        const before = byKey.get(key) ?? null;
        const after: OptionCore = {
          key,
          nameTh: draft.nameTh,
          description: draft.description,
          example: draft.example,
          sortNo,
          isActive: draft.isActive,
        };
        if (!before
          || before.nameTh !== after.nameTh
          || before.description !== after.description
          || before.example !== after.example
          || before.sortNo !== after.sortNo
          || before.isActive !== after.isActive) {
          changes.push({ key, before, after });
        }

        const column = OPTION_DEFINITIONS[group].keyField;
        const value = keyValue(group, key);
        if (before) {
          const assignments = ["name_th = ?", "sort_no = ?", "is_active = ?"];
          const values: (string | number)[] = [after.nameTh, sortNo, after.isActive ? 1 : 0];
          if (OPTION_DEFINITIONS[group].supportsDescription) {
            assignments.push("description = ?");
            values.push(after.description);
          }
          if (OPTION_DEFINITIONS[group].supportsExample) {
            assignments.push("example = ?");
            values.push(after.example);
          }
          values.push(value);
          statements.push({
            sql: `UPDATE ${OPTION_DEFINITIONS[group].table} SET ${assignments.join(", ")} WHERE ${column} = ?`,
            values,
          });
        } else {
          const columns = [column, "name_th"];
          const values: (string | number)[] = [value, after.nameTh];
          if (OPTION_DEFINITIONS[group].supportsDescription) {
            columns.push("description");
            values.push(after.description);
          }
          if (OPTION_DEFINITIONS[group].supportsExample) {
            columns.push("example");
            values.push(after.example);
          }
          columns.push("sort_no", "is_active");
          values.push(sortNo, after.isActive ? 1 : 0);
          statements.push({
            sql: `INSERT INTO ${OPTION_DEFINITIONS[group].table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
            values,
          });
        }
      }

      pending.push({ group, changes, statements });
    }

    for (const group of pending) {
      for (const statement of group.statements) {
        await connection.execute<ResultSetHeader>(statement.sql, statement.values);
      }
      if (group.changes.length > 0) {
        await connection.execute(
          `INSERT INTO audit_logs (user_id, action, entity, detail, ip_address)
           VALUES (?, 'content.options_update', ?, ?, ?)`,
          [actorId, group.group, JSON.stringify({ changes: group.changes }), ipAddress],
        );
      }
    }

    await connection.commit();
    return { ok: true, snapshot: await listOptionGroups() };
  } catch (error) {
    await connection.rollback();
    if (isDuplicateError(error)) return { ok: false, error: "duplicate" };
    throw error;
  } finally {
    for (const name of lockedNames) {
      await connection.execute("SELECT RELEASE_LOCK(?)", [name]).catch(() => undefined);
    }
    connection.release();
  }
}
