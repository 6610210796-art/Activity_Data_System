import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  generateTemporaryPassword,
  hashPassword,
  normalizeEmail,
  validateEmail,
} from "@/lib/password-security";
import {
  checkUserLockProtection,
  validateProfileUpdate,
  type ManagedProfile,
  type ManagedRole,
} from "@/lib/user-management";
import { authorizeAdminUsers } from "@/lib/admin-users-policy";
import { writeUserAudit } from "@/lib/user-audit";
import { lockActiveAdmins, lockAndVerifyAdminActor } from "@/lib/admin-user-lock";
import { logSafeServerError } from "@/lib/safe-error-log";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

function ipAddress(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const candidate = forwarded?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? null;
  return candidate ? candidate.slice(0, 45) : null;
}

async function getTarget(connection: PoolConnection, id: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id, full_name, email, role, department_code, is_active
     FROM profiles WHERE id = ? LIMIT 1 FOR UPDATE`,
    [id],
  );
  return rows[0] as ManagedProfile & {
    full_name: string;
    email: string;
  } | undefined;
}

export async function PATCH(request: NextRequest, context: Context) {
  const actor = await getCurrentUser();
  const access = authorizeAdminUsers(actor);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const admin = access.actor;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || !("action" in body)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const action = body.action;
  const db = getDb();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const activeAdminCount = await lockActiveAdmins(connection);
    const actorError = await lockAndVerifyAdminActor(connection, admin.id);
    if (actorError) {
      await connection.rollback();
      return NextResponse.json({ error: actorError }, { status: actorError === "session" ? 401 : 403 });
    }
    const target = await getTarget(connection, id);
    if (!target) {
      await connection.rollback();
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (action === "profile") {
      if (!("fullName" in body) || !("email" in body)) {
        await connection.rollback();
        return NextResponse.json({ error: "invalid" }, { status: 400 });
      }
      const fullName =
        typeof body.fullName === "string" ? body.fullName.trim() : "";
      const email =
        typeof body.email === "string" ? normalizeEmail(body.email) : "";
      if (!validateEmail(email)) {
        await connection.rollback();
        return NextResponse.json({ error: "email_invalid" }, { status: 400 });
      }
      const profileError = validateProfileUpdate(
        fullName,
        email,
        target.role,
        target.department_code,
      );
      if (profileError) {
        await connection.rollback();
        return NextResponse.json({ error: "validation" }, { status: 400 });
      }

      const [duplicateRows] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM profiles WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1",
        [email, id],
      );
      if (duplicateRows.length > 0) {
        await connection.rollback();
        return NextResponse.json({ error: "email_duplicate" }, { status: 409 });
      }

      await connection.execute(
        "UPDATE profiles SET full_name = ?, email = ? WHERE id = ?",
        [fullName, email, id],
      );
      await writeUserAudit(connection, {
        actorId: admin.id,
        action: "user.update_profile",
        entityId: id,
        before: { full_name: target.full_name, email: target.email },
        after: { full_name: fullName, email },
        ipAddress: ipAddress(request),
      });
      await connection.commit();
      return NextResponse.json({ ok: true, fullName, email });
    }

    if (action === "role") {
      if (!("role" in body)) {
        await connection.rollback();
        return NextResponse.json({ error: "invalid" }, { status: 400 });
      }
      const nextRole: ManagedRole =
        body.role === "unit_user" ? "unit_user" : body.role === "admin" ? "admin" : "invalid" as ManagedRole;
      if (nextRole === ("invalid" as ManagedRole)) {
        await connection.rollback();
        return NextResponse.json({ error: "invalid" }, { status: 400 });
      }
      const nextDepartment =
        "departmentCode" in body && typeof body.departmentCode === "string"
          ? body.departmentCode
          : target.department_code;

      const protection = checkUserLockProtection({
        actorId: admin.id,
        targetId: id,
        targetBefore: target,
        targetAfterRole: nextRole,
        targetAfterDepartment:
          nextRole === "unit_user" ? nextDepartment : null,
        targetAfterActive: Number(target.is_active) === 1,
        activeAdminCount,
      });
      if (!protection.ok) {
        await connection.rollback();
        return NextResponse.json({ error: "lock_protection" }, { status: 409 });
      }

      if (nextRole === "unit_user" && nextDepartment) {
        const [departmentRows] = await connection.execute<RowDataPacket[]>(
          "SELECT code FROM departments WHERE code = ? AND is_active = 1 LIMIT 1",
          [nextDepartment],
        );
        if (departmentRows.length === 0) {
          await connection.rollback();
          return NextResponse.json({ error: "department_invalid" }, { status: 400 });
        }
      }

      const finalDepartment =
        nextRole === "unit_user" ? nextDepartment : null;
      await connection.execute(
        "UPDATE profiles SET role = ?, department_code = ? WHERE id = ?",
        [nextRole, finalDepartment, id],
      );
      await writeUserAudit(connection, {
        actorId: admin.id,
        action: "user.update_role",
        entityId: id,
        before: { role: target.role },
        after: { role: nextRole },
        ipAddress: ipAddress(request),
      });
      if (target.department_code !== finalDepartment) {
        await writeUserAudit(connection, {
          actorId: admin.id,
          action: "user.update_department",
          entityId: id,
          before: { department_code: target.department_code },
          after: { department_code: finalDepartment },
          ipAddress: ipAddress(request),
        });
      }
      await connection.commit();
      return NextResponse.json({
        ok: true,
        role: nextRole,
        departmentCode: finalDepartment,
      });
    }

    if (action === "department") {
      if (!("departmentCode" in body) || typeof body.departmentCode !== "string") {
        await connection.rollback();
        return NextResponse.json({ error: "invalid" }, { status: 400 });
      }
      const departmentCode = body.departmentCode;
      if (target.role === "unit_user" && !departmentCode) {
        await connection.rollback();
        return NextResponse.json({ error: "department_required" }, { status: 400 });
      }
      if (departmentCode) {
        const [departmentRows] = await connection.execute<RowDataPacket[]>(
          "SELECT code FROM departments WHERE code = ? AND is_active = 1 LIMIT 1",
          [departmentCode],
        );
        if (departmentRows.length === 0) {
          await connection.rollback();
          return NextResponse.json({ error: "department_invalid" }, { status: 400 });
        }
      }

      await connection.execute(
        "UPDATE profiles SET department_code = ? WHERE id = ?",
        [departmentCode || null, id],
      );
      await writeUserAudit(connection, {
        actorId: admin.id,
        action: "user.update_department",
        entityId: id,
        before: { department_code: target.department_code },
        after: { department_code: departmentCode || null },
        ipAddress: ipAddress(request),
      });
      await connection.commit();
      return NextResponse.json({ ok: true, departmentCode: departmentCode || null });
    }

    if (action === "status") {
      if (!("isActive" in body) || typeof body.isActive !== "boolean") {
        await connection.rollback();
        return NextResponse.json({ error: "invalid" }, { status: 400 });
      }
      const nextActive = body.isActive;
      const protection = checkUserLockProtection({
        actorId: admin.id,
        targetId: id,
        targetBefore: target,
        targetAfterRole: target.role,
        targetAfterDepartment: target.department_code,
        targetAfterActive: nextActive,
        activeAdminCount,
      });
      if (!protection.ok) {
        await connection.rollback();
        return NextResponse.json({ error: "lock_protection" }, { status: 409 });
      }
      await connection.execute(
        "UPDATE profiles SET is_active = ? WHERE id = ?",
        [nextActive ? 1 : 0, id],
      );
      await writeUserAudit(connection, {
        actorId: admin.id,
        action: nextActive ? "user.enable" : "user.disable",
        entityId: id,
        before: { is_active: Number(target.is_active) === 1 },
        after: { is_active: nextActive },
        ipAddress: ipAddress(request),
      });
      await connection.commit();
      return NextResponse.json({ ok: true, isActive: nextActive });
    }

    if (action === "reset_password") {
      if (admin.id === id) {
        await connection.rollback();
        return NextResponse.json({
          error: "lock_protection",
        }, { status: 409 });
      }
      const password = generateTemporaryPassword();
      const passwordHash = await hashPassword(password);
      await connection.execute(
        "UPDATE profiles SET password_hash = ? WHERE id = ?",
        [passwordHash, id],
      );
      await writeUserAudit(connection, {
        actorId: admin.id,
        action: "user.reset_password",
        entityId: id,
        before: { credential_state: "existing" },
        after: { credential_state: "reset" },
        ipAddress: ipAddress(request),
      });
      await connection.commit();
      return NextResponse.json({
        ok: true,
        temporaryPassword: password,
      });
    }

    await connection.rollback();
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  } catch (error) {
    await connection.rollback();
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "email_duplicate" }, { status: 409 });
    }
    logSafeServerError("Update managed user failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  } finally {
    connection.release();
  }
}
