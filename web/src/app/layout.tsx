import type { Metadata } from "next";
import { Bebas_Neue } from "next/font/google";
import "./globals.css";
import { getSiteContent } from "@/lib/content";

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
  display: "swap",
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getSiteContent(["app.name", "app.org"]);
  return {
    title: content["app.name"],
    description: content["app.org"],
    icons: {
      icon: "/rsp-south-logo.png",
      shortcut: "/rsp-south-logo.png",
    },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={bebasNeue.variable}>
      <body>{children}</body>
    </html>
  );
}
