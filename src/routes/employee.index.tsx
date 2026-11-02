import { createFileRoute, Link } from "@tanstack/react-router";
import { startOfDay } from "date-fns";
import { CheckCircle2, Clock, PauseCircle, Truck } from "lucide-react";
import { EmptyState, ErrorNote, Loading, StatCard } from "@/components/app/ui-bits";
import { ActiveDeliveryCard, QueueTaskCard, useMyFinished, useMyQueue } from "@/components/app/employee-tasks";
import { useRealtimeRefresh } from "@/hooks/use-realtime";

export const Route = createFileRoute("/employee/")({
  head: () => ({ meta: [{ title: "My Dashboard — Water Plant" }] }),
  component: EmployeeDashboard,
});

function EmployeeDashboard() {
  const { employee } = Route.useRouteContext();
  useRealtimeRefresh(["delivery_tasks"], [["my-queue"], ["my-finished"]]);
  const queue = useMyQueue(employee.id);
  const today = useMyFinished(employee.id, startOfDay(new Date()).toISOString());

  if (queue.isLoading) return <Loading />;
  if (queue.error) return <ErrorNote error={queue.error} />;
  const { active, pending, onHold, nextId, perms } = queue.data!;
  const next = pending.find((t) => t.id === nextId) ?? null;
  const deliveredToday = (today.data ?? []).filter((t) => t.status === "DELIVERED").length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Hello,</p>
        <h1 className="text-2xl font-semibold">{employee.name}</h1>
        <p className="text-xs text-muted-foreground">{employee.employee_code} · {employee.role_title}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Pending" value={pending.length} icon={Clock} tone="warning" />
        <StatCard label="Done today" value={deliveredToday} icon={CheckCircle2} tone="success" />
        <StatCard label="On hold" value={onHold.length} icon={PauseCircle} tone="navy" />
      </div>

      {active ? (
        <ActiveDeliveryCard task={active} perms={perms} />
      ) : next ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Your next delivery</h2>
          <QueueTaskCard task={next} isNext blocked={false} canStart={Boolean(perms?.can_start_delivery)} />
        </div>
      ) : (
        <div className="rounded-2xl border bg-card shadow-soft">
          <EmptyState icon={Truck} title={pending.length ? "Nothing ready yet" : "No deliveries waiting"} description={pending.length ? "Your remaining tasks are scheduled for later." : "New tasks from the office will appear here automatically."} />
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
