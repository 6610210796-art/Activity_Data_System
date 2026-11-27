import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AdminDashboard } from "@/components/admin-dashboard";
import {
  getAdminDashboardData,
  getAdminDashboardOptions,
  type DashboardFilters,
} from "@/lib/admin-dashboard-data";
import { getPreviousQuarter } from "@/lib/past-activity-validation";
import {
  getSiteContent,
  type ContentKey,
} from "@/lib/content";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DASHBOARD_CONTENT_KEYS = [
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
  "dashboard.title",
  "dashboard.description",
  "dashboard.period.label",
  "dashboard.quarter.name",
  "dashboard.filter.fiscal_year",
  "dashboard.filter.quarter",
  "dashboard.filter.department",
  "dashboard.filter.activity_type",
  "dashboard.filter.all",
  "dashboard.filter.apply",
  "dashboard.filter.clear",
  "form.option.inactive",
  "dashboard.filter.no_results",
  "dashboard.filter.results",
  "dashboard.submission.summary",
  "dashboard.submission.sent",
  "dashboard.submission.pending",
  "dashboard.stat.activities.title",
  "dashboard.stat.activities.unit",
  "dashboard.stat.activities.delta",
  "dashboard.stat.participants.title",
  "dashboard.stat.participants.unit",
  "dashboard.stat.participants.delta",
  "dashboard.stat.satisfaction.title",
  "dashboard.stat.satisfaction.evaluated",
  "dashboard.stat.satisfaction.points",
  "dashboard.stat.satisfaction.delta",
  "dashboard.chart.empty",
  "dashboard.chart.department.title",
  "dashboard.chart.department.subtitle",
  "dashboard.chart.activity_type.title",
  "dashboard.chart.activity_type.subtitle",
  "dashboard.chart.participant_type.title",
  "dashboard.chart.participant_type.subtitle",
  "dashboard.chart.trend.title",
  "dashboard.chart.trend.subtitle",
  "dashboard.chart.trend.activities",
  "dashboard.chart.trend.participants",
  "dashboard.featured.title",
  "dashboard.featured.no_image",
  "dashboard.featured.satisfaction",
  "dashboard.featured.people",
  "dashboard.planned.title",
  "dashboard.planned.summary",
  "dashboard.planned.empty",
  "dashboard.planned.date",
  "dashboard.planned.activity",
  "dashboard.planned.department",
  "dashboard.planned.type",
  "dashboard.planned.people",
  "dashboard.planned.status",
  "dashboard.planned.confirmed",
  "dashboard.planned.unconfirmed",
  "dashboard.planned.awaiting",
  "dashboard.planned.view_all",
  "dashboard.source",
] as const satisfies readonly ContentKey[];

interface DashboardPageProps {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}

function getSingleParam(
  value: string | string[] | undefined,
): string | null {
  return typeof value === "string" ? value : null;
}

function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
  options: Awaited<ReturnType<typeof getAdminDashboardOptions>>,
  defaultQuarter: { fiscalYear: number; quarterNo: number },
): DashboardFilters {
  const fiscalYearValue = Number(getSingleParam(searchParams.fiscal_year));
  const fiscalYear = options.fiscalYears.includes(fiscalYearValue)
    ? fiscalYearValue
    : defaultQuarter.fiscalYear;
  const quarterValue = Number(getSingleParam(searchParams.quarter));
  const quarterNo = options.quarters.some(
    (quarter) => quarter.no === quarterValue,
  )
    ? quarterValue
    : defaultQuarter.quarterNo;
  const departmentParam = getSingleParam(searchParams.department);
  const departmentCode =
    departmentParam &&
    options.filterDepartments.some(
      (department) => department.code === departmentParam,
    )
      ? departmentParam
      : null;
  const activityTypeValue = Number(
    getSingleParam(searchParams.activity_type),
  );
  const activityTypeId = options.filterActivityTypes.some(
    (activityType) => activityType.id === activityTypeValue,
  )
    ? activityTypeValue
    : null;

  return {
    fiscalYear,
    quarterNo,
    departmentCode,
    activityTypeId,
  };
}

export default async function AdminDashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await requireUser();
  if (user.role !== "admin") {
    redirect("/");
  }

  const defaultQuarter = getPreviousQuarter();
  const [query, content] = await Promise.all([
    searchParams,
    getSiteContent(DASHBOARD_CONTENT_KEYS),
  ]);
  const options = await getAdminDashboardOptions(
    defaultQuarter.fiscalYear,
    content["form.option.inactive"],
  );
  const filters = parseFilters(query, options, defaultQuarter);
  const data = await getAdminDashboardData(filters, options);

  return (
    <AppShell activeTab="dashboard" content={content} user={user}>
      <AdminDashboard content={content} data={data} options={options} />
    </AppShell>
  );
}
