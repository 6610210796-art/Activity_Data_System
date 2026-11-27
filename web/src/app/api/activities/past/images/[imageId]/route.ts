import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

interface ActivityImageRow extends RowDataPacket {
  file_path: string;
  main_department: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse(null, { status: 401 });
  }

  const { imageId } = await params;
  if (!/^[1-9]\d*$/.test(imageId)) {
    return new NextResponse(null, { status: 404 });
  }

  const archiveScope = new URL(request.url).searchParams.get("scope") === "archive";
  const [rows] = await getDb().execute<ActivityImageRow[]>(
    `SELECT pai.file_path, pa.main_department
     FROM past_activity_images AS pai
     INNER JOIN past_activities AS pa ON pa.id = pai.past_id
     WHERE pai.id = ? AND ((? = 1 AND pa.deleted_at IS NOT NULL AND pa.purged_at IS NULL)
       OR (? = 0 AND pa.deleted_at IS NULL AND pa.purged_at IS NULL))
     LIMIT 1`,
    [imageId, archiveScope ? 1 : 0, archiveScope ? 1 : 0],
  );
  const image = rows[0];
  if (
    !image ||
    (user.role === "unit_user" &&
      (!user.department_code || image.main_department !== user.department_code))
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const pathMatch = /^storage\/uploads\/[a-f0-9-]{36}\.(jpg|png)$/.exec(
    image.file_path,
  );
  if (!pathMatch) {
    console.error("Invalid past activity image path in database", image.file_path);
    return new NextResponse(null, { status: 404 });
  }

  const uploadDirectory = path.join(process.cwd(), "storage", "uploads");
  const filePath = path.join(uploadDirectory, path.basename(image.file_path));
  if (path.dirname(filePath) !== uploadDirectory) {
    console.error("Past activity image path escaped upload directory");
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
  } catch (error) {
    console.error("Could not read past activity image", error);
    return new NextResponse(null, { status: 404 });
  }
}
