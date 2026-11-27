import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AdminActivities } from "@/components/admin-activities";
import { requireUser } from "@/lib/auth";
import { getSiteContent, type ContentKey } from "@/lib/content";
import {
  getAdminActivitiesOptions,
  getAdminActivitiesPage,
} from "@/lib/admin-activities-data";
import {
  parseAdminActivitiesFilters,
  type AdminActivitiesFilterOptions,
} from "@/lib/admin-activities-query";

export const dynamic = "force-dynamic";

const CONTENT_KEYS = [
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
  "all.title",
  "all.subtitle",
  "all.search.placeholder",
  "all.filter.year",
  "all.filter.quarter",
  "all.filter.department",
  "all.filter.activity_type",
  "all.filter.status",
  "all.status.all",
  "all.status.past",
  "all.status.planned",
  "all.status.confirmed",
  "all.status.unconfirmed",
  "all.filter.clear",
  "all.export",
  "all.exporting",
  "all.export.error",
  "all.export.limit",
  "all.empty",
  "all.loading",
  "all.error",
  "all.column.activity",
  "all.column.department",
  "all.column.type",
  "all.column.quarter",
  "all.column.date",
  "all.column.participants",
  "all.column.satisfaction",
  "all.column.status",
  "all.pagination.summary",
  "all.pagination.previous",
  "all.pagination.next",
  "all.sort.ascending",
  "all.sort.descending",
  "all.co_organizers",
  "all.participant",
  "all.status.past.label",
  "all.status.confirmed.label",
  "all.status.unconfirmed.label",
  "all.quarter.fiscal",
  "form.option.inactive",
] as const satisfies readonly ContentKey[];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminActivitiesPage({
  searchParams,
}: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const [query, content] = await Promise.all([
    searchParams,
    getSiteContent(CONTENT_KEYS),
  ]);
  const options = await getAdminActivitiesOptions(content["form.option.inactive"]);
  const filterOptions: AdminActivitiesFilterOptions = {
    fiscalYears: options.fiscalYears,
    departments: options.departments,
    activityTypes: options.activityTypes,
  };
  const filters = parseAdminActivitiesFilters(query, filterOptions);
  const data = await getAdminActivitiesPage(filters, content["form.option.inactive"]);

  return (
    <AppShell activeTab="activities" content={content} user={user}>
      <AdminActivities
        content={content}
        data={data}
        filters={filters}
        options={options}
      />
    </AppShell>
  );
}
