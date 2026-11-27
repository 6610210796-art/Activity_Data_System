"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, LogIn } from "lucide-react";

interface Props {
  token: string;
  labels: {
    title: string;
    description: string;
    newPassword: string;
    confirmPassword: string;
    submit: string;
    cancel: string;
    success: string;
    invalid: string;
    mismatch: string;
    policy: string;
    submitting: string;
    showPassword: string;
    hidePassword: string;
  };
}

export function PasswordResetForm({ token, labels }: Props) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [visible, setVisible] = useState({ next: false, confirm: false });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      setError(labels.mismatch);
      return;
    }
    if (newPassword.length < 10) {
      setError(labels.policy);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error === "password_policy" ? labels.policy : labels.invalid);
        return;
      }
      setSuccess(true);
    } catch {
      setError(labels.invalid);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="password-reset-title" className="login-card">
      <div className="login-card-brand">
        <KeyRound aria-hidden="true" size={19} />
        <span>{labels.description}</span>
      </div>
      <h2 className="mb-5 text-lg font-bold text-[#0B3D7A]" id="password-reset-title">{labels.title}</h2>
      {success ? (
        <div className="space-y-5">
          <p aria-live="polite" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800" role="status">{labels.success}</p>
          <Link className="primary-button flex w-full items-center justify-center gap-2" href="/login">
            <LogIn aria-hidden="true" size={17} />
            {labels.cancel}
          </Link>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          {(["newPassword", "confirmPassword"] as const).map((field) => {
            const isNew = field === "newPassword";
            const shown = isNew ? visible.next : visible.confirm;
            const setShown = () => setVisible((current) => ({ ...current, [isNew ? "next" : "confirm"]: !shown }));
            return (
              <label className="block" key={field}>
                <span className="mb-2 block text-sm font-semibold text-slate-700">{isNew ? labels.newPassword : labels.confirmPassword}</span>
                <span className="input-wrap">
                  <KeyRound aria-hidden="true" size={18} />
                  <input
                    autoComplete="new-password"
                    className="login-input"
                    minLength={10}
                    name={field}
                    required
                    type={shown ? "text" : "password"}
                  />
                  <button aria-label={shown ? labels.hidePassword : labels.showPassword} aria-pressed={shown} className="password-visibility" onClick={setShown} type="button">
                    {shown ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                  </button>
                </span>
              </label>
            );
          })}
          {error ? <p aria-live="polite" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}
          <button className="primary-button flex w-full items-center justify-center gap-2" disabled={submitting} type="submit">
            <KeyRound aria-hidden="true" size={17} />
            {submitting ? labels.submitting : labels.submit}
          </button>
          <Link className="mx-auto block w-fit text-sm font-medium text-blue-700 hover:underline" href="/login">{labels.cancel}</Link>
        </form>
      )}
    </section>
  );
}
