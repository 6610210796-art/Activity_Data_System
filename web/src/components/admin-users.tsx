"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { UserPlus, MoreHorizontal, X } from "lucide-react";
import type { SiteContent } from "@/lib/content";
import type {
  AdminUserItem,
  DepartmentOption,
} from "@/lib/admin-users-data";

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
  const [datePart, timePart] = value.split(" ");
  if (!datePart) return "-";
  const [year, month, day] = datePart.split("-").map(Number);
  const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  return `${day} ${months[month - 1]} ${year + 543}${timePart ? ` ${timePart.slice(0, 5)} น.` : ""}`;
}

export function AdminUsers({
  content,
  data,
  departments,
  actorId,
  initialFilters,
}: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<"create" | "edit" | "reset" | "password" | null>(null);
  const [selected, setSelected] = useState<AdminUserItem | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "unit_user">("unit_user");
  const [departmentCode, setDepartmentCode] = useState("");
  const [password, setPassword] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
      setNotice("ไม่สามารถรีเซ็ตรหัสผ่านของตัวเองได้");
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
      setError(body.message ?? content["users.error"]);
      return;
    }
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
      setError(body.message ?? content["users.error"]);
      return;
    }
    setNotice("แก้ไขข้อมูลสำเร็จ");
    setModal(null);
    router.refresh();
  }

  async function patchUser(
    item: AdminUserItem,
    action: "role" | "department" | "status",
    value: unknown,
  ) {
    setError("");
    setNotice("");
    const response = await fetch(`/api/admin/users/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value ? { action, ...value as object } : { action }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.message ?? content["users.error"]);
      router.refresh();
      return;
    }
    setNotice("บันทึกสำเร็จ");
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
      setError(body.message ?? content["users.error"]);
      return;
    }
    setTemporaryPassword(body.temporaryPassword);
    setModal("password");
  }

  async function copyTemporaryPassword() {
    if (!temporaryPassword) return;
    await navigator.clipboard.writeText(temporaryPassword);
    setNotice("คัดลอกรหัสผ่านแล้ว");
  }

  async function generatePassword() {
    setError("");
    const response = await fetch("/api/admin/users/generate", {
      method: "POST",
    });
    const body = await response.json();
    if (!response.ok) {
      setError(content["users.error"]);
      return;
    }
    setPassword(body.password);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const start = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const end = Math.min(data.page * data.pageSize, data.total);

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

      <form className="users-filter-card" method="get" action="/admin/users">
        <input
          name="q"
          type="search"
          defaultValue={initialFilters.search}
          placeholder={content["users.search.placeholder"]}
        />
        <select name="status" defaultValue={initialFilters.status}>
          <option value="all">{content["users.filter.status.all"]}</option>
          <option value="active">{content["users.filter.status.active"]}</option>
          <option value="inactive">{content["users.filter.status.inactive"]}</option>
        </select>
        <select name="role" defaultValue={initialFilters.role}>
          <option value="all">{content["users.filter.role.all"]}</option>
          <option value="admin">{content["users.filter.role.admin"]}</option>
          <option value="unit_user">{content["users.filter.role.unit"]}</option>
        </select>
        <button type="submit">ค้นหา</button>
      </form>

      <section className="users-table-card">
        {data.items.length === 0 ? (
          <div className="users-empty">{content["users.empty"]}</div>
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
                        title={item.id === actorId ? "ไม่สามารถลดสิทธิ์บัญชีตัวเองได้" : undefined}
                        onChange={(event) => {
                          const nextRole = event.target.value as "admin" | "unit_user";
                          if (nextRole === "unit_user" && !item.departmentCode) {
                            const code = window.prompt("กรุณาเลือกหน่วยงานก่อน เปลี่ยนสิทธิ์เป็นผู้ใช้ประจำหน่วยงาน");
                            if (!code) {
                              router.refresh();
                              return;
                            }
                            if (!window.confirm(`ยืนยันเปลี่ยนสิทธิ์และหน่วยงานของ ${item.fullName} หรือไม่?`)) {
                              router.refresh();
                              return;
                            }
                            void patchUser(item, "role", { role: nextRole, departmentCode: code });
                            return;
                          }
                          if (window.confirm(`ยืนยันเปลี่ยนสิทธิ์ของ ${item.fullName} จาก ${item.role} เป็น ${nextRole} หรือไม่?`)) {
                            void patchUser(item, "role", { role: nextRole, departmentCode: nextRole === "unit_user" ? item.departmentCode : null });
                          } else {
                            router.refresh();
                          }
                        }}
                      >
                        <option value="admin">{content["users.filter.role.admin"]}</option>
                        <option value="unit_user">{content["users.filter.role.unit"]}</option>
                      </select>
                    </td>
                    <td data-label={content["users.column.department"]}>
                      <select
                        value={item.departmentCode ?? ""}
                        disabled={item.role === "admin"}
                        onChange={(event) => {
                          const code = event.target.value;
                          if (!window.confirm(`ยืนยันเปลี่ยนหน่วยงานของ ${item.fullName} เป็น ${code || "ไม่สังกัดหน่วยงาน"} หรือไม่?`)) {
                            router.refresh();
                            return;
                          }
                          void patchUser(item, "department", { departmentCode: code });
                        }}
                      >
                        {item.role === "admin" ? <option value="">ไม่สังกัดหน่วยงาน</option> : null}
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
                      <details className="users-actions">
                        <summary aria-label="เมนูจัดการ" title="เมนูจัดการ"><MoreHorizontal size={18} /></summary>
                        <div>
                          <button type="button" onClick={() => openEdit(item)}>{content["users.menu.edit"]}</button>
                          <button type="button" disabled={item.id === actorId} onClick={() => openReset(item)} title={item.id === actorId ? "ไม่สามารถรีเซ็ตรหัสผ่านของตัวเองได้" : undefined}>
                            {content["users.menu.reset"]}
                          </button>
                          <button
                            type="button"
                            disabled={item.id === actorId}
                            title={item.id === actorId ? "ไม่สามารถปิดการใช้งานบัญชีตัวเองได้" : undefined}
                            onClick={() => {
                              if (window.confirm(`${item.isActive ? "ยืนยันปิดการใช้งาน" : "ยืนยันเปิดการใช้งาน"}บัญชี ${item.fullName} หรือไม่?`)) {
                                void patchUser(item, "status", { isActive: !item.isActive });
                              }
                            }}
                          >
                            {item.isActive ? content["users.menu.disable"] : content["users.menu.enable"]}
                          </button>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <footer className="users-pagination">
              <span>{content["users.pagination"].replace("{start}", String(start)).replace("{end}", String(end)).replace("{total}", String(data.total))}</span>
              <nav>
                {data.page > 1 ? <a href={`/admin/users?page=${data.page - 1}`}>ก่อนหน้า</a> : null}
                {data.page < totalPages ? <a href={`/admin/users?page=${data.page + 1}`}>ถัดไป</a> : null}
              </nav>
            </footer>
          </>
        )}
      </section>

      {(modal === "create" || modal === "edit") ? (
        <div className="users-modal-backdrop" role="presentation">
          <section className="users-modal" role="dialog" aria-modal="true">
            <button className="users-modal-close" type="button" aria-label="ปิด" onClick={() => setModal(null)}><X size={18} /></button>
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
                        <option value="">กรุณาเลือกหน่วยงาน</option>
                        {departments.map((department) => (
                          <option key={department.code} value={department.code}>{department.code} {department.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label>
                    <span>{content["users.create.password"]}</span>
                    <input type="text" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="เว้นว่างเพื่อสร้างให้อัตโนมัติ" />
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
            <button type="button" className="users-modal-cancel" onClick={() => setModal(null)}>{content["users.confirm.cancel"]}</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
