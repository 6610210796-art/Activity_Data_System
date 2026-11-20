import type { Metadata } from "next";
import "./globals.css";
import { getSiteContent } from "@/lib/content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getSiteContent(["app.name", "app.org"]);
  return {
    title: content["app.name"],
    description: content["app.org"],
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
