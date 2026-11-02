import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Droplet,
  IndianRupee,
  Package,
  Pencil,
  Plus,
  QrCode,
  Receipt,
  Settings,
  Truck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ActiveBadge, EmptyState, ErrorNote, Loading, PageHeader, Panel, StatCard, StatusBadge } from "@/components/app/ui-bits";
import { CustomerFormDialog } from "@/components/app/CustomerFormDialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { customerTypeLabel, fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { EMPTY_CAN_TXN_LABEL } from "@/lib/billing";
import { unwrap } from "@/lib/queries";

export const Route = createFileRoute("/admin/customers/$customerId")({
  head: () => ({ meta: [{ title: "Customer profile — Water Plant Admin" }] }),
  component: CustomerProfile,
});

function CustomerProfile() {
  const { customerId } = Route.useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState("deliveries");
  const [qrOpen, setQrOpen] = useState(false);

  const q = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const [customer, stats, balances, items, tasks, emptyTxns, bills, settings] = await Promise.all([
        unwrap(supabase.from("customers").select("*").eq("id", customerId).maybeSingle()),
        unwrap(supabase.from("customer_stats").select("*").eq("customer_id", customerId).maybeSingle()),
        unwrap(supabase.from("customer_balances").select("*").eq("customer_id", customerId).maybeSingle()),
        unwrap(supabase.from("customer_items").select("*").eq("customer_id", customerId).order("sort_order")),
        unwrap(
          supabase
            .from("delivery_tasks")
            .select("id, task_code, created_at, completed_at, status, empty_cans_returned, employees:employee_id(name), delivery_items(product_name, requested_qty, delivered_qty, unit, unit_price, line_total)")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
            .limit(100),
        ),
        unwrap(
          supabase
            .from("customer_empty_can_txns")
            .select("*, employees:employee_id(name), delivery_tasks:task_id(task_code)")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
            .limit(100),
        ),
        unwrap(
          supabase
            .from("bill_balances")
            .select("*, delivery_tasks:task_id(task_code)")
            .eq("customer_id", customerId)
            .order("bill_date", { ascending: false })
            .limit(100),
        ),
        unwrap(supabase.from("app_settings").select("business_name, upi_id, qr_image_path").eq("id", 1).single()),
      ]);

      return {
        customer,
        stats,
        balances,
        items: items ?? [],
        tasks: tasks ?? [],
        emptyTxns: emptyTxns ?? [],
        bills: bills ?? [],
        settings,
      };
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const { customer: c, stats, balances, items, tasks, emptyTxns, bills, settings } = q.data!;
  if (!c) {
    return (
      <EmptyState
        title="Customer not found"
        action={
          <Button asChild variant="outline">
            <Link to="/admin/customers">Back to customers</Link>
          </Button>
        }
      />
    );
  }

  // Map task ID to bill balance
  const billsByTaskId = new Map((bills ?? []).map((b: any) => [b.task_id, b]));

  const outstanding = Number(balances?.outstanding || 0);
  const unappliedCredit = Number(balances?.unapplied_credit || 0);

  return (
    <div className="space-y-6">
      <Link to="/admin/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Customers
      </Link>

      <PageHeader
        title={c.name}
        description={`${c.customer_code} · ${customerTypeLabel(c)} · joined ${fmtDate(c.joined_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setQrOpen(true)}>
              <QrCode className="mr-1.5 h-4 w-4" /> Show QR
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/billing" search={{ customerId: c.id }}>
                <Receipt className="mr-1.5 h-4 w-4" /> Record Payment
              </Link>
            </Button>
            <CustomerFormDialog
              customer={c}
              trigger={
                <Button variant="water">
                  <Pencil className="mr-1.5 h-4 w-4" /> Edit
                </Button>
              }
            />
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Deliveries" value={stats?.total_deliveries ?? 0} icon={CheckCircle2} tone="success" />
        <StatCard label="Cans Delivered" value={stats?.total_cans ?? 0} icon={Droplet} />
        <StatCard label="Empty Cans Balance" value={balances?.empty_cans_balance ?? c.empty_cans_balance ?? 0} icon={Package} tone="navy" />
        <StatCard label="Total Invoiced" value={fmtMoney(balances?.total_billed ?? 0)} icon={IndianRupee} tone="navy" />
        <StatCard label="Total Paid" value={fmtMoney(balances?.total_received ?? 0)} icon={Wallet} tone="success" />
        <StatCard
          label="Outstanding Dues"
          value={fmtMoney(outstanding)}
          icon={AlertCircle}
          tone={outstanding > 0 ? "warning" : "success"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Customer Information & Pricing */}
        <div className="space-y-6 lg:col-span-1">
          <Panel title="Customer Details">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd><ActiveBadge status={c.status} /></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Customer ID</dt>
                <dd className="font-mono text-xs">{c.customer_code}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="font-medium text-foreground">{customerTypeLabel(c)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Mobile</dt>
                <dd className="font-medium text-foreground">{c.mobile}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Address</dt>
                <dd className="text-right font-medium text-foreground">{c.address}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Joining Date</dt>
                <dd className="font-medium text-foreground">{fmtDate(c.joined_at)}</dd>
              </div>
              {c.notes && (
                <div className="border-t pt-2">
                  <dt className="text-xs text-muted-foreground">Notes</dt>
                  <dd className="mt-1 text-xs text-foreground">{c.notes}</dd>
                </div>
              )}
            </dl>
          </Panel>

          {/* Customer Items & Pricing Table */}
          <Panel title="Configured Products & Pricing">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No custom items configured. Edit this customer to set pricing.</p>
            ) : (
              <div className="divide-y rounded-xl border bg-card text-sm">
                {items.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-2.5">
                    <div>
                      <p className="font-medium text-foreground">{item.item_name}</p>
                      <p className="text-xs text-muted-foreground">Per {item.unit}</p>
                    </div>
                    <p className="font-bold tabular-nums text-foreground">{fmtMoney(item.price)}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Tabbed Activity Views */}
        <div className="space-y-4 lg:col-span-2">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="deliveries">Delivery History ({tasks.length})</TabsTrigger>
              <TabsTrigger value="billing">Invoices & Billing ({bills.length})</TabsTrigger>
              <TabsTrigger value="empty_cans">Empty Cans Ledger ({emptyTxns.length})</TabsTrigger>
            </TabsList>

            {/* Tab: Deliveries */}
            <TabsContent value="deliveries" className="mt-4">
              <Panel title="Delivery History">
                {tasks.length === 0 ? (
                  <EmptyState title="No deliveries yet" description="Tasks created for this customer will appear here." />
                ) : (
                  <div className="-mx-4 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Task Code</TableHead>
                          <TableHead>Products</TableHead>
                          <TableHead className="text-center">Empties</TableHead>
                          <TableHead>Employee</TableHead>
                          <TableHead className="text-right">Bill</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tasks.map((t: any) => {
                          const bill = billsByTaskId.get(t.id);
                          return (
                            <TableRow key={t.id}>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {fmtDateTime(t.completed_at ?? t.created_at)}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{t.task_code}</TableCell>
                              <TableCell className="text-xs">
                                {t.delivery_items?.map((i: any) => (
                                  <div key={i.product_name}>
                                    {t.status === "DELIVERED" && i.delivered_qty != null ? i.delivered_qty : i.requested_qty} × {i.product_name}
                                  </div>
                                ))}
                              </TableCell>
                              <TableCell className="text-center text-xs font-semibold tabular-nums">
                                {t.empty_cans_returned > 0 ? `${t.empty_cans_returned} cans` : "—"}
                              </TableCell>
                              <TableCell className="text-xs">{t.employees?.name ?? "—"}</TableCell>
                              <TableCell className="text-right text-xs font-medium tabular-nums">
                                {bill ? fmtMoney(bill.total_amount) : "—"}
                              </TableCell>
                              <TableCell className="text-right text-xs font-medium tabular-nums text-success-foreground">
                                {bill ? fmtMoney(bill.amount_paid) : "—"}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={t.status} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Panel>
            </TabsContent>

            {/* Tab: Billing */}
            <TabsContent value="billing" className="mt-4">
              <Panel title="Invoices & Payment Status">
                {bills.length === 0 ? (
                  <EmptyState title="No bills found" description="Bills generated for completed deliveries will appear here." />
                ) : (
                  <div className="-mx-4 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bill Code</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Task</TableHead>
                          <TableHead className="text-right">Total Amount</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bills.map((b: any) => (
                          <TableRow key={b.bill_id}>
                            <TableCell className="font-mono text-xs font-semibold">{b.bill_code}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{fmtDateTime(b.bill_date)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{b.delivery_tasks?.task_code ?? "—"}</TableCell>
                            <TableCell className="text-right text-xs font-medium tabular-nums">{fmtMoney(b.total_amount)}</TableCell>
                            <TableCell className="text-right text-xs font-medium tabular-nums text-success-foreground">{fmtMoney(b.amount_paid)}</TableCell>
                            <TableCell className={`text-right text-xs font-bold tabular-nums ${b.outstanding > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                              {fmtMoney(b.outstanding)}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                b.payment_status === "PAID"
                                  ? "bg-success/15 text-success-foreground"
                                  : b.payment_status === "PARTIALLY_PAID"
                                    ? "bg-warning/15 text-warning-foreground"
                                    : "bg-destructive/15 text-destructive"
                              }`}>
                                {b.payment_status === "PAID" ? "Paid" : b.payment_status === "PARTIALLY_PAID" ? "Partial" : "Unpaid"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Panel>
            </TabsContent>

            {/* Tab: Empty Cans */}
            <TabsContent value="empty_cans" className="mt-4">
              <Panel title="Empty Cans Ledger">
                {emptyTxns.length === 0 ? (
                  <EmptyState title="No empty can movements" description="Empty cans collected during deliveries will be audited here." />
                ) : (
                  <div className="-mx-4 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-center">Quantity</TableHead>
                          <TableHead className="text-center">Previous</TableHead>
                          <TableHead className="text-center">New Balance</TableHead>
                          <TableHead>Task</TableHead>
                          <TableHead>Employee</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {emptyTxns.map((x: any) => (
                          <TableRow key={x.id}>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(x.created_at)}</TableCell>
                            <TableCell className="text-xs font-medium">
                              {EMPTY_CAN_TXN_LABEL[x.txn_type] ?? x.txn_type}
                            </TableCell>
                            <TableCell className="text-center text-xs font-bold tabular-nums text-foreground">
                              {x.quantity > 0 ? `+${x.quantity}` : x.quantity}
                            </TableCell>
                            <TableCell className="text-center text-xs text-muted-foreground tabular-nums">{x.previous_balance}</TableCell>
                            <TableCell className="text-center text-xs font-semibold tabular-nums text-primary">{x.new_balance}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{x.delivery_tasks?.task_code ?? "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{x.employees?.name ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Panel>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Show QR Payment Modal */}
      <ShowQrModal
        customer={c}
        outstanding={outstanding}
        settings={settings}
        open={qrOpen}
        onClose={() => setQrOpen(false)}
      />
    </div>
  );
}

function ShowQrModal({
  customer,
  outstanding,
  settings,
  open,
  onClose,
}: {
  customer: any;
  outstanding: number;
  settings: { business_name?: string; upi_id?: string | null; qr_image_path?: string | null } | null;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const upiId = settings?.upi_id;
  const qrPath = settings?.qr_image_path;

  // Load signed QR URL if path exists
  useQuery({
    queryKey: ["qr-image-url", qrPath],
    queryFn: async () => {
      if (!qrPath) return null;
      const { data } = await supabase.storage.from("payment-qr").createSignedUrl(qrPath, 3600);
      if (data?.signedUrl) setQrUrl(data.signedUrl);
      return data?.signedUrl ?? null;
    },
    enabled: open && !!qrPath,
  });

  function copyUpi() {
    if (!upiId) return;
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    toast.success("UPI ID copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader>
          <DialogTitle className="text-center font-display text-xl">UPI Payment QR</DialogTitle>
          <DialogDescription className="text-center">
            {customer.name} ({customer.customer_code})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Outstanding amount card */}
          <div className="rounded-2xl bg-accent/30 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Outstanding Due Balance</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums text-foreground">{fmtMoney(outstanding)}</p>
          </div>

          {/* QR Code display */}
          {qrUrl ? (
            <div className="mx-auto flex flex-col items-center justify-center rounded-2xl border bg-white p-4 shadow-soft">
              <img src={qrUrl} alt="UPI Payment QR Code" className="h-56 w-56 object-contain" />
              <p className="mt-2 text-xs font-semibold text-gray-700">Scan using any UPI app</p>
              <p className="text-[11px] text-gray-500">GPay · PhonePe · Paytm · BHIM</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-6 text-center">
              <QrCode className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold text-foreground">No QR code uploaded</p>
              <p className="text-xs text-muted-foreground">Upload your business QR code in Admin Settings to display it here.</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to="/admin/settings" onClick={onClose}>
                  <Settings className="mr-1 h-3.5 w-3.5" /> Go to Settings
                </Link>
              </Button>
            </div>
          )}

          {/* UPI ID and Copy Button */}
          {upiId ? (
            <div className="flex items-center justify-between rounded-xl border bg-card p-3">
              <div className="text-left">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Business UPI ID</p>
                <p className="font-mono text-sm font-bold text-foreground">{upiId}</p>
              </div>
              <Button variant="outline" size="sm" onClick={copyUpi} className="h-8">
                {copied ? <Check className="mr-1 h-3.5 w-3.5 text-success-foreground" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Business UPI ID not configured. Set it in Settings.
            </p>
          )}
        </div>

        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
