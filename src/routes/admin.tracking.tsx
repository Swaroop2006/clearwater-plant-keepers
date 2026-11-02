import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownUp, CheckCircle2, Clock, Route as RouteIcon, Search, Timer, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorNote, Loading, PageHeader, PriorityBadge, StatCard, StatusBadge } from "@/components/app/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { presetRange, RANGE_LABEL, type RangePreset } from "@/lib/date-ranges";
import { fmtDateTime, formatDuration, STATUS_LABEL, TASK_STATUSES } from "@/lib/format";
import { allCustomersLiteQuery, allEmployeesLiteQuery, productsQuery, unwrap } from "@/lib/queries";

export const Route = createFileRoute("/admin/tracking")({
  head: () => ({ meta: [{ title: "Delivery Tracking — Water Plant Admin" }] }),
  component: TrackingPage,
});

const PAGE = 25;
type SortKey = "created_at" | "completed_at" | "duration_seconds" | "priority";

function TrackingPage() {
  const [preset, setPreset] = useState<RangePreset>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [employee, setEmployee] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [product, setProduct] = useState("all");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);

  useRealtimeRefresh(["delivery_tasks"], [["tracking"]]);
  const employees = useQuery(allEmployeesLiteQuery());
  const customers = useQuery(allCustomersLiteQuery());
  const products = useQuery(productsQuery());
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => unwrap(supabase.from("app_settings").select("*").eq("id", 1).single()) });
  const lateSec = (settings.data?.late_threshold_minutes ?? 60) * 60;

  const range = presetRange(preset, { from, to });
  const filterKey = [preset, from, to, status, employee, customer, product, term];

  function build(select: string, count?: boolean) {
    let q = supabase.from("delivery_tasks").select(select, count ? { count: "exact" } : undefined);
    if (range) {
      const [a, b] = [range[0].toISOString(), range[1].toISOString()];
      q = q.or(`and(completed_at.gte.${a},completed_at.lte.${b}),and(completed_at.is.null,created_at.gte.${a},created_at.lte.${b})`);
    }
    if (status !== "all") q = q.eq("status", status as "PENDING");
    if (employee !== "all") q = q.eq("employee_id", employee);
    if (customer !== "all") q = q.eq("customer_id", customer);
    if (product !== "all") q = q.eq("delivery_items.product_id", product);
    const t = term.trim().replace(/[%,()]/g, "");
    if (t) q = q.or(`task_code.ilike.%${t}%,customer_name.ilike.%${t}%,customer_code.ilike.%${t}%,delivery_address.ilike.%${t}%`);
    return q;
  }
  const itemsJoin = product !== "all" ? "delivery_items!inner" : "delivery_items";

  const list = useQuery({
    queryKey: ["tracking", "list", ...filterKey, sort, asc, page],
    queryFn: async () => {
      const { data, error, count } = await build(
        `id, task_code, customer_name, customer_code, status, priority, created_at, started_at, completed_at, duration_seconds, scheduled_date, failure_reason, ${itemsJoin}(product_id, product_name, requested_qty, delivered_qty, unit), employees(name, employee_code)`,
        true,
      )
        .order(sort, { ascending: asc, nullsFirst: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as TrackRow[], count: count ?? 0 };
    },
  });

  const summary = useQuery({
    queryKey: ["tracking", "summary", ...filterKey],
    queryFn: async () => {
      const { data, error } = await build(`status, duration_seconds, scheduled_date, ${itemsJoin}(product_id)`).limit(1000);
      if (error) throw error;
      const rows = (data ?? []) as unknown as { status: string; duration_seconds: number | null; scheduled_date: string | null }[];
      const delivered = rows.filter((r) => r.status === "DELIVERED");
      const avg = delivered.length ? delivered.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / delivered.length : null;
      return {
        total: rows.length,
        delivered: delivered.length,
        failed: rows.filter((r) => r.status === "FAILED").length,
        open: rows.filter((r) => ["PENDING", "IN_PROGRESS", "ON_HOLD"].includes(r.status)).length,
        late: delivered.filter((r) => (r.duration_seconds ?? 0) > lateSec).length,
        avg,
      };
    },
  });

  const toggleSort = (k: SortKey) => {
    if (sort === k) setAsc(!asc);
    else { setSort(k); setAsc(false); }
  };
  const pages = Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE));
  const today = new Date().toISOString().slice(0, 10);
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  return (
    <div className="space-y-5">
      <PageHeader title="Delivery tracking" description={`Deliveries taking longer than ${settings.data?.late_threshold_minutes ?? 60} minutes are flagged as late.`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Tasks" value={summary.data?.total ?? "—"} icon={RouteIcon} />
        <StatCard label="Delivered" value={summary.data?.delivered ?? "—"} icon={CheckCircle2} tone="success" />
        <StatCard label="Open" value={summary.data?.open ?? "—"} icon={Clock} tone="warning" />
        <StatCard label="Failed" value={summary.data?.failed ?? "—"} icon={XCircle} tone="destructive" />
        <StatCard label="Late" value={summary.data?.late ?? "—"} icon={AlertTriangle} tone="warning" />
        <StatCard label="Avg time" value={<span className="text-xl">{formatDuration(summary.data?.avg)}</span>} icon={Timer} tone="info" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={preset} onValueChange={(v) => reset(setPreset)(v as RangePreset)}>
          <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(RANGE_LABEL) as RangePreset[]).map((k) => <SelectItem key={k} value={k}>{RANGE_LABEL[k]}</SelectItem>)}
          </SelectContent>
        </Select>
        {preset === "custom" ? (
          <div className="flex gap-2">
            <Input type="date" className="bg-card" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="From" />
            <Input type="date" className="bg-card" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="To" />
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="bg-card pl-9" placeholder="Search task, customer, address" value={term} onChange={(e) => reset(setTerm)(e.target.value)} />
          </div>
        )}
        <Select value={status} onValueChange={reset(setStatus)}>
          <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
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
            {(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={product} onValueChange={reset(setProduct)}>
          <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            {(products.data ?? []).filter((p) => p.kind !== "EMPTY_CAN").map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {preset === "custom" && (
          <div className="relative sm:col-span-2">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="bg-card pl-9" placeholder="Search task, customer, address" value={term} onChange={(e) => reset(setTerm)(e.target.value)} />
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        {preset === "custom" && !range ? (
          <EmptyState title="Choose a start and end date" />
        ) : list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <div className="p-4"><ErrorNote error={list.error} /></div>
        ) : !list.data?.rows.length ? (
          <EmptyState icon={RouteIcon} title="No deliveries in this view" description="Try a different date range or filter." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Product & qty</TableHead>
                  <SortHead label="Priority" k="priority" sort={sort} onClick={toggleSort} />
                  <SortHead label="Created" k="created_at" sort={sort} onClick={toggleSort} />
                  <TableHead>Started</TableHead>
                  <SortHead label="Completed" k="completed_at" sort={sort} onClick={toggleSort} />
                  <SortHead label="Duration" k="duration_seconds" sort={sort} onClick={toggleSort} />
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.rows.map((t) => {
                  const late = t.status === "DELIVERED" && (t.duration_seconds ?? 0) > lateSec;
                  const overdue = ["PENDING", "ON_HOLD"].includes(t.status) && t.scheduled_date && t.scheduled_date < today;
                  return (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => setDetailId(t.id)}>
                      <TableCell className="font-mono text-xs text-primary underline-offset-2 hover:underline">{t.task_code}</TableCell>
                      <TableCell className="font-semibold">{t.customer_name}</TableCell>
                      <TableCell>{t.employees?.name}</TableCell>
                      <TableCell className="text-sm">
                        {t.delivery_items.map((i, n) => <div key={n}>{i.product_name} × {i.delivered_qty ?? i.requested_qty}</div>)}
                      </TableCell>
                      <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(t.created_at)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(t.started_at)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(t.completed_at)}</TableCell>
                      <TableCell className="text-sm">{formatDuration(t.duration_seconds)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge status={t.status} />
                          {late && <Badge variant="pending">Late</Badge>}
                          {overdue && <Badge variant="destructive">Overdue</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {(list.data?.count ?? 0) > PAGE && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">{list.data?.count} tasks · page {page + 1} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
      <TaskDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

type TrackRow = {
  id: string; task_code: string; customer_name: string; status: string; priority: number;
  created_at: string; started_at: string | null; completed_at: string | null; duration_seconds: number | null;
  scheduled_date: string | null; failure_reason: string | null;
  delivery_items: { product_name: string; requested_qty: number; delivered_qty: number | null; unit: string }[];
  employees: { name: string; employee_code: string } | null;
};

function SortHead({ label, k, sort, onClick }: { label: string; k: SortKey; sort: SortKey; onClick: (k: SortKey) => void }) {
  return (
    <TableHead>
      <button className={"inline-flex items-center gap-1 " + (sort === k ? "text-foreground" : "")} onClick={() => onClick(k)}>
        {label} <ArrowDownUp className="size-3" />
      </button>
    </TableHead>
  );
}

function TaskDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["tracking", "detail", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const [task, logs, txns] = await Promise.all([
        unwrap(supabase.from("delivery_tasks").select("*, delivery_items(*), employees(name, employee_code)").eq("id", id!).single()),
        unwrap(supabase.from("delivery_logs").select("*").eq("task_id", id!).order("created_at")),
        unwrap(supabase.from("inventory_transactions").select("txn_code, txn_type, quantity, products(name)").eq("task_id", id!)),
      ]);
      return { task, logs, txns };
    },
  });
  const t = q.data?.task;
  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{t ? `${t.task_code} · ${t.customer_name}` : "Task"}</DialogTitle></DialogHeader>
        {q.isLoading || !t ? (
          <Loading />
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={t.status} /><PriorityBadge priority={t.priority} /><span className="text-muted-foreground">{t.employees?.name} ({t.employees?.employee_code})</span></div>
            <p className="text-muted-foreground">{t.delivery_address} · {t.customer_phone}</p>
            <div className="rounded-xl bg-muted/60 p-3">
              {t.delivery_items.map((i) => (
                <div key={i.id} className="flex justify-between">
                  <span>{i.product_name}</span>
                  <span className="tabular-nums">{i.delivered_qty != null ? `${i.delivered_qty} of ${i.requested_qty}` : i.requested_qty} {i.unit}</span>
                </div>
              ))}
              {t.empty_cans_returned > 0 && <div className="mt-1 flex justify-between text-muted-foreground"><span>Empty cans returned</span><span>{t.empty_cans_returned}</span></div>}
            </div>
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-muted-foreground">Created</dt><dd>{fmtDateTime(t.created_at)}</dd>
              <dt className="text-muted-foreground">Started</dt><dd>{fmtDateTime(t.started_at)}</dd>
              <dt className="text-muted-foreground">Finished</dt><dd>{fmtDateTime(t.completed_at)}</dd>
              <dt className="text-muted-foreground">Duration</dt><dd>{formatDuration(t.duration_seconds)}</dd>
            </dl>
            {(t.failure_reason || t.hold_reason || t.completion_notes || t.notes) && (
              <div className="space-y-1">
                {t.notes && <p><span className="text-muted-foreground">Task notes:</span> {t.notes}</p>}
                {t.failure_reason && <p><span className="text-muted-foreground">Reason:</span> {t.failure_reason}</p>}
                {t.hold_reason && <p><span className="text-muted-foreground">Hold reason:</span> {t.hold_reason}</p>}
                {t.completion_notes && <p><span className="text-muted-foreground">Delivery notes:</span> {t.completion_notes}</p>}
              </div>
            )}
            <div>
              <p className="mb-2 font-semibold">Timeline</p>
              <ol className="space-y-2 border-l pl-4">
                {q.data!.logs.map((l) => (
                  <li key={l.id}>
                    <p className="font-medium">{l.from_status ? `${STATUS_LABEL[l.from_status]} → ` : ""}{STATUS_LABEL[l.to_status]}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(l.created_at)}{l.note ? ` · ${l.note}` : ""}</p>
                  </li>
                ))}
              </ol>
            </div>
            {q.data!.txns.length > 0 && (
              <div>
                <p className="mb-1 font-semibold">Stock movements</p>
                {q.data!.txns.map((x) => (
                  <p key={x.txn_code} className="text-muted-foreground">{x.txn_code} · {x.products?.name} · {x.quantity > 0 ? "+" : ""}{x.quantity}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
