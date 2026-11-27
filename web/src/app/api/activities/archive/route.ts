import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getNextQuarter } from "@/lib/planned-activity-validation";
import { getSiteContent } from "@/lib/content";
import { formatInactiveLabel } from "@/lib/option-policy";

export const dynamic = "force-dynamic";
interface CountRow extends RowDataPacket { total: number | string }
interface ArchiveRow extends RowDataPacket {
  id: number | string; fiscal_year: number | string; quarter_no: number | string;
  title: string; main_department: string; department_name: string; department_active: number;
  activity_type_id: number | string; activity_type_name: string | null; activity_type_active: number | null;
  start_date?: Date | string; end_date?: Date | string; expected_start?: Date | string; expected_end?: Date | string;
  total_participants?: number | string; expected_participants?: number | string;
  participants?: number | string;
  date_status?: "confirmed" | "unconfirmed"; image_id: number | string | null; planned_id: number | string | null;
  result_recorded: number | string; archived_at: Date | string;
}
function dateValue(value: Date | string | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return String(value.getFullYear()).padStart(4, "0") + "-" + String(value.getMonth() + 1).padStart(2, "0") + "-" + String(value.getDate()).padStart(2, "0");
}
function integer(value: string | null, min = 0, max = Number.MAX_SAFE_INTEGER): number | null | false {
  if (value === null || value === "") return null;
  if (!/^\d+$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : false;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ errorKey: "err.session" }, { status: 401 });
  if (user.role === "unit_user" && !user.department_code) return NextResponse.json({ errorKey: "err.save" }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const kind = params.get("type") === "planned" ? "planned" : "past";
  const fiscalYear = integer(params.get("fiscalYear"));
  const quarterNo = integer(params.get("quarterNo"), 1, 4);
  const activityTypeId = integer(params.get("activityTypeId"), 1);
  const pageParam = integer(params.get("page"), 1);
  if (fiscalYear === false || quarterNo === false || activityTypeId === false || pageParam === false) {
    return NextResponse.json({ errorKey: "err.filter.invalid" }, { status: 400 });
  }
  const baseYear = getNextQuarter().fiscalYear;
  const allowedYears = new Set(Array.from({ length: 10 }, (_, i) => baseYear + 2 - i));
  if (fiscalYear !== null && !allowedYears.has(fiscalYear)) return NextResponse.json({ errorKey: "err.filter.invalid" }, { status: 400 });
  const db = getDb();
  const requestedDepartment = params.get("departmentCode");
  const department = user.role === "admin" ? requestedDepartment : user.department_code;
  const search = (params.get("search") ?? "").trim().slice(0, 150);
  const table = kind === "past" ? "past_activities" : "planned_activities";
  const conditions = ["a.deleted_at IS NOT NULL", "a.purged_at IS NULL"];
  const values: (string | number)[] = [];
  if (department) { conditions.push("a.main_department = ?"); values.push(department); }
  if (fiscalYear !== null) { conditions.push("a.fiscal_year = ?"); values.push(fiscalYear); }
  if (quarterNo !== null) { conditions.push("a.quarter_no = ?"); values.push(quarterNo); }
  if (activityTypeId !== null) { conditions.push("a.activity_type_id = ?"); values.push(activityTypeId); }
  if (search) { conditions.push("a.title LIKE ?"); values.push("%" + search + "%"); }
  const where = conditions.join(" AND ");
  const [countRows] = await db.execute<CountRow[]>("SELECT COUNT(*) AS total FROM " + table + " a WHERE " + where, values);
  const total = Number(countRows[0]?.total ?? 0);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageParam || 1, totalPages);
  const offset = (page - 1) * pageSize;
  const start = kind === "past" ? "a.start_date" : "a.expected_start";
  const end = kind === "past" ? "a.end_date" : "a.expected_end";
  const participants = kind === "past" ? "a.total_participants" : "a.expected_participants";
  const image = kind === "past" ? "(SELECT pai.id FROM past_activity_images pai WHERE pai.past_id = a.id ORDER BY pai.sort_no, pai.id LIMIT 1)" : "NULL";
  const plannedId = kind === "past" ? "a.planned_id" : "NULL";
  const dateStatus = kind === "planned" ? "a.date_status" : "NULL";
  const resultRecorded = kind === "past" ? "1" : "CASE WHEN a.expected_end < CURDATE() AND NOT EXISTS (SELECT 1 FROM past_activities pa WHERE pa.planned_id = a.id AND pa.deleted_at IS NULL) THEN 0 ELSE 1 END";
  const [rows] = await db.execute<ArchiveRow[]>(
    "SELECT a.id, a.fiscal_year, a.quarter_no, a.title, a.main_department, d.name_th AS department_name, d.is_active AS department_active, a.activity_type_id, at.name_th AS activity_type_name, at.is_active AS activity_type_active, " +
    start + " AS start_date, " + end + " AS end_date, " + participants + " AS participants, " +
    dateStatus + " AS date_status, " + image + " AS image_id, " + plannedId + " AS planned_id, " +
    resultRecorded + " AS result_recorded, a.deleted_at AS archived_at FROM " + table +
    " a INNER JOIN departments d ON d.code = a.main_department LEFT JOIN activity_types at ON at.id = a.activity_type_id WHERE " +
    where + " ORDER BY a.deleted_at DESC, a.id DESC LIMIT ? OFFSET ?",
    [...values, pageSize, offset],
  );
  const countArchived = async (source: string) => {
    const sql = "SELECT COUNT(*) AS total FROM " + source + " a WHERE " + where;
    const [result] = await db.execute<CountRow[]>(sql, values);
    return Number(result[0]?.total ?? 0);
  };
  const { "form.option.inactive": inactiveSuffix } = await getSiteContent(["form.option.inactive"]);
  return NextResponse.json({
    counts: { past: await countArchived("past_activities"), planned: await countArchived("planned_activities") },
    items: rows.map((row) => ({
      id: String(row.id), fiscal_year: Number(row.fiscal_year), quarter_no: Number(row.quarter_no), title: row.title,
      main_department: row.main_department,
      department_name: Number(row.department_active) === 1
        ? row.department_name
        : formatInactiveLabel(row.department_name, inactiveSuffix),
      activity_type_id: Number(row.activity_type_id),
      activity_type_name: Number(row.activity_type_active) === 1
        ? row.activity_type_name ?? String(row.activity_type_id)
        : formatInactiveLabel(row.activity_type_name ?? String(row.activity_type_id), inactiveSuffix),
      start_date: dateValue(row.start_date ?? row.expected_start), end_date: dateValue(row.end_date ?? row.expected_end),
      participants: Number(row.participants ?? 0), date_status: row.date_status ?? null,
      image_id: row.image_id === null ? null : String(row.image_id), planned_id: row.planned_id === null ? null : String(row.planned_id),
      result_recorded: Number(row.result_recorded) === 1, archived_at: dateValue(row.archived_at),
    })),
    total, page, pageSize, totalPages,
  });
}
