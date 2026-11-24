export interface AdminActivityUser {
  role: "admin" | "unit_user";
}

export type AdminActivityAccessStatus = 200 | 401 | 403;

export function getAdminActivityAccessStatus(
  user: AdminActivityUser | null,
): AdminActivityAccessStatus {
  if (!user) return 401;
  return user.role === "admin" ? 200 : 403;
}
