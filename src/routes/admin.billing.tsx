import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  IndianRupee,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "@/lib/queries";
import { EmptyState, ErrorNote, Loading, PageHeader, StatCard } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { errorMessage, fmtDateTime, fmtMoney } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, PaymentMethod } from "@/lib/billing";
import { downloadWorkbook } from "@/lib/excel";

export const Route = createFileRoute("/admin/billing")({
  validateSearch: (s: Record<string, unknown>): { tab?: string; customerId?: string } => {
    const res: { tab?: string; customerId?: string } = {};
    if (typeof s["tab"] === "string") res.tab = s["tab"];
    if (typeof s["customerId"] === "string") res.customerId = s["customerId"];
    return res;
  },
  head: () => ({ meta: [{ title: "Billing & Ledger — Water Plant Admin" }] }),
  component: BillingPage,
});

type BillBalanceRow = {
  bill_id: string;
  bill_code: string;
  customer_id: string;
  task_id: string | null;
  bill_date: string;
  total_amount: number;
  amount_paid: number;
  outstanding: number;
  payment_status: "PAID" | "PARTIALLY_PAID" | "UNPAID";
  customers?: { customer_code: string; name: string; mobile: string } | null;
  delivery_tasks?: { task_code: string } | null;
};

type PaymentRow = {
  payment_id: string;
  payment_code: string;
  customer_id: string;
  task_id: string | null;
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  allocated: number;
  unapplied: number;
  is_reversed: boolean;
  reference_no?: string | null;
  notes?: string | null;
  customer_name?: string;
  customer_code?: string;
  reverses_payment_code?: string | null;
};

type CustomerBalanceRow = {
  customer_id: string;
  empty_cans_balance: number;
  total_billed: number;
  total_allocated: number;
  total_received: number;
  outstanding: number;
  unapplied_credit: number;
  bill_count: number;
  unpaid_bills: number;
  partial_bills: number;
  last_payment_at: string | null;
  name?: string;
  customer_code?: string;
  mobile?: string;
};

function BillingPage() {
  const search = Route.useSearch();
  const qc = useQueryClient();

  useRealtimeRefresh(["bills", "payments"], [["bills"], ["payments"], ["customer-balances"]]);

  const [tab, setTab] = useState(search.tab ?? "bills");
  const [billFilter, setBillFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState(search.customerId ?? "all");
  const [searchTerm, setSearchTerm] = useState("");

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordCustomerId, setRecordCustomerId] = useState<string | undefined>(search.customerId);
  const [recordBillId, setRecordBillId] = useState<string | undefined>();

  const [reversePayment, setReversePayment] = useState<PaymentRow | null>(null);
  const [applyCustomer, setApplyCustomer] = useState<CustomerBalanceRow | null>(null);

  // 1. Fetch Customers Lite
  const customers = useQuery({
    queryKey: ["customers-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, customer_code, name, mobile").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // 2. Fetch Bills
  const billsQuery = useQuery({
    queryKey: ["bills", customerFilter, billFilter],
    queryFn: async () => {
      let q = supabase
        .from("bill_balances")
        .select("*, customers:customer_id(customer_code, name, mobile), delivery_tasks:task_id(task_code)")
        .order("bill_date", { ascending: false });
      if (customerFilter !== "all") q = q.eq("customer_id", customerFilter);
      if (billFilter !== "all") q = q.eq("payment_status", billFilter);
      return (await unwrap(q)) as unknown as BillBalanceRow[];
    },
  });

  // 3. Fetch Payments
  const paymentsQuery = useQuery({
    queryKey: ["payments", customerFilter, paymentFilter],
    queryFn: async () => {
      let q = supabase
        .from("payment_balances")
        .select("*, payments:payment_id(reference_no, notes), customers:customer_id(customer_code, name)")
        .order("paid_at", { ascending: false });
      if (customerFilter !== "all") q = q.eq("customer_id", customerFilter);
      const data = await unwrap(q);
      return (data ?? []).map((p: any) => ({
        ...p,
        reference_no: p.payments?.reference_no,
        notes: p.payments?.notes,
        customer_name: p.customers?.name,
        customer_code: p.customers?.customer_code,
      })) as PaymentRow[];
    },
  });

  // 4. Fetch Customer Balances
  const customerBalancesQuery = useQuery({
    queryKey: ["customer-balances"],
    queryFn: async () => {
      const data = await unwrap(
        supabase
          .from("customer_balances")
          .select("*, customers:customer_id(customer_code, name, mobile)")
          .order("outstanding", { ascending: false }),
      );
      return (data ?? []).map((c: any) => ({
        ...c,
        customer_code: c.customers?.customer_code,
        name: c.customers?.name,
        mobile: c.customers?.mobile,
      })) as CustomerBalanceRow[];
    },
  });

  // Totals
  const balances = customerBalancesQuery.data ?? [];
  const totalInvoiced = balances.reduce((s, b) => s + Number(b.total_billed || 0), 0);
  const totalReceived = balances.reduce((s, b) => s + Number(b.total_received || 0), 0);
  const totalOutstanding = balances.reduce((s, b) => s + Number(b.outstanding || 0), 0);
  const totalCredit = balances.reduce((s, b) => s + Number(b.unapplied_credit || 0), 0);

  // Filtered Bills
  const filteredBills = useMemo(() => {
    let list = billsQuery.data ?? [];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (b) =>
          b.bill_code.toLowerCase().includes(term) ||
          b.customers?.name?.toLowerCase().includes(term) ||
          b.customers?.customer_code?.toLowerCase().includes(term) ||
          b.delivery_tasks?.task_code?.toLowerCase().includes(term),
      );
    }
    return list;
  }, [billsQuery.data, searchTerm]);

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    let list = paymentsQuery.data ?? [];
    if (paymentFilter !== "all") {
      list = list.filter((p) => p.method === paymentFilter);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (p) =>
          p.payment_code.toLowerCase().includes(term) ||
          p.customer_name?.toLowerCase().includes(term) ||
          p.customer_code?.toLowerCase().includes(term) ||
          (p.reference_no && p.reference_no.toLowerCase().includes(term)),
      );
    }
    return list;
  }, [paymentsQuery.data, paymentFilter, searchTerm]);

  // Export Bills
  async function handleExportBills() {
    await downloadWorkbook(`Bills_${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: "Bills",
        columns: [
          { header: "Bill Code", key: "bill_code" },
          { header: "Date", key: "date", type: "datetime" },
          { header: "Customer Code", key: "customer_code" },
          { header: "Customer Name", key: "customer_name" },
          { header: "Task Code", key: "task_code" },
          { header: "Total Amount", key: "total_amount", type: "money" },
          { header: "Amount Paid", key: "amount_paid", type: "money" },
          { header: "Pending Amount", key: "outstanding", type: "money" },
          { header: "Status", key: "payment_status" },
        ],
        rows: filteredBills.map((b) => ({
          bill_code: b.bill_code,
          date: b.bill_date,
          customer_code: b.customers?.customer_code ?? "",
          customer_name: b.customers?.name ?? "",
          task_code: b.delivery_tasks?.task_code ?? "Direct",
          total_amount: b.total_amount,
          amount_paid: b.amount_paid,
          outstanding: b.outstanding,
          payment_status: b.payment_status,
        })),
      },
    ]);
  }

  // Export Payments
  async function handleExportPayments() {
    await downloadWorkbook(`Payments_${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: "Payments",
        columns: [
          { header: "Payment Code", key: "payment_code" },
          { header: "Date", key: "date", type: "datetime" },
          { header: "Customer Code", key: "customer_code" },
          { header: "Customer Name", key: "customer_name" },
          { header: "Amount", key: "amount", type: "money" },
          { header: "Method", key: "method" },
          { header: "Allocated", key: "allocated", type: "money" },
          { header: "Unapplied Credit", key: "unapplied", type: "money" },
          { header: "Reference", key: "reference" },
          { header: "Notes", key: "notes" },
          { header: "Status", key: "status" },
        ],
        rows: filteredPayments.map((p) => ({
          payment_code: p.payment_code,
          date: p.paid_at,
          customer_code: p.customer_code ?? "",
          customer_name: p.customer_name ?? "",
          amount: p.amount,
          method: PAYMENT_METHOD_LABEL[p.method] ?? p.method,
          allocated: p.allocated,
          unapplied: p.unapplied,
          reference: p.reference_no ?? "",
          notes: p.notes ?? "",
          status: p.is_reversed ? "Reversed" : "Active",
        })),
      },
    ]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Reconciliation"
        description="Comprehensive ledger, offline payment collection, customer credit management, and billing audit."
        actions={
          <div className="flex gap-2">
            <Button
              variant="water"
              onClick={() => {
                setRecordCustomerId(customerFilter !== "all" ? customerFilter : undefined);
                setRecordBillId(undefined);
                setRecordOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Record Payment
            </Button>
          </div>
        }
      />

      {/* Top 4 Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Invoiced" value={fmtMoney(totalInvoiced)} icon={IndianRupee} tone="navy" />
        <StatCard label="Total Received" value={fmtMoney(totalReceived)} icon={CheckCircle2} tone="success" />
        <StatCard label="Outstanding Dues" value={fmtMoney(totalOutstanding)} icon={AlertCircle} tone={totalOutstanding > 0 ? "warning" : "success"} />
        <StatCard label="Unapplied Credit" value={fmtMoney(totalCredit)} icon={Wallet} tone="navy" />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="bills">Bills & Invoices ({billsQuery.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="payments">Payments ({paymentsQuery.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="reconciliation">Customer Balances & Credit ({balances.length})</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            {/* Customer Filter */}
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-48 h-9 text-xs">
                <SelectValue placeholder="All Customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {(customers.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.customer_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-44 pl-8 h-9 text-xs"
              />
            </div>

            {/* Excel Download */}
            {tab === "bills" && (
              <Button variant="outline" size="sm" onClick={handleExportBills} className="h-9 text-xs">
                <Download className="mr-1 h-3.5 w-3.5" /> Export Excel
              </Button>
            )}
            {tab === "payments" && (
              <Button variant="outline" size="sm" onClick={handleExportPayments} className="h-9 text-xs">
                <Download className="mr-1 h-3.5 w-3.5" /> Export Excel
              </Button>
            )}
          </div>
        </div>

        {/* Tab 1: Bills */}
        <TabsContent value="bills" className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Status:</span>
            {["all", "UNPAID", "PARTIALLY_PAID", "PAID"].map((st) => (
              <Button
                key={st}
                size="sm"
                variant={billFilter === st ? "default" : "outline"}
                className="h-7 text-xs px-2.5"
                onClick={() => setBillFilter(st)}
              >
                {st === "all" ? "All" : st === "UNPAID" ? "Unpaid" : st === "PARTIALLY_PAID" ? "Partially Paid" : "Paid"}
              </Button>
            ))}
          </div>

          <div className="rounded-2xl border bg-card shadow-soft overflow-x-auto">
            {billsQuery.isLoading ? (
              <Loading />
            ) : filteredBills.length === 0 ? (
              <EmptyState title="No bills found" description="No invoices matching the selected filters." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill Code</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right">Amount Paid</TableHead>
                    <TableHead className="text-right">Pending Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBills.map((b) => (
                    <TableRow key={b.bill_id}>
                      <TableCell className="font-semibold text-foreground">{b.bill_code}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDateTime(b.bill_date)}</TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">{b.customers?.name}</p>
                        <p className="text-xs text-muted-foreground">{b.customers?.customer_code}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{b.delivery_tasks?.task_code ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{fmtMoney(b.total_amount)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-success-foreground">{fmtMoney(b.amount_paid)}</TableCell>
                      <TableCell className={`text-right font-bold tabular-nums ${b.outstanding > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                        {fmtMoney(b.outstanding)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          b.payment_status === "PAID"
                            ? "bg-success/15 text-success-foreground"
                            : b.payment_status === "PARTIALLY_PAID"
                              ? "bg-warning/15 text-warning-foreground"
                              : "bg-destructive/15 text-destructive"
                        }`}>
                          {b.payment_status === "PAID" ? "Paid" : b.payment_status === "PARTIALLY_PAID" ? "Partially paid" : "Unpaid"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {b.outstanding > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setRecordCustomerId(b.customer_id);
                              setRecordBillId(b.bill_id);
                              setRecordOpen(true);
                            }}
                          >
                            Pay Bill
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Payments */}
        <TabsContent value="payments" className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Method:</span>
            {["all", ...PAYMENT_METHODS].map((m) => (
              <Button
                key={m}
                size="sm"
                variant={paymentFilter === m ? "default" : "outline"}
                className="h-7 text-xs px-2.5"
                onClick={() => setPaymentFilter(m)}
              >
                {m === "all" ? "All" : PAYMENT_METHOD_LABEL[m as PaymentMethod]}
              </Button>
            ))}
          </div>

          <div className="rounded-2xl border bg-card shadow-soft overflow-x-auto">
            {paymentsQuery.isLoading ? (
              <Loading />
            ) : filteredPayments.length === 0 ? (
              <EmptyState title="No payments recorded" description="No payment transactions found." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Code</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Unapplied Credit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((p) => (
                    <TableRow key={p.payment_id}>
                      <TableCell className="font-semibold text-foreground">{p.payment_code}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDateTime(p.paid_at)}</TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">{p.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{p.customer_code}</p>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        <span className="rounded-md bg-accent px-2 py-0.5 text-accent-foreground">
                          {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.reference_no ?? "—"}</TableCell>
                      <TableCell className={`text-right font-bold tabular-nums ${p.amount < 0 ? "text-destructive" : "text-foreground"}`}>
                        {fmtMoney(p.amount)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-muted-foreground">{fmtMoney(p.allocated)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-primary">{fmtMoney(p.unapplied)}</TableCell>
                      <TableCell>
                        {p.is_reversed ? (
                          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">Reversed</span>
                        ) : p.amount < 0 ? (
                          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">Reversal Entry</span>
                        ) : (
                          <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success-foreground">Active</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!p.is_reversed && p.amount > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() => setReversePayment(p)}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" /> Reverse
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Tab 3: Customer Balances & Credit */}
        <TabsContent value="reconciliation" className="space-y-4">
          <div className="rounded-2xl border bg-card shadow-soft overflow-x-auto">
            {customerBalancesQuery.isLoading ? (
              <Loading />
            ) : balances.length === 0 ? (
              <EmptyState title="No customer balances" description="Customer balances will appear here as bills are issued." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total Invoiced</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead className="text-right">Outstanding Dues</TableHead>
                    <TableHead className="text-right">Unapplied Credit</TableHead>
                    <TableHead className="text-center">Unpaid Bills</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map((c) => (
                    <TableRow key={c.customer_id}>
                      <TableCell>
                        <p className="font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.customer_code} · {c.mobile}</p>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{fmtMoney(c.total_billed)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-success-foreground">{fmtMoney(c.total_received)}</TableCell>
                      <TableCell className={`text-right font-bold tabular-nums ${c.outstanding > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                        {fmtMoney(c.outstanding)}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums text-primary">{fmtMoney(c.unapplied_credit)}</TableCell>
                      <TableCell className="text-center">
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold">{c.unpaid_bills}</span>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {c.unapplied_credit > 0 && c.outstanding > 0 && (
                          <Button
                            variant="water"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setApplyCustomer(c)}
                          >
                            <RefreshCw className="mr-1 h-3 w-3" /> Apply Credit
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setRecordCustomerId(c.customer_id);
                            setRecordBillId(undefined);
                            setRecordOpen(true);
                          }}
                        >
                          Record Payment
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        initialCustomerId={recordCustomerId || undefined}
        initialBillId={recordBillId || undefined}
        customers={customers.data ?? []}
      />

      {/* Reverse Payment Dialog */}
      {reversePayment && (
        <ReversePaymentDialog
          payment={reversePayment}
          open={Boolean(reversePayment)}
          onClose={() => setReversePayment(null)}
        />
      )}

      {/* Apply Credit Dialog */}
      {applyCustomer && (
        <ApplyCreditDialog
          customer={applyCustomer}
          open={Boolean(applyCustomer)}
          onClose={() => setApplyCustomer(null)}
        />
      )}
    </div>
  );
}

function RecordPaymentDialog({
  open,
  onOpenChange,
  initialCustomerId,
  initialBillId,
  customers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialCustomerId?: string | undefined;
  initialBillId?: string | undefined;
  customers: { id: string; customer_code: string; name: string }[];
}) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [mode, setMode] = useState<"OLDEST" | "BILL" | "CREDIT">(initialBillId ? "BILL" : "OLDEST");
  const [billId, setBillId] = useState(initialBillId ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [paidAt, setPaidAt] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useState(() => {
    if (initialCustomerId) setCustomerId(initialCustomerId);
    if (initialBillId) {
      setBillId(initialBillId);
      setMode("BILL");
    }
  });

  const openBills = useQuery({
    queryKey: ["customer-open-bills", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const { data, error } = await supabase
        .from("bill_balances")
        .select("*")
        .eq("customer_id", customerId)
        .gt("outstanding", 0)
        .order("bill_date");
      if (error) throw error;
      return (data ?? []) as BillBalanceRow[];
    },
    enabled: open && !!customerId,
  });

  function onSelectBill(id: string) {
    setBillId(id);
    const b = openBills.data?.find((x) => x.bill_id === id);
    if (b) setAmount(String(b.outstanding));
  }

  async function submit() {
    if (busy) return;
    if (!customerId) { toast.error("Select a customer"); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid payment amount"); return; }
    if (mode === "BILL" && !billId) { toast.error("Select the bill to pay"); return; }

    setBusy(true);
    const { error } = await supabase.rpc("record_customer_payment", {
      _customer_id: customerId,
      _amount: amt,
      _method: method,
      _mode: mode,
      ...(mode === "BILL" && billId ? { _bill_id: billId } : {}),
      ...(reference.trim() ? { _reference: reference.trim() } : {}),
      ...(notes.trim() ? { _notes: notes.trim() } : {}),
      ...(paidAt ? { _paid_at: new Date(paidAt).toISOString() } : {}),
    });
    setBusy(false);

    if (error) { toast.error(errorMessage(error)); return; }

    toast.success("Payment recorded successfully!");
    qc.invalidateQueries({ queryKey: ["bills"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["customer-balances"] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>Record offline cash, UPI, or bank transfer payments.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setBillId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c.customer_code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>How to apply payment</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OLDEST">Auto-apply to oldest open bills first</SelectItem>
                <SelectItem value="BILL">Apply to a specific bill</SelectItem>
                <SelectItem value="CREDIT">Save as unapplied customer credit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "BILL" && (
            <div className="space-y-1.5">
              <Label>Select Bill</Label>
              {openBills.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading open bills...</p>
              ) : (openBills.data ?? []).length === 0 ? (
                <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">This customer has no unpaid bills.</p>
              ) : (
                <Select value={billId} onValueChange={onSelectBill}>
                  <SelectTrigger><SelectValue placeholder="Select bill" /></SelectTrigger>
                  <SelectContent>
                    {(openBills.data ?? []).map((b) => (
                      <SelectItem key={b.bill_id} value={b.bill_id}>
                        {b.bill_code} · {fmtDateTime(b.bill_date)} · Pending {fmtMoney(b.outstanding)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payAmt">Amount (₹)</Label>
              <Input
                id="payAmt"
                type="number"
                min="0.01"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payDate">Payment Date (optional)</Label>
              <Input id="payDate" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payRef">Reference / Txn No</Label>
              <Input id="payRef" placeholder="e.g. UPI Ref / UTR" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payNotes">Notes (optional)</Label>
            <Textarea id="payNotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="water" onClick={submit} disabled={busy || !customerId || !amount}>
            {busy && <Loader2 className="animate-spin" />} Save Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReversePaymentDialog({
  payment,
  open,
  onClose,
}: {
  payment: PaymentRow;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    if (reason.trim().length < 3) {
      toast.error("Please enter a short reason for reversing this payment");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("reverse_payment", {
      _payment_id: payment.payment_id,
      _reason: reason.trim(),
    });
    setBusy(false);

    if (error) { toast.error(errorMessage(error)); return; }

    toast.success(`Payment ${payment.payment_code} reversed.`);
    qc.invalidateQueries({ queryKey: ["bills"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["customer-balances"] });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reverse Payment {payment.payment_code}</DialogTitle>
          <DialogDescription>
            This creates an auditable negative payment entry and rolls back bill allocations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/40 p-3 text-sm">
            <p className="font-semibold text-foreground">{payment.customer_name} ({payment.customer_code})</p>
            <p className="text-xs text-muted-foreground">{fmtDateTime(payment.paid_at)} · {PAYMENT_METHOD_LABEL[payment.method]}</p>
            <p className="mt-1 text-base font-bold text-foreground">{fmtMoney(payment.amount)}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="revReason">Reason for reversal</Label>
            <Textarea
              id="revReason"
              rows={2}
              placeholder="e.g. Cheque bounced, entered duplicate amount, wrong customer"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={busy || reason.trim().length < 3}>
            {busy && <Loader2 className="animate-spin" />} Confirm Reversal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyCreditDialog({
  customer,
  open,
  onClose,
}: {
  customer: CustomerBalanceRow;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("apply_customer_credit", {
      _customer_id: customer.customer_id,
    });
    setBusy(false);

    if (error) { toast.error(errorMessage(error)); return; }

    toast.success(`Successfully applied ${fmtMoney(data as number)} credit to open bills!`);
    qc.invalidateQueries({ queryKey: ["bills"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["customer-balances"] });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply Customer Credit</DialogTitle>
          <DialogDescription>
            Allocate unapplied balance to this customer's oldest pending invoices.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
          <p className="font-semibold text-foreground">{customer.name} ({customer.customer_code})</p>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="rounded-lg bg-accent/40 p-2 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Unapplied Credit</p>
              <p className="text-base font-bold text-primary tabular-nums">{fmtMoney(customer.unapplied_credit)}</p>
            </div>
            <div className="rounded-lg bg-warning/15 p-2 text-center">
              <p className="text-[10px] text-warning-foreground uppercase">Pending Invoices</p>
              <p className="text-base font-bold text-warning-foreground tabular-nums">{fmtMoney(customer.outstanding)}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="water" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Apply Credit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
