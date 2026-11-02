import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Droplet,
  Package,
  PackageOpen,
  Truck,
  UserCheck,
  Users,
  UserCog,
  Timer,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorNote, Loading, PageHeader, Panel, PriorityBadge, StatCard, StatusBadge } from "@/components/app/ui-bits";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { fmtAgo, fmtTime, TXN_LABEL, type TaskStatus } from "@/lib/format";
import { unwrap, type DashboardData } from "@/lib/queries";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Dashboard — Water Plant Admin" }] }),
  component: AdminDashboard,
});

function AdminDashboard() {
  useRealtimeRefresh(["delivery_tasks", "products"], [["dashboard"], ["dashboard-active"], ["dashboard-recent"]]);

  const stats = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await unwrap(supabase.rpc("admin_dashboard"))) as unknown as DashboardData,
  });
  const active = useQuery({
    queryKey: ["dashboard-active"],
    queryFn: () =>
      unwrap(
        supabase
          .from("delivery_tasks")
          .select("id, task_code, customer_name, status, priority, created_at, started_at, employees(name)")
          .in("status", ["PENDING", "IN_PROGRESS", "ON_HOLD"])
          .order("status", { ascending: false })
          .order("priority")
          .order("created_at")
          .limit(12),
      ),
  });
  const recent = useQuery({
    queryKey: ["dashboard-recent"],
    queryFn: async () => {
      const [tasks, txns, customers] = await Promise.all([
        unwrap(
          supabase
            .from("delivery_tasks")
            .select("id, task_code, customer_name, status, completed_at, duration_seconds, employees(name)")
            .in("status", ["DELIVERED", "FAILED", "CANCELLED"])
            .order("completed_at", { ascending: false })
            .limit(8),
        ),
        unwrap(
          supabase
            .from("inventory_transactions")
            .select("id, txn_code, txn_type, quantity, new_stock, created_at, products(name)")
            .order("created_at", { ascending: false })
            .limit(8),
        ),
        unwrap(supabase.from("customers").select("id, customer_code, name, joined_at, status").order("joined_at", { ascending: false }).limit(5)),
      ]);
      return { tasks, txns, customers };
    },
  });

  if (stats.isLoading) return <Loading />;
  if (stats.error) return <ErrorNote error={stats.error} />;
  const d = stats.data!;
  const monthly = d.monthly.map((m) => ({ ...m, label: format(parse(m.month, "yyyy-MM", new Date()), "MMM") }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Today, ${format(new Date(), "EEEE d MMMM")}`}
        actions={
          <Button asChild variant="water">
            <Link to="/admin/tasks" search={{ new: true }}>
              <Truck /> New delivery task
            </Link>
          </Button>
        }
      />

      {d.low_stock.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-foreground" />
            <div>
              <p className="font-semibold text-warning-foreground">Low stock</p>
              <p className="text-sm text-warning-foreground/80">
                {d.low_stock.map((p) => `${p.name}: ${p.available} ${p.unit} (min ${p.min})`).join(" · ")}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/inventory">Restock</Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total customers" value={d.total_customers} icon={Users} />
        <StatCard label="Active customers" value={d.active_customers} icon={UserCheck} tone="success" />
        <StatCard label="Employees" value={d.total_employees} icon={UserCog} tone="navy" hint={`${d.active_employees} active`} />
        <StatCard label="Today's deliveries" value={d.today_tasks} icon={Truck} tone="info" hint="Created, finished or open today" />
        <StatCard label="Completed today" value={d.today_delivered} icon={CheckCircle2} tone="success" hint={d.today_failed ? `${d.today_failed} failed` : undefined} />
        <StatCard label="Pending" value={d.pending} icon={Clock} tone="warning" hint={d.on_hold ? `${d.on_hold} on hold` : undefined} />
        <StatCard label="In progress" value={d.in_progress} icon={Timer} tone="info" />
        <StatCard label="Filled cans" value={d.filled_cans} icon={Droplet} />
        <StatCard label="Water packets" value={d.packets} icon={Package} />
        <StatCard label="Empty cans" value={d.empty_cans} icon={PackageOpen} tone="navy" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Open delivery tasks" className="xl:col-span-2" action={<Link to="/admin/tasks" className="text-xs font-semibold text-primary">View all</Link>}>
          {active.isLoading ? (
            <Loading />
          ) : !active.data?.length ? (
            <EmptyState title="No open tasks" description="Pending and in-progress deliveries will appear here." />
          ) : (
            <ul className="divide-y">
              {active.data.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {t.task_code} · {t.customer_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.employees?.name ?? "—"} · {t.status === "IN_PROGRESS" ? `started ${fmtAgo(t.started_at)}` : `created ${fmtAgo(t.created_at)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Today by employee">
          {!d.employee_today.length ? (
            <EmptyState title="No active employees" action={<Button asChild size="sm" variant="outline"><Link to="/admin/employees">Add employee</Link></Button>} />
          ) : (
            <ul className="space-y-3">
              {d.employee_today.map((e) => (
                <li key={e.id} className="rounded-xl bg-muted/60 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{e.name}</p>
                    <span className="text-xs text-muted-foreground">{e.code}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-success">{e.delivered} delivered</span>
                    <span>{e.pending} pending</span>
                    {e.in_progress > 0 && <span className="text-info">on a delivery</span>}
                    {e.failed > 0 && <span className="text-destructive">{e.failed} failed</span>}
                    {e.avg_minutes != null && <span>avg {e.avg_minutes} min</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Monthly deliveries (last 6 months)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="delivered" name="Delivered" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="cans" name="Cans" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="failed" name="Failed" fill="var(--chart-5)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Recently finished deliveries" action={<Link to="/admin/tracking" className="text-xs font-semibold text-primary">Tracking</Link>}>
          {!recent.data?.tasks.length ? (
            <EmptyState title="No finished deliveries yet" />
          ) : (
            <ul className="divide-y">
              {recent.data.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{t.task_code} · {t.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{t.employees?.name} · {fmtTime(t.completed_at)}</p>
                  </div>
                  <StatusBadge status={t.status as TaskStatus} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Recent inventory transactions" action={<Link to="/admin/inventory" className="text-xs font-semibold text-primary">Inventory</Link>}>
          {!recent.data?.txns.length ? (
            <EmptyState title="No stock movements yet" icon={Package} />
          ) : (
            <ul className="divide-y">
              {recent.data.txns.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{x.products?.name} · {TXN_LABEL[x.txn_type]}</p>
                    <p className="text-xs text-muted-foreground">{x.txn_code} · {fmtAgo(x.created_at)}</p>
                  </div>
                  <span className={"font-semibold tabular-nums " + (x.quantity > 0 ? "text-success" : "text-destructive")}>
                    {x.quantity > 0 ? "+" : ""}{x.quantity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Recent customers" action={<Link to="/admin/customers" className="text-xs font-semibold text-primary">Customers</Link>}>
          {!recent.data?.customers.length ? (
            <EmptyState title="No customers yet" action={<Button asChild size="sm" variant="outline"><Link to="/admin/customers">Add customer</Link></Button>} />
          ) : (
            <ul className="divide-y">
              {recent.data.customers.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link to="/admin/customers/$customerId" params={{ customerId: c.id }} className="font-semibold hover:text-primary">
                    {c.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{c.customer_code} · joined {fmtAgo(c.joined_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
