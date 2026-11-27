export type AdminUsersActor = {
  id: string;
  role: "admin" | "unit_user";
} | null;

export type AdminUsersAccess =
  | { allowed: true; actor: Exclude<AdminUsersActor, null> }
  | { allowed: false; status: 401 | 403; error: "session" | "forbidden" };

export function authorizeAdminUsers(actor: AdminUsersActor): AdminUsersAccess {
  if (!actor) return { allowed: false, status: 401, error: "session" };
  if (actor.role !== "admin") {
    return { allowed: false, status: 403, error: "forbidden" };
  }
  return { allowed: true, actor };
}
