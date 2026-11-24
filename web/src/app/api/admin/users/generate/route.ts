import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateTemporaryPassword } from "@/lib/password-security";

export const dynamic = "force-dynamic";

export async function POST() {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "session" }, { status: 401 });
  if (actor.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    password: generateTemporaryPassword(),
  });
}
