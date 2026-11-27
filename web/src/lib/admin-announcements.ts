import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDb } from "@/lib/db";
import {
  buildVisibleAnnouncementsQuery,
  getAnnouncementStatus,
  getBangkokToday,
  parseAnnouncementFilters,
  validateAnnouncementInput,
  type AnnouncementFilters,
  type AnnouncementInput,
  type AnnouncementStatus,
  type AnnouncementValidationError,
} from "@/lib/announcement-policy";

interface AnnouncementRow extends RowDataPacket {
  id: number;
  title: string;
  body: string | null;
  start_date: string;
  end_date: string | null;
  is_active: number;
  created_at: string;
}

interface CountRow extends RowDataPacket {
  total: number | string;
}

export interface AnnouncementView {
  id: number;
  title: string;
  body: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  status: AnnouncementStatus;
  createdAt: string;
}

export interface AnnouncementListResult {
  items: AnnouncementView[];
  total: number;
  page: number;
  pageSize: 20;
}

export interface HomeAnnouncement {
  id: number;
  title: string;
  body: string;
}

interface HomeAnnouncementRow extends RowDataPacket, HomeAnnouncement {}

type AnnouncementAuditAction =
  | "content.announcement_create"
  | "content.announcement_update"
  | "content.announcement_toggle"
  | "content.announcement_delete";

export type AnnouncementMutationResult =
  | { ok: true; id?: number }
  | { ok: false; error: AnnouncementValidationError | "not_found" };

const SELECT_COLUMNS = `id, title, COALESCE(body, '') AS body,
       DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
       DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
       is_active, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s') AS created_at`;

function toView(row: AnnouncementRow, today: string): AnnouncementView {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? "",
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: Boolean(row.is_active),
    status: getAnnouncementStatus({
      startDate: row.start_date,
      endDate: row.end_date,
      isActive: row.is_active,
    }, today),
    createdAt: row.created_at,
  };
}

function buildConditions(
  filters: AnnouncementFilters,
  today: string,
): { sql: string; values: (string | number)[] } {
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  const query = filters.q.trim();
  if (query) {
    clauses.push("(LOCATE(?, title) > 0 OR LOCATE(?, body) > 0)");
    values.push(query, query);
  }

  if (filters.status === "active") {
    clauses.push("is_active = 1 AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)");
    values.push(today, today);
  } else if (filters.status === "upcoming") {
    clauses.push("is_active = 1 AND start_date > ?");
    values.push(today);
  } else if (filters.status === "expired") {
    clauses.push("is_active = 1 AND end_date IS NOT NULL AND end_date < ?");
    values.push(today);
  } else if (filters.status === "inactive") {
    clauses.push("is_active = 0");
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

export async function listAnnouncements(
  rawFilters: Record<string, string | null | undefined>,
): Promise<AnnouncementListResult> {
  const filters = parseAnnouncementFilters(rawFilters);
  const today = getBangkokToday();
  const conditions = buildConditions(filters, today);
  const offset = (filters.page - 1) * 20;
  const db = getDb();

  const [[countRows], [rows]] = await Promise.all([
    db.execute<CountRow[]>(
      `SELECT COUNT(*) AS total FROM announcements ${conditions.sql}`,
      conditions.values,
    ),
    db.execute<AnnouncementRow[]>(
      `SELECT ${SELECT_COLUMNS}
         FROM announcements
         ${conditions.sql}
        ORDER BY created_at DESC, id DESC
        LIMIT 20 OFFSET ?`,
      [...conditions.values, offset],
    ),
  ]);

  return {
    items: rows.map((row) => toView(row, today)),
    total: Number(countRows[0]?.total ?? 0),
    page: filters.page,
    pageSize: 20,
  };
}

export async function getVisibleHomeAnnouncements(): Promise<HomeAnnouncement[]> {
  const query = buildVisibleAnnouncementsQuery(getBangkokToday());
  const [rows] = await getDb().execute<HomeAnnouncementRow[]>(query.sql, query.values);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body ?? "",
  }));
}

async function writeAudit(
  connection: PoolConnection,
  actorId: string,
  action: AnnouncementAuditAction,
  entityId: string,
  detail: unknown,
  ipAddress: string | null,
): Promise<void> {
  await connection.execute(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, detail, ip_address)
     VALUES (?, ?, 'announcements', ?, ?, ?)`,
    [actorId, action, entityId, JSON.stringify(detail), ipAddress],
  );
}

export async function createAnnouncement(
  input: AnnouncementInput,
  actorId: string,
  ipAddress: string | null,
): Promise<AnnouncementMutationResult> {
  const validation = validateAnnouncementInput(input);
  if (!validation.ok) return validation;

  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO announcements (title, body, start_date, end_date, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        validation.value.title,
        validation.value.body,
        validation.value.startDate,
        validation.value.endDate,
        validation.value.isActive,
        actorId,
      ],
    );
    const id = String(result.insertId);
    await writeAudit(connection, actorId, "content.announcement_create", id, {
      title: validation.value.title,
      startDate: validation.value.startDate,
      endDate: validation.value.endDate,
      isActive: validation.value.isActive,
    }, ipAddress);
    await connection.commit();
    return { ok: true, id: result.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateAnnouncement(
  id: string,
  input: AnnouncementInput,
  actorId: string,
  ipAddress: string | null,
): Promise<AnnouncementMutationResult> {
  const validation = validateAnnouncementInput(input);
  if (!validation.ok) return validation;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) {
    return { ok: false, error: "not_found" };
  }

  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const [beforeRows] = await connection.execute<AnnouncementRow[]>(
      `SELECT title, body, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, is_active
         FROM announcements WHERE id = ? LIMIT 1 FOR UPDATE`,
      [id],
    );
    const before = beforeRows[0];
    if (!before) {
      await connection.rollback();
      return { ok: false, error: "not_found" };
    }

    await connection.execute(
      `UPDATE announcements
          SET title = ?, body = ?, start_date = ?, end_date = ?, is_active = ?
        WHERE id = ?`,
      [
        validation.value.title,
        validation.value.body,
        validation.value.startDate,
        validation.value.endDate,
        validation.value.isActive,
        id,
      ],
    );
    await writeAudit(connection, actorId, "content.announcement_update", id, {
      before: {
        title: before.title,
        startDate: before.start_date,
        endDate: before.end_date,
        isActive: Boolean(before.is_active),
      },
      after: {
        title: validation.value.title,
        startDate: validation.value.startDate,
        endDate: validation.value.endDate,
        isActive: Boolean(validation.value.isActive),
      },
    }, ipAddress);
    await connection.commit();
    return { ok: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function toggleAnnouncement(
  id: string,
  actorId: string,
  ipAddress: string | null,
): Promise<AnnouncementMutationResult> {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) {
    return { ok: false, error: "not_found" };
  }

  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<AnnouncementRow[]>(
      "SELECT is_active FROM announcements WHERE id = ? LIMIT 1 FOR UPDATE",
      [id],
    );
    const before = rows[0];
    if (!before) {
      await connection.rollback();
      return { ok: false, error: "not_found" };
    }
    const next = before.is_active ? 0 : 1;
    await connection.execute("UPDATE announcements SET is_active = ? WHERE id = ?", [next, id]);
    await writeAudit(connection, actorId, "content.announcement_toggle", id, {
      before: Boolean(before.is_active),
      after: Boolean(next),
    }, ipAddress);
    await connection.commit();
    return { ok: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteAnnouncement(
  id: string,
  actorId: string,
  ipAddress: string | null,
): Promise<AnnouncementMutationResult> {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) {
    return { ok: false, error: "not_found" };
  }

  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<AnnouncementRow[]>(
      `SELECT title, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date
         FROM announcements WHERE id = ? LIMIT 1 FOR UPDATE`,
      [id],
    );
    const before = rows[0];
    if (!before) {
      await connection.rollback();
      return { ok: false, error: "not_found" };
    }
    await connection.execute("DELETE FROM announcements WHERE id = ?", [id]);
    await writeAudit(connection, actorId, "content.announcement_delete", id, {
      title: before.title,
      startDate: before.start_date,
    }, ipAddress);
    await connection.commit();
    return { ok: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
