import Link from "next/link";
import {
  ArrowRightFromLine,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AuthenticatedUser } from "@/lib/auth";
import type { ContentKey, SiteContent } from "@/lib/content";

interface AppShellProps {
  user: AuthenticatedUser;
  content: SiteContent;
  activeTab?: "home" | "past" | "planned" | "mine" | "dashboard" | "activities" | "users";
  children: ReactNode;
}

export function AppShell({
  user,
  content,
  activeTab = "home",
  children,
}: AppShellProps) {
  const tabs: {
    key: ContentKey;
    href?: string;
    tab?: "home" | "past" | "planned" | "mine" | "dashboard" | "activities" | "users";
  }[] = [
    { key: "nav.home", href: "/", tab: "home" },
    { key: "nav.past", href: "/activities/past/new", tab: "past" },
    { key: "nav.planned", href: "/activities/planned/new", tab: "planned" },
    { key: "nav.mine", href: "/activities/mine", tab: "mine" },
  ];
  if (user.role === "admin") {
    tabs.push(
      {
        key: "nav.admin_dashboard",
        href: "/admin/dashboard",
        tab: "dashboard",
      },
      {
        key: "nav.all_activities",
        href: "/admin/activities",
        tab: "activities",
      },
      {
        key: "nav.users",
        href: "/admin/users",
        tab: "users",
      },
    );
  }

  return (
    <main
      className={
        activeTab === "dashboard"
          ? "app-container admin-dashboard-shell"
          : activeTab === "activities"
            ? "app-container admin-activities-shell"
            : activeTab === "users"
              ? "app-container admin-users-shell"
              : "app-container"
      }
    >
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
            <Link className="password-link" href="/account/password">
              {content["account.password.link"]}
            </Link>
            <form action="/api/auth/logout" method="post">
              <button className="logout-button" type="submit">
                <ArrowRightFromLine aria-hidden="true" size={16} />
                {content["common.logout"]}
              </button>
            </form>
          </div>
        </div>

        <nav aria-label={content["app.name"]} className="tab-list">
          {tabs.map(({ key, href, tab }) =>
            href ? (
              <Link
                aria-current={activeTab === tab ? "page" : undefined}
                className={
                  activeTab === tab
                    ? "nav-tab nav-tab-active"
                    : "nav-tab"
                }
                href={href}
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
