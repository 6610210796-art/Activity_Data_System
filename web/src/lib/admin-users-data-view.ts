import type { RowDataPacket } from "mysql2";

export interface AdminUserRecord extends RowDataPacket {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "unit_user";
  department_code: string | null;
  department_name: string | null;
  last_login_at: Date | string | null;
  is_active: number | boolean;
  created_at: Date | string;
  password_hash?: string;
}

export function toSafeAdminUser(record: AdminUserRecord) {
  const dateValue = (value: Date | string | null): string | null => {
    if (!value) return null;
    if (typeof value === "string") return value;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")} ${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:${String(value.getSeconds()).padStart(2, "0")}`;
  };

  return {
    id: record.id,
    fullName: record.full_name,
    email: record.email,
    role: record.role,
    departmentCode: record.department_code,
    departmentName: record.department_name,
    lastLoginAt: dateValue(record.last_login_at),
    isActive: Number(record.is_active) === 1,
    createdAt: dateValue(record.created_at) ?? "",
  };
}
