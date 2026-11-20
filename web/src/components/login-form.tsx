"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AtSign, LockKeyhole, LogIn } from "lucide-react";

interface LoginFormProps {
  labels: {
    email: string;
    emailPlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    submit: string;
    genericError: string;
    serverError: string;
  };
}

export function LoginForm({ labels }: LoginFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });

      if (response.ok) {
        router.replace("/");
        return;
      }

      const result = (await response.json()) as { message?: string };
      setError(result.message || labels.genericError);
    } catch {
      setError(labels.serverError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          {labels.email}
        </span>
        <span className="input-wrap">
          <AtSign aria-hidden="true" size={18} />
          <input
            autoComplete="username"
            className="login-input"
            name="email"
            placeholder={labels.emailPlaceholder}
            required
            type="email"
          />
        </span>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          {labels.password}
        </span>
        <span className="input-wrap">
          <LockKeyhole aria-hidden="true" size={18} />
          <input
            autoComplete="current-password"
            className="login-input"
            name="password"
            placeholder={labels.passwordPlaceholder}
            required
            type="password"
          />
        </span>
      </label>

      {error ? (
        <p
          aria-live="polite"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        className="primary-button flex w-full items-center justify-center gap-2"
        disabled={isSubmitting}
        type="submit"
      >
        <LogIn aria-hidden="true" size={17} />
        {labels.submit}
      </button>
    </form>
  );
}
