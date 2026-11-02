import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Timer, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ActiveBadge, Panel, StatCard } from "@/components/app/ui-bits";
import { fmtDate, formatDuration } from "@/lib/format";
import { unwrap } from "@/lib/queries";

export const Route = createFileRoute("/employee/profile")({
  head: () => ({ meta: [{ title: "My Profile — Water Plant" }] }),
  component: MyProfile,
});

const PERM_LABEL: Record<string, string> = {
  can_start_delivery: "Start deliveries",
  can_complete_delivery: "Complete deliveries",
  can_report_failure: "Report failed deliveries",
  can_hold_delivery: "Put deliveries on hold",
  can_view_history: "View delivery history",
};

function MyProfile() {
  const { employee, permissions } = Route.useRouteContext();
  const stats = useQuery({
    queryKey: ["my-stats", employee.id],
    queryFn: async () => {
      const rows = await unwrap(
        supabase.from("delivery_tasks").select("status, duration_seconds").eq("employee_id", employee.id).in("status", ["DELIVERED", "FAILED"]),
      );
      const d = rows.filter((r) => r.status === "DELIVERED");
      return {
        delivered: d.length,
        failed: rows.length - d.length,
        avg: d.length ? d.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / d.length : null,
      };
    },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">My profile</h1>
      <Panel>
        <dl className="space-y-3 text-sm">
          {[
            ["Name", employee.name],
            ["Employee ID", employee.employee_code],
            ["Role", employee.role_title],
            ["Username", employee.username],
            ["Mobile", employee.mobile],
            ["Joined", fmtDate(employee.joined_at)],
            ["Status", <ActiveBadge key="s" status={employee.status} />],
          ].map(([k, v]) => (
            <div key={String(k)} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Delivered" value={stats.data?.delivered ?? "—"} icon={CheckCircle2} tone="success" />
        <StatCard label="Failed" value={stats.data?.failed ?? "—"} icon={XCircle} tone="destructive" />
        <StatCard label="Avg time" value={<span className="text-base">{formatDuration(stats.data?.avg)}</span>} icon={Timer} tone="info" />
      </div>
      <Panel title="What you can do">
        <ul className="space-y-2 text-sm">
          {Object.entries(PERM_LABEL).map(([k, label]) => (
            <li key={k} className="flex items-center justify-between">
              <span>{label}</span>
              <span className={permissions?.[k as keyof typeof permissions] ? "font-semibold text-success" : "text-muted-foreground"}>
                {permissions?.[k as keyof typeof permissions] ? "Allowed" : "Not allowed"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">To change your details or password, please contact the office.</p>
      </Panel>
    </div>
  );
}
