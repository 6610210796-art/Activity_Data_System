import { NextResponse } from "next/server";
import { getSiteAssetFile } from "@/lib/site-assets";
import { logSafeServerError } from "@/lib/safe-error-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const asset = await getSiteAssetFile("logo");
    if (!asset) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(asset.bytes), {
      headers: {
        "Cache-Control": asset.cacheControl,
        "Content-Type": asset.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logSafeServerError("Public logo read failed", error);
    return new NextResponse(null, { status: 404 });
  }
}
