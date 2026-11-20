import { FlaskConical, LogIn } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";
import { getSiteContent } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) {
    redirect("/");
  }

  const content = await getSiteContent([
    "app.name",
    "app.org",
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
  ]);

  return (
    <main className="login-page">
      <div className="login-wrap">
        <div className="login-heading">
          <div aria-hidden="true" className="login-mark">
            <FlaskConical size={27} />
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

          <LoginForm
            labels={{
              email: content["login.email"],
              emailPlaceholder: content["login.email.placeholder"],
              password: content["login.password"],
              passwordPlaceholder: content["login.password.placeholder"],
              submit: content["login.submit"],
              genericError: content["login.error.generic"],
              serverError: content["login.error.server"],
            }}
          />

          <p className="login-notice">{content["login.notice"]}</p>
        </section>
      </div>
    </main>
  );
}
