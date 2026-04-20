import Link from "next/link";
import { clsx } from "clsx";
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";

const styles =
  "inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-60";
const variants = {
  primary: "bg-[#1f6f50] text-white hover:bg-[#18583f]",
  secondary: "border border-[#cdd6cf] bg-white text-[#1d2520] hover:bg-[#eef3ee]",
  danger: "bg-[#b42318] text-white hover:bg-[#8f1d14]",
};

type Variant = keyof typeof variants;

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={clsx(styles, variants[variant], className)} {...props} />;
}

export function ButtonLink({
  className,
  variant = "primary",
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: Variant; children: ReactNode }) {
  return (
    <Link className={clsx(styles, variants[variant], className)} {...props}>
      {children}
    </Link>
  );
}
