"use client";

import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import type { SiteContent } from "@/lib/content";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  autoComplete: string;
  minLength?: number;
  visible: boolean;
  toggleLabel: string;
  onToggle: () => void;
};

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  visible,
  toggleLabel,
  onToggle,
}: PasswordFieldProps) {
  return (
    <div className="account-password-field">
      <label htmlFor={id}>{label}</label>
      <div className="account-password-input-wrap">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          value={value}
          onChange={onChange}
          required
        />
        <button
          type="button"
          className="account-password-visibility"
          aria-label={toggleLabel}
          aria-pressed={visible}
          onClick={onToggle}
        >
          {visible ? <EyeOff aria-hidden="true" size={19} /> : <Eye aria-hidden="true" size={19} />}
        </button>
      </div>
    </div>
  );
}

export function ChangePasswordForm({
  content,
}: {
  content: SiteContent;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visibleFields, setVisibleFields] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function passwordError(code: unknown): string {
    const keys: Record<string, keyof SiteContent> = {
      confirmation: "account.password.confirmation",
      locked: "account.password.locked",
      current_password: "account.password.current.invalid",
      same_password: "account.password.same",
      password_policy: "account.password.policy",
      session: "account.password.session",
    };
    return typeof code === "string" && keys[code]
      ? content[keys[code]]
      : content["account.password.error"];
  }

  function toggleVisibility(field: keyof typeof visibleFields) {
    setVisibleFields((current) => ({ ...current, [field]: !current[field] }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(passwordError(body.error));
        return;
      }
      window.alert(content["account.password.success"]);
      router.replace("/login");
      router.refresh();
    } catch {
      setError(content["account.password.error"]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="account-password-page">
      <div className="account-password-card">
        <h1>{content["account.password.title"]}</h1>
        <p>{content["account.password.description"]}</p>
        <form className="account-password-form" onSubmit={submit}>
          <PasswordField
            id="current-password"
            label={content["account.password.current"]}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            visible={visibleFields.current}
            toggleLabel={content[visibleFields.current ? "account.password.hide_password" : "account.password.show_password"]}
            onToggle={() => toggleVisibility("current")}
          />
          <PasswordField
            id="new-password"
            label={content["account.password.new"]}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            minLength={10}
            visible={visibleFields.next}
            toggleLabel={content[visibleFields.next ? "account.password.hide_password" : "account.password.show_password"]}
            onToggle={() => toggleVisibility("next")}
          />
          <PasswordField
            id="confirm-password"
            label={content["account.password.confirm"]}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={10}
            visible={visibleFields.confirm}
            toggleLabel={content[visibleFields.confirm ? "account.password.hide_password" : "account.password.show_password"]}
            onToggle={() => toggleVisibility("confirm")}
          />
          {error ? <p className="account-password-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={submitting}>
            {submitting
              ? content["account.password.submitting"]
              : content["account.password.submit"]}
          </button>
        </form>
      </div>
    </section>
  );
}
