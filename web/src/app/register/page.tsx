import Link from "next/link";
import Image from "next/image";
import { UserRoundPlus } from "lucide-react";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/register-form";
import { getCurrentUser } from "@/lib/auth";
import { getDepartmentOptions } from "@/lib/admin-users-data";
import { getSiteContent } from "@/lib/content";

export const dynamic = "force-dynamic";

const contentKeys = [
  "app.name",
  "app.org",
  "register.title",
  "register.description",
  "register.full_name",
  "register.full_name.placeholder",
  "register.email",
  "register.email.placeholder",
  "register.department",
  "register.department.placeholder",
  "register.password",
  "register.password.placeholder",
  "register.confirm_password",
  "register.confirm_password.placeholder",
  "register.submit",
  "register.submitting",
  "register.error.validation",
  "register.error.email_invalid",
  "register.error.email_duplicate",
  "register.error.department_invalid",
  "register.error.password_policy",
  "register.error.password_mismatch",
  "register.error.rate_limit",
  "register.error.server",
  "register.error.generic",
  "login.password.show",
  "login.password.hide",
] as const;

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  const [content, departments] = await Promise.all([
    getSiteContent(contentKeys),
    getDepartmentOptions(),
  ]);

  return (
    <main className="login-page">
      <div className="login-wrap">
        <div className="login-heading">
          <div className="login-mark">
            <Image
              alt="RSP South"
              className="login-logo"
              height={235}
              src="/rsp-south-logo.png"
              width={600}
            />
          </div>
          <h1>{content["register.title"]}</h1>
          <p>{content["app.name"]} · {content["app.org"]}</p>
        </div>
        <section aria-label={content["register.title"]} className="login-card">
          <div className="login-card-brand">
            <UserRoundPlus aria-hidden="true" size={19} />
            <span>{content["register.description"]}</span>
          </div>
          <RegisterForm content={content} departments={departments} />
          <Link className="mx-auto mt-6 block w-fit text-base font-medium text-blue-600 hover:underline" href="/login">
            {content["register.back"]}
          </Link>
        </section>
      </div>
    </main>
  );
}
