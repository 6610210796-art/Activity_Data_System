import "server-only";

import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { AuthenticatedUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { archiveSqlState, canTransitionArchiveState, getArchiveState, nextArchiveState } from "@/lib/activity-archive-policy";

export type ActivityArchiveKind = "past" | "planned";
export type ActivityArchiveAction = "archive" | "restore" | "purge";

const TABLES = {
  past: { table: "past_activities", entity: "past_activity" },
  planned: { table: "planned_activities", entity: "planned_activity" },
} as const;

interface ActivityRow extends RowDataPacket {
  id: string | number;
  title: string;
  main_department: string;
  deleted_at: Date | string | null;
  purged_at: Date | string | null;
}

export async function changeActivityArchiveState(input: {
  user: AuthenticatedUser;
  kind: ActivityArchiveKind;
  id: string;
  action: ActivityArchiveAction;
  ipAddress: string | null;
}) {
  const { table, entity } = TABLES[input.kind];
  const connection = await getDb().getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const ownerSql = input.user.role === "admin" ? "" : " AND main_department = ?";
    const ownerValues = input.user.role === "admin" ? [input.id] : [input.id, input.user.department_code ?? ""];
    const [rows] = await connection.execute<ActivityRow[]>(
      `SELECT id, title, main_department, deleted_at, purged_at
       FROM ${table} WHERE id = ?${ownerSql} FOR UPDATE`, ownerValues,
    );
    const row = rows[0];
    if (!row) {
      await connection.rollback();
      transactionStarted = false;
      return { ok: false as const, status: 404 };
    }
    const currentState = getArchiveState(row.deleted_at, row.purged_at);
    if (!canTransitionArchiveState(currentState, input.action)) {
      await connection.rollback();
      transactionStarted = false;
      return { ok: false as const, status: 409 };
    }

    const before = { deleted_at: row.deleted_at, purged_at: row.purged_at };
    const { whereClause: whereState, setClause: setSql } = archiveSqlState(input.action);
    const [updated] = await connection.execute<ResultSetHeader>(
      `UPDATE ${table} SET ${setSql} WHERE id = ? AND ${whereState}${ownerSql}`,
      input.user.role === "admin" ? [input.id] : [input.id, input.user.department_code ?? ""],
    );
    if (updated.affectedRows !== 1) {
      await connection.rollback();
      transactionStarted = false;
      return { ok: false as const, status: 409 };
    }
    const actionName = input.action === "archive" ? "activity.archive"
      : input.action === "restore" ? "activity.restore" : "activity.purge";
    const nextState = nextArchiveState(input.action);
    const after = nextState === "archived"
      ? { deleted_at: "CURRENT_TIMESTAMP", purged_at: null }
      : nextState === "active"
        ? { deleted_at: null, purged_at: null }
        : { deleted_at: row.deleted_at, purged_at: "CURRENT_TIMESTAMP" };
    const detail = JSON.stringify({
      title: row.title,
      main_department: row.main_department,
      before,
      after,
    });
    await connection.execute(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, detail, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [input.user.id, actionName, entity, String(row.id), detail, input.ipAddress],
    );
    await connection.commit();
    transactionStarted = false;
    return { ok: true as const };
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
