import { redirect } from "next/navigation";
import { AdminContent } from "@/components/admin-content";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { getAdminContentEntries, getContentHistory } from "@/lib/admin-content";
import { parseContentHistoryFilters } from "@/lib/admin-content-policy";
import { listAnnouncements } from "@/lib/admin-announcements";
import { listOptionGroups } from "@/lib/admin-options";
import { getSiteContent } from "@/lib/content";
import { getSiteAssetView } from "@/lib/site-assets";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export default async function AdminContentPage({ searchParams }: PageProps) {
  const actor = await requireUser();
  if (actor.role !== "admin") redirect("/");

  const query = await searchParams;
  const tab = single(query.tab);
  const activeTab = tab === "history" || tab === "assets" || tab === "announcements" || tab === "options" ? tab : "text";
  const historyFilters = parseContentHistoryFilters({
    from: single(query.from), to: single(query.to), editor: single(query.editor),
    group: single(query.group), q: single(query.q), page: single(query.page),
  });
  const [content, entries, history, announcements, options] = await Promise.all([
    getSiteContent(["app.name", "app.org", "app.logo.alt", "nav.content"]),
    getAdminContentEntries(),
    activeTab === "history" ? getContentHistory(historyFilters) : Promise.resolve(null),
    activeTab === "announcements" ? listAnnouncements({}) : Promise.resolve(null),
    activeTab === "options" ? listOptionGroups() : Promise.resolve(null),
  ]);
  const logo = await getSiteAssetView("logo", content["app.logo.alt"]);

  return (
    <AppShell activeTab="content" content={content} user={actor}>
      <AdminContent
        announcements={announcements}
        content={content}
        entries={entries}
        history={history}
        initialTab={activeTab}
        initialFilters={historyFilters}
        logo={logo}
        options={options}
      />
    </AppShell>
  );
}
