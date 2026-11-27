import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { authorizeAdminContent } from "@/lib/admin-content-policy";

export const dynamic = "force-dynamic";

export async function POST() {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ error: "gone" }, { status: 410 });
}
