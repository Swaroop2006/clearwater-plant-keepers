import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { History, Home, ListChecks, LogOut, UserRound } from "lucide-react";
import { Logo } from "@/components/app/ui-bits";
import { signOutTo } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/employee", label: "Dashboard", icon: Home, exact: true },
  { to: "/employee/tasks", label: "My Tasks", icon: ListChecks },
  { to: "/employee/history", label: "History", icon: History },
  { to: "/employee/profile", label: "Profile", icon: UserRound },
] as const;

export function EmployeeShell({ name, code, children }: { name: string; code: string; children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string, exact?: boolean) => (exact ? path === to || path === to + "/" : path.startsWith(to));
  return (
    <div className="min-h-screen bg-sky pb-24 md:pb-8">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive(n.to, "exact" in n) ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-foreground">{name}</p>
              <p className="text-xs text-muted-foreground">{code}</p>
            </div>
            <button
              onClick={() => signOutTo("/login/employee")}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-card/95 backdrop-blur md:hidden">
        {NAV.map((n) => {
          const active = isActive(n.to, "exact" in n);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}
            >
              <n.icon className="size-5" />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
