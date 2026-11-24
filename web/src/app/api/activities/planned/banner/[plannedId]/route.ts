import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

interface BannerRow extends RowDataPacket {
  banner_path: string;
  main_department: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ plannedId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { plannedId } = await params;
  if (!/^[1-9]\d*$/.test(plannedId)) {
    return new NextResponse(null, { status: 404 });
  }

  const [rows] = await getDb().execute<BannerRow[]>(
    `SELECT banner_path, main_department
     FROM planned_activities
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [plannedId],
  );
  const banner = rows[0];
  if (
    !banner ||
    (user.role === "unit_user" &&
      (!user.department_code || banner.main_department !== user.department_code))
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const pathMatch = /^storage\/uploads\/[a-f0-9-]{36}\.(jpg|png)$/.exec(
    banner.banner_path,
  );
  if (!pathMatch) return new NextResponse(null, { status: 404 });

  const uploadDirectory = path.join(process.cwd(), "storage", "uploads");
  const filePath = path.join(uploadDirectory, path.basename(banner.banner_path));
  if (path.dirname(filePath) !== uploadDirectory) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const bytes = await readFile(filePath);
    const mimeType = pathMatch[1] === "jpg" ? "image/jpeg" : "image/png";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${path.basename(filePath)}"`,
        "Content-Type": mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
