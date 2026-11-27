import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AdminUsers } from "@/components/admin-users";
import { requireUser } from "@/lib/auth";
import { getSiteContent, type ContentKey } from "@/lib/content";
import {
  getAdminUsers,
  getDepartmentOptions,
} from "@/lib/admin-users-data";

export const dynamic = "force-dynamic";

const keys = [
  "app.name",
  "app.org",
  "nav.home",
  "nav.past",
  "nav.planned",
  "nav.mine",
  "nav.admin_dashboard",
  "nav.all_activities",
  "nav.users",
  "common.logout",
  "common.role.admin",
  "common.role.unit_user",
  "account.password.link",
  "users.title",
  "users.description",
  "users.add",
  "users.search.placeholder",
  "users.filter.status",
  "users.filter.status.all",
  "users.filter.status.active",
  "users.filter.status.inactive",
  "users.filter.role",
  "users.filter.role.all",
  "users.filter.role.admin",
  "users.filter.role.unit",
  "users.column.name",
  "users.column.email",
  "users.column.role",
  "users.column.department",
  "users.column.last_login",
  "users.column.status",
  "users.column.actions",
  "users.status.active",
  "users.status.inactive",
  "users.you",
  "users.menu.edit",
  "users.menu.reset",
  "users.menu.disable",
  "users.menu.enable",
  "users.empty",
  "users.loading",
  "users.error",
  "users.pagination",
  "users.department.none",
  "users.create.title",
  "users.create.full_name",
  "users.create.email",
  "users.create.role",
  "users.create.department",
  "users.create.password",
  "users.create.generate",
  "users.create.submit",
  "users.temporary.title",
  "users.temporary.warning",
  "users.temporary.copy",
  "users.edit.title",
  "users.reset.confirm",
  "users.confirm.save",
  "users.confirm.cancel",
  "users.search.submit",
  "users.filter.clear",
  "users.pagination.previous",
  "users.pagination.next",
  "users.department.select",
  "users.password.auto_placeholder",
  "users.menu.label",
  "users.modal.close",
  "users.confirm.change_role",
  "users.confirm.change_role_department",
  "users.confirm.change_department",
  "users.confirm.disable",
  "users.confirm.enable",
  "users.self.role",
  "users.self.reset",
  "users.self.disable",
  "users.success.profile",
  "users.success.saved",
  "users.success.copied",
  "users.error.validation",
  "users.error.email_invalid",
  "users.error.email_duplicate",
  "users.error.department_invalid",
  "users.error.department_required",
  "users.error.lock_protection",
  "users.error.password_policy",
  "users.error.session",
  "users.error.invalid",
  "users.error.server",
  "form.option.inactive",
] as const satisfies readonly ContentKey[];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function parsePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const actor = await requireUser();
  if (actor.role !== "admin") redirect("/");

  const [query, content] = await Promise.all([
    searchParams,
    getSiteContent(keys),
  ]);
  const departments = await getDepartmentOptions();
  const statusParam = single(query.status);
  const roleParam = single(query.role);
  const status =
    statusParam === "active" || statusParam === "inactive"
      ? statusParam
      : "all";
  const role =
    roleParam === "admin" || roleParam === "unit_user"
      ? roleParam
      : "all";
  const data = await getAdminUsers({
    search: single(query.q)?.slice(0, 150) ?? "",
    status,
    role,
    page: parsePage(single(query.page)),
  });

  return (
    <AppShell activeTab="users" content={content} user={actor}>
      <AdminUsers
        content={content}
        data={data}
        departments={departments}
        actorId={actor.id}
        initialFilters={{ search: single(query.q) ?? "", status, role }}
      />
    </AppShell>
  );
}
