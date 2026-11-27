import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { CONTENT_FALLBACKS, type ContentKey } from "@/lib/content";
import { getContentMetadata } from "@/lib/content-catalog";
import { getDb } from "@/lib/db";
import { escapeLike, hasSameTimestamp, validateContentValue } from "@/lib/admin-content-policy";

interface ContentRow extends RowDataPacket {
  id: number;
  content_key: string;
  page_group: string;
  label_th: string;
  content_value: string;
  updated_at: Date | string;
  updated_by_name: string | null;
}

export interface AdminContentEntry {
  id: number | null;
  key: ContentKey;
  pageGroup: string;
  label: string;
  value: string;
  fallback: string;
  updatedAt: string | null;
  updatedBy: string | null;
  isStored: boolean;
}

export interface ContentHistoryFilters {
  from: string;
  to: string;
  editor: string;
  group: string;
  q: string;
  page: number;
}

export interface ContentHistoryItem {
  id: number;
  key: string;
  pageGroup: string;
  label: string;
  oldValue: string;
  newValue: string;
  changedAt: string;
  changedBy: string | null;
  currentValue: string;
}

export interface ContentHistoryResult {
  items: ContentHistoryItem[];
  total: number;
  page: number;
  pageSize: 20;
  editors: { id: string; name: string }[];
  groups: string[];
}

function timestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value.replace(" ", "T") + (/[zZ]|[+-]\d\d:\d\d$/.test(value) ? "" : "+07:00"));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export async function getAdminContentEntries(): Promise<AdminContentEntry[]> {
  const [rows] = await getDb().execute<ContentRow[]>(
    `SELECT sc.id, sc.content_key, sc.page_group, sc.label_th, sc.content_value,
            sc.updated_at, p.full_name AS updated_by_name
       FROM site_content sc
       LEFT JOIN profiles p ON p.id = sc.updated_by
      ORDER BY sc.page_group, sc.content_key`,
    [],
  );
  const existing = new Map(rows.map((row) => [row.content_key, row]));

  return (Object.keys(CONTENT_FALLBACKS) as ContentKey[]).map((key) => {
    const fallback = CONTENT_FALLBACKS[key];
    const row = existing.get(key);
    const metadata = getContentMetadata(key, fallback);
    return {
      id: row?.id ?? null,
      key,
      pageGroup: row?.page_group ?? metadata.pageGroup,
      label: row?.label_th ?? metadata.labelTh,
      value: row?.content_value ?? fallback,
      fallback,
      updatedAt: row ? timestamp(row.updated_at) : null,
      updatedBy: row?.updated_by_name ?? null,
      isStored: Boolean(row),
    };
  });
}

interface HistoryRow extends RowDataPacket {
  id: number;
  content_key: string;
  page_group: string;
  label_th: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: Date | string;
  changed_by_name: string | null;
  current_value: string;
}

interface CountRow extends RowDataPacket { total: number; }
interface EditorRow extends RowDataPacket { id: string; full_name: string; }
interface GroupRow extends RowDataPacket { page_group: string; }

export async function getContentHistory(filters: ContentHistoryFilters): Promise<ContentHistoryResult> {
  const db = getDb();
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  if (filters.from) { clauses.push("h.changed_at >= ?"); values.push(`${filters.from} 00:00:00`); }
  if (filters.to) { clauses.push("h.changed_at < DATE_ADD(?, INTERVAL 1 DAY)"); values.push(`${filters.to} 00:00:00`); }
  if (filters.editor) { clauses.push("h.changed_by = ?"); values.push(filters.editor); }
  if (filters.group) { clauses.push("sc.page_group = ?"); values.push(filters.group); }
  if (filters.q) {
    clauses.push("(sc.content_key LIKE ? ESCAPE '\\\\' OR sc.content_value LIKE ? ESCAPE '\\\\' OR h.old_value LIKE ? ESCAPE '\\\\' OR h.new_value LIKE ? ESCAPE '\\\\')");
    const pattern = `%${escapeLike(filters.q.slice(0, 150))}%`;
    values.push(pattern, pattern, pattern, pattern);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const from = (filters.page - 1) * 20;
  const [countRows] = await db.execute<CountRow[]>(
    `SELECT COUNT(*) AS total FROM content_history h JOIN site_content sc ON sc.id = h.content_id ${where}`,
    values,
  );
  const [rows] = await db.execute<HistoryRow[]>(
    `SELECT h.id, sc.content_key, sc.page_group, sc.label_th, h.old_value, h.new_value,
            sc.content_value AS current_value,
            h.changed_at, p.full_name AS changed_by_name
       FROM content_history h
       JOIN site_content sc ON sc.id = h.content_id
       LEFT JOIN profiles p ON p.id = h.changed_by
       ${where}
      ORDER BY h.changed_at DESC, h.id DESC LIMIT ? OFFSET ?`,
    [...values, 20, from],
  );
  const [editors] = await db.execute<EditorRow[]>(
    `SELECT DISTINCT p.id, p.full_name
       FROM content_history h JOIN profiles p ON p.id = h.changed_by
      WHERE p.role = ? ORDER BY p.full_name`,
    ["admin"],
  );
  const [groups] = await db.execute<GroupRow[]>(
    "SELECT DISTINCT page_group FROM site_content ORDER BY page_group",
    [],
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      key: row.content_key,
      pageGroup: row.page_group,
      label: row.label_th,
      oldValue: row.old_value ?? "",
      newValue: row.new_value ?? "",
      changedAt: timestamp(row.changed_at) ?? "",
      changedBy: row.changed_by_name,
      currentValue: row.current_value,
    })),
    total: Number(countRows[0]?.total ?? 0),
    page: filters.page,
    pageSize: 20,
    editors: editors.map(({ id, full_name }) => ({ id, name: full_name })),
    groups: groups.map(({ page_group }) => page_group),
  };
}

export interface ContentChangeInput {
  key: string;
  value: string;
  originalValue: string;
  updatedAt: string | null;
}

export type SaveContentResult =
  | { ok: true; changedKeys: string[] }
  | { ok: false; error: "invalid" | "validation" | "conflict"; fields?: Record<string, string>; latest?: Record<string, string> };

interface LockedContentRow extends RowDataPacket {
  id: number;
  content_value: string;
  updated_at: Date | string;
}

async function writeContentAudit(connection: PoolConnection, actorId: string, keys: string[], ipAddress: string | null) {
  await connection.execute(
    `INSERT INTO audit_logs (user_id, action, entity, detail, ip_address)
     VALUES (?, 'content.update', 'site_content', ?, ?)`,
    [actorId, JSON.stringify({ keys }), ipAddress],
  );
}

export async function saveContentChanges(
  actorId: string,
  changes: ContentChangeInput[],
  ipAddress: string | null,
): Promise<SaveContentResult> {
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 500) return { ok: false, error: "invalid" };
  const seen = new Set<string>();
  const fields: Record<string, string> = {};
  const normalized = changes.map((change) => {
    if (!change || typeof change.key !== "string" || !Object.hasOwn(CONTENT_FALLBACKS, change.key) || seen.has(change.key) || typeof change.value !== "string" || typeof change.originalValue !== "string" || !(change.updatedAt === null || typeof change.updatedAt === "string")) {
      return null;
    }
    seen.add(change.key);
    const fallback = CONTENT_FALLBACKS[change.key as ContentKey];
    const validation = validateContentValue(change.value, fallback);
    if (validation.error) fields[change.key] = validation.error;
    return { ...change, value: validation.value, fallback };
  });
  if (normalized.some((change) => change === null)) return { ok: false, error: "invalid" };
  if (Object.keys(fields).length) return { ok: false, error: "validation", fields };

  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const changedKeys: string[] = [];
    for (const change of normalized as Exclude<(typeof normalized)[number], null>[]) {
      const metadata = getContentMetadata(change.key, change.fallback);
      const [rows] = await connection.execute<LockedContentRow[]>(
        "SELECT id, content_value, updated_at FROM site_content WHERE content_key = ? LIMIT 1 FOR UPDATE",
        [change.key],
      );
      let row = rows[0];
      if (!row) {
        const [insertResult] = await connection.execute<ResultSetHeader>(
          "INSERT IGNORE INTO site_content (content_key, page_group, label_th, content_value) VALUES (?, ?, ?, ?)",
          [change.key, metadata.pageGroup, metadata.labelTh, change.fallback],
        );
        const [afterInsert] = await connection.execute<LockedContentRow[]>(
          "SELECT id, content_value, updated_at FROM site_content WHERE content_key = ? LIMIT 1 FOR UPDATE",
          [change.key],
        );
        row = afterInsert[0];
        if (!row || insertResult.affectedRows !== 1 || row.content_value !== change.fallback) {
          fields[change.key] = "conflict";
          await connection.rollback();
          return { ok: false, error: "conflict", latest: { [change.key]: row?.content_value ?? "" } };
        }
      } else if (change.updatedAt === null || !hasSameTimestamp(change.updatedAt, row.updated_at) || row.content_value !== change.originalValue) {
        fields[change.key] = "conflict";
        await connection.rollback();
        return { ok: false, error: "conflict", latest: { [change.key]: row.content_value } };
      }

      if (row.content_value !== change.value) {
        await connection.execute(
          "UPDATE site_content SET content_value = ?, updated_by = ? WHERE id = ?",
          [change.value, actorId, row.id],
        );
        changedKeys.push(change.key);
      }
    }
    if (changedKeys.length) await writeContentAudit(connection, actorId, changedKeys, ipAddress);
    await connection.commit();
    return { ok: true, changedKeys };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export type RestoreContentResult =
  | { ok: true; changed: boolean; currentValue: string; targetValue: string }
  | { ok: false; error: "not_found" | "validation"; fieldError?: string };

interface RestoreRow extends RowDataPacket {
  id: number;
  content_id: number;
  old_value: string | null;
  content_key: string;
  content_value: string;
}

export async function restoreContentHistory(
  actorId: string,
  historyId: number,
  ipAddress: string | null,
): Promise<RestoreContentResult> {
  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const [historyRows] = await connection.execute<RestoreRow[]>(
      `SELECT h.id, h.content_id, h.old_value, sc.content_key, sc.content_value
         FROM content_history h JOIN site_content sc ON sc.id = h.content_id
        WHERE h.id = ? LIMIT 1 FOR UPDATE`,
      [historyId],
    );
    const history = historyRows[0];
    if (!history) {
      await connection.rollback();
      return { ok: false, error: "not_found" };
    }
    const key = history.content_key as ContentKey;
    const fallback = CONTENT_FALLBACKS[key];
    if (typeof fallback !== "string") {
      await connection.rollback();
      return { ok: false, error: "not_found" };
    }
    const targetValue = history.old_value ?? "";
    const validation = validateContentValue(targetValue, fallback);
    if (validation.error) {
      await connection.rollback();
      return { ok: false, error: "validation", fieldError: validation.error };
    }
    if (history.content_value === validation.value) {
      await connection.rollback();
      return { ok: true, changed: false, currentValue: history.content_value, targetValue: validation.value };
    }
    await connection.execute(
      "UPDATE site_content SET content_value = ?, updated_by = ? WHERE id = ?",
      [validation.value, actorId, history.content_id],
    );
    await writeContentAudit(connection, actorId, [key], ipAddress);
    await connection.commit();
    return { ok: true, changed: true, currentValue: history.content_value, targetValue: validation.value };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
