import type { PoolConnection } from "mysql2/promise";

export type UserAuditAction =
  | "user.create"
  | "user.update_role"
  | "user.update_department"
  | "user.update_profile"
  | "user.disable"
  | "user.enable"
  | "user.reset_password"
  | "user.change_password";

function assertAuditFieldsAreSafe(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (/password|hash/i.test(key)) {
      throw new Error("Credential fields cannot be written to user audit details.");
    }
    assertAuditFieldsAreSafe(nested);
  }
}

export async function writeUserAudit(
  connection: PoolConnection,
  input: {
    actorId: string;
    action: UserAuditAction;
    entityId: string;
    before: unknown;
    after: unknown;
    ipAddress: string | null;
  },
): Promise<void> {
  assertAuditFieldsAreSafe(input.before);
  assertAuditFieldsAreSafe(input.after);
  const detail = JSON.stringify({ before: input.before, after: input.after });
  await connection.execute(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, detail, ip_address)
     VALUES (?, ?, 'user', ?, ?, ?)`,
    [input.actorId, input.action, input.entityId, detail, input.ipAddress],
  );
}
