import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

export type AdminActorLockError = "session" | "forbidden";

export async function lockActiveAdmins(
  connection: PoolConnection,
): Promise<number> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT id FROM profiles WHERE role = ? AND is_active = ? ORDER BY id FOR UPDATE",
    ["admin", 1],
  );
  return rows.length;
}

export async function lockAndVerifyAdminActor(
  connection: PoolConnection,
  actorId: string,
): Promise<AdminActorLockError | null> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT role, is_active FROM profiles WHERE id = ? LIMIT 1 FOR UPDATE",
    [actorId],
  );
  const actor = rows[0];
  if (!actor || Number(actor.is_active) !== 1) return "session";
  if (actor.role !== "admin") return "forbidden";
  return null;
}
