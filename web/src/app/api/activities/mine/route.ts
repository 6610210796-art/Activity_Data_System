import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface CountRow extends RowDataPacket {
  total: number | string;
}

interface ActivityRow extends RowDataPacket {
  id: number | string;
  fiscal_year: number | string;
  quarter_no: number | string;
  title: string;
  main_department: string;
  department_name: string;
  activity_type_id: number | string;
  activity_type_name: string | null;
  start_date?: Date | string;
  end_date?: Date | string;
  expected_start?: Date | string;
  expected_end?: Date | string;
  total_participants?: number | string;
  expected_participants?: number | string;
  date_status?: "confirmed" | "unconfirmed";
  image_id: number | string | null;
  planned_id: number | string | null;
  result_recorded: number | string;
}

function dateValue(value: Date | string | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseOptionalInteger(value: string | null): number | null | false {
  if (value === null || value === "") return null;
  if (!/^\d+$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : false;
}

function parsePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ errorKey: "err.session" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const kind = params.get("type") === "planned" ? "planned" : "past";
  const fiscalYear = parseOptionalInteger(params.get("fiscalYear"));
  const quarterNo = parseOptionalInteger(params.get("quarterNo"));
  const activityTypeId = parseOptionalInteger(params.get("activityTypeId"));
  if (
    fiscalYear === false ||
    quarterNo === false ||
    activityTypeId === false ||
    (quarterNo !== null && (quarterNo < 1 || quarterNo > 4))
  ) {
    return NextResponse.json({ errorKey: "err.filter.invalid" }, { status: 400 });
  }

  const requestedDepartment = params.get("departmentCode");
  const departmentCode =
    user.role === "unit_user" ? user.department_code : requestedDepartment;
  const search = (params.get("search") ?? "").trim().slice(0, 150);
  const page = parsePage(params.get("page"));
  const db = getDb();
  const unitDepartment =
    user.role === "unit_user" ? user.department_code : null;
  if (user.role === "unit_user" && unitDepartment === null) {
    return NextResponse.json({
      counts: { past: 0, planned: 0 },
      items: [],
      total: 0,
      page,
      pageSize: 10,
      totalPages: 1,
    });
  }

  const commonConditions: string[] = ["deleted_at IS NULL"];
  const commonValues: (string | number)[] = [];
  if (unitDepartment !== null) {
    commonConditions.push("main_department = ?");
    commonValues.push(unitDepartment);
  } else if (departmentCode) {
    commonConditions.push("main_department = ?");
    commonValues.push(departmentCode);
  }

  const [pastCountRows] = await db.execute<CountRow[]>(
    `SELECT COUNT(*) AS total FROM past_activities WHERE ${commonConditions.join(" AND ")}`,
    commonValues,
  );
  const [plannedCountRows] = await db.execute<CountRow[]>(
    `SELECT COUNT(*) AS total FROM planned_activities WHERE ${commonConditions.join(" AND ")}`,
    commonValues,
  );

  const table = kind === "past" ? "past_activities" : "planned_activities";
  const conditions = [`a.deleted_at IS NULL`];
  const values: (string | number)[] = [];
  if (unitDepartment !== null) {
    conditions.push("a.main_department = ?");
    values.push(unitDepartment);
  } else if (departmentCode) {
    conditions.push("a.main_department = ?");
    values.push(departmentCode);
  }
  if (fiscalYear !== null) {
    conditions.push("a.fiscal_year = ?");
    values.push(fiscalYear);
  }
  if (quarterNo !== null) {
    conditions.push("a.quarter_no = ?");
    values.push(quarterNo);
  }
  if (activityTypeId !== null) {
    conditions.push("a.activity_type_id = ?");
    values.push(activityTypeId);
  }
  if (search) {
    conditions.push("a.title LIKE ?");
    values.push(`%${search}%`);
  }

  const whereSql = conditions.join(" AND ");
  const [countRows] = await db.execute<CountRow[]>(
    `SELECT COUNT(*) AS total
     FROM ${table} AS a
     WHERE ${whereSql}`,
    values,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;

  const pastSelect = `
    SELECT a.id, a.fiscal_year, a.quarter_no, a.title, a.main_department,
      d.name_th AS department_name, a.activity_type_id,
      at.name_th AS activity_type_name, a.start_date, a.end_date,
      a.total_participants, a.planned_id,
      (SELECT pai.id FROM past_activity_images AS pai
       WHERE pai.past_id = a.id ORDER BY pai.sort_no, pai.id LIMIT 1) AS image_id,
      1 AS result_recorded
    FROM past_activities AS a
    INNER JOIN departments AS d ON d.code = a.main_department
    LEFT JOIN activity_types AS at ON at.id = a.activity_type_id
    WHERE ${whereSql}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ? OFFSET ?`;
  const plannedSelect = `
    SELECT a.id, a.fiscal_year, a.quarter_no, a.title, a.main_department,
      d.name_th AS department_name, a.activity_type_id,
      at.name_th AS activity_type_name, a.expected_start, a.expected_end,
      a.expected_participants, a.date_status, NULL AS image_id, NULL AS planned_id,
      CASE WHEN a.expected_end < CURDATE() AND NOT EXISTS (
        SELECT 1 FROM past_activities AS pa
        WHERE pa.planned_id = a.id AND pa.deleted_at IS NULL
      ) THEN 0 ELSE 1 END AS result_recorded
    FROM planned_activities AS a
    INNER JOIN departments AS d ON d.code = a.main_department
    LEFT JOIN activity_types AS at ON at.id = a.activity_type_id
    WHERE ${whereSql}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ? OFFSET ?`;
  const [rows] = await db.execute<ActivityRow[]>(
    kind === "past" ? pastSelect : plannedSelect,
    [...values, pageSize, offset],
  );

  const items = rows.map((row) => ({
    id: String(row.id),
    fiscal_year: Number(row.fiscal_year),
    quarter_no: Number(row.quarter_no),
    title: row.title,
    main_department: row.main_department,
    department_name: row.department_name,
    activity_type_id: Number(row.activity_type_id),
    activity_type_name: row.activity_type_name ?? String(row.activity_type_id),
    start_date: dateValue(row.start_date ?? row.expected_start),
    end_date: dateValue(row.end_date ?? row.expected_end),
    participants: Number(row.total_participants ?? row.expected_participants ?? 0),
    date_status: row.date_status ?? null,
    image_id: row.image_id === null ? null : String(row.image_id),
    planned_id: row.planned_id === null ? null : String(row.planned_id),
    result_recorded: Number(row.result_recorded) === 1,
  }));

  return NextResponse.json({
    counts: {
      past: Number(pastCountRows[0]?.total ?? 0),
      planned: Number(plannedCountRows[0]?.total ?? 0),
    },
    items,
    total,
    page: currentPage,
    pageSize,
    totalPages,
  });
}
