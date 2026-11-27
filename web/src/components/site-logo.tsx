import Image from "next/image";
import { getSiteAssetView } from "@/lib/site-assets";

interface SiteLogoProps {
  fallbackAlt: string;
  className: string;
  sizes?: string;
}

export async function SiteLogo({ fallbackAlt, className, sizes }: SiteLogoProps) {
  const logo = await getSiteAssetView("logo", fallbackAlt);
  return (
    <Image
      alt={logo.alt}
      className={className}
      height={235}
      sizes={sizes}
      src={logo.src}
      unoptimized
      width={600}
    />
  );
}
