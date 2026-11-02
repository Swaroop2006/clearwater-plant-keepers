import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorNote, Loading, PageHeader, PriorityBadge, StatusBadge } from "@/components/app/ui-bits";
import { CreateTaskDialog } from "@/components/app/CreateTaskDialog";
import { TaskActions } from "@/components/app/TaskActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { fmtDate, fmtDateTime, formatDuration, STATUS_LABEL, TASK_STATUSES } from "@/lib/format";
import { allCustomersLiteQuery, allEmployeesLiteQuery, TASK_SELECT } from "@/lib/queries";
import { endOfDay, startOfDay } from "date-fns";

export const Route = createFileRoute("/admin/tasks")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean } => (s["new"] ? { new: true } : {}),
  head: () => ({ meta: [{ title: "Delivery Tasks — Water Plant Admin" }] }),
  component: TasksPage,
});

const PAGE = 30;

function TasksPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/tasks" });
  const [open, setOpen] = useState(Boolean(search.new));
  const [status, setStatus] = useState("open");
  const [employee, setEmployee] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [priority, setPriority] = useState("all");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(0);

  useRealtimeRefresh(["delivery_tasks"], [["tasks"]]);
  const employees = useQuery(allEmployeesLiteQuery());
  const customers = useQuery(allCustomersLiteQuery());

  const tasks = useQuery({
    queryKey: ["tasks", status, employee, customer, priority, date, page],
    queryFn: async () => {
      let q = supabase.from("delivery_tasks").select(TASK_SELECT, { count: "exact" });
      if (status === "open") q = q.in("status", ["PENDING", "IN_PROGRESS", "ON_HOLD"]);
      else if (status !== "all") q = q.eq("status", status as "PENDING");
      if (employee !== "all") q = q.eq("employee_id", employee);
      if (customer !== "all") q = q.eq("customer_id", customer);
      if (priority !== "all") q = q.eq("priority", Number(priority));
      if (date) {
        const d = new Date(date);
        q = q.gte("created_at", startOfDay(d).toISOString()).lte("created_at", endOfDay(d).toISOString());
      }
      const { data, error, count } = await q
        .order("priority")
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };
  const pages = Math.max(1, Math.ceil((tasks.data?.count ?? 0) / PAGE));

  return (
    <div>
      <PageHeader
        title="Delivery tasks"
        description="Each employee works through their own queue: lowest priority number first, then oldest."
        actions={<Button variant="water" onClick={() => setOpen(true)}><Plus /> New task</Button>}
      />
      <CreateTaskDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && search.new) navigate({ search: {}, replace: true });
        }}
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Select value={status} onValueChange={reset(setStatus)}>
          <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open (pending, in progress, on hold)</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={employee} onValueChange={reset(setEmployee)}>
          <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            {(employees.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={customer} onValueChange={reset(setCustomer)}>
          <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.customer_code})</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={reset(setPriority)}>
          <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any priority</SelectItem>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <SelectItem key={n} value={String(n)}>Priority {n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="bg-card" value={date} onChange={(e) => reset(setDate)(e.target.value)} aria-label="Created on" />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        {tasks.isLoading ? (
          <Loading />
        ) : tasks.error ? (
          <div className="p-4"><ErrorNote error={tasks.error} /></div>
        ) : !tasks.data?.rows.length ? (
          <EmptyState icon={ClipboardList} title="No tasks found" description="Create a task to send a delivery to one of your employees." action={<Button onClick={() => setOpen(true)}><Plus /> New task</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.data.rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.task_code}</TableCell>
                    <TableCell>
                      <p className="font-semibold">{t.customer_name}</p>
                      <p className="max-w-52 truncate text-xs text-muted-foreground">{t.delivery_address}</p>
                    </TableCell>
                    <TableCell>{t.employees?.name}</TableCell>
                    <TableCell className="text-sm">{t.delivery_items.map((i) => `${i.product_name} × ${i.delivered_qty ?? i.requested_qty}`).join(", ")}</TableCell>
                    <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(t.created_at)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{fmtDate(t.scheduled_date)}</TableCell>
                    <TableCell className="text-sm">{t.status === "IN_PROGRESS" ? "running…" : formatDuration(t.duration_seconds)}</TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} />
                      {(t.failure_reason || t.hold_reason) && (
                        <p className="mt-1 max-w-40 truncate text-xs text-muted-foreground" title={t.failure_reason ?? t.hold_reason ?? ""}>{t.failure_reason ?? t.hold_reason}</p>
                      )}
                    </TableCell>
                    <TableCell><TaskActions task={t} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {(tasks.data?.count ?? 0) > PAGE && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">{tasks.data?.count} tasks · page {page + 1} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
