import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

interface PlannedActivityRow extends RowDataPacket {
  id: number | string;
  fiscal_year: number;
  quarter_no: number;
  title: string;
  main_department: string;
  activity_type_id: number;
  participant_type_id: number;
  expected_start: Date | string;
  expected_end: Date | string;
  expected_participants: number;
  location: string | null;
  ref_link: string | null;
  co_organizer_code: string | null;
}

function dateInputValue(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ errorKey: "err.session" }, { status: 401 });
  }

  const search = request.nextUrl.searchParams;
  const fiscalYear = Number(search.get("fiscalYear"));
  const quarterNo = Number(search.get("quarterNo"));
  const requestedDepartment = search.get("departmentCode");
  if (
    !Number.isInteger(fiscalYear) ||
    !Number.isInteger(quarterNo) ||
    quarterNo < 1 ||
    quarterNo > 4
  ) {
    return NextResponse.json({ errorKey: "err.required" }, { status: 400 });
  }

  const departmentCode =
    user.role === "unit_user" ? user.department_code : requestedDepartment;
  if (!departmentCode) {
    return NextResponse.json(
      { errorKey: "err.department.invalid" },
      { status: 400 },
    );
  }

  const db = getDb();
  const [departmentRows] = await db.execute<RowDataPacket[]>(
    "SELECT code FROM departments WHERE code = ? AND is_active = 1 LIMIT 1",
    [departmentCode],
  );
  if (departmentRows.length === 0) {
    return NextResponse.json(
      { errorKey: "err.department.invalid" },
      { status: 400 },
    );
  }

  const [rows] = await db.execute<PlannedActivityRow[]>(
    `SELECT
       p.id,
       p.fiscal_year,
       p.quarter_no,
       p.title,
       p.main_department,
       p.activity_type_id,
       p.participant_type_id,
       p.expected_start,
       p.expected_end,
       p.expected_participants,
       p.location,
       p.ref_link,
       d.code AS co_organizer_code
     FROM planned_activities AS p
     LEFT JOIN planned_co_organizers AS pc
       ON pc.planned_id = p.id AND pc.department_code <> p.main_department
     LEFT JOIN departments AS d
       ON d.code = pc.department_code AND d.is_active = 1
     WHERE p.fiscal_year = ?
       AND p.quarter_no = ?
       AND p.main_department = ?
       AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC, p.id DESC, pc.department_code`,
    [fiscalYear, quarterNo, departmentCode],
  );

  const plans = new Map<
    string,
    {
      id: string;
      fiscal_year: number;
      quarter_no: number;
      title: string;
      main_department: string;
      activity_type_id: number;
      participant_type_id: number;
      expected_start: string;
      expected_end: string;
      expected_participants: number;
      location: string | null;
      ref_link: string | null;
      co_organizers: string[];
    }
  >();

  for (const row of rows) {
    const id = String(row.id);
    let plan = plans.get(id);
    if (!plan) {
      plan = {
        id,
        fiscal_year: Number(row.fiscal_year),
        quarter_no: Number(row.quarter_no),
        title: row.title,
        main_department: row.main_department,
        activity_type_id: Number(row.activity_type_id),
        participant_type_id: Number(row.participant_type_id),
        expected_start: dateInputValue(row.expected_start),
        expected_end: dateInputValue(row.expected_end),
        expected_participants: Number(row.expected_participants),
        location: row.location,
        ref_link: row.ref_link,
        co_organizers: [],
      };
      plans.set(id, plan);
    }
    if (row.co_organizer_code) {
      plan.co_organizers.push(row.co_organizer_code);
    }
  }

  return NextResponse.json({ plans: Array.from(plans.values()) });
}
