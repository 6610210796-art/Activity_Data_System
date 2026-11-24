import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  getAdminUsers,
  getDepartmentOptions,
} from "@/lib/admin-users-data";
import {
  generateTemporaryPassword,
  hashPassword,
  normalizeEmail,
  validateEmail,
  validatePasswordPolicy,
} from "@/lib/password-security";
import { validateProfileUpdate } from "@/lib/user-management";

export const dynamic = "force-dynamic";

function ipAddress(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const candidate = forwarded?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? null;
  return candidate ? candidate.slice(0, 45) : null;
}

function parsePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export async function GET(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "session" }, { status: 401 });
  if (actor.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const statusParam = params.get("status");
  const roleParam = params.get("role");
  const status =
    statusParam === "active" || statusParam === "inactive"
      ? statusParam
      : "all";
  const role =
    roleParam === "admin" || roleParam === "unit_user"
      ? roleParam
      : "all";

  try {
    const [data, departments] = await Promise.all([
      getAdminUsers({
        search: (params.get("q") ?? "").slice(0, 150),
        status,
        role,
        page: parsePage(params.get("page")),
      }),
      getDepartmentOptions(),
    ]);
    return NextResponse.json({ ...data, departments });
  } catch (error) {
    console.error("Admin users list failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "session" }, { status: 401 });
  if (actor.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("fullName" in body) ||
    !("email" in body) ||
    !("role" in body)
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string"
    ? normalizeEmail(body.email)
    : "";
  const role = body.role === "unit_user" ? "unit_user" : body.role === "admin" ? "admin" : "";
  const departmentCode =
    "departmentCode" in body && typeof body.departmentCode === "string"
      ? body.departmentCode
      : null;
  const suppliedPassword =
    "password" in body && typeof body.password === "string"
      ? body.password
      : "";

  if (!validateEmail(email)) {
    return NextResponse.json({ error: "email_invalid" }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const profileError = validateProfileUpdate(
    fullName,
    email,
    role,
    role === "unit_user" ? departmentCode : null,
  );
  if (profileError) {
    return NextResponse.json({ error: "validation", message: profileError }, { status: 400 });
  }

  const temporaryPassword = suppliedPassword || generateTemporaryPassword();
  const passwordError = validatePasswordPolicy(temporaryPassword);
  if (passwordError) {
    return NextResponse.json({ error: "password_policy", message: passwordError }, { status: 400 });
  }

  const db = getDb();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [duplicateRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM profiles WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [email],
    );
    if (duplicateRows.length > 0) {
      await connection.rollback();
      return NextResponse.json({ error: "email_duplicate", message: "อีเมลนี้มีในระบบแล้ว" }, { status: 409 });
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

    const passwordHash = await hashPassword(temporaryPassword);
    await connection.execute(
      `INSERT INTO profiles
       (email, password_hash, full_name, role, department_code, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [
        email,
        passwordHash,
        fullName,
        role,
        role === "unit_user" ? departmentCode : null,
      ],
    );
    const [createdRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM profiles WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [email],
    );
    const insertId = String(createdRows[0]?.id ?? "");
    await connection.execute(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, detail, ip_address)
       VALUES (?, 'user.create', 'user', ?, ?, ?)`,
      [
        actor.id,
        insertId,
        JSON.stringify({
          email,
          full_name: fullName,
          role,
          department_code: role === "unit_user" ? departmentCode : null,
        }),
        ipAddress(request),
      ],
    );
    await connection.commit();
    return NextResponse.json(
      {
        ok: true,
        id: insertId,
        temporaryPassword,
      },
      { status: 201 },
    );
  } catch (error) {
    await connection.rollback();
    console.error("Create managed user failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  } finally {
    connection.release();
  }
}
