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

const MAX_IMAGE_COUNT = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_IMAGE_COUNT * MAX_IMAGE_SIZE + 256 * 1024;

interface CodeRow extends RowDataPacket {
  code: string;
}

interface PlannedRow extends RowDataPacket {
  id: number | string;
}

interface PastActivityForm {
  fiscalYear: number;
  quarterNo: number;
  title: string;
  mainDepartment: string;
  coOrganizers: string[];
  activityTypeId: number;
  participantTypeId: number;
  startDate: string;
  endDate: string;
  totalParticipants: number;
  resultSummary: string | null;
  satisfactionPercent: string | null;
  imageConsent: 1;
  location: string | null;
  refLink: string | null;
  plannedId: string | null;
}

interface ValidatedImage {
  buffer: Buffer;
  filePath: string;
}

function errorResponse(
  errorKey: string,
  field?: string,
  status = 400,
) {
  return NextResponse.json({ errorKey, field }, { status });
}

function getString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : null;
}

function parseInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseOptionalText(value: string | null): string | null {
  return value?.trim() ? value.trim() : null;
}

function parseCoOrganizers(value: string | null): string[] | null {
  if (value === null || value === "") {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.some((item) => typeof item !== "string")
    ) {
      return null;
    }
    return parsed.map((item: string) => item.trim());
  } catch {
    return null;
  }
}

function parseForm(formData: FormData):
  | { form: PastActivityForm }
  | { errorKey: string; field: string } {
  const fiscalYear = parseInteger(getString(formData, "fiscal_year"));
  const quarterNo = parseInteger(getString(formData, "quarter_no"));
  const title = getString(formData, "title");
  const mainDepartment = getString(formData, "main_department");
  const coOrganizers = parseCoOrganizers(
    getString(formData, "co_organizers"),
  );
  const activityTypeId = parseInteger(
    getString(formData, "activity_type_id"),
  );
  const participantTypeId = parseInteger(
    getString(formData, "participant_type_id"),
  );
  const startDate = getString(formData, "start_date");
  const endDate = getString(formData, "end_date");
  const totalParticipants = parseInteger(
    getString(formData, "total_participants"),
  );
  const resultSummary = parseOptionalText(
    getString(formData, "result_summary"),
  );
  const satisfactionInput = getString(formData, "satisfaction_percent");
  const imageConsentValue = getString(formData, "image_consent");
  const location = parseOptionalText(getString(formData, "location"));
  const refLink = parseOptionalText(getString(formData, "ref_link"));
  const plannedIdInput = getString(formData, "planned_id");

  if (fiscalYear === null) {
    return { errorKey: "err.required", field: "fiscal_year" };
  }
  if (quarterNo === null) {
    return { errorKey: "err.required", field: "quarter_no" };
  }
  if (!title) {
    return { errorKey: "err.required", field: "title" };
  }
  if ([...title].length > 150) {
    return { errorKey: "err.title.max", field: "title" };
  }
  if (!mainDepartment) {
    return { errorKey: "err.required", field: "main_department" };
  }
  if (coOrganizers === null) {
    return { errorKey: "err.co.duplicate", field: "co_organizers" };
  }
  if (coOrganizers.length > 7) {
    return { errorKey: "err.co.max", field: "co_organizers" };
  }
  if (!activityTypeId) {
    return { errorKey: "err.required", field: "activity_type_id" };
  }
  if (!participantTypeId) {
    return { errorKey: "err.required", field: "participant_type_id" };
  }
  if (!startDate) {
    return { errorKey: "err.required", field: "start_date" };
  }
  if (!endDate) {
    return { errorKey: "err.required", field: "end_date" };
  }
  if (
    totalParticipants === null ||
    totalParticipants < 1 ||
    totalParticipants > 2147483647
  ) {
    return { errorKey: "err.participants.min", field: "total_participants" };
  }
  if (resultSummary && [...resultSummary].length > 500) {
    return { errorKey: "err.result.max", field: "result_summary" };
  }
  if (satisfactionInput) {
    if (!/^-?\d+(?:\.\d+)?$/.test(satisfactionInput)) {
      return {
        errorKey: "err.satisfaction.precision",
        field: "satisfaction_percent",
      };
    }
    if (!/^-?\d+(?:\.\d)?$/.test(satisfactionInput)) {
      return {
        errorKey: "err.satisfaction.precision",
        field: "satisfaction_percent",
      };
    }
    const satisfaction = Number(satisfactionInput);
    if (satisfaction < 0 || satisfaction > 100) {
      return {
        errorKey: "err.satisfaction.range",
        field: "satisfaction_percent",
      };
    }
  }
  if (location && [...location].length > 255) {
    return { errorKey: "err.location.max", field: "location" };
  }
  if (refLink && [...refLink].length > 500) {
    return { errorKey: "err.ref_link.max", field: "ref_link" };
  }
  if (imageConsentValue !== "1" && imageConsentValue !== "true") {
    return { errorKey: "err.image.consent", field: "image_consent" };
  }

  const dateError = validateActivityDates({
    fiscalYear,
    quarterNo,
    startDate,
    endDate,
    startField: "start_date",
    endField: "end_date",
    startRule: "not_after_today",
  });
  if (dateError) {
    return { errorKey: dateError.key, field: dateError.field };
  }

  if (new Set(coOrganizers).size !== coOrganizers.length) {
    return { errorKey: "err.co.duplicate", field: "co_organizers" };
  }
  if (coOrganizers.includes(mainDepartment)) {
    return { errorKey: "err.co.duplicate", field: "co_organizers" };
  }

  let plannedId: string | null = null;
  if (plannedIdInput) {
    if (!/^[1-9]\d*$/.test(plannedIdInput)) {
      return { errorKey: "err.planned.invalid", field: "planned_id" };
    }
    plannedId = plannedIdInput;
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
      startDate,
      endDate,
      totalParticipants,
      resultSummary,
      satisfactionPercent: satisfactionInput || null,
      imageConsent: 1,
      location,
      refLink,
      plannedId,
    },
  };
}

async function validateImages(formData: FormData) {
  const entries = formData.getAll("images");
  if (entries.length === 0) {
    return { errorKey: "err.image.required", images: [] as ValidatedImage[] };
  }
  if (entries.length > MAX_IMAGE_COUNT) {
    return { errorKey: "err.image.max", images: [] as ValidatedImage[] };
  }

  const images: ValidatedImage[] = [];
  for (const entry of entries) {
    if (typeof entry === "string" || entry.size === 0) {
      return { errorKey: "err.image.content", images: [] as ValidatedImage[] };
    }
    if (entry.size > MAX_IMAGE_SIZE) {
      return { errorKey: "err.image.size", images: [] as ValidatedImage[] };
    }

    const buffer = Buffer.from(await entry.arrayBuffer());
    const detectedType = await fileTypeFromBuffer(buffer);
    if (!detectedType) {
      return { errorKey: "err.image.content", images: [] as ValidatedImage[] };
    }
    if (detectedType.mime !== "image/jpeg" && detectedType.mime !== "image/png") {
      return { errorKey: "err.image.type", images: [] as ValidatedImage[] };
    }

    const extension = detectedType.mime === "image/jpeg" ? "jpg" : "png";
    images.push({
      buffer,
      filePath: `storage/uploads/${randomUUID()}.${extension}`,
    });
  }
  return { errorKey: null, images };
}

async function cleanupFiles(filePaths: readonly string[]) {
  const uploadDirectory = path.join(process.cwd(), "storage", "uploads");
  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        await unlink(path.join(uploadDirectory, path.basename(filePath)));
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return;
        }
        console.error("Could not remove an uploaded activity image", error);
      }
    }),
  );
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("err.session", undefined, 401);
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
    return errorResponse("err.image.size", "images", 413);
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;
  const writtenFiles: string[] = [];

  try {
    const formData = await request.formData();
    const parsed = parseForm(formData);
    if ("errorKey" in parsed) {
      return errorResponse(parsed.errorKey, parsed.field);
    }
    const form = parsed.form;

    if (
      form.fiscalYear < 1544 ||
      form.fiscalYear > 9999 ||
      form.quarterNo < 1 ||
      form.quarterNo > 4
    ) {
      return errorResponse("err.required", "fiscal_year");
    }
    if (form.resultSummary && [...form.resultSummary].length > 500) {
      return errorResponse("err.result.max", "result_summary");
    }
    if (form.location && [...form.location].length > 255) {
      return errorResponse("err.location.max", "location");
    }
    if (form.refLink && [...form.refLink].length > 500) {
      return errorResponse("err.ref_link.max", "ref_link");
    }

    if (
      user.role === "unit_user" &&
      (!user.department_code || form.mainDepartment !== user.department_code)
    ) {
      return errorResponse("err.department.invalid", "main_department", 403);
    }

    const db = getDb();
    const [
      [departmentRows],
      [quarterRows],
      [activityTypeRows],
      [participantTypeRows],
    ] = await Promise.all([
      db.execute<CodeRow[]>(
        "SELECT code FROM departments WHERE code = ? AND is_active = 1 LIMIT 1",
        [form.mainDepartment],
      ),
      db.execute<RowDataPacket[]>(
        "SELECT no FROM quarters WHERE no = ? LIMIT 1",
        [form.quarterNo],
      ),
      db.execute<RowDataPacket[]>(
        "SELECT id FROM activity_types WHERE id = ? AND is_active = 1 LIMIT 1",
        [form.activityTypeId],
      ),
      db.execute<RowDataPacket[]>(
        "SELECT id FROM participant_types WHERE id = ? AND is_active = 1 LIMIT 1",
        [form.participantTypeId],
      ),
    ]);

    if (departmentRows.length === 0) {
      return errorResponse("err.department.invalid", "main_department");
    }
    if (quarterRows.length === 0) {
      return errorResponse("err.required", "quarter_no");
    }
    if (activityTypeRows.length === 0) {
      return errorResponse("err.required", "activity_type_id");
    }
    if (participantTypeRows.length === 0) {
      return errorResponse("err.required", "participant_type_id");
    }

    if (form.coOrganizers.length > 0) {
      const placeholders = form.coOrganizers.map(() => "?").join(", ");
      const [coOrganizerRows] = await db.execute<CodeRow[]>(
        `SELECT code FROM departments
         WHERE is_active = 1 AND code IN (${placeholders})`,
        form.coOrganizers,
      );
      if (coOrganizerRows.length !== form.coOrganizers.length) {
        return errorResponse("err.department.invalid", "co_organizers");
      }
    }

    if (form.plannedId) {
      const [plannedRows] = await db.execute<PlannedRow[]>(
        `SELECT id
         FROM planned_activities
         WHERE id = ?
           AND fiscal_year = ?
           AND quarter_no = ?
           AND main_department = ?
           AND deleted_at IS NULL
         LIMIT 1`,
        [
          form.plannedId,
          form.fiscalYear,
          form.quarterNo,
          form.mainDepartment,
        ],
      );
      if (plannedRows.length === 0) {
        return errorResponse("err.planned.invalid", "planned_id");
      }
    }

    const imageResult = await validateImages(formData);
    if (imageResult.errorKey) {
      return errorResponse(imageResult.errorKey, "images");
    }

    const uploadDirectory = path.join(process.cwd(), "storage", "uploads");
    await mkdir(uploadDirectory, { recursive: true });
    for (const image of imageResult.images) {
      const absolutePath = path.join(
        uploadDirectory,
        path.basename(image.filePath),
      );
      writtenFiles.push(image.filePath);
      await writeFile(absolutePath, image.buffer, { flag: "wx" });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [insertResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO past_activities (
         planned_id,
         fiscal_year,
         quarter_no,
         title,
         main_department,
         activity_type_id,
         participant_type_id,
         start_date,
         end_date,
         total_participants,
         result_summary,
         satisfaction_percent,
         image_consent,
         location,
         ref_link,
         created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        form.plannedId,
        form.fiscalYear,
        form.quarterNo,
        form.title,
        form.mainDepartment,
        form.activityTypeId,
        form.participantTypeId,
        form.startDate,
        form.endDate,
        form.totalParticipants,
        form.resultSummary,
        form.satisfactionPercent,
        form.imageConsent,
        form.location,
        form.refLink,
        user.id,
      ],
    );
    const pastId = insertResult.insertId;

    if (form.coOrganizers.length > 0) {
      const values = form.coOrganizers.flatMap((departmentCode) => [
        pastId,
        departmentCode,
      ]);
      const placeholders = form.coOrganizers.map(() => "(?, ?)").join(", ");
      await connection.execute(
        `INSERT INTO past_co_organizers (past_id, department_code) VALUES ${placeholders}`,
        values,
      );
    }

    const imageValues = imageResult.images.flatMap((image, index) => [
      pastId,
      image.filePath,
      index + 1,
    ]);
    const imagePlaceholders = imageResult.images.map(() => "(?, ?, ?)").join(", ");
    await connection.execute(
      `INSERT INTO past_activity_images (past_id, file_path, sort_no) VALUES ${imagePlaceholders}`,
      imageValues,
    );

    await connection.commit();
    transactionStarted = false;
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Could not roll back past activity transaction", rollbackError);
      }
    }
    await cleanupFiles(writtenFiles);
    console.error("Could not save past activity", error);
    return errorResponse("err.save", undefined, 500);
  } finally {
    connection?.release();
  }
}
