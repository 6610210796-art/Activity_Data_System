import { AppShell } from "@/components/app-shell";
import { PlannedActivityEditor } from "@/components/planned-activity-editor";
import { requireUser } from "@/lib/auth";
import { getSiteContent } from "@/lib/content";
import { getPlannedActivityFormOptions } from "@/lib/planned-activity-data";
import { getPlannedActivityPreviousOptions } from "@/lib/option-queries";

export const dynamic = "force-dynamic";

export default async function EditPlannedActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const previous = await getPlannedActivityPreviousOptions(id);
  const content = await getSiteContent(["app.name", "form.option.inactive"]);
  const options = await getPlannedActivityFormOptions(
    "edit",
    content["form.option.inactive"],
    previous,
  );
  return (
    <AppShell activeTab="planned" content={content} user={user}>
      <PlannedActivityEditor
        activityTypes={options.activityTypes}
        content={content}
        departments={options.departments}
        id={id}
        participantTypes={options.participantTypes}
        quarters={options.quarters}
        user={user}
      />
    </AppShell>
  );
}
