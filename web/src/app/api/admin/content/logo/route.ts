import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { authorizeAdminContent } from "@/lib/admin-content-policy";
import { getSiteAssetView, resetSiteLogo, saveSiteLogo } from "@/lib/site-assets";
import { consumeSiteUpload } from "@/lib/site-upload-rate-limit";
import { isBodyTooLarge, requestIpAddress } from "@/lib/request-ip";
import { logSafeServerError } from "@/lib/safe-error-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 3 * 1024 * 1024;

export async function GET() {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    return NextResponse.json({ logo: await getSiteAssetView("logo") });
  } catch (error) {
    logSafeServerError("Admin logo read failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!consumeSiteUpload(access.actor.id)) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }
  if (isBodyTooLarge(request, MAX_REQUEST_BYTES)) {
    return NextResponse.json({ error: "invalid" }, { status: 413 });
  }

  let form: FormData;
  try { form = await request.formData(); } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const candidate = form.get("file");
  if (!candidate || typeof candidate === "string" || typeof candidate.arrayBuffer !== "function") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const file = candidate as File;
  const altValue = form.get("altText");

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await saveSiteLogo({
      fileName: file.name || "logo",
      mimeType: file.type || "",
      bytes,
      altText: typeof altValue === "string" ? altValue : "",
      actorId: access.actor.id,
      ipAddress: requestIpAddress(request),
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: result.error === "svg" ? 415 : 400 });
    }
    revalidatePath("/", "layout");
    return NextResponse.json({ logo: result.view, warning: result.warning });
  } catch (error) {
    logSafeServerError("Logo upload failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const access = authorizeAdminContent(await getCurrentUser());
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!consumeSiteUpload(access.actor.id)) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }
  try {
    const result = await resetSiteLogo(access.actor.id, requestIpAddress(request));
    revalidatePath("/", "layout");
    return NextResponse.json({ logo: result.view, warning: result.warning });
  } catch (error) {
    logSafeServerError("Logo reset failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
