import { AppShell } from "@/components/app-shell";
import { PlannedActivityForm } from "@/components/planned-activity-form";
import { requireUser } from "@/lib/auth";
import type { ContentKey } from "@/lib/content";
import { getSiteContent } from "@/lib/content";
import { getPlannedActivityFormOptions } from "@/lib/planned-activity-data";
import { getNextQuarter } from "@/lib/planned-activity-validation";

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
  "form2.title",
  "form2.description",
  "form1.field.quarter",
  "form1.field.fiscal_year",
  "form1.field.title",
  "form1.field.main_department",
  "form1.field.co_organizers",
  "form1.field.activity_type",
  "form1.field.participant_type",
  "form1.field.location",
  "form1.field.ref_link",
  "form1.help.fiscal_year",
  "form1.help.co_organizers",
  "form1.help.activity_type",
  "form1.help.date_range",
  "form1.select.placeholder",
  "form1.placeholder.title",
  "form1.placeholder.location",
  "form1.placeholder.ref_link",
  "form2.field.date_status",
  "form2.field.expected_start",
  "form2.field.expected_end",
  "form2.field.expected_participants",
  "form2.field.banner",
  "form2.status.confirmed",
  "form2.status.unconfirmed",
  "form2.help.banner",
  "form2.upload.add",
  "form2.upload.remove",
  "form2.upload.preview",
  "form2.saved",
  "form2.submit.incomplete",
  "form2.placeholder.expected_participants",
  "form2.help.expected_participants",
  "btn.save",
  "btn.cancel",
  "err.required",
  "err.title.max",
  "err.location.max",
  "err.ref_link.max",
  "err.date.quarter",
  "err.date.planned_future",
  "err.date.order",
  "err.participants.min",
  "err.co.duplicate",
  "err.co.max",
  "err.image.type",
  "err.image.content",
  "err.image.size",
  "err.department.invalid",
  "err.session",
  "err.save",
] as const satisfies readonly ContentKey[];

export default async function NewPlannedActivityPage() {
  const user = await requireUser();
  const [content, options] = await Promise.all([
    getSiteContent(formContentKeys),
    getPlannedActivityFormOptions(),
  ]);
  const nextQuarter = getNextQuarter();

  return (
    <AppShell activeTab="planned" content={content} user={user}>
      <PlannedActivityForm
        activityTypes={options.activityTypes}
        content={content}
        departments={options.departments}
        initialFiscalYear={nextQuarter.fiscalYear}
        initialQuarterNo={nextQuarter.quarterNo}
        participantTypes={options.participantTypes}
        quarters={options.quarters}
        user={user}
      />
    </AppShell>
  );
}
