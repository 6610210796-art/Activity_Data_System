import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { authorizeAdminContent } from "@/lib/admin-content-policy";
import { listOptionGroups } from "@/lib/admin-options";
import { logSafeServerError } from "@/lib/safe-error-log";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    return NextResponse.json(await listOptionGroups());
  } catch (error) {
    logSafeServerError("Option snapshot failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
