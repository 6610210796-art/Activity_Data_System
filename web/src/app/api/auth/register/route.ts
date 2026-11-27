import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";
import { logSafeServerError } from "@/lib/safe-error-log";
import {
  hashPassword,
  normalizeEmail,
  validateEmail,
  validatePasswordPolicy,
} from "@/lib/password-security";

export const dynamic = "force-dynamic";

const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_REGISTRATIONS_PER_WINDOW = 8;
const registrationAttempts = new Map<string, number[]>();

interface CodeRow extends RowDataPacket {
  code: string;
}

function getRateLimitKey(request: NextRequest): string {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? "unknown";
  return createHash("sha256").update(address).digest("hex");
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const attempts = (registrationAttempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < RATE_WINDOW_MS,
  );
  if (attempts.length >= MAX_REGISTRATIONS_PER_WINDOW) {
    registrationAttempts.set(key, attempts);
    return true;
  }
  attempts.push(now);
  registrationAttempts.set(key, attempts);
  return false;
}

function isDuplicateEmailError(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "ER_DUP_ENTRY";
}

export async function POST(request: NextRequest) {
  if (isRateLimited(getRateLimitKey(request))) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }
  if (
    typeof body !== "object" || body === null || Array.isArray(body) ||
    !("fullName" in body) || !("email" in body) ||
    !("departmentCode" in body) || !("password" in body) ||
    !("confirmPassword" in body) ||
    typeof body.fullName !== "string" || typeof body.email !== "string" ||
    typeof body.departmentCode !== "string" || typeof body.password !== "string" ||
    typeof body.confirmPassword !== "string"
  ) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  const fullName = body.fullName.trim();
  const email = normalizeEmail(body.email);
  const departmentCode = body.departmentCode.trim();
  if (fullName.length < 2 || fullName.length > 150 || email.length > 190 || !departmentCode) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }
  if (!validateEmail(email)) {
    return NextResponse.json({ error: "email_invalid" }, { status: 400 });
  }
  if (body.password !== body.confirmPassword) {
    return NextResponse.json({ error: "password_mismatch" }, { status: 400 });
  }
  if (validatePasswordPolicy(body.password)) {
    return NextResponse.json({ error: "password_policy" }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(body.password);
    const connection = await getDb().getConnection();
    let transactionStarted = false;
    try {
      await connection.beginTransaction();
      transactionStarted = true;

      const [departments] = await connection.execute<CodeRow[]>(
        "SELECT code FROM departments WHERE code = ? AND is_active = ? LIMIT 1 FOR UPDATE",
        [departmentCode, 1],
      );
      if (!departments[0]) {
        await connection.rollback();
        transactionStarted = false;
        return NextResponse.json({ error: "department_invalid" }, { status: 400 });
      }

      const [existing] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM profiles WHERE LOWER(email) = ? LIMIT 1",
        [email],
      );
      if (existing.length > 0) {
        await connection.rollback();
        transactionStarted = false;
        return NextResponse.json({ error: "email_duplicate" }, { status: 409 });
      }

      await connection.execute(
        `INSERT INTO profiles
         (email, password_hash, full_name, role, department_code, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [email, passwordHash, fullName, "unit_user", departmentCode, 1],
      );
      await connection.commit();
      transactionStarted = false;
      return NextResponse.json({ ok: true }, { status: 201 });
    } catch (error) {
      if (transactionStarted) await connection.rollback();
      if (isDuplicateEmailError(error)) {
        return NextResponse.json({ error: "email_duplicate" }, { status: 409 });
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    logSafeServerError("User registration failed", error);
    return NextResponse.json({ error: "server" }, { status: 503 });
  }
}
