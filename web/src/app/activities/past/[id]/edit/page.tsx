import { AppShell } from "@/components/app-shell";
import { PastActivityEditor } from "@/components/past-activity-editor";
import { requireUser } from "@/lib/auth";
import { getSiteContent } from "@/lib/content";
import { getPastActivityFormOptions } from "@/lib/past-activity-data";
import { getPastActivityPreviousOptions } from "@/lib/option-queries";

export const dynamic = "force-dynamic";

export default async function EditPastActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const previous = await getPastActivityPreviousOptions(id);
  const content = await getSiteContent(["app.name", "form.option.inactive"]);
  const options = await getPastActivityFormOptions(
    "edit",
    content["form.option.inactive"],
    previous,
  );
  return (
    <AppShell activeTab="past" content={content} user={user}>
      <PastActivityEditor
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
