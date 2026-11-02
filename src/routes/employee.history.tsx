import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { History } from "lucide-react";
import { EmptyState, ErrorNote, Loading } from "@/components/app/ui-bits";
import { FinishedTaskRow, useMyFinished } from "@/components/app/employee-tasks";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/employee/history")({
  head: () => ({ meta: [{ title: "Delivery History — Water Plant" }] }),
  component: MyHistory,
});

function MyHistory() {
  const { employee, permissions } = Route.useRouteContext();
  const [filter, setFilter] = useState("all");
  const q = useMyFinished(employee.id);

  if (!permissions?.can_view_history) {
    return <div className="rounded-2xl border bg-card shadow-soft"><EmptyState icon={History} title="History not available" description="Your manager has turned off delivery history for your account." /></div>;
  }
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const rows = (q.data ?? []).filter((t) => filter === "all" || t.status === filter);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Delivery history</h1>
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="DELIVERED">Delivered</TabsTrigger>
          <TabsTrigger value="FAILED">Failed</TabsTrigger>
          <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>
      {!rows.length ? (
        <div className="rounded-2xl border bg-card shadow-soft"><EmptyState icon={History} title="No deliveries here yet" /></div>
      ) : (
        <div className="space-y-3">{rows.map((t) => <FinishedTaskRow key={t.id} task={t} />)}</div>
      )}
    </div>
  );
}
