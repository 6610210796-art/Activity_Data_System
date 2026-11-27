import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { authorizeAdminContent } from "@/lib/admin-content-policy";
import {
  deleteAnnouncement,
  updateAnnouncement,
} from "@/lib/admin-announcements";
import { isBodyTooLarge, requestIpAddress } from "@/lib/request-ip";
import { logSafeServerError } from "@/lib/safe-error-log";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function PATCH(request: NextRequest, context: Context) {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  if (isBodyTooLarge(request, 20_000)) {
    return NextResponse.json({ error: "invalid" }, { status: 413 });
  }
  const { id } = await context.params;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  try {
    const result = await updateAnnouncement(id, {
      title: stringValue(input.title),
      body: stringValue(input.body),
      startDate: stringValue(input.startDate),
      endDate: stringValue(input.endDate),
      isActive: input.isActive === true || input.isActive === 1,
    }, access.actor.id, requestIpAddress(request));
    if (!result.ok) return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 400 });
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (error) {
    logSafeServerError("Announcement update failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  try {
    const result = await deleteAnnouncement(id, access.actor.id, requestIpAddress(request));
    if (!result.ok) return NextResponse.json(result, { status: 404 });
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (error) {
    logSafeServerError("Announcement delete failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
