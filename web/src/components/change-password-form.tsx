"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { SiteContent } from "@/lib/content";

export function ChangePasswordForm({
  content,
}: {
  content: SiteContent;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        setError(body.message ?? content["account.password.error"]);
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
        <form onSubmit={submit}>
          <label>
            <span>{content["account.password.current"]}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            <span>{content["account.password.new"]}</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label>
            <span>{content["account.password.confirm"]}</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
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
