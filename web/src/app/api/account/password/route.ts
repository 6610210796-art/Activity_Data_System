import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { AUTH_COOKIE_NAME, getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  clearPasswordChangeFailures,
  getPasswordChangeLockSeconds,
  recordPasswordChangeFailure,
} from "@/lib/password-change-rate-limit";
import {
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "@/lib/password-security";
import { writeUserAudit } from "@/lib/user-audit";
import { logSafeServerError } from "@/lib/safe-error-log";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "session" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("currentPassword" in body) ||
    !("newPassword" in body) ||
    !("confirmPassword" in body) ||
    typeof body.currentPassword !== "string" ||
    typeof body.newPassword !== "string" ||
    typeof body.confirmPassword !== "string"
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (body.newPassword !== body.confirmPassword) {
    return NextResponse.json({ error: "confirmation" }, { status: 400 });
  }
  const policyError = validatePasswordPolicy(body.newPassword);
  if (policyError) {
    return NextResponse.json({ error: "password_policy" }, { status: 400 });
  }

  const lockSeconds = getPasswordChangeLockSeconds(user.id);
  if (lockSeconds > 0) {
    return NextResponse.json({
      error: "locked",
      retryAfter: lockSeconds,
    }, { status: 429 });
  }

  const db = getDb();
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT password_hash FROM profiles WHERE id = ? AND is_active = 1 LIMIT 1",
    [user.id],
  );
  const passwordHash = rows[0]?.password_hash;
  if (typeof passwordHash !== "string") {
    return NextResponse.json({ error: "session" }, { status: 401 });
  }

  const currentMatches = await verifyPassword(
    body.currentPassword,
    passwordHash,
  );
  if (!currentMatches) {
    const retryAfter = recordPasswordChangeFailure(user.id);
    return NextResponse.json({
      error: "current_password",
      retryAfter,
    }, { status: retryAfter > 0 ? 429 : 400 });
  }
  if (await verifyPassword(body.newPassword, passwordHash)) {
    return NextResponse.json({ error: "same_password" }, { status: 400 });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [lockedRows] = await connection.execute<RowDataPacket[]>(
      "SELECT password_hash FROM profiles WHERE id = ? AND is_active = 1 LIMIT 1 FOR UPDATE",
      [user.id],
    );
    if (!lockedRows[0]) {
      await connection.rollback();
      return NextResponse.json({ error: "session" }, { status: 401 });
    }
    const nextHash = await hashPassword(body.newPassword);
    await connection.execute(
      "UPDATE profiles SET password_hash = ? WHERE id = ?",
      [nextHash, user.id],
    );
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const realIp = request.headers.get("x-real-ip")?.trim();
    await writeUserAudit(connection, {
      actorId: user.id,
      action: "user.change_password",
      entityId: user.id,
      before: { credential_state: "existing" },
      after: { credential_state: "changed" },
      ipAddress: (forwarded || realIp || "").slice(0, 45) || null,
    });
    await connection.commit();
    clearPasswordChangeFailures(user.id);

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(0),
      path: "/",
    });
    return response;
  } catch (error) {
    await connection.rollback();
    logSafeServerError("Change password failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  } finally {
    connection.release();
  }
}
