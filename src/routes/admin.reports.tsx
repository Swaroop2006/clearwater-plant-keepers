import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, parse, startOfMonth } from "date-fns";
import { CheckCircle2, Clock, Download, Droplet, Package, PackageOpen, Timer, Truck, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorNote, Loading, PageHeader, Panel, StatCard } from "@/components/app/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, fmtMoney, PRODUCT_KIND_LABEL } from "@/lib/format";
import { isoDate } from "@/lib/date-ranges";
import { unwrap } from "@/lib/queries";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({ meta: [{ title: "Reports — Water Plant Admin" }] }),
  component: ReportsPage,
});

type Report = {
  total: number; delivered: number; failed: number; pending: number; cancelled: number;
  cans: number; packets: number; empty_returned: number; avg_minutes: number | null;
  daily: { date: string; delivered: number; failed: number; cans: number; packets: number }[];
  monthly: { month: string; delivered: number; failed: number; cans: number; packets: number }[];
  customers: { code: string; name: string; deliveries: number; days: number; failed: number; cans: number; packets: number; amount: number }[];
  employees: { code: string; name: string; assigned: number; delivered: number; failed: number; avg_minutes: number | null; fastest_minutes: number | null; slowest_minutes: number | null }[];
  inventory: { name: string; unit: string; kind: string; stock: number; min: number; low: boolean; in: number; out: number; delivered: number; damaged: number; returned: number }[];
};

function ReportsPage() {
  const now = new Date();
  const [from, setFrom] = useState(isoDate(startOfMonth(now)));
  const [to, setTo] = useState(isoDate(endOfMonth(now)));
  const [grain, setGrain] = useState<"daily" | "monthly">("daily");
  const valid = Boolean(from && to && from <= to);

  const q = useQuery({
    queryKey: ["report", from, to],
    enabled: valid,
    queryFn: async () => (await unwrap(supabase.rpc("delivery_report", { _from: from, _to: to }))) as unknown as Report,
  });

  const r = q.data;
  const series = r
    ? grain === "daily"
      ? r.daily.map((d) => ({ ...d, label: format(new Date(d.date), "d MMM") }))
      : r.monthly.map((m) => ({ ...m, label: format(parse(m.month, "yyyy-MM", new Date()), "MMM yyyy") }))
    : [];
  const tag = `${from}_to_${to}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Calculated from completed delivery records. Pending, failed and cancelled tasks never count as deliveries."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1"><Label htmlFor="rf" className="text-xs">From</Label><Input id="rf" type="date" className="bg-card" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="rt" className="text-xs">To</Label><Input id="rt" type="date" className="bg-card" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
        }
      />
      {!valid ? (
        <ErrorNote error={{ message: "Choose a valid date range (start before end)." }} />
      ) : q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : r ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total tasks" value={r.total} icon={Truck} />
            <StatCard label="Successful" value={r.delivered} icon={CheckCircle2} tone="success" />
            <StatCard label="Pending" value={r.pending} icon={Clock} tone="warning" />
            <StatCard label="Failed" value={r.failed} icon={XCircle} tone="destructive" />
            <StatCard label="Cans delivered" value={r.cans} icon={Droplet} />
            <StatCard label="Packets delivered" value={r.packets} icon={Package} />
            <StatCard label="Empties returned" value={r.empty_returned} icon={PackageOpen} tone="navy" />
            <StatCard label="Avg time" value={<span className="text-xl">{r.avg_minutes != null ? `${r.avg_minutes} min` : "—"}</span>} icon={Timer} tone="info" />
          </div>

          <Panel
            title="Deliveries over time"
            action={
              <div className="flex gap-2">
                <Tabs value={grain} onValueChange={(v) => setGrain(v as "daily" | "monthly")}>
                  <TabsList className="h-8"><TabsTrigger value="daily">Daily</TabsTrigger><TabsTrigger value="monthly">Monthly</TabsTrigger></TabsList>
                </Tabs>
                <Button size="sm" variant="outline" onClick={() => downloadCsv(`${grain}-deliveries_${tag}.csv`, grain === "daily" ? r.daily : r.monthly)}><Download /> CSV</Button>
              </div>
            }
          >
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="delivered" name="Deliveries" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cans" name="Cans" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="packets" name="Packets" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" name="Failed" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Customer-wise totals" action={<Button size="sm" variant="outline" disabled={!r.customers.length} onClick={() => downloadCsv(`customers_${tag}.csv`, r.customers)}><Download /> CSV</Button>}>
            {!r.customers.length ? <EmptyState title="No customer deliveries in this range" /> : (
              <div className="-mx-4 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>ID</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Deliveries</TableHead><TableHead className="text-right">Delivery days</TableHead>
                    <TableHead className="text-right">Cans</TableHead><TableHead className="text-right">Packets</TableHead><TableHead className="text-right">Failed</TableHead><TableHead className="text-right">Value</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {r.customers.map((c) => (
                      <TableRow key={c.code}>
                        <TableCell className="font-mono text-xs">{c.code}</TableCell><TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.deliveries}</TableCell><TableCell className="text-right tabular-nums">{c.days}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.cans}</TableCell><TableCell className="text-right tabular-nums">{c.packets}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.failed}</TableCell><TableCell className="text-right tabular-nums">{fmtMoney(c.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>

          <Panel title="Employee-wise performance" action={<Button size="sm" variant="outline" disabled={!r.employees.length} onClick={() => downloadCsv(`employees_${tag}.csv`, r.employees)}><Download /> CSV</Button>}>
            {!r.employees.length ? <EmptyState title="No employee activity in this range" /> : (
              <div className="-mx-4 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>ID</TableHead><TableHead>Employee</TableHead><TableHead className="text-right">Assigned</TableHead><TableHead className="text-right">Delivered</TableHead>
                    <TableHead className="text-right">Failed</TableHead><TableHead className="text-right">Avg min</TableHead><TableHead className="text-right">Fastest</TableHead><TableHead className="text-right">Slowest</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {r.employees.map((e) => (
                      <TableRow key={e.code}>
                        <TableCell className="font-mono text-xs">{e.code}</TableCell><TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.assigned}</TableCell><TableCell className="text-right tabular-nums">{e.delivered}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.failed}</TableCell><TableCell className="text-right tabular-nums">{e.avg_minutes ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.fastest_minutes ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{e.slowest_minutes ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>

          <Panel title="Inventory movements & current stock" action={<Button size="sm" variant="outline" disabled={!r.inventory.length} onClick={() => downloadCsv(`inventory_${tag}.csv`, r.inventory)}><Download /> CSV</Button>}>
            {!r.inventory.length ? <EmptyState title="No products" /> : (
              <div className="-mx-4 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead className="text-right">In</TableHead><TableHead className="text-right">Out</TableHead>
                    <TableHead className="text-right">Delivered</TableHead><TableHead className="text-right">Damaged</TableHead><TableHead className="text-right">Returned</TableHead><TableHead className="text-right">Current</TableHead><TableHead />
                  </TableRow></TableHeader>
                  <TableBody>
                    {r.inventory.map((p) => (
                      <TableRow key={p.name}>
                        <TableCell className="font-medium">{p.name}</TableCell><TableCell>{PRODUCT_KIND_LABEL[p.kind]}</TableCell>
                        <TableCell className="text-right tabular-nums text-success">+{p.in}</TableCell><TableCell className="text-right tabular-nums text-destructive">-{p.out}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.delivered}</TableCell><TableCell className="text-right tabular-nums">{p.damaged}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.returned}</TableCell><TableCell className="text-right font-semibold tabular-nums">{p.stock} {p.unit}</TableCell>
                        <TableCell>{p.low && <Badge variant="pending">Low (min {p.min})</Badge>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
