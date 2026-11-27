"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { UserPlus, MoreHorizontal, X } from "lucide-react";
import type { SiteContent } from "@/lib/content";
import type {
  AdminUserItem,
  DepartmentOption,
} from "@/lib/admin-users-data";
import { buildFilterQuery } from "@/lib/filter-navigation";
import { ClearFiltersButton } from "@/components/clear-filters-button";

interface Props {
  content: SiteContent;
  data: {
    items: AdminUserItem[];
    total: number;
    page: number;
    pageSize: number;
  };
  departments: DepartmentOption[];
  actorId: string;
  initialFilters: {
    search: string;
    status: "all" | "active" | "inactive";
    role: "all" | "admin" | "unit_user";
  };
}

function formatThaiDate(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(`${value.replace(" ", "T")}+07:00`);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(parsed);
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (token, key: string) => values[key] ?? token);
}

function isActiveDepartment(
  departments: readonly DepartmentOption[],
  code: string | null,
): boolean {
  return Boolean(code && departments.some((department) => department.code === code));
}

type PendingChange =
  | { item: AdminUserItem; action: "role"; role: "admin" | "unit_user"; departmentCode: string }
  | { item: AdminUserItem; action: "department"; departmentCode: string }
  | { item: AdminUserItem; action: "status"; isActive: boolean };

export function AdminUsers({
  content,
  data,
  departments,
  actorId,
  initialFilters,
}: Props) {
  const router = useRouter();
  const [filterPending, startFilterTransition] = useTransition();
  const [actionMenu, setActionMenu] = useState<{ item: AdminUserItem; top: number; left: number } | null>(null);
  const [modal, setModal] = useState<"create" | "edit" | "reset" | "password" | "confirm_change" | null>(null);
  const [selected, setSelected] = useState<AdminUserItem | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [pendingDepartment, setPendingDepartment] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "unit_user">("unit_user");
  const [departmentCode, setDepartmentCode] = useState("");
  const [password, setPassword] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [userFilters, setUserFilters] = useState(initialFilters);
  const [filterSearch, setFilterSearch] = useState(initialFilters.search);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror server-parsed URL after history navigation
    setUserFilters(initialFilters);
    setFilterSearch(initialFilters.search);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [initialFilters]);

  function navigateFilters(next: typeof initialFilters, mode: "push" | "replace") {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const updated = { ...next, search: filterSearch };
    const params = new URLSearchParams(buildFilterQuery({
      q: updated.search,
      status: updated.status === "all" ? "" : updated.status,
      role: updated.role === "all" ? "" : updated.role,
    }));
    const query = params.toString();
    const href = `/admin/users${query ? `?${query}` : ""}`;
    startFilterTransition(() => {
      if (mode === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    });
    setUserFilters(updated);
  }

  useEffect(() => {
    if (!actionMenu) return;
    const close = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && (target.closest(".users-actions-menu") || target.closest(".users-actions-trigger"))) return;
      setActionMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionMenu(null);
    };
    const dismiss = () => setActionMenu(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [actionMenu]);

  function toggleActionMenu(item: AdminUserItem, button: HTMLButtonElement) {
    if (actionMenu?.item.id === item.id) {
      setActionMenu(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuHeight = 148;
    const menuWidth = Math.min(210, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const top = window.innerHeight - rect.bottom < menuHeight + 12
      ? Math.max(8, rect.top - menuHeight - 6)
      : rect.bottom + 6;
    setActionMenu({ item, top, left });
  }

  function userError(code: unknown): string {
    const keys: Record<string, keyof SiteContent> = {
      validation: "users.error.validation",
      email_invalid: "users.error.email_invalid",
      email_duplicate: "users.error.email_duplicate",
      department_invalid: "users.error.department_invalid",
      department_required: "users.error.department_required",
      lock_protection: "users.error.lock_protection",
      password_policy: "users.error.password_policy",
      session: "users.error.session",
      invalid: "users.error.invalid",
      server: "users.error.server",
    };
    return typeof code === "string" && keys[code]
      ? content[keys[code]]
      : content["users.error"];
  }

  function openCreate() {
    setSelected(null);
    setFullName("");
    setEmail("");
    setRole("unit_user");
    setDepartmentCode("");
    setPassword("");
    setTemporaryPassword("");
    setError("");
    setModal("create");
  }

  function openEdit(item: AdminUserItem) {
    setSelected(item);
    setFullName(item.fullName);
    setEmail(item.email);
    setRole(item.role);
    setDepartmentCode(item.departmentCode ?? "");
    setError("");
    setModal("edit");
  }

  function openReset(item: AdminUserItem) {
    if (item.id === actorId) {
      setNotice(content["users.self.reset"]);
      return;
    }
    setSelected(item);
    setTemporaryPassword("");
    setError("");
    setModal("reset");
  }

  async function saveCreate(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        email,
        role,
        departmentCode: role === "unit_user" ? departmentCode : null,
        password,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(userError(body.error));
      return;
    }
    setPassword("");
    setTemporaryPassword(body.temporaryPassword);
    setModal("password");
    router.refresh();
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    const response = await fetch(`/api/admin/users/${encodeURIComponent(selected.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "profile", fullName, email }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(userError(body.error));
      return;
    }
    setNotice(content["users.success.profile"]);
    setModal(null);
    router.refresh();
  }

  async function patchUser(
    item: AdminUserItem,
    action: "role" | "department" | "status",
    value: Record<string, unknown>,
  ) {
    setError("");
    setNotice("");
    const response = await fetch(`/api/admin/users/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...value }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(userError(body.error));
      router.refresh();
      return;
    }
    setNotice(content["users.success.saved"]);
    router.refresh();
  }

  async function resetPassword() {
    if (!selected) return;
    setError("");
    const response = await fetch(`/api/admin/users/${encodeURIComponent(selected.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_password" }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(userError(body.error));
      return;
    }
    setTemporaryPassword(body.temporaryPassword);
    setModal("password");
  }

  async function copyTemporaryPassword() {
    if (!temporaryPassword) return;
    await navigator.clipboard.writeText(temporaryPassword);
    setNotice(content["users.success.copied"]);
  }

  async function generatePassword() {
    setError("");
    const response = await fetch("/api/admin/users/generate", {
      method: "POST",
    });
    const body = await response.json();
    if (!response.ok) {
      setError(userError(body.error));
      return;
    }
    setPassword(body.password);
  }

  function beginRoleChange(item: AdminUserItem, nextRole: "admin" | "unit_user") {
    setSelected(item);
    setPendingDepartment(item.departmentCode ?? "");
    setPendingChange({
      item,
      action: "role",
      role: nextRole,
      departmentCode: item.departmentCode ?? "",
    });
    setModal("confirm_change");
  }

  function beginDepartmentChange(item: AdminUserItem, nextDepartment: string) {
    setSelected(item);
    setPendingChange({ item, action: "department", departmentCode: nextDepartment });
    setModal("confirm_change");
  }

  function beginStatusChange(item: AdminUserItem) {
    setSelected(item);
    setPendingChange({ item, action: "status", isActive: !item.isActive });
    setModal("confirm_change");
  }

  async function confirmPendingChange() {
    if (!pendingChange) return;
    if (pendingChange.action === "role") {
      await patchUser(pendingChange.item, "role", {
        role: pendingChange.role,
        departmentCode: pendingChange.role === "unit_user" ? pendingDepartment : null,
      });
    } else if (pendingChange.action === "department") {
      await patchUser(pendingChange.item, "department", {
        departmentCode: pendingChange.departmentCode,
      });
    } else {
      await patchUser(pendingChange.item, "status", { isActive: pendingChange.isActive });
    }
    setPendingChange(null);
    setModal(null);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const start = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const end = Math.min(data.page * data.pageSize, data.total);
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (initialFilters.search) params.set("q", initialFilters.search);
    if (initialFilters.status !== "all") params.set("status", initialFilters.status);
    if (initialFilters.role !== "all") params.set("role", initialFilters.role);
    params.set("page", String(page));
    return `/admin/users?${params.toString()}`;
  };

  function closeModal() {
    setModal(null);
    setPassword("");
    if (modal === "password") setTemporaryPassword("");
    setPendingChange(null);
    setPendingDepartment("");
  }

  return (
    <div className="admin-users-page">
      <section className="users-title-card">
        <div>
          <h1>{content["users.title"]}</h1>
          <p>{content["users.description"].replace("{count}", data.total.toLocaleString("th-TH"))}</p>
        </div>
        <button type="button" className="users-add-button" onClick={openCreate}>
          <UserPlus aria-hidden="true" size={18} />
          {content["users.add"]}
        </button>
      </section>

      {notice ? <p className="users-success" role="status">{notice}</p> : null}
      {error ? <p className="users-error" role="alert">{error}</p> : null}

      <form className="users-filter-card" onSubmit={(event: FormEvent) => { event.preventDefault(); if (searchTimer.current) clearTimeout(searchTimer.current); navigateFilters({ ...userFilters, search: filterSearch }, "replace"); }}>
        <input
          aria-label={content["users.search.placeholder"]}
          name="q"
          type="search"
          value={filterSearch}
          onChange={(event) => {
            const value = event.target.value;
            setFilterSearch(value);
            if (searchTimer.current) clearTimeout(searchTimer.current);
            searchTimer.current = setTimeout(() => navigateFilters({ ...userFilters, search: value }, "replace"), 350);
          }}
          placeholder={content["users.search.placeholder"]}
        />
        <select aria-label={content["users.filter.status"]} name="status" value={userFilters.status} onChange={(event) => navigateFilters({ ...userFilters, status: event.target.value as typeof userFilters.status }, "push")}>
          <option value="all">{content["users.filter.status.all"]}</option>
          <option value="active">{content["users.filter.status.active"]}</option>
          <option value="inactive">{content["users.filter.status.inactive"]}</option>
        </select>
        <select aria-label={content["users.filter.role"]} name="role" value={userFilters.role} onChange={(event) => navigateFilters({ ...userFilters, role: event.target.value as typeof userFilters.role }, "push")}>
          <option value="all">{content["users.filter.role.all"]}</option>
          <option value="admin">{content["users.filter.role.admin"]}</option>
          <option value="unit_user">{content["users.filter.role.unit"]}</option>
        </select>
        <ClearFiltersButton href="/admin/users" label={content["users.filter.clear"]} />
      </form>

      <section className="users-table-card" aria-busy={filterPending}>
        {filterPending ? <div className="filter-loading-bar" aria-hidden="true" /> : null}
        <p className="sr-only" aria-live="polite">{content["users.pagination"].replace("{start}", String(start)).replace("{end}", String(end)).replace("{total}", String(data.total))}</p>
        {data.items.length === 0 ? (
          <div className="users-empty">
            <p>{content["users.empty"]}</p>
            <ClearFiltersButton href="/admin/users" label={content["users.filter.clear"]} />
          </div>
        ) : (
          <>
            <table className="users-table">
              <thead>
                <tr>
                  <th>{content["users.column.name"]}</th>
                  <th>{content["users.column.email"]}</th>
                  <th>{content["users.column.role"]}</th>
                  <th>{content["users.column.department"]}</th>
                  <th>{content["users.column.last_login"]}</th>
                  <th>{content["users.column.status"]}</th>
                  <th>{content["users.column.actions"]}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td data-label={content["users.column.name"]}>
                      <strong>
                        {item.fullName}
                        {item.id === actorId ? <span className="users-you"> {content["users.you"]}</span> : null}
                      </strong>
                    </td>
                    <td data-label={content["users.column.email"]}>{item.email}</td>
                    <td data-label={content["users.column.role"]}>
                      <select
                        value={item.role}
                        disabled={item.id === actorId}
                        title={item.id === actorId ? content["users.self.role"] : undefined}
                        onChange={(event) => {
                          beginRoleChange(item, event.target.value as "admin" | "unit_user");
                        }}
                      >
                        <option value="admin">{content["users.filter.role.admin"]}</option>
                        <option value="unit_user">{content["users.filter.role.unit"]}</option>
                      </select>
                    </td>
                    <td data-label={content["users.column.department"]}>
                      {item.departmentCode && !isActiveDepartment(departments, item.departmentCode) ? (
                        <span className="users-department-inactive">
                          {item.departmentName ?? item.departmentCode} {content["form.option.inactive"]}
                        </span>
                      ) : null}
                      <select
                        value={isActiveDepartment(departments, item.departmentCode) ? item.departmentCode ?? "" : ""}
                        disabled={item.role === "admin"}
                        onChange={(event) => {
                          beginDepartmentChange(item, event.target.value);
                        }}
                      >
                        {item.role === "admin" ? <option value="">{content["users.department.none"]}</option> : null}
                        {item.departmentCode && !isActiveDepartment(departments, item.departmentCode) && item.role !== "admin" ? (
                          <option value="">{content["users.department.select"]}</option>
                        ) : null}
                        {departments.map((department) => (
                          <option key={department.code} value={department.code}>
                            {department.code} {department.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label={content["users.column.last_login"]}>{formatThaiDate(item.lastLoginAt)}</td>
                    <td data-label={content["users.column.status"]}>
                      <span className={item.isActive ? "users-status users-status-active" : "users-status users-status-inactive"}>
                        {item.isActive ? content["users.status.active"] : content["users.status.inactive"]}
                      </span>
                    </td>
                    <td data-label={content["users.column.actions"]}>
                      <div className="users-actions">
                        <button type="button" className="users-actions-trigger" aria-label={content["users.menu.label"]} title={content["users.menu.label"]} aria-expanded={actionMenu?.item.id === item.id} onClick={(event) => toggleActionMenu(item, event.currentTarget)}>
                          <MoreHorizontal size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <footer className="users-pagination">
              <span>{content["users.pagination"].replace("{start}", String(start)).replace("{end}", String(end)).replace("{total}", String(data.total))}</span>
              <nav>
                {data.page > 1 ? <a href={pageHref(data.page - 1)}>{content["users.pagination.previous"]}</a> : null}
                {data.page < totalPages ? <a href={pageHref(data.page + 1)}>{content["users.pagination.next"]}</a> : null}
              </nav>
            </footer>
          </>
        )}
      </section>

      {actionMenu && typeof document !== "undefined" ? createPortal(
        <div className="users-actions-menu" role="menu" style={{ top: actionMenu.top, left: actionMenu.left }}>
          <button type="button" role="menuitem" onClick={() => { setActionMenu(null); openEdit(actionMenu.item); }}>{content["users.menu.edit"]}</button>
          <button type="button" role="menuitem" disabled={actionMenu.item.id === actorId} onClick={() => { setActionMenu(null); openReset(actionMenu.item); }} title={actionMenu.item.id === actorId ? content["users.self.reset"] : undefined}>
            {content["users.menu.reset"]}
          </button>
          <button type="button" role="menuitem" disabled={actionMenu.item.id === actorId} title={actionMenu.item.id === actorId ? content["users.self.disable"] : undefined} onClick={() => { setActionMenu(null); beginStatusChange(actionMenu.item); }}>
            {actionMenu.item.isActive ? content["users.menu.disable"] : content["users.menu.enable"]}
          </button>
        </div>, document.body) : null}

      {(modal === "create" || modal === "edit") ? (
        <div className="users-modal-backdrop" role="presentation">
          <section className="users-modal" role="dialog" aria-modal="true">
            <button className="users-modal-close" type="button" aria-label={content["users.modal.close"]} onClick={closeModal}><X size={18} /></button>
            <h2>{modal === "create" ? content["users.create.title"] : content["users.edit.title"]}</h2>
            <form onSubmit={modal === "create" ? saveCreate : saveProfile}>
              <label>
                <span>{content["users.create.full_name"]}</span>
                <input value={fullName} minLength={2} maxLength={150} onChange={(event) => setFullName(event.target.value)} required />
              </label>
              <label>
                <span>{content["users.create.email"]}</span>
                <input type="email" value={email} maxLength={190} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              {modal === "create" ? (
                <>
                  <label>
                    <span>{content["users.create.role"]}</span>
                    <select value={role} onChange={(event) => setRole(event.target.value as "admin" | "unit_user")}>
                      <option value="admin">{content["users.filter.role.admin"]}</option>
                      <option value="unit_user">{content["users.filter.role.unit"]}</option>
                    </select>
                  </label>
                  {role === "unit_user" ? (
                    <label>
                      <span>{content["users.create.department"]}</span>
                      <select value={departmentCode} onChange={(event) => setDepartmentCode(event.target.value)} required>
                        <option value="">{content["users.department.select"]}</option>
                        {departments.map((department) => (
                          <option key={department.code} value={department.code}>{department.code} {department.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label>
                    <span>{content["users.create.password"]}</span>
                    <input type="text" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={content["users.password.auto_placeholder"]} />
                  </label>
                  <button type="button" className="users-generate" onClick={generatePassword}>{content["users.create.generate"]}</button>
                </>
              ) : null}
              {error ? <p className="users-error" role="alert">{error}</p> : null}
              <button type="submit" className="users-modal-save">{modal === "create" ? content["users.create.submit"] : content["users.confirm.save"]}</button>
            </form>
          </section>
        </div>
      ) : null}

      {modal === "reset" && selected ? (
        <div className="users-modal-backdrop" role="presentation">
          <section className="users-modal users-confirm-modal" role="dialog" aria-modal="true">
            <h2>{content["users.reset.confirm"].replace("{name}", selected.fullName)}</h2>
            {error ? <p className="users-error" role="alert">{error}</p> : null}
            <button type="button" className="users-modal-save" onClick={resetPassword}>{content["users.confirm.save"]}</button>
            <button type="button" className="users-modal-cancel" onClick={() => setModal(null)}>{content["users.confirm.cancel"]}</button>
          </section>
        </div>
      ) : null}

      {modal === "password" ? (
        <div className="users-modal-backdrop" role="presentation">
          <section className="users-modal" role="dialog" aria-modal="true">
            <h2>{content["users.temporary.title"]}</h2>
            <input className="users-temp-password" readOnly value={temporaryPassword} />
            <p>{content["users.temporary.warning"]}</p>
            <button type="button" className="users-modal-save" onClick={copyTemporaryPassword}>{content["users.temporary.copy"]}</button>
            <button type="button" className="users-modal-cancel" onClick={closeModal}>{content["users.confirm.cancel"]}</button>
          </section>
        </div>
      ) : null}

      {modal === "confirm_change" && pendingChange ? (
        <div className="users-modal-backdrop" role="presentation">
          <section className="users-modal users-confirm-modal" role="dialog" aria-modal="true">
            <h2>
              {pendingChange.action === "role"
                ? pendingChange.role === "unit_user" && !pendingChange.item.departmentCode
                  ? content["users.confirm.change_role_department"].replace("{name}", pendingChange.item.fullName)
                  : interpolate(content["users.confirm.change_role"], {
                      name: pendingChange.item.fullName,
                      before: content[`users.filter.role.${pendingChange.item.role === "admin" ? "admin" : "unit"}`],
                      after: content[`users.filter.role.${pendingChange.role === "admin" ? "admin" : "unit"}`],
                    })
                : pendingChange.action === "department"
                  ? interpolate(content["users.confirm.change_department"], {
                      name: pendingChange.item.fullName,
                      department: departments.find((entry) => entry.code === pendingChange.departmentCode)?.name
                        ?? (pendingChange.departmentCode === pendingChange.item.departmentCode
                          ? pendingChange.item.departmentName ?? pendingChange.departmentCode
                          : null)
                        ?? content["users.department.none"],
                    })
                  : interpolate(content[pendingChange.isActive ? "users.confirm.enable" : "users.confirm.disable"], {
                      name: pendingChange.item.fullName,
                    })}
            </h2>
            {pendingChange.action === "role" && pendingChange.role === "unit_user" && !pendingChange.item.departmentCode ? (
              <label>
                <span>{content["users.create.department"]}</span>
                <select value={pendingDepartment} onChange={(event) => setPendingDepartment(event.target.value)} required>
                  <option value="">{content["users.department.select"]}</option>
                  {departments.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} {entry.name}</option>)}
                </select>
              </label>
            ) : null}
            {error ? <p className="users-error" role="alert">{error}</p> : null}
            <button type="button" className="users-modal-save" disabled={pendingChange.action === "role" && pendingChange.role === "unit_user" && !pendingDepartment} onClick={() => void confirmPendingChange()}>{content["users.confirm.save"]}</button>
            <button type="button" className="users-modal-cancel" onClick={closeModal}>{content["users.confirm.cancel"]}</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
