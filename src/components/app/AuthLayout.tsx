import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/app/ui-bits";

export function AuthLayout({
  title,
  subtitle,
  badge,
  tone = "water",
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  badge: string;
  tone?: "water" | "navy";
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-sky">
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pt-6">
        <Logo />
        <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Home
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md overflow-hidden rounded-3xl border bg-card shadow-card">
          <div className={(tone === "navy" ? "bg-deep" : "bg-water") + " px-6 py-6 text-primary-foreground"}>
            <span className="rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase">
              {badge}
            </span>
            <h1 className="mt-3 text-2xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm opacity-85">{subtitle}</p>
          </div>
          <div className="p-6">{children}</div>
        </div>
      </div>
      {footer && <div className="pb-8 text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}
