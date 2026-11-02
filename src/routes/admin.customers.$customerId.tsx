import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, CheckCircle2, Droplet, Package, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ActiveBadge, EmptyState, ErrorNote, Loading, PageHeader, Panel, StatCard, StatusBadge } from "@/components/app/ui-bits";
import { CustomerFormDialog } from "@/components/app/CustomerFormDialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CUSTOMER_TYPE_LABEL, fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { TASK_SELECT, unwrap } from "@/lib/queries";

export const Route = createFileRoute("/admin/customers/$customerId")({
  head: () => ({ meta: [{ title: "Customer profile — Water Plant Admin" }] }),
  component: CustomerProfile,
});

function CustomerProfile() {
  const { customerId } = Route.useParams();
  const q = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const [customer, stats, tasks] = await Promise.all([
        unwrap(supabase.from("customers").select("*").eq("id", customerId).maybeSingle()),
        unwrap(supabase.from("customer_stats").select("*").eq("customer_id", customerId).maybeSingle()),
        unwrap(supabase.from("delivery_tasks").select(TASK_SELECT).eq("customer_id", customerId).order("created_at", { ascending: false }).limit(200)),
      ]);
      return { customer, stats, tasks };
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const { customer: c, stats, tasks } = q.data!;
  if (!c) return <EmptyState title="Customer not found" action={<Button asChild variant="outline"><Link to="/admin/customers">Back to customers</Link></Button>} />;

  return (
    <div className="space-y-6">
      <Link to="/admin/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Customers
      </Link>
      <PageHeader
        title={c.name}
        description={`${c.customer_code} · ${CUSTOMER_TYPE_LABEL[c.customer_type]} · joined ${fmtDate(c.joined_at)}`}
        actions={<CustomerFormDialog customer={c} trigger={<Button variant="outline"><Pencil /> Edit</Button>} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Deliveries" value={stats?.total_deliveries ?? 0} icon={CheckCircle2} tone="success" />
        <StatCard label="Cans delivered" value={stats?.total_cans ?? 0} icon={Droplet} />
        <StatCard label="Packets delivered" value={stats?.total_packets ?? 0} icon={Package} />
        <StatCard label="Delivery days" value={stats?.delivery_days ?? 0} icon={CalendarDays} tone="navy" />
        <StatCard label="Last delivery" value={<span className="text-base">{fmtDate(stats?.last_delivery_at)}</span>} icon={CalendarDays} tone="info" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Details">
          <dl className="space-y-3 text-sm">
            {[
              ["Status", <ActiveBadge key="s" status={c.status} />],
              ["Mobile", c.mobile],
              ["Address", c.address],
              ["Price per can", fmtMoney(c.price_per_can)],
              ["Price per packet", fmtMoney(c.price_per_packet)],
              ["Notes", c.notes || "—"],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Delivery history" className="lg:col-span-2">
          {!tasks.length ? (
            <EmptyState title="No deliveries yet" description="Tasks created for this customer will appear here." />
          ) : (
            <div className="-mx-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">{fmtDateTime(t.completed_at ?? t.created_at)}</TableCell>
                      <TableCell className="font-mono text-xs">{t.task_code}</TableCell>
                      <TableCell className="text-sm">
                        {t.delivery_items.map((i) => (
                          <div key={i.id}>
                            {i.product_name}: {t.status === "DELIVERED" ? i.delivered_qty : i.requested_qty} {i.unit}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell>{t.employees?.name}</TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
