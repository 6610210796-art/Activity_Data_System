import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { restoreContentHistory } from "@/lib/admin-content";
import { authorizeAdminContent } from "@/lib/admin-content-policy";
import { logSafeServerError } from "@/lib/safe-error-log";

export const dynamic = "force-dynamic";

function ipAddress(request: NextRequest): string | null {
  const candidate = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? null;
  return candidate ? candidate.slice(0, 45) : null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const result = await restoreContentHistory(access.actor.id, Number(id), ipAddress(request));
    if (!result.ok) return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 400 });
    if (result.changed) revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (error) {
    logSafeServerError("Admin content history restore failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
