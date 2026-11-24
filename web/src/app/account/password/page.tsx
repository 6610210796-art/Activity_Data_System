import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ChangePasswordForm } from "@/components/change-password-form";
import { requireUser } from "@/lib/auth";
import { getSiteContent, type ContentKey } from "@/lib/content";

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
  "account.password.title",
  "account.password.description",
  "account.password.current",
  "account.password.new",
  "account.password.confirm",
  "account.password.submit",
  "account.password.success",
] as const satisfies readonly ContentKey[];

export default async function ChangePasswordPage() {
  const user = await requireUser();
  const content = await getSiteContent(keys);
  return (
    <AppShell content={content} user={user}>
      <ChangePasswordForm content={content} />
    </AppShell>
  );
}
