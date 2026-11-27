"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Eye, EyeOff, LockKeyhole, LogIn, Mail } from "lucide-react";

interface LoginFormProps {
  labels: {
    email: string;
    emailPlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    submit: string;
    genericError: string;
    serverError: string;
    forgot: string;
    forgotTitle: string;
    forgotSubmit: string;
    forgotBack: string;
    forgotSuccess: string;
    forgotUnavailable: string;
    submitting: string;
    showPassword: string;
    hidePassword: string;
  };
}

export function LoginForm({ labels }: LoginFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function openForgotPassword() {
    setError("");
    setNotice("");
    setIsForgotPassword(true);
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.get("email") }),
      });
      if (!response.ok) {
        setError(labels.forgotUnavailable);
        return;
      }
      setNotice(labels.forgotSuccess);
    } catch {
      setError(labels.serverError);
    } finally {
      setIsSubmitting(false);
    }
  }

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

  if (isForgotPassword) {
    return (
      <form className="space-y-5" onSubmit={requestReset}>
        <h2 className="text-lg font-bold text-[#0B3D7A]">{labels.forgotTitle}</h2>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">{labels.email}</span>
          <span className="input-wrap">
            <AtSign aria-hidden="true" size={18} />
            <input autoComplete="email" className="login-input" name="email" placeholder={labels.emailPlaceholder} required type="email" />
          </span>
        </label>
        {notice ? <p aria-live="polite" className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800" role="status">{notice}</p> : null}
        {error ? <p aria-live="polite" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}
        <button className="primary-button flex w-full items-center justify-center gap-2" disabled={isSubmitting} type="submit">
          <Mail aria-hidden="true" size={17} />
          {isSubmitting ? labels.submitting : labels.forgotSubmit}
        </button>
        <button className="mx-auto block text-sm font-medium text-blue-700 hover:underline" onClick={() => { setIsForgotPassword(false); setError(""); setNotice(""); }} type="button">
          {labels.forgotBack}
        </button>
      </form>
    );
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
            type={showPassword ? "text" : "password"}
          />
          <button aria-label={showPassword ? labels.hidePassword : labels.showPassword} aria-pressed={showPassword} className="password-visibility" onClick={() => setShowPassword((value) => !value)} type="button">
            {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
          </button>
        </span>
      </label>

      <div className="-mt-3 flex justify-end">
        <button className="text-sm text-blue-600 hover:underline" onClick={openForgotPassword} type="button">{labels.forgot}</button>
      </div>

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
