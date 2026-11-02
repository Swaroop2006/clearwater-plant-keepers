import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { EmptyState, ErrorNote, Loading } from "@/components/app/ui-bits";
import { ActiveDeliveryCard, QueueTaskCard, useMyQueue } from "@/components/app/employee-tasks";
import { useRealtimeRefresh } from "@/hooks/use-realtime";

export const Route = createFileRoute("/employee/tasks")({
  head: () => ({ meta: [{ title: "My Tasks — Water Plant" }] }),
  component: MyTasks,
});

function MyTasks() {
  const { employee } = Route.useRouteContext();
  useRealtimeRefresh(["delivery_tasks"], [["my-queue"]]);
  const queue = useMyQueue(employee.id);
  if (queue.isLoading) return <Loading />;
  if (queue.error) return <ErrorNote error={queue.error} />;
  const { active, pending, onHold, nextId, perms } = queue.data!;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">My tasks</h1>
        <p className="text-sm text-muted-foreground">Deliver in this order. Priority 1 comes first.</p>
      </div>
      {active && <ActiveDeliveryCard task={active} perms={perms} />}
      {!active && !pending.length && !onHold.length && (
        <div className="rounded-2xl border bg-card shadow-soft"><EmptyState icon={ListChecks} title="Your queue is empty" description="New tasks will appear here as soon as they are assigned." /></div>
      )}
      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase">Queue ({pending.length})</h2>
          {pending.map((t) => (
            <QueueTaskCard key={t.id} task={t} isNext={t.id === nextId} blocked={Boolean(active)} canStart={Boolean(perms?.can_start_delivery)} />
          ))}
        </section>
      )}
      {onHold.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase">On hold ({onHold.length})</h2>
          {onHold.map((t) => <QueueTaskCard key={t.id} task={t} isNext={false} blocked canStart={false} />)}
        </section>
      )}
    </div>
  );
}
