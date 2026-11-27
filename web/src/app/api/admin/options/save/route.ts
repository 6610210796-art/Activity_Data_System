import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { authorizeAdminContent } from "@/lib/admin-content-policy";
import { saveOptions } from "@/lib/admin-options";
import { isBodyTooLarge, requestIpAddress } from "@/lib/request-ip";
import { logSafeServerError } from "@/lib/safe-error-log";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  if (isBodyTooLarge(request, 500_000)) {
    return NextResponse.json({ error: "invalid" }, { status: 413 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const result = await saveOptions(body, access.actor.id, requestIpAddress(request));
    if (!result.ok) {
      return NextResponse.json(result, { status: result.error === "conflict" ? 409 : 400 });
    }
    revalidatePath("/", "layout");
    revalidatePath("/admin/content");
    return NextResponse.json(result);
  } catch (error) {
    logSafeServerError("Option batch save failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
