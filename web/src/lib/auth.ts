import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";
import { resolveAuthenticatedProfile } from "@/lib/auth-profile";

export const AUTH_COOKIE_NAME = "activity_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "unit_user";
  department_code: string | null;
}

interface ProfileRow extends RowDataPacket, AuthenticatedUser {
  is_active: number | boolean;
}

function jwtKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || new TextEncoder().encode(secret).length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(jwtKey());
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, jwtKey());
    if (typeof payload.sub !== "string") {
      return null;
    }
    userId = payload.sub;
  } catch {
    return null;
  }

  const [rows] = await getDb().execute<ProfileRow[]>(
    "SELECT id, email, full_name, role, department_code, is_active FROM profiles WHERE id = ? LIMIT 1",
    [userId],
  );
  return resolveAuthenticatedProfile(rows[0]);
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
