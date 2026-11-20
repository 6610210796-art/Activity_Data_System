import Link from "next/link";
import {
  ArrowRightFromLine,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AuthenticatedUser } from "@/lib/auth";
import type { SiteContent } from "@/lib/content";

interface AppShellProps {
  user: AuthenticatedUser;
  content: SiteContent;
  children: ReactNode;
}

export function AppShell({ user, content, children }: AppShellProps) {
  const tabs =
    user.role === "admin"
      ? [
          ["nav.home", true],
          ["nav.past", false],
          ["nav.planned", false],
          ["nav.mine", false],
          ["nav.admin_dashboard", false],
          ["nav.all_activities", false],
          ["nav.users", false],
        ] as const
      : [
          ["nav.home", true],
          ["nav.past", false],
          ["nav.planned", false],
          ["nav.mine", false],
        ] as const;

  return (
    <main className="app-container">
      <header className="app-header">
        <div className="header-top">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <FlaskConical size={27} strokeWidth={1.8} />
            </div>
            <div>
              <p className="brand-title">{content["app.name"]}</p>
              <p className="brand-subtitle">{content["app.org"]}</p>
            </div>
          </div>

          <div className="account-controls">
            <div className="account-badge">
              <ShieldCheck aria-hidden="true" size={16} />
              <span>{user.full_name}</span>
              <span className="role-pill">
                {user.role === "admin"
                  ? content["common.role.admin"]
                  : content["common.role.unit_user"]}
              </span>
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="logout-button" type="submit">
                <ArrowRightFromLine aria-hidden="true" size={16} />
                {content["common.logout"]}
              </button>
            </form>
          </div>
        </div>

        <nav aria-label={content["app.name"]} className="tab-list">
          {tabs.map(([key, enabled]) =>
            enabled ? (
              <Link
                aria-current="page"
                className="nav-tab nav-tab-active"
                href="/"
                key={key}
              >
                {content[key]}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="nav-tab nav-tab-disabled"
                key={key}
              >
                {content[key]}
              </span>
            ),
          )}
        </nav>
      </header>
      {children}
    </main>
  );
}
