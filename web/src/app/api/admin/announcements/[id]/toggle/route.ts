import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { authorizeAdminContent } from "@/lib/admin-content-policy";
import { toggleAnnouncement } from "@/lib/admin-announcements";
import { requestIpAddress } from "@/lib/request-ip";
import { logSafeServerError } from "@/lib/safe-error-log";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  try {
    const result = await toggleAnnouncement(id, access.actor.id, requestIpAddress(request));
    if (!result.ok) return NextResponse.json(result, { status: 404 });
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (error) {
    logSafeServerError("Announcement toggle failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
