import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getAdminContentEntries, getContentHistory, saveContentChanges } from "@/lib/admin-content";
import { authorizeAdminContent, parseContentHistoryFilters } from "@/lib/admin-content-policy";
import { logSafeServerError } from "@/lib/safe-error-log";

export const dynamic = "force-dynamic";

function ipAddress(request: NextRequest): string | null {
  const candidate = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? null;
  return candidate ? candidate.slice(0, 45) : null;
}

export async function GET(request: NextRequest) {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    if (request.nextUrl.searchParams.get("view") === "history") {
      const params = request.nextUrl.searchParams;
      const filters = parseContentHistoryFilters({
        from: params.get("from"), to: params.get("to"), editor: params.get("editor"),
        group: params.get("group"), q: params.get("q"), page: params.get("page"),
      });
      return NextResponse.json(await getContentHistory(filters));
    }
    return NextResponse.json({ entries: await getAdminContentEntries() });
  } catch (error) {
    logSafeServerError("Admin content read failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || !("changes" in body) || !Array.isArray(body.changes)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  try {
    const result = await saveContentChanges(access.actor.id, body.changes, ipAddress(request));
    if (!result.ok) return NextResponse.json(result, { status: result.error === "conflict" ? 409 : 400 });
    if (result.changedKeys.length) revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (error) {
    logSafeServerError("Admin content update failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
