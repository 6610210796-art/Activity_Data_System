import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
} from "lucide-react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { AppShell } from "@/components/app-shell";
import { getDb } from "@/lib/db";
import { formatContent, getSiteContent } from "@/lib/content";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface CountRow extends RowDataPacket {
  total: number | string;
}

function getCurrentFiscalYear(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return year + (month >= 10 ? 1 : 0) + 543;
}

async function getActivityCounts(
  role: "admin" | "unit_user",
  departmentCode: string | null,
) {
  const db = getDb();
  if (role === "admin") {
    const [[pastRows], [plannedRows]] = await Promise.all([
      db.execute<CountRow[]>(
        "SELECT COUNT(*) AS total FROM past_activities WHERE deleted_at IS NULL",
        [],
      ),
      db.execute<CountRow[]>(
        "SELECT COUNT(*) AS total FROM planned_activities WHERE deleted_at IS NULL",
        [],
      ),
    ]);
    return {
      past: Number(pastRows[0]?.total ?? 0),
      planned: Number(plannedRows[0]?.total ?? 0),
    };
  }

  if (!departmentCode) {
    return { past: 0, planned: 0 };
  }

  const [[pastRows], [plannedRows]] = await Promise.all([
    db.execute<CountRow[]>(
      "SELECT COUNT(*) AS total FROM past_activities WHERE deleted_at IS NULL AND main_department = ?",
      [departmentCode],
    ),
    db.execute<CountRow[]>(
      "SELECT COUNT(*) AS total FROM planned_activities WHERE deleted_at IS NULL AND main_department = ?",
      [departmentCode],
    ),
  ]);
  return {
    past: Number(pastRows[0]?.total ?? 0),
    planned: Number(plannedRows[0]?.total ?? 0),
  };
}

export default async function Home() {
  const user = await requireUser();
  const [content, counts] = await Promise.all([
    getSiteContent([
      "app.name",
      "app.org",
      "common.logout",
      "common.role.admin",
      "common.role.unit_user",
      "nav.home",
      "nav.past",
      "nav.planned",
      "nav.mine",
      "nav.admin_dashboard",
      "nav.all_activities",
      "nav.users",
      "home.kicker",
      "home.heading",
      "home.subtitle",
      "home.card1.title",
      "home.card1.desc",
      "home.card1.count",
      "home.card2.title",
      "home.card2.desc",
      "home.card2.count",
      "home.card.action",
      "home.mine_hint",
    ]),
    getActivityCounts(user.role, user.department_code),
  ]);

  return (
    <AppShell content={content} user={user}>
      <section className="intro-card">
        <p className="eyebrow">{content["home.kicker"]}</p>
        <h1>{content["home.heading"]}</h1>
        <p className="intro-description">
          {formatContent(content["home.subtitle"], {
            fiscalYear: getCurrentFiscalYear(),
          })}
        </p>
      </section>

      <section aria-label={content["home.heading"]} className="activity-grid">
        <Link
          className="activity-card activity-card-link"
          href="/activities/past/new"
        >
          <div className="activity-card-main">
            <span className="number-badge number-blue">1</span>
            <div className="activity-copy">
              <h2>{content["home.card1.title"]}</h2>
              <p>{content["home.card1.desc"]}</p>
            </div>
            <CalendarDays
              aria-hidden="true"
              className="card-icon"
              size={24}
            />
          </div>
          <div className="activity-card-footer">
            <span className="count-pill count-blue">
              {formatContent(content["home.card1.count"], {
                count: counts.past,
              })}
            </span>
            <span className="card-action">
              {content["home.card.action"]}
              <ArrowRight aria-hidden="true" size={17} />
            </span>
          </div>
        </Link>

        <Link
          className="activity-card activity-card-link"
          href="/activities/planned/new"
        >
          <div className="activity-card-main">
            <span className="number-badge number-green">2</span>
            <div className="activity-copy">
              <h2>{content["home.card2.title"]}</h2>
              <p>{content["home.card2.desc"]}</p>
            </div>
            <CalendarPlus
              aria-hidden="true"
              className="card-icon"
              size={24}
            />
          </div>
          <div className="activity-card-footer">
            <span className="count-pill count-green">
              {formatContent(content["home.card2.count"], {
                count: counts.planned,
              })}
            </span>
            <span className="card-action">
              {content["home.card.action"]}
              <ArrowRight aria-hidden="true" size={17} />
            </span>
          </div>
        </Link>
      </section>

      <p className="home-hint">{content["home.mine_hint"]}</p>
    </AppShell>
  );
}
