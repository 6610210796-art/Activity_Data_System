import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { AUTH_COOKIE_NAME, createSessionToken, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { getSiteContent } from "@/lib/content";
import { getDb } from "@/lib/db";
import {
  clearFailedLogins,
  getLoginLockSeconds,
  recordFailedLogin,
} from "@/lib/login-rate-limit";

interface LoginProfile extends RowDataPacket {
  id: string;
  password_hash: string;
  is_active: number | boolean;
}

const dummyHash = bcrypt.hash("nonexistent-account-password", 12);

function invalidResponse(message: string, status = 401, retryAfter = 0) {
  const response = NextResponse.json({ message }, { status });
  if (retryAfter > 0) {
    response.headers.set("Retry-After", String(retryAfter));
  }
  return response;
}

export async function POST(request: NextRequest) {
  let email = "";
  let password = "";
  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("email" in body) ||
      !("password" in body) ||
      typeof body.email !== "string" ||
      typeof body.password !== "string"
    ) {
      const content = await getSiteContent(["login.error.generic"]);
      return invalidResponse(content["login.error.generic"]);
    }
    email = body.email.trim().toLowerCase();
    password = body.password;
  } catch {
    const content = await getSiteContent(["login.error.generic"]);
    return invalidResponse(content["login.error.generic"]);
  }

  const content = await getSiteContent([
    "login.error.generic",
    "login.error.server",
  ]);
  const genericError = content["login.error.generic"];
  const retryAfter = getLoginLockSeconds(email);
  if (retryAfter > 0) {
    return invalidResponse(genericError, 429, retryAfter);
  }

  try {
    const [rows] = await getDb().execute<LoginProfile[]>(
      "SELECT id, password_hash, is_active FROM profiles WHERE email = ? LIMIT 1",
      [email],
    );
    const profile = rows[0];
    const passwordMatches = await bcrypt.compare(
      password,
      profile?.password_hash ?? (await dummyHash),
    );

    if (!profile || Number(profile.is_active) !== 1 || !passwordMatches) {
      const lockSeconds = recordFailedLogin(email);
      return invalidResponse(genericError, lockSeconds > 0 ? 429 : 401, lockSeconds);
    }

    clearFailedLogins(email);
    await getDb().execute(
      "UPDATE profiles SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
      [profile.id],
    );

    const token = await createSessionToken(profile.id);
    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("Login request failed", error);
    return NextResponse.json(
      { message: content["login.error.server"] },
      { status: 503 },
    );
  }
}
