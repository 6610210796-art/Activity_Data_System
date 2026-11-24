import "server-only";

import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";

export interface AdminUserRow extends RowDataPacket {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "unit_user";
  department_code: string | null;
  department_name: string | null;
  last_login_at: Date | string | null;
  is_active: number | boolean;
  created_at: Date | string;
}

export interface AdminUserItem {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "unit_user";
  departmentCode: string | null;
  departmentName: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface DepartmentOption {
  code: string;
  name: string;
}

function dateValue(value: Date | string | null): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")} ${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:${String(value.getSeconds()).padStart(2, "0")}`;
}

export function escapeLikeLiteral(value: string): string {
  return value.replace(/[!%_]/g, "!$&");
}

export async function getDepartmentOptions(): Promise<DepartmentOption[]> {
  const [rows] = await getDb().execute<RowDataPacket[]>(
    "SELECT code, name_th FROM departments WHERE is_active = 1 ORDER BY sort_no, code",
    [],
  );
  return rows.map((row) => ({
    code: String(row.code),
    name: String(row.name_th),
  }));
}

export async function getAdminUsers(params: {
  search: string;
  status: "all" | "active" | "inactive";
  role: "all" | "admin" | "unit_user";
  page: number;
}): Promise<{ items: AdminUserItem[]; total: number; page: number; pageSize: number }> {
  const conditions = ["1 = 1"];
  const values: (string | number)[] = [];
  const search = params.search.trim();
  if (search) {
    const escaped = `%${escapeLikeLiteral(search)}%`;
    conditions.push("(p.full_name LIKE ? ESCAPE '!' OR p.email LIKE ? ESCAPE '!')");
    values.push(escaped, escaped);
  }
  if (params.status === "active") {
    conditions.push("p.is_active = 1");
  } else if (params.status === "inactive") {
    conditions.push("p.is_active = 0");
  }
  if (params.role !== "all") {
    conditions.push("p.role = ?");
    values.push(params.role);
  }

  const db = getDb();
  const [countRows] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM profiles p
     WHERE ${conditions.join(" AND ")}`,
    values,
  );
  const total = Number(countRows[0]?.total ?? 0);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(params.page, totalPages);
  const offset = (page - 1) * pageSize;

  const [rows] = await db.execute<AdminUserRow[]>(
    `SELECT p.id, p.full_name, p.email, p.role, p.department_code,
            d.name_th AS department_name, p.last_login_at,
            p.is_active, p.created_at
     FROM profiles p
     LEFT JOIN departments d ON d.code = p.department_code
     WHERE ${conditions.join(" AND ")}
     ORDER BY p.full_name ASC, p.id ASC
     LIMIT ? OFFSET ?`,
    [...values, pageSize, offset],
  );

  return {
    total,
    page,
    pageSize,
    items: rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      departmentCode: row.department_code,
      departmentName: row.department_name,
      lastLoginAt: dateValue(row.last_login_at),
      isActive: Number(row.is_active) === 1,
      createdAt: dateValue(row.created_at) ?? "",
    })),
  };
}
