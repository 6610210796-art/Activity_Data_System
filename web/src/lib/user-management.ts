export type ManagedRole = "admin" | "unit_user";

export interface ManagedProfile {
  id: string;
  role: ManagedRole;
  department_code: string | null;
  is_active: number | boolean;
}

export interface UserLockProtectionInput {
  actorId: string;
  targetId: string;
  targetBefore: ManagedProfile;
  targetAfterRole: ManagedRole;
  targetAfterDepartment: string | null;
  targetAfterActive: boolean;
  activeAdminCount: number;
}

export type UserLockProtectionResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateManagedProfile(
  role: ManagedRole,
  departmentCode: string | null,
): string | null {
  if (role === "unit_user" && !departmentCode) {
    return "ผู้ใช้สิทธิ์หน่วยงานต้องสังกัดหน่วยงาน";
  }
  return null;
}

export function checkUserLockProtection(
  input: UserLockProtectionInput,
): UserLockProtectionResult {
  const self = input.actorId === input.targetId;
  if (self && input.targetAfterActive === false) {
    return { ok: false, message: "ไม่สามารถปิดการใช้งานบัญชีของตัวเองได้" };
  }
  if (
    self &&
    input.targetBefore.role === "admin" &&
    input.targetAfterRole !== "admin"
  ) {
    return { ok: false, message: "ไม่สามารถลดสิทธิ์ของบัญชีตัวเองได้" };
  }

  const targetWasActiveAdmin =
    input.targetBefore.role === "admin" &&
    Number(input.targetBefore.is_active) === 1;
  const targetStoppedBeingActiveAdmin =
    targetWasActiveAdmin &&
    (input.targetAfterRole !== "admin" || input.targetAfterActive === false);
  if (targetStoppedBeingActiveAdmin && input.activeAdminCount <= 1) {
    return {
      ok: false,
      message: "ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน",
    };
  }

  const departmentError = validateManagedProfile(
    input.targetAfterRole,
    input.targetAfterDepartment,
  );
  if (departmentError) return { ok: false, message: departmentError };
  return { ok: true };
}

export function validateProfileUpdate(
  fullName: string,
  email: string,
  role: ManagedRole,
  departmentCode: string | null,
): string | null {
  if (fullName.trim().length < 2) {
    return "กรุณากรอกชื่อ-นามสกุล";
  }
  if (fullName.trim().length > 150) {
    return "ชื่อ-นามสกุลต้องไม่เกิน 150 ตัวอักษร";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "รูปแบบอีเมลไม่ถูกต้อง";
  }
  return validateManagedProfile(role, departmentCode);
}
