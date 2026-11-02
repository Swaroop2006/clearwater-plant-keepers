import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardList,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Route as RouteIcon,
  Settings,
  Users,
  UserCog,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/ui-bits";
import { signOutTo } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/employees", label: "Employees", icon: UserCog },
  { to: "/admin/tasks", label: "Tasks", icon: ClipboardList },
  { to: "/admin/billing", label: "Billing & Ledger", icon: IndianRupee },
  { to: "/admin/tracking", label: "Delivery Tracking", icon: RouteIcon },
  { to: "/admin/inventory", label: "Inventory", icon: Package },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map((item) => {
        const active = "exact" in item && item.exact ? path === item.to || path === item.to + "/" : path.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-glow"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
      <button
        onClick={() => signOutTo("/login/admin")}
        className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LogOut className="size-4" /> Logout
      </button>
    </nav>
  );
}

export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-sky">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 bg-deep p-4 lg:flex">
        <div className="px-2 pt-1">
          <Logo light />
        </div>
        <NavList />
        <div className="rounded-xl bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground">
          <p className="font-semibold text-sidebar-accent-foreground">Administrator</p>
          <p className="truncate">{email}</p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <Button variant="outline" size="icon" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu />
        </Button>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-72 flex-col gap-6 border-0 bg-deep p-4">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Logo light />
          <NavList onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
