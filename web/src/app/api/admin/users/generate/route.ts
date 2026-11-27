import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateTemporaryPassword } from "@/lib/password-security";
import { authorizeAdminUsers } from "@/lib/admin-users-policy";

export const dynamic = "force-dynamic";

export async function POST() {
  const actor = await getCurrentUser();
  const access = authorizeAdminUsers(actor);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  return NextResponse.json({
    password: generateTemporaryPassword(),
  });
}
