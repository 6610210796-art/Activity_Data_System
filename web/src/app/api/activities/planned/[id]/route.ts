import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { NextResponse } from "next/server";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { validateActivityDates } from "@/lib/activity-date-validation";

export const runtime = "nodejs";

interface ActivityRow extends RowDataPacket {
  id: number | string;
  fiscal_year: number | string;
  quarter_no: number | string;
  title: string;
  main_department: string;
  activity_type_id: number | string;
  participant_type_id: number | string;
  date_status: "confirmed" | "unconfirmed";
  expected_start: Date | string;
  expected_end: Date | string;
  expected_participants: number | string;
  banner_path: string | null;
  location: string | null;
  ref_link: string | null;
}

interface OrganizerRow extends RowDataPacket {
  department_code: string;
}

interface CodeRow extends RowDataPacket {
  code: string;
}

interface ExistingBannerRow extends RowDataPacket {
  banner_path: string | null;
}

const MAX_BANNER_SIZE = 5 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_BANNER_SIZE + 256 * 1024;

function dateValue(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function validId(id: string) {
  return /^[1-9]\d*$/.test(id);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ errorKey: "err.session" }, { status: 401 });
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ errorKey: "err.save" }, { status: 404 });

  const db = getDb();
  const [rows] = await db.execute<ActivityRow[]>(
    `SELECT id, fiscal_year, quarter_no, title, main_department,
            activity_type_id, participant_type_id, date_status,
            expected_start, expected_end, expected_participants,
            banner_path, location, ref_link
     FROM planned_activities
     WHERE id = ? AND deleted_at IS NULL
       AND (? = 'admin' OR main_department = ?)
     LIMIT 1`,
    [id, user.role, user.department_code ?? ""],
  );
  const activity = rows[0];
  if (!activity) return NextResponse.json({ errorKey: "err.save" }, { status: 404 });
  const [organizers] = await db.execute<OrganizerRow[]>(
    "SELECT department_code FROM planned_co_organizers WHERE planned_id = ? ORDER BY department_code",
    [id],
  );

  return NextResponse.json({
    activity: {
      id: String(activity.id),
      fiscal_year: Number(activity.fiscal_year),
      quarter_no: Number(activity.quarter_no),
      title: activity.title,
      main_department: activity.main_department,
      activity_type_id: Number(activity.activity_type_id),
      participant_type_id: Number(activity.participant_type_id),
      date_status: activity.date_status,
      expected_start: dateValue(activity.expected_start),
      expected_end: dateValue(activity.expected_end),
      expected_participants: Number(activity.expected_participants),
      banner_path: activity.banner_path,
      banner_url: activity.banner_path
        ? `/api/activities/planned/banner/${activity.id}`
        : "",
      location: activity.location ?? "",
      ref_link: activity.ref_link ?? "",
      co_organizers: organizers.map((row) => row.department_code),
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ errorKey: "err.session" }, { status: 401 });
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ errorKey: "err.save" }, { status: 404 });

  const department = user.role === "unit_user" ? user.department_code : null;
  if (user.role === "unit_user" && !department) {
    return NextResponse.json({ errorKey: "err.save" }, { status: 404 });
  }
  const [result] = await getDb().execute<ResultSetHeader>(
    `UPDATE planned_activities
     SET deleted_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL
       AND (? IS NULL OR main_department = ?)`,
    [id, department, department],
  );
  if (result.affectedRows !== 1) {
    return NextResponse.json({ errorKey: "err.save" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function integer(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function stringArray(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function validateBanner(formData: FormData) {
  const entry = formData.get("banner");
  if (entry === null || typeof entry === "string") {
    return { errorKey: null, buffer: null as Buffer | null, filePath: null as string | null };
  }
  if (entry.size === 0) return { errorKey: "err.image.content", buffer: null, filePath: null };
  if (entry.size > MAX_BANNER_SIZE) return { errorKey: "err.image.size", buffer: null, filePath: null };
  const buffer = Buffer.from(await entry.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) return { errorKey: "err.image.content", buffer: null, filePath: null };
  if (detected.mime !== "image/jpeg" && detected.mime !== "image/png") {
    return { errorKey: "err.image.type", buffer: null, filePath: null };
  }
  return {
    errorKey: null,
    buffer,
    filePath: `storage/uploads/${randomUUID()}.${detected.mime === "image/jpeg" ? "jpg" : "png"}`,
  };
}

async function cleanupBanner(filePath: string | null) {
  if (!filePath) return;
  try {
    await unlink(path.join(process.cwd(), "storage", "uploads", path.basename(filePath)));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return;
    console.error("Could not remove a newly uploaded planned activity banner", error);
  }
}

async function removeBannerFile(filePath: string | null) {
  if (!filePath) return;
  try {
    await unlink(path.join(process.cwd(), "storage", "uploads", path.basename(filePath)));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return;
    console.error("Could not remove a replaced planned activity banner", error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ errorKey: "err.session" }, { status: 401 });
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ errorKey: "err.save" }, { status: 404 });
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_REQUEST_SIZE) {
    return NextResponse.json({ errorKey: "err.image.size", field: "banner" }, { status: 413 });
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;
  let uploadedPath: string | null = null;
  let replacedPath: string | null = null;
  try {
    const formData = await request.formData();
    const fiscalYear = integer(getString(formData, "fiscal_year"));
    const quarterNo = integer(getString(formData, "quarter_no"));
    const title = getString(formData, "title");
    const mainDepartment = getString(formData, "main_department");
    const coOrganizers = stringArray(getString(formData, "co_organizers"));
    const activityTypeId = integer(getString(formData, "activity_type_id"));
    const participantTypeId = integer(getString(formData, "participant_type_id"));
    const dateStatus = getString(formData, "date_status");
    const expectedStart = getString(formData, "expected_start");
    const expectedEnd = getString(formData, "expected_end");
    const expectedParticipants = integer(getString(formData, "expected_participants"));
    const location = getString(formData, "location") || null;
    const refLink = getString(formData, "ref_link") || null;
    const removeBanner = getString(formData, "remove_banner") === "1";

    if (fiscalYear === null || fiscalYear < 1544 || fiscalYear > 9999) {
      return NextResponse.json({ errorKey: "err.required", field: "fiscal_year" }, { status: 400 });
    }
    if (quarterNo === null || quarterNo < 1 || quarterNo > 4) {
      return NextResponse.json({ errorKey: "err.required", field: "quarter_no" }, { status: 400 });
    }
    if (!title) return NextResponse.json({ errorKey: "err.required", field: "title" }, { status: 400 });
    if ([...title].length > 150) return NextResponse.json({ errorKey: "err.title.max", field: "title" }, { status: 400 });
    if (!mainDepartment) return NextResponse.json({ errorKey: "err.required", field: "main_department" }, { status: 400 });
    if (!coOrganizers) {
      return NextResponse.json({ errorKey: "err.co.duplicate", field: "co_organizers" }, { status: 400 });
    }
    if (coOrganizers.length > 7) return NextResponse.json({ errorKey: "err.co.max", field: "co_organizers" }, { status: 400 });
    if (new Set(coOrganizers).size !== coOrganizers.length || coOrganizers.includes(mainDepartment)) {
      return NextResponse.json({ errorKey: "err.co.duplicate", field: "co_organizers" }, { status: 400 });
    }
    if (activityTypeId === null) return NextResponse.json({ errorKey: "err.required", field: "activity_type_id" }, { status: 400 });
    if (participantTypeId === null) return NextResponse.json({ errorKey: "err.required", field: "participant_type_id" }, { status: 400 });
    if (dateStatus !== "confirmed" && dateStatus !== "unconfirmed") {
      return NextResponse.json({ errorKey: "err.required", field: "date_status" }, { status: 400 });
    }
    if (!expectedStart) return NextResponse.json({ errorKey: "err.required", field: "expected_start" }, { status: 400 });
    if (!expectedEnd) return NextResponse.json({ errorKey: "err.required", field: "expected_end" }, { status: 400 });
    if (expectedParticipants === null || expectedParticipants < 1 || expectedParticipants > 2147483647) {
      return NextResponse.json({ errorKey: "err.participants.min", field: "expected_participants" }, { status: 400 });
    }
    if (location && [...location].length > 255) return NextResponse.json({ errorKey: "err.location.max", field: "location" }, { status: 400 });
    if (refLink && [...refLink].length > 500) return NextResponse.json({ errorKey: "err.ref_link.max", field: "ref_link" }, { status: 400 });
    const dateError = validateActivityDates({
      fiscalYear,
      quarterNo,
      startDate: expectedStart,
      endDate: expectedEnd,
      startField: "expected_start",
      endField: "expected_end",
      startRule: "none",
    });
    if (dateError) {
      return NextResponse.json({ errorKey: dateError.key, field: dateError.field }, { status: 400 });
    }
    if (user.role === "unit_user" && (!user.department_code || mainDepartment !== user.department_code)) {
      return NextResponse.json({ errorKey: "err.department.invalid", field: "main_department" }, { status: 403 });
    }

    const db = getDb();
    const [[departmentRows], [quarterRows], [activityRows], [participantRows]] = await Promise.all([
      db.execute<CodeRow[]>("SELECT code FROM departments WHERE code = ? AND is_active = 1 LIMIT 1", [mainDepartment]),
      db.execute<RowDataPacket[]>("SELECT no FROM quarters WHERE no = ? LIMIT 1", [quarterNo]),
      db.execute<RowDataPacket[]>("SELECT id FROM activity_types WHERE id = ? AND is_active = 1 LIMIT 1", [activityTypeId]),
      db.execute<RowDataPacket[]>("SELECT id FROM participant_types WHERE id = ? AND is_active = 1 LIMIT 1", [participantTypeId]),
    ]);
    if (!departmentRows.length) return NextResponse.json({ errorKey: "err.department.invalid", field: "main_department" }, { status: 400 });
    if (!quarterRows.length) return NextResponse.json({ errorKey: "err.required", field: "quarter_no" }, { status: 400 });
    if (!activityRows.length) return NextResponse.json({ errorKey: "err.required", field: "activity_type_id" }, { status: 400 });
    if (!participantRows.length) return NextResponse.json({ errorKey: "err.required", field: "participant_type_id" }, { status: 400 });
    if (coOrganizers.length) {
      const placeholders = coOrganizers.map(() => "?").join(", ");
      const [organizerRows] = await db.execute<CodeRow[]>(
        `SELECT code FROM departments WHERE is_active = 1 AND code IN (${placeholders})`,
        coOrganizers,
      );
      if (organizerRows.length !== coOrganizers.length) {
        return NextResponse.json({ errorKey: "err.department.invalid", field: "co_organizers" }, { status: 400 });
      }
    }

    const bannerResult = await validateBanner(formData);
    if (bannerResult.errorKey) {
      return NextResponse.json({ errorKey: bannerResult.errorKey, field: "banner" }, { status: 400 });
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const ownershipClause = user.role === "admin" ? "" : " AND main_department = ?";
    const ownershipValues = user.role === "admin" ? [id] : [id, user.department_code ?? ""];
    const [existingRows] = await connection.execute<ExistingBannerRow[]>(
      `SELECT banner_path FROM planned_activities
       WHERE id = ? AND deleted_at IS NULL${ownershipClause} FOR UPDATE`,
      ownershipValues,
    );
    if (!existingRows.length) {
      await connection.rollback();
      transactionStarted = false;
      return NextResponse.json({ errorKey: "err.save" }, { status: 404 });
    }

    const oldBannerPath = existingRows[0].banner_path;
    const bannerPath = bannerResult.filePath ?? (removeBanner ? null : oldBannerPath);
    if (bannerResult.filePath && bannerResult.buffer) {
      const uploadDirectory = path.join(process.cwd(), "storage", "uploads");
      await mkdir(uploadDirectory, { recursive: true });
      uploadedPath = bannerResult.filePath;
      await writeFile(path.join(uploadDirectory, path.basename(bannerResult.filePath)), bannerResult.buffer, { flag: "wx" });
    }

    await connection.execute(
      `UPDATE planned_activities SET fiscal_year = ?, quarter_no = ?, title = ?,
        main_department = ?, activity_type_id = ?, participant_type_id = ?,
        date_status = ?, expected_start = ?, expected_end = ?,
        expected_participants = ?, banner_path = ?, location = ?, ref_link = ?
       WHERE id = ? AND deleted_at IS NULL${ownershipClause}`,
      [
        fiscalYear, quarterNo, title, mainDepartment, activityTypeId, participantTypeId,
        dateStatus, expectedStart, expectedEnd, expectedParticipants, bannerPath,
        location, refLink, ...ownershipValues,
      ],
    );
    await connection.execute("DELETE FROM planned_co_organizers WHERE planned_id = ?", [id]);
    if (coOrganizers.length) {
      const placeholders = coOrganizers.map(() => "(?, ?)").join(", ");
      await connection.execute(
        `INSERT INTO planned_co_organizers (planned_id, department_code) VALUES ${placeholders}`,
        coOrganizers.flatMap((code) => [id, code]),
      );
    }

    await connection.commit();
    transactionStarted = false;
    if (oldBannerPath !== bannerPath) {
      replacedPath = oldBannerPath;
      await removeBannerFile(replacedPath);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Could not roll back planned activity edit", rollbackError);
      }
    }
    await cleanupBanner(uploadedPath);
    console.error("Could not update planned activity", error);
    return NextResponse.json({ errorKey: "err.save" }, { status: 500 });
  } finally {
    connection?.release();
  }
}
