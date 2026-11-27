import { AppShell } from "@/components/app-shell";
import { MineActivities } from "@/components/mine-activities";
import { requireUser } from "@/lib/auth";
import type { ContentKey } from "@/lib/content";
import { getSiteContent } from "@/lib/content";
import { getPastActivityFormOptions } from "@/lib/past-activity-data";
import { getNextQuarter } from "@/lib/planned-activity-validation";

export const dynamic = "force-dynamic";

const pageContentKeys = [
  "app.name",
  "app.org",
  "common.logout",
  "common.role.admin",
  "common.role.unit_user",
  "common.back_to_list",
  "nav.home",
  "nav.past",
  "nav.planned",
  "nav.mine",
  "nav.admin_dashboard",
  "nav.all_activities",
  "nav.users",
  "form.option.inactive",
  "mine.title",
  "mine.description",
  "mine.create_past",
  "mine.create_planned",
  "mine.tab.past",
  "mine.tab.planned",
  "mine.search.label",
  "mine.search.placeholder",
  "mine.filter.year",
  "mine.fiscal_year.label",
  "mine.unit.people",
  "mine.filter.quarter",
  "mine.filter.activity_type",
  "mine.filter.department",
  "mine.filter.apply",
  "mine.filter.clear",
  "mine.column.title",
  "mine.column.quarter",
  "mine.column.activity_type",
  "mine.column.date",
  "mine.column.participants",
  "mine.column.status",
  "mine.column.actions",
  "mine.action.edit",
  "mine.action.delete",
  "mine.delete.confirm",
  "mine.delete.success",
  "mine.empty",
  "mine.filter.no_results",
  "mine.empty.create",
  "mine.loading",
  "mine.error",
  "mine.badge.from_plan",
  "mine.badge.not_recorded",
  "mine.action.record_result",
  "mine.status.confirmed",
  "mine.status.unconfirmed",
  "mine.status.completed",
  "mine.pagination.summary",
  "mine.pagination.previous",
  "mine.pagination.next",
  "archive.action.open",
  "archive.action.store",
  "form1.field.fiscal_year",
  "form1.field.quarter",
  "form1.field.main_department",
  "form1.field.activity_type",
  "err.session",
  "err.mine.delete",
] as const satisfies readonly ContentKey[];

export default async function MineActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const [query, content] = await Promise.all([
    searchParams,
    getSiteContent(pageContentKeys),
  ]);
  const options = await getPastActivityFormOptions(
    "filter",
    content["form.option.inactive"],
  );
  const fiscalYear = getNextQuarter().fiscalYear;
  const fiscalYears = Array.from({ length: 10 }, (_, index) => fiscalYear + 2 - index);
  const requestedFiscalYear = typeof query.fiscalYear === "string" ? query.fiscalYear : "";
  const requestedQuarter = typeof query.quarterNo === "string" ? query.quarterNo : "";
  const requestedActivityType = typeof query.activityTypeId === "string" ? query.activityTypeId : "";
  const requestedDepartment = typeof query.departmentCode === "string" ? query.departmentCode : "";
  const initialFilters = {
    type: query.type === "planned" ? "planned" as const : "past" as const,
    fiscalYear: fiscalYears.includes(Number(requestedFiscalYear)) ? requestedFiscalYear : "",
    quarterNo: /^[1-4]$/.test(requestedQuarter) ? requestedQuarter : "",
    activityTypeId: options.activityTypes.some((type) => type.id === Number(requestedActivityType)) ? requestedActivityType : "",
    departmentCode: user.role === "admin" && options.departments.some((department) => department.code === requestedDepartment) ? requestedDepartment : "",
    search: typeof query.search === "string" ? query.search.slice(0, 150) : "",
    page: typeof query.page === "string" && /^\d+$/.test(query.page) ? query.page : "1",
  };

  return (
    <AppShell activeTab="mine" content={content} user={user}>
      <MineActivities
        activityTypes={options.activityTypes.map(({ id, name_th }) => ({ id, name_th }))}
        content={content}
        departments={options.departments}
        fiscalYears={fiscalYears}
        quarters={options.quarters}
        initialFilters={initialFilters}
        role={user.role}
      />
    </AppShell>
  );
}
