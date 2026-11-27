import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { authorizeAdminContent } from "@/lib/admin-content-policy";
import {
  createAnnouncement,
  listAnnouncements,
} from "@/lib/admin-announcements";
import { isBodyTooLarge, requestIpAddress } from "@/lib/request-ip";
import { logSafeServerError } from "@/lib/safe-error-log";

export const dynamic = "force-dynamic";

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function GET(request: NextRequest) {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const params = request.nextUrl.searchParams;
    const result = await listAnnouncements({
      q: params.get("q"),
      status: params.get("status"),
      page: params.get("page"),
    });
    return NextResponse.json(result);
  } catch (error) {
    logSafeServerError("Announcement list failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  if (isBodyTooLarge(request, 20_000)) {
    return NextResponse.json({ error: "invalid" }, { status: 413 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  try {
    const result = await createAnnouncement({
      title: stringValue(input.title),
      body: stringValue(input.body),
      startDate: stringValue(input.startDate),
      endDate: stringValue(input.endDate),
      isActive: input.isActive === true || input.isActive === 1,
    }, access.actor.id, requestIpAddress(request));
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (error) {
    logSafeServerError("Announcement create failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
