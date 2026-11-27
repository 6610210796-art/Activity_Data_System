"use client";

import { useRouter } from "next/navigation";
import { AtSign, Building2, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { SiteContent } from "@/lib/content";
import type { DepartmentOption } from "@/lib/admin-users-data";

interface Props {
  content: SiteContent;
  departments: DepartmentOption[];
}

export function RegisterForm({ content, departments }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [visible, setVisible] = useState({ password: false, confirmation: false });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setError(content["register.error.password_mismatch"]);
      return;
    }
    if (password.length < 10) {
      setError(content["register.error.password_policy"]);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.get("fullName"),
          email: form.get("email"),
          departmentCode: form.get("departmentCode"),
          password,
          confirmPassword,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        const errorKey: Record<string, keyof SiteContent> = {
          validation: "register.error.validation",
          email_invalid: "register.error.email_invalid",
          email_duplicate: "register.error.email_duplicate",
          department_invalid: "register.error.department_invalid",
          password_policy: "register.error.password_policy",
          password_mismatch: "register.error.password_mismatch",
          rate_limit: "register.error.rate_limit",
          server: "register.error.server",
        };
        setError(result.error && errorKey[result.error]
          ? content[errorKey[result.error]]
          : content["register.error.generic"]);
        return;
      }
      router.replace("/login?registered=1");
      router.refresh();
    } catch {
      setError(content["register.error.server"]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <label className="block">
        <span className="mb-2 block text-base font-semibold text-slate-700">{content["register.full_name"]}</span>
        <span className="input-wrap">
          <UserRound aria-hidden="true" size={18} />
          <input autoComplete="name" className="login-input" maxLength={150} minLength={2} name="fullName" placeholder={content["register.full_name.placeholder"]} required />
        </span>
      </label>

      <label className="block">
        <span className="mb-2 block text-base font-semibold text-slate-700">{content["register.email"]}</span>
        <span className="input-wrap">
          <AtSign aria-hidden="true" size={18} />
          <input autoComplete="email" className="login-input" maxLength={190} name="email" placeholder={content["register.email.placeholder"]} required type="email" />
        </span>
      </label>

      <label className="block">
        <span className="mb-2 block text-base font-semibold text-slate-700">{content["register.department"]}</span>
        <span className="input-wrap">
          <Building2 aria-hidden="true" size={18} />
          <select className="login-input" defaultValue="" name="departmentCode" required>
            <option disabled value="">{content["register.department.placeholder"]}</option>
            {departments.map((department) => (
              <option key={department.code} value={department.code}>
                {department.code} · {department.name}
              </option>
            ))}
          </select>
        </span>
      </label>

      <label className="block">
        <span className="mb-2 block text-base font-semibold text-slate-700">{content["register.password"]}</span>
        <span className="input-wrap">
          <LockKeyhole aria-hidden="true" size={18} />
          <input autoComplete="new-password" className="login-input" minLength={10} name="password" placeholder={content["register.password.placeholder"]} required type={visible.password ? "text" : "password"} />
          <button aria-label={content[visible.password ? "login.password.hide" : "login.password.show"]} aria-pressed={visible.password} className="password-visibility" onClick={() => setVisible((current) => ({ ...current, password: !current.password }))} type="button">
            {visible.password ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
          </button>
        </span>
      </label>

      <label className="block">
        <span className="mb-2 block text-base font-semibold text-slate-700">{content["register.confirm_password"]}</span>
        <span className="input-wrap">
          <LockKeyhole aria-hidden="true" size={18} />
          <input autoComplete="new-password" className="login-input" minLength={10} name="confirmPassword" placeholder={content["register.confirm_password.placeholder"]} required type={visible.confirmation ? "text" : "password"} />
          <button aria-label={content[visible.confirmation ? "login.password.hide" : "login.password.show"]} aria-pressed={visible.confirmation} className="password-visibility" onClick={() => setVisible((current) => ({ ...current, confirmation: !current.confirmation }))} type="button">
            {visible.confirmation ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
          </button>
        </span>
      </label>

      {error ? <p aria-live="polite" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-700" role="alert">{error}</p> : null}

      <button className="primary-button flex w-full items-center justify-center gap-2" disabled={submitting} type="submit">
        <UserRound aria-hidden="true" size={18} />
        {submitting ? content["register.submitting"] : content["register.submit"]}
      </button>
    </form>
  );
}
