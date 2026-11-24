import { AppShell } from "@/components/app-shell";
import { PlannedActivityEditor } from "@/components/planned-activity-editor";
import { requireUser } from "@/lib/auth";
import { getSiteContent } from "@/lib/content";
import { getPlannedActivityFormOptions } from "@/lib/planned-activity-data";

export const dynamic = "force-dynamic";

export default async function EditPlannedActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const [content, options] = await Promise.all([
    getSiteContent(["app.name"]),
    getPlannedActivityFormOptions(),
  ]);
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
