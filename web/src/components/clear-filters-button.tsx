import Link from "next/link";
import { FilterX } from "lucide-react";
import type { MouseEventHandler } from "react";

type ClearFiltersButtonProps = {
  label: string;
  className?: string;
} & (
  | { href: string; onClick?: never }
  | { href?: never; onClick: MouseEventHandler<HTMLButtonElement> }
);

export function ClearFiltersButton({ label, className = "", ...action }: ClearFiltersButtonProps) {
  const classes = ["clear-filters-button", className].filter(Boolean).join(" ");
  const icon = <FilterX aria-hidden="true" size={16} />;

  if ("href" in action && action.href) {
    return <Link className={classes} href={action.href}>{icon}<span>{label}</span></Link>;
  }

  return <button className={classes} onClick={action.onClick} type="button">{icon}<span>{label}</span></button>;
}
