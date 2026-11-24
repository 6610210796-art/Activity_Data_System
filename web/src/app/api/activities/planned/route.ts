import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { validateActivityDates } from "@/lib/activity-date-validation";

export const runtime = "nodejs";

const MAX_BANNER_SIZE = 5 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_BANNER_SIZE + 256 * 1024;

interface CodeRow extends RowDataPacket {
  code: string;
}

interface PlannedActivityForm {
  fiscalYear: number;
  quarterNo: number;
  title: string;
  mainDepartment: string;
  coOrganizers: string[];
  activityTypeId: number;
  participantTypeId: number;
  dateStatus: "confirmed" | "unconfirmed";
  expectedStart: string;
  expectedEnd: string;
  expectedParticipants: number;
  location: string | null;
  refLink: string | null;
}

function errorResponse(errorKey: string, field?: string, status = 400) {
  return NextResponse.json({ errorKey, field }, { status });
}

function getString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : null;
}

function parseInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseOptionalText(value: string | null): string | null {
  return value?.trim() ? value.trim() : null;
}

function parseCoOrganizers(value: string | null): string[] | null {
  if (value === null || value === "") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      return null;
    }
    return parsed.map((item: string) => item.trim());
  } catch {
    return null;
  }
}

function parseForm(formData: FormData):
  | { form: PlannedActivityForm }
  | { errorKey: string; field: string } {
  const fiscalYear = parseInteger(getString(formData, "fiscal_year"));
  const quarterNo = parseInteger(getString(formData, "quarter_no"));
  const title = getString(formData, "title");
  const mainDepartment = getString(formData, "main_department");
  const coOrganizers = parseCoOrganizers(getString(formData, "co_organizers"));
  const activityTypeId = parseInteger(getString(formData, "activity_type_id"));
  const participantTypeId = parseInteger(getString(formData, "participant_type_id"));
  const dateStatus = getString(formData, "date_status");
  const expectedStart = getString(formData, "expected_start");
  const expectedEnd = getString(formData, "expected_end");
  const expectedParticipants = parseInteger(
    getString(formData, "expected_participants"),
  );
  const location = parseOptionalText(getString(formData, "location"));
  const refLink = parseOptionalText(getString(formData, "ref_link"));

  if (fiscalYear === null) return { errorKey: "err.required", field: "fiscal_year" };
  if (quarterNo === null) return { errorKey: "err.required", field: "quarter_no" };
  if (!title) return { errorKey: "err.required", field: "title" };
  if ([...title].length > 150) return { errorKey: "err.title.max", field: "title" };
  if (!mainDepartment) return { errorKey: "err.required", field: "main_department" };
  if (coOrganizers === null) return { errorKey: "err.co.duplicate", field: "co_organizers" };
  if (coOrganizers.length > 7) return { errorKey: "err.co.max", field: "co_organizers" };
  if (!activityTypeId) return { errorKey: "err.required", field: "activity_type_id" };
  if (!participantTypeId) return { errorKey: "err.required", field: "participant_type_id" };
  if (dateStatus !== "confirmed" && dateStatus !== "unconfirmed") {
    return { errorKey: "err.required", field: "date_status" };
  }
  if (!expectedStart) return { errorKey: "err.required", field: "expected_start" };
  if (!expectedEnd) return { errorKey: "err.required", field: "expected_end" };
  if (expectedParticipants === null || expectedParticipants < 1 || expectedParticipants > 2147483647) {
    return { errorKey: "err.participants.min", field: "expected_participants" };
  }
  if (location && [...location].length > 255) return { errorKey: "err.location.max", field: "location" };
  if (refLink && [...refLink].length > 500) return { errorKey: "err.ref_link.max", field: "ref_link" };

  const dateError = validateActivityDates({
    fiscalYear,
    quarterNo,
    startDate: expectedStart,
    endDate: expectedEnd,
    startField: "expected_start",
    endField: "expected_end",
    startRule: "not_before_today",
  });
  if (dateError) return { errorKey: dateError.key, field: dateError.field };

  if (new Set(coOrganizers).size !== coOrganizers.length) {
    return { errorKey: "err.co.duplicate", field: "co_organizers" };
  }
  if (coOrganizers.includes(mainDepartment)) {
    return { errorKey: "err.co.duplicate", field: "co_organizers" };
  }

  return {
    form: {
      fiscalYear,
      quarterNo,
      title,
      mainDepartment,
      coOrganizers,
      activityTypeId,
      participantTypeId,
      dateStatus,
      expectedStart,
      expectedEnd,
      expectedParticipants,
      location,
      refLink,
    },
  };
}

async function validateBanner(formData: FormData) {
  const entry = formData.get("banner");
  if (entry === null || typeof entry === "string") {
    return { errorKey: null, buffer: null as Buffer | null, filePath: null as string | null };
  }
  if (entry.size === 0) {
    return { errorKey: "err.image.content", buffer: null, filePath: null };
  }
  if (entry.size > MAX_BANNER_SIZE) {
    return { errorKey: "err.image.size", buffer: null, filePath: null };
  }
  const buffer = Buffer.from(await entry.arrayBuffer());
  const detectedType = await fileTypeFromBuffer(buffer);
  if (!detectedType) {
    return { errorKey: "err.image.content", buffer: null, filePath: null };
  }
  if (detectedType.mime !== "image/jpeg" && detectedType.mime !== "image/png") {
    return { errorKey: "err.image.type", buffer: null, filePath: null };
  }
  const extension = detectedType.mime === "image/jpeg" ? "jpg" : "png";
  return {
    errorKey: null,
    buffer,
    filePath: `storage/uploads/${randomUUID()}.${extension}`,
  };
}

async function cleanupFile(filePath: string | null) {
  if (!filePath) return;
  try {
    await unlink(path.join(process.cwd(), "storage", "uploads", path.basename(filePath)));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return;
    }
    console.error("Could not remove planned activity banner", error);
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("err.session", undefined, 401);

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
    return errorResponse("err.image.size", "banner", 413);
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;
  let writtenFilePath: string | null = null;

  try {
    const formData = await request.formData();
    const parsed = parseForm(formData);
    if ("errorKey" in parsed) return errorResponse(parsed.errorKey, parsed.field);
    const form = parsed.form;

    if (
      user.role === "unit_user" &&
      (!user.department_code || form.mainDepartment !== user.department_code)
    ) {
      return errorResponse("err.department.invalid", "main_department", 403);
    }
    if (form.fiscalYear < 1544 || form.fiscalYear > 9999 ||
        form.quarterNo < 1 || form.quarterNo > 4) {
      return errorResponse("err.required", "fiscal_year");
    }

    const db = getDb();
    const [[departmentRows], [quarterRows], [activityTypeRows], [participantTypeRows]] =
      await Promise.all([
        db.execute<CodeRow[]>(
          "SELECT code FROM departments WHERE code = ? AND is_active = 1 LIMIT 1",
          [form.mainDepartment],
        ),
        db.execute<RowDataPacket[]>("SELECT no FROM quarters WHERE no = ? LIMIT 1", [form.quarterNo]),
        db.execute<RowDataPacket[]>("SELECT id FROM activity_types WHERE id = ? AND is_active = 1 LIMIT 1", [form.activityTypeId]),
        db.execute<RowDataPacket[]>("SELECT id FROM participant_types WHERE id = ? AND is_active = 1 LIMIT 1", [form.participantTypeId]),
      ]);

    if (departmentRows.length === 0) return errorResponse("err.department.invalid", "main_department");
    if (quarterRows.length === 0) return errorResponse("err.required", "quarter_no");
    if (activityTypeRows.length === 0) return errorResponse("err.required", "activity_type_id");
    if (participantTypeRows.length === 0) return errorResponse("err.required", "participant_type_id");

    if (form.coOrganizers.length > 0) {
      const placeholders = form.coOrganizers.map(() => "?").join(", ");
      const [coRows] = await db.execute<CodeRow[]>(
        `SELECT code FROM departments
         WHERE is_active = 1 AND code IN (${placeholders})`,
        form.coOrganizers,
      );
      if (coRows.length !== form.coOrganizers.length) {
        return errorResponse("err.department.invalid", "co_organizers");
      }
    }

    const bannerResult = await validateBanner(formData);
    if (bannerResult.errorKey) {
      return errorResponse(bannerResult.errorKey, "banner");
    }

    if (bannerResult.filePath && bannerResult.buffer) {
      const uploadDirectory = path.join(process.cwd(), "storage", "uploads");
      await mkdir(uploadDirectory, { recursive: true });
      const absolutePath = path.join(uploadDirectory, path.basename(bannerResult.filePath));
      await writeFile(absolutePath, bannerResult.buffer, { flag: "wx" });
      writtenFilePath = bannerResult.filePath;
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [insertResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO planned_activities (
         fiscal_year, quarter_no, title, main_department,
         activity_type_id, participant_type_id, date_status,
         expected_start, expected_end, expected_participants,
         banner_path, location, ref_link, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        form.fiscalYear,
        form.quarterNo,
        form.title,
        form.mainDepartment,
        form.activityTypeId,
        form.participantTypeId,
        form.dateStatus,
        form.expectedStart,
        form.expectedEnd,
        form.expectedParticipants,
        bannerResult.filePath,
        form.location,
        form.refLink,
        user.id,
      ],
    );

    if (form.coOrganizers.length > 0) {
      const plannedId = insertResult.insertId;
      const values = form.coOrganizers.flatMap((departmentCode) => [plannedId, departmentCode]);
      const placeholders = form.coOrganizers.map(() => "(?, ?)").join(", ");
      await connection.execute(
        `INSERT INTO planned_co_organizers (planned_id, department_code) VALUES ${placeholders}`,
        values,
      );
    }

    await connection.commit();
    transactionStarted = false;
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Could not roll back planned activity transaction", rollbackError);
      }
    }
    await cleanupFile(writtenFilePath);
    console.error("Could not save planned activity", error);
    return errorResponse("err.save", undefined, 500);
  } finally {
    connection?.release();
  }
}
