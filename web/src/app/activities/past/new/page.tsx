import { AppShell } from "@/components/app-shell";
import { PastActivityForm } from "@/components/past-activity-form";
import { PastActivityFromPlan } from "@/components/past-activity-from-plan";
import { requireUser } from "@/lib/auth";
import type { ContentKey } from "@/lib/content";
import { getSiteContent } from "@/lib/content";
import { getPastActivityFormOptions } from "@/lib/past-activity-data";
import { getPreviousQuarter } from "@/lib/past-activity-validation";

export const dynamic = "force-dynamic";

const formContentKeys = [
  "app.name",
  "app.org",
  "common.logout",
  "common.role.admin",
  "common.role.unit_user",
  "common.back_to_list",
  "home.kicker",
  "nav.home",
  "nav.past",
  "nav.planned",
  "nav.mine",
  "nav.admin_dashboard",
  "nav.all_activities",
  "nav.users",
  "form1.title",
  "form1.description",
  "form1.mode.planned",
  "form1.mode.new",
  "form1.field.quarter",
  "form1.field.fiscal_year",
  "form1.field.title",
  "form1.field.main_department",
  "form1.field.co_organizers",
  "form1.field.activity_type",
  "form1.field.participant_type",
  "form1.field.start_date",
  "form1.field.end_date",
  "form1.field.total_participants",
  "form1.field.result_summary",
  "form1.field.satisfaction",
  "form1.field.images",
  "form1.field.location",
  "form1.field.ref_link",
  "form1.help.fiscal_year",
  "form1.help.co_organizers",
  "form1.help.activity_type",
  "form1.help.date_range",
  "form1.help.participants",
  "form1.help.satisfaction",
  "form1.help.images",
  "form1.select.placeholder",
  "form1.placeholder.title",
  "form1.placeholder.total_participants",
  "form1.placeholder.result_summary",
  "form1.placeholder.satisfaction",
  "form1.placeholder.location",
  "form1.placeholder.ref_link",
  "form1.planned.placeholder",
  "form1.planned.empty",
  "form1.planned.loading",
  "form1.upload.add",
  "form1.upload.remove",
  "form1.upload.count",
  "form1.upload.requirements",
  "form1.consent",
  "form1.help.consent_minor",
  "form1.saved",
  "form1.submit.incomplete",
  "btn.save",
  "btn.cancel",
  "err.required",
  "err.title.max",
  "err.result.max",
  "err.location.max",
  "err.ref_link.max",
  "err.date.quarter",
  "err.date.future",
  "err.date.order",
  "err.participants.min",
  "err.satisfaction.range",
  "err.satisfaction.precision",
  "err.co.duplicate",
  "err.co.max",
  "err.image.required",
  "err.image.max",
  "err.image.type",
  "err.image.content",
  "err.image.size",
  "err.image.consent",
  "err.planned.invalid",
  "err.department.invalid",
  "err.session",
  "err.save",
] as const satisfies readonly ContentKey[];

export default async function NewPastActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ plannedId?: string | string[] }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const plannedId =
    typeof query.plannedId === "string" && /^[1-9]\d*$/.test(query.plannedId)
      ? query.plannedId
      : null;
  const [content, options] = await Promise.all([
    getSiteContent(formContentKeys),
    getPastActivityFormOptions(),
  ]);
  const previousQuarter = getPreviousQuarter();

  return (
    <AppShell activeTab="past" content={content} user={user}>
      {plannedId ? (
        <PastActivityFromPlan
          activityTypes={options.activityTypes}
          content={content}
          departments={options.departments}
          initialFiscalYear={previousQuarter.fiscalYear}
          initialQuarterNo={previousQuarter.quarterNo}
          plannedId={plannedId}
          participantTypes={options.participantTypes}
          quarters={options.quarters}
          user={user}
        />
      ) : (
        <PastActivityForm
          activityTypes={options.activityTypes}
          content={content}
          departments={options.departments}
          initialFiscalYear={previousQuarter.fiscalYear}
          initialQuarterNo={previousQuarter.quarterNo}
          participantTypes={options.participantTypes}
          quarters={options.quarters}
          user={user}
        />
      )}
    </AppShell>
  );
}
