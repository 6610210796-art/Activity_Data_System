import { LogIn } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { PasswordResetForm } from "@/components/password-reset-form";
import { SiteLogo } from "@/components/site-logo";
import { getCurrentUser } from "@/lib/auth";
import { getSiteContent } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ resetToken?: string | string[]; registered?: string | string[] }>;
}) {
  const params = await searchParams;
  const resetToken = typeof params.resetToken === "string" ? params.resetToken : "";
  const registered = params.registered === "1";
  if (!resetToken && await getCurrentUser()) {
    redirect("/");
  }

  const content = await getSiteContent([
    "app.name",
    "app.org",
    "app.logo.alt",
    "login.title",
    "login.subtitle",
    "login.email",
    "login.email.placeholder",
    "login.password",
    "login.password.placeholder",
    "login.submit",
    "login.notice",
    "login.error.generic",
    "login.error.server",
    "login.forgot",
    "login.forgot.title",
    "login.forgot.submit",
    "login.forgot.back",
    "login.forgot.success",
    "login.forgot.unavailable",
    "login.submitting",
    "login.password.show",
    "login.password.hide",
    "login.register.question",
    "login.register.link",
    "login.register.success",
    "password.reset.title",
    "password.reset.description",
    "password.reset.new",
    "password.reset.confirm",
    "password.reset.submit",
    "password.reset.cancel",
    "password.reset.success",
    "password.reset.invalid",
    "password.reset.password_mismatch",
    "password.reset.password_policy",
  ]);

  return (
    <main className="login-page">
      <div className="login-wrap">
        <div className="login-heading">
          <div className="login-mark">
            <SiteLogo className="login-logo" fallbackAlt={content["app.logo.alt"]} />
          </div>
          <h1>{content["login.title"]}</h1>
          <p>
            {content["app.name"]} · {content["app.org"]}
          </p>
        </div>

        <section aria-label={content["login.title"]} className="login-card">
          <div className="login-card-brand">
            <LogIn aria-hidden="true" size={19} />
            <span>{content["login.subtitle"]}</span>
          </div>

          {resetToken ? (
            <PasswordResetForm
              token={resetToken}
              labels={{
                title: content["password.reset.title"],
                description: content["password.reset.description"],
                newPassword: content["password.reset.new"],
                confirmPassword: content["password.reset.confirm"],
                submit: content["password.reset.submit"],
                cancel: content["password.reset.cancel"],
                success: content["password.reset.success"],
                invalid: content["password.reset.invalid"],
                mismatch: content["password.reset.password_mismatch"],
                policy: content["password.reset.password_policy"],
                submitting: content["login.submitting"],
                showPassword: content["login.password.show"],
                hidePassword: content["login.password.hide"],
              }}
            />
          ) : <LoginForm
            labels={{
              email: content["login.email"],
              emailPlaceholder: content["login.email.placeholder"],
              password: content["login.password"],
              passwordPlaceholder: content["login.password.placeholder"],
              submit: content["login.submit"],
              genericError: content["login.error.generic"],
              serverError: content["login.error.server"],
              forgot: content["login.forgot"],
              forgotTitle: content["login.forgot.title"],
              forgotSubmit: content["login.forgot.submit"],
              forgotBack: content["login.forgot.back"],
              forgotSuccess: content["login.forgot.success"],
              forgotUnavailable: content["login.forgot.unavailable"],
              submitting: content["login.submitting"],
              showPassword: content["login.password.show"],
              hidePassword: content["login.password.hide"],
            }}
          />}

          {!resetToken ? <p className="login-notice">{content["login.notice"]}</p> : null}
          {!resetToken && registered ? (
            <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-base text-green-800" role="status">
              {content["login.register.success"]}
            </p>
          ) : null}
          {!resetToken ? (
            <p className="mt-5 text-center text-base text-slate-600">
              {content["login.register.question"]} {" "}
              <Link className="font-medium text-blue-600 hover:underline" href="/register">
                {content["login.register.link"]}
              </Link>
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
