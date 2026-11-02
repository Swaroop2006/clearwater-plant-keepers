import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, Clock, Package, Play, Truck, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "@/lib/queries";
import { EmptyState, ErrorNote, Loading, StatCard, StatusBadge } from "@/components/app/ui-bits";
import { ActiveDeliveryCard, QueueTaskCard, useMyQueue, MY_SELECT, MyTask } from "@/components/app/employee-tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { dailyGoods, localDay, tasksForDay } from "@/lib/billing";

export const Route = createFileRoute("/employee/")({
  head: () => ({ meta: [{ title: "My Dashboard — Water Plant" }] }),
  component: EmployeeDashboard,
});

function EmployeeDashboard() {
  const { employee } = Route.useRouteContext();
  useRealtimeRefresh(["delivery_tasks"], [["my-queue"], ["my-finished"], ["my-tasks-all"]]);

  const todayIso = new Date().toISOString();
  const todayStr = localDay(todayIso);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showOrderBreakdown, setShowOrderBreakdown] = useState(false);

  const queue = useMyQueue(employee.id);

  const allTasksQuery = useQuery({
    queryKey: ["my-tasks-all", employee.id],
    queryFn: async () => {
      const data = await unwrap(
        supabase
          .from("delivery_tasks")
          .select(MY_SELECT)
          .eq("employee_id", employee.id)
          .order("created_at", { ascending: false }),
      );
      return (data ?? []) as unknown as MyTask[];
    },
  });

  if (queue.isLoading || allTasksQuery.isLoading) return <Loading />;
  if (queue.error) return <ErrorNote error={queue.error} />;
  if (allTasksQuery.error) return <ErrorNote error={allTasksQuery.error} />;

  const { active, pending, perms, nextId } = queue.data!;
  const next = pending.find((t) => t.id === nextId) ?? null;

  const dayTasks = tasksForDay(allTasksQuery.data ?? [], selectedDate, todayStr);
  const goods = dailyGoods(dayTasks);
  const totalRemainingGoods = goods.reduce((sum, g) => sum + g.remaining, 0);

  const assignedCount = dayTasks.length;
  const pendingCount = dayTasks.filter((t) => t.status === "PENDING").length;
  const inProgressCount = dayTasks.filter((t) => t.status === "IN_PROGRESS").length;
  const completedCount = dayTasks.filter((t) => t.status === "DELIVERED").length;

  const isToday = selectedDate === todayStr;

  return (
    <div className="space-y-6">
      {/* Header with Date Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Hello,</p>
          <h1 className="text-2xl font-semibold">{employee.name}</h1>
          <p className="text-xs text-muted-foreground">{employee.employee_code} · {employee.role_title}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40 font-medium"
          />
          {!isToday && (
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(todayStr)}>
              Today
            </Button>
          )}
        </div>
      </div>

      {/* 5 Summary Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
        <StatCard label="Total Assigned" value={assignedCount} icon={ClipboardList} tone="navy" />
        <StatCard label="Pending" value={pendingCount} icon={Clock} tone="warning" />
        <StatCard label="In-Progress" value={inProgressCount} icon={Play} tone="navy" />
        <StatCard label="Completed" value={completedCount} icon={CheckCircle2} tone="success" />
        <StatCard label="Remaining Goods" value={totalRemainingGoods} icon={Package} tone={totalRemainingGoods > 0 ? "warning" : "success"} />
      </div>

      {/* Today's / Selected Date's Required Goods */}
      <div className="rounded-3xl border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">
              {isToday ? "Today's Required Goods" : `Required Goods (${selectedDate})`}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isToday
                ? "Total quantity needed to fulfill today's deliveries, including carryover tasks."
                : `Quantity needed for tasks scheduled on ${selectedDate}.`}
            </p>
          </div>
          {dayTasks.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOrderBreakdown(!showOrderBreakdown)}
              className="text-xs text-muted-foreground"
            >
              {showOrderBreakdown ? "Hide orders" : "View orders"}
              {showOrderBreakdown ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
            </Button>
          )}
        </div>

        {goods.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            No deliveries or goods scheduled for this date.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {goods.map((g) => (
              <div key={g.product_id} className="rounded-2xl border bg-muted/30 p-3.5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">{g.name}</p>
                  <span className="text-xs text-muted-foreground">{g.unit}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <div className="rounded-lg bg-background p-1.5">
                    <p className="text-[10px] text-muted-foreground uppercase">Required</p>
                    <p className="text-base font-bold tabular-nums text-foreground">{g.required}</p>
                  </div>
                  <div className="rounded-lg bg-success/10 p-1.5">
                    <p className="text-[10px] text-success-foreground uppercase">Delivered</p>
                    <p className="text-base font-bold tabular-nums text-success-foreground">{g.delivered}</p>
                  </div>
                  <div className={`rounded-lg p-1.5 ${g.remaining > 0 ? "bg-warning/15" : "bg-muted"}`}>
                    <p className="text-[10px] text-muted-foreground uppercase">Remaining</p>
                    <p className={`text-base font-bold tabular-nums ${g.remaining > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                      {g.remaining}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Order Breakdown by Task */}
        {showOrderBreakdown && dayTasks.length > 0 && (
          <div className="mt-4 space-y-2 border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Order Breakdown ({dayTasks.length} {dayTasks.length === 1 ? "task" : "tasks"})
            </p>
            <div className="divide-y rounded-2xl border bg-background text-sm">
              {dayTasks.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{t.customer_name}</span>
                      <span className="text-xs text-muted-foreground">({t.task_code})</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.delivery_address}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {t.delivery_items.map((i) => (
                        <span key={i.id} className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">
                          {t.status === "DELIVERED" && i.delivered_qty != null ? i.delivered_qty : i.requested_qty} × {i.product_name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Active or Next Delivery Card */}
      {active ? (
        <ActiveDeliveryCard task={active} perms={perms} />
      ) : next ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Your next delivery</h2>
          <QueueTaskCard task={next} isNext blocked={false} canStart={Boolean(perms?.can_start_delivery)} />
        </div>
      ) : (
        <div className="rounded-2xl border bg-card shadow-soft">
          <EmptyState
            icon={Truck}
            title={pending.length ? "Nothing ready yet" : "No deliveries waiting"}
            description={pending.length ? "Your remaining tasks are scheduled for later." : "New tasks from the office will appear here automatically."}
          />
        </div>
      )}

      {pending.length > (active ? 0 : next ? 1 : 0) && (
        <Link to="/employee/tasks" className="block rounded-2xl border bg-card p-4 text-center text-sm font-semibold text-primary shadow-soft">
          See all {pending.length} tasks in your queue →
        </Link>
      )}
    </div>
  );
}
