import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Droplets, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, type TaskStatus } from "@/lib/format";

const STATUS_VARIANT: Record<TaskStatus, "pending" | "progress" | "success" | "destructive" | "hold" | "muted"> = {
  PENDING: "pending",
  IN_PROGRESS: "progress",
  DELIVERED: "success",
  FAILED: "destructive",
  ON_HOLD: "hold",
  CANCELLED: "muted",
};

export function StatusBadge({ status }: { status: string }) {
  const s = status as TaskStatus;
  return (
    <Badge variant={STATUS_VARIANT[s] ?? "muted"}>
      {s === "IN_PROGRESS" && <span className="size-1.5 animate-pulse rounded-full bg-info" />}
      {STATUS_LABEL[s] ?? status}
    </Badge>
  );
}

export function ActiveBadge({ status }: { status: string }) {
  return <Badge variant={status === "ACTIVE" ? "success" : "muted"}>{status === "ACTIVE" ? "Active" : "Inactive"}</Badge>;
}

export function PriorityBadge({ priority }: { priority: number }) {
  const variant = priority <= 1 ? "destructive" : priority <= 3 ? "pending" : "secondary";
  return <Badge variant={variant}>P{priority}</Badge>;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: ReactNode;
  tone?: "primary" | "success" | "warning" | "destructive" | "info" | "navy";
}) {
  const toneCls = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/10 text-destructive",
    info: "bg-info/12 text-info",
    navy: "bg-navy/10 text-navy",
  }[tone];
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-semibold text-foreground tabular-nums">{value}</p>
        </div>
        <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", toneCls)}>
          <Icon className="size-5" />
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card shadow-soft", className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title, description, action, icon: Icon = Droplets }: { title: string; description?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="relative mb-3 grid size-14 place-items-center rounded-full bg-accent text-primary">
        <Icon className="size-6" />
      </div>
      <p className="font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const msg = (error as { message?: string })?.message ?? "Could not load data";
  return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{msg}</div>;
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-xl bg-water text-primary-foreground shadow-glow">
        <Droplets className="size-5" />
      </div>
      <div className="leading-tight">
        <p className={cn("font-display text-sm font-semibold", light ? "text-sidebar-accent-foreground" : "text-foreground")}>Water Plant</p>
        <p className={cn("text-[11px]", light ? "text-sidebar-foreground/70" : "text-muted-foreground")}>Management System</p>
      </div>
    </div>
  );
}
