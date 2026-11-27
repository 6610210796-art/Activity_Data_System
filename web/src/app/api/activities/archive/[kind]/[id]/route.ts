import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { changeActivityArchiveState, type ActivityArchiveAction, type ActivityArchiveKind } from "@/lib/activity-archive";

const validId = (id: string) => /^[1-9]\d*$/.test(id);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ errorKey: "err.save" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ errorKey: "err.session" }, { status: 401 });
  const { kind, id } = await params;
  if ((kind !== "past" && kind !== "planned") || !validId(id)) {
    return NextResponse.json({ errorKey: "err.save" }, { status: 404 });
  }
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ errorKey: "err.save" }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("action" in body) ||
      !["archive", "restore", "purge"].includes(String(body.action))) {
    return NextResponse.json({ errorKey: "err.save" }, { status: 400 });
  }
  try {
    const result = await changeActivityArchiveState({
      user,
      kind: kind as ActivityArchiveKind,
      id,
      action: body.action as ActivityArchiveAction,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    if (!result.ok) return NextResponse.json({ errorKey: "err.save" }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Activity archive operation failed", error);
    return NextResponse.json({ errorKey: "err.save" }, { status: 500 });
  }
}
