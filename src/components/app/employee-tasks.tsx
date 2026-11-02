import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, MapPin, PauseCircle, Phone, Play, Receipt, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PriorityBadge, StatusBadge } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNow } from "@/hooks/use-realtime";
import { errorMessage, fmtDateTime, fmtMoney, formatClock } from "@/lib/format";
import { unwrap } from "@/lib/queries";
import { money, PAYMENT_METHODS, PAYMENT_METHOD_LABEL, PaymentMethod, PaymentStatus } from "@/lib/billing";

export type MyTask = {
  id: string;
  task_code: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  priority: number;
  status: string;
  notes: string | null;
  hold_reason: string | null;
  scheduled_date: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  failure_reason: string | null;
  empty_cans_returned: number;
  delivery_items: {
    id: string;
    product_id: string;
    product_name: string;
    product_kind: string;
    unit: string;
    requested_qty: number;
    delivered_qty: number | null;
    unit_price: number;
    line_total: number | null;
  }[];
};

export const MY_SELECT =
  "id, task_code, customer_name, customer_phone, delivery_address, priority, status, notes, hold_reason, scheduled_date, created_at, started_at, completed_at, duration_seconds, failure_reason, empty_cans_returned, delivery_items(id, product_id, product_name, product_kind, unit, requested_qty, delivered_qty, unit_price, line_total)";

export function useMyQueue(employeeId: string) {
  return useQuery({
    queryKey: ["my-queue", employeeId],
    queryFn: async () => {
      const [tasks, nextId, perms] = await Promise.all([
        unwrap(
          supabase
            .from("delivery_tasks")
            .select(MY_SELECT)
            .eq("employee_id", employeeId)
            .in("status", ["PENDING", "IN_PROGRESS", "ON_HOLD"])
            .order("priority")
            .order("scheduled_date", { ascending: true, nullsFirst: true })
            .order("created_at"),
        ),
        unwrap(supabase.rpc("my_next_task_id")),
        unwrap(supabase.from("employee_permissions").select("*").eq("employee_id", employeeId).maybeSingle()),
      ]);
      const list = tasks as unknown as MyTask[];
      return {
        active: list.find((t) => t.status === "IN_PROGRESS") ?? null,
        pending: list.filter((t) => t.status === "PENDING"),
        onHold: list.filter((t) => t.status === "ON_HOLD"),
        nextId: nextId as string | null,
        perms,
      };
    },
  });
}

export function useMyFinished(employeeId: string, sinceIso?: string) {
  return useQuery({
    queryKey: ["my-finished", employeeId, sinceIso ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("delivery_tasks")
        .select(MY_SELECT)
        .eq("employee_id", employeeId)
        .in("status", ["DELIVERED", "FAILED", "CANCELLED"])
        .order("completed_at", { ascending: false })
        .limit(200);
      if (sinceIso) q = q.gte("completed_at", sinceIso);
      return (await unwrap(q)) as unknown as MyTask[];
    },
  });
}

export function invalidateMine(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["my-queue"] });
  qc.invalidateQueries({ queryKey: ["my-finished"] });
  qc.invalidateQueries({ queryKey: ["my-tasks-all"] });
}

function Items({ task, delivered = false }: { task: MyTask; delivered?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {task.delivery_items.map((i) => (
        <span key={i.id} className="rounded-lg bg-accent px-2.5 py-1 text-sm font-semibold text-accent-foreground">
          {delivered && i.delivered_qty != null ? i.delivered_qty : i.requested_qty} × {i.product_name}
        </span>
      ))}
    </div>
  );
}

export function QueueTaskCard({
  task,
  isNext,
  blocked,
  canStart,
}: {
  task: MyTask;
  isNext?: boolean;
  blocked?: boolean;
  canStart?: boolean;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const futureDate = task.scheduled_date && task.scheduled_date > new Date().toISOString().slice(0, 10);

  async function start() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("start_delivery", { _task_id: task.id });
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    toast.success(`Started delivery ${task.task_code}`);
    invalidateMine(qc);
  }

  return (
    <div className="rounded-3xl border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{task.task_code}</span>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <p className="font-display text-lg font-semibold">{task.customer_name}</p>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" /> {task.delivery_address}</p>
        <a href={`tel:${task.customer_phone}`} className="flex items-center gap-1.5 text-sm font-semibold text-primary"><Phone className="size-4" /> {task.customer_phone}</a>
        <Items task={task} />
        {task.notes && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{task.notes}</p>}
        {task.status === "ON_HOLD" && task.hold_reason && <p className="text-sm text-muted-foreground">On hold: {task.hold_reason}. The office will return it to your queue.</p>}
        <p className="text-xs text-muted-foreground">Assigned {fmtDateTime(task.created_at)}{task.scheduled_date ? ` · scheduled ${task.scheduled_date}` : ""}</p>
      </div>
      {task.status === "PENDING" && (
        <div className="mt-4">
          {isNext && canStart && !blocked ? (
            <Button variant="water" size="lg" className="w-full" onClick={start} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Play />} Start delivery
            </Button>
          ) : (
            <p className="rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
              {!canStart
                ? "You don't have permission to start deliveries."
                : blocked
                  ? "Finish your current delivery first."
                  : futureDate
                    ? "Scheduled for a later date."
                    : "Waiting — deliver higher-priority tasks first."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ActiveDeliveryCard({
  task,
  perms,
}: {
  task: MyTask;
  perms: { can_complete_delivery: boolean; can_report_failure: boolean; can_hold_delivery: boolean } | null;
}) {
  const now = useNow(1000);
  const elapsed = task.started_at ? (now - new Date(task.started_at).getTime()) / 1000 : 0;
  const [mode, setMode] = useState<null | "complete" | "fail" | "hold">(null);

  return (
    <div className="overflow-hidden rounded-3xl bg-deep text-navy-foreground shadow-card">
      <div className="p-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold">
            <span className="size-2 animate-pulse rounded-full bg-primary-glow" /> Delivery in progress
          </span>
          <span className="text-xs opacity-80">{task.task_code}</span>
        </div>
        <p className="mt-4 font-display text-5xl font-semibold tabular-nums">{formatClock(elapsed)}</p>
        <p className="text-xs opacity-70">Started {fmtDateTime(task.started_at)}</p>
        <p className="mt-4 font-display text-xl font-semibold">{task.customer_name}</p>
        <div className="mt-2 space-y-1.5 text-sm opacity-90">
          <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" /> {task.delivery_address}</p>
          <a href={`tel:${task.customer_phone}`} className="flex items-center gap-2 font-semibold"><Phone className="size-4" /> {task.customer_phone}</a>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {task.delivery_items.map((i) => (
            <span key={i.id} className="rounded-lg bg-primary-foreground/15 px-2.5 py-1 text-sm font-semibold">{i.requested_qty} × {i.product_name}</span>
          ))}
        </div>
        {task.notes && <p className="mt-3 rounded-lg bg-primary-foreground/10 px-3 py-2 text-sm">{task.notes}</p>}
      </div>
      <div className="grid gap-2 bg-primary-foreground/5 p-4 sm:grid-cols-3">
        <Button variant="success" size="lg" className="sm:col-span-3" disabled={!perms?.can_complete_delivery} onClick={() => setMode("complete")}>
          <CheckCircle2 /> Complete delivery
        </Button>
        <Button variant="outline" className="text-foreground" disabled={!perms?.can_report_failure} onClick={() => setMode("fail")}><XCircle /> Report failed</Button>
        <Button variant="outline" className="text-foreground sm:col-span-2" disabled={!perms?.can_hold_delivery} onClick={() => setMode("hold")}><PauseCircle /> Put on hold</Button>
      </div>
      <CompleteDialog task={task} open={mode === "complete"} onClose={() => setMode(null)} />
      <ReasonDialog task={task} kind={mode === "fail" ? "fail" : mode === "hold" ? "hold" : null} onClose={() => setMode(null)} />
    </div>
  );
}

export function CompleteDialog({ task, open, onClose }: { task: MyTask; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [empties, setEmpties] = useState("0");
  const [amountPaid, setAmountPaid] = useState("");
  const [oldDuesPaid, setOldDuesPaid] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const billingContext = useQuery({
    queryKey: ["delivery-billing-context", task.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("delivery_billing_context", { _task_id: task.id });
      if (error) throw error;
      return data as { empty_cans_balance: number; previous_outstanding: number; open_bills: number };
    },
    enabled: open,
  });

  const value = (id: string, req: number) => qty[id] ?? String(req);

  useEffect(() => {
    if (open) {
      setStep("form");
      const initialQty: Record<string, string> = {};
      let initialBill = 0;
      for (const item of task.delivery_items) {
        initialQty[item.id] = String(item.requested_qty);
        initialBill += money(item.requested_qty * (item.unit_price || 0));
      }
      setQty(initialQty);
      setEmpties("0");
      setAmountPaid(String(money(initialBill)));
      setOldDuesPaid("0");
      setPaymentMethod("CASH");
      setReferenceNo("");
      setNotes("");
      setPaymentNotes("");
    }
  }, [open, task]);

  const currentBillTotal = money(
    task.delivery_items.reduce((sum, item) => {
      const q = Number(value(item.id, item.requested_qty)) || 0;
      return sum + money(q * (item.unit_price || 0));
    }, 0),
  );

  const prevOutstanding = money(billingContext.data?.previous_outstanding ?? 0);
  const totalPayable = money(currentBillTotal + prevOutstanding);

  const nowAmt = money(Number(amountPaid) || 0);
  const duesAmt = money(Number(oldDuesPaid) || 0);
  const totalCollected = money(nowAmt + duesAmt);

  const billPending = money(Math.max(0, currentBillTotal - nowAmt));
  const remainingOldDues = money(Math.max(0, prevOutstanding - duesAmt));
  const totalRemainingBalance = money(billPending + remainingOldDues);

  const derivedStatus: PaymentStatus =
    currentBillTotal - nowAmt <= 0 ? "PAID" : nowAmt > 0 ? "PARTIALLY_PAID" : "UNPAID";

  function handleGoToReview() {
    for (const src of task.delivery_items) {
      const d = Number(value(src.id, src.requested_qty));
      if (!Number.isInteger(d) || d < 0) {
        toast.error(`Delivered quantity for ${src.product_name} must be 0 or more`);
        return;
      }
      if (d > src.requested_qty) {
        toast.error(`You cannot deliver more than requested (${src.requested_qty}) for ${src.product_name}`);
        return;
      }
    }
    const totalDelivered = task.delivery_items.reduce((s, i) => s + (Number(value(i.id, i.requested_qty)) || 0), 0);
    if (totalDelivered === 0) {
      toast.error('Nothing delivered? Use "Report failed" instead.');
      return;
    }
    const e = Number(empties);
    if (!Number.isInteger(e) || e < 0) {
      toast.error("Empty cans returned must be 0 or more");
      return;
    }
    if (nowAmt < 0 || nowAmt > currentBillTotal) {
      toast.error(`Amount paid now cannot exceed current bill of ${fmtMoney(currentBillTotal)}`);
      return;
    }
    if (duesAmt < 0 || duesAmt > prevOutstanding) {
      toast.error(`Old dues paid cannot exceed previous dues of ${fmtMoney(prevOutstanding)}`);
      return;
    }
    setStep("confirm");
  }

  async function handleConfirmSubmit() {
    if (busy) return;
    setBusy(true);

    const items = task.delivery_items.map((i) => ({
      item_id: i.id,
      delivered_qty: Number(value(i.id, i.requested_qty)),
    }));

    const paymentPayload: Record<string, unknown> = {
      amount_paid: nowAmt,
      old_dues_paid: duesAmt,
      method: totalCollected > 0 ? paymentMethod : "CASH",
      payment_status: derivedStatus,
      ...(referenceNo.trim() ? { reference_no: referenceNo.trim() } : {}),
      ...(paymentNotes.trim() ? { notes: paymentNotes.trim() } : {}),
    };

    const { error } = await supabase.rpc("complete_delivery", {
      _task_id: task.id,
      _items: items,
      _empty_cans_returned: Number(empties) || 0,
      ...(notes.trim() ? { _notes: notes.trim() } : {}),
      _payment: paymentPayload as any,
    });

    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      invalidateMine(qc);
      return;
    }

    toast.success("Delivery completed and recorded successfully!");
    invalidateMine(qc);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{step === "confirm" ? "Confirm Delivery & Payment" : `Complete ${task.task_code}`}</DialogTitle>
          <DialogDescription>
            {step === "confirm"
              ? "Verify details before updating inventory, bills, and payment records."
              : `Handing over goods to ${task.customer_name}`}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="space-y-4">
            {/* 1. Items Delivered */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">1. Delivered quantities</Label>
              <div className="space-y-2 rounded-xl border bg-card p-3">
                {task.delivery_items.map((i) => {
                  const dQty = Number(value(i.id, i.requested_qty)) || 0;
                  const lineAmt = money(dQty * (i.unit_price || 0));
                  return (
                    <div key={i.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{i.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtMoney(i.unit_price)} / {i.unit} · Ordered: {i.requested_qty}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          id={i.id}
                          className="w-20 text-center text-base"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={i.requested_qty}
                          value={value(i.id, i.requested_qty)}
                          onChange={(e) => {
                            const newQty = { ...qty, [i.id]: e.target.value };
                            setQty(newQty);
                            // Auto-adjust default amount paid to new total bill
                            const newTotal = task.delivery_items.reduce((s, it) => {
                              const q = Number(it.id === i.id ? e.target.value : (newQty[it.id] ?? it.requested_qty)) || 0;
                              return s + money(q * (it.unit_price || 0));
                            }, 0);
                            setAmountPaid(String(money(newTotal)));
                          }}
                        />
                        <span className="w-16 text-right text-sm font-semibold tabular-nums">{fmtMoney(lineAmt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Empty Cans */}
            <div className="space-y-1.5 rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="empties" className="font-semibold">2. Empty cans collected</Label>
                  <p className="text-xs text-muted-foreground">
                    Customer currently has: {billingContext.data?.empty_cans_balance ?? 0} cans
                  </p>
                </div>
                <Input
                  id="empties"
                  className="w-20 text-center text-base"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={empties}
                  onChange={(e) => setEmpties(e.target.value)}
                />
              </div>
            </div>

            {/* 3. Billing & Payment */}
            <div className="space-y-3 rounded-xl border bg-accent/20 p-3">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="text-xs text-muted-foreground">Delivery Bill Amount</p>
                  <p className="text-lg font-bold tabular-nums text-foreground">{fmtMoney(currentBillTotal)}</p>
                </div>
                {prevOutstanding > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Previous Unpaid Dues</p>
                    <p className="text-sm font-semibold tabular-nums text-warning-foreground">{fmtMoney(prevOutstanding)}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="amtPaid" className="text-xs font-semibold">Amount Paid Now (for this bill)</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setAmountPaid(String(currentBillTotal))}
                    >
                      Full ({fmtMoney(currentBillTotal)})
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setAmountPaid("0")}
                    >
                      ₹0
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="amtPaid"
                    type="number"
                    min={0}
                    max={currentBillTotal}
                    step="any"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder="0.00"
                    className="font-medium"
                  />
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    derivedStatus === "PAID"
                      ? "bg-success/15 text-success-foreground"
                      : derivedStatus === "PARTIALLY_PAID"
                        ? "bg-warning/15 text-warning-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}>
                    {derivedStatus === "PAID" ? "Paid" : derivedStatus === "PARTIALLY_PAID" ? "Partial" : "Unpaid"}
                  </span>
                </div>
              </div>

              {prevOutstanding > 0 && (
                <div className="space-y-1.5 border-t pt-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="duesPaid" className="text-xs font-semibold">Old Dues Collected</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setOldDuesPaid(String(prevOutstanding))}
                    >
                      Full Dues ({fmtMoney(prevOutstanding)})
                    </Button>
                  </div>
                  <Input
                    id="duesPaid"
                    type="number"
                    min={0}
                    max={prevOutstanding}
                    step="any"
                    value={oldDuesPaid}
                    onChange={(e) => setOldDuesPaid(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}

              {totalCollected > 0 && (
                <div className="space-y-3 border-t pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Total Collected Now:</span>
                    <span className="text-base font-bold tabular-nums text-primary">{fmtMoney(totalCollected)}</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment Method</Label>
                    <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(paymentMethod === "UPI" || paymentMethod === "BANK_TRANSFER") && (
                    <div className="space-y-1.5">
                      <Label htmlFor="refNo" className="text-xs">Transaction / Reference Number (optional)</Label>
                      <Input
                        id="refNo"
                        placeholder="e.g. UPI Ref / UTR"
                        value={referenceNo}
                        onChange={(e) => setReferenceNo(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="cn" className="text-xs">Delivery notes (optional)</Label>
              <Textarea id="cn" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Left with security" />
            </div>
          </div>
        ) : (
          /* Confirmation Step */
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="font-display text-lg font-bold">{task.customer_name}</p>
              <p className="text-xs text-muted-foreground">{task.delivery_address}</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items Handed Over</p>
              <div className="divide-y rounded-xl border bg-card text-sm">
                {task.delivery_items.map((i) => {
                  const dQty = Number(value(i.id, i.requested_qty)) || 0;
                  const lineTotal = money(dQty * (i.unit_price || 0));
                  return (
                    <div key={i.id} className="flex justify-between p-2.5">
                      <div>
                        <span className="font-medium">{i.product_name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {dQty} {i.unit} × {fmtMoney(i.unit_price)}
                        </span>
                      </div>
                      <span className="font-semibold tabular-nums">{fmtMoney(lineTotal)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 rounded-xl border bg-card p-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Current Delivery Bill:</span>
                <span className="font-semibold text-foreground tabular-nums">{fmtMoney(currentBillTotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Amount Paid Now (Bill):</span>
                <span className="font-semibold text-foreground tabular-nums">{fmtMoney(nowAmt)}</span>
              </div>
              {prevOutstanding > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Previous Outstanding Dues:</span>
                    <span className="font-semibold text-warning-foreground tabular-nums">{fmtMoney(prevOutstanding)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Old Dues Paid:</span>
                    <span className="font-semibold text-foreground tabular-nums">{fmtMoney(duesAmt)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>Total Collected:</span>
                <span className="text-primary tabular-nums">{fmtMoney(totalCollected)} {totalCollected > 0 && `(${PAYMENT_METHOD_LABEL[paymentMethod]})`}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-xs">
                <span className="text-muted-foreground">Remaining Balance After Delivery:</span>
                <span className="font-bold text-foreground tabular-nums">{fmtMoney(totalRemainingBalance)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Empty Cans Collected:</span>
                <span className="font-bold text-foreground">{empties} cans</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "form" ? (
            <Button variant="success" size="lg" className="w-full" onClick={handleGoToReview} disabled={busy}>
              Review delivery details →
            </Button>
          ) : (
            <div className="flex w-full gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("form")} disabled={busy}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Edit
              </Button>
              <Button variant="success" className="flex-1" onClick={handleConfirmSubmit} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} Confirm & Complete
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({ task, kind, onClose }: { task: MyTask; kind: "fail" | "hold" | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const presets = kind === "fail" ? ["Customer not available", "Address locked", "Customer refused", "Wrong address"] : ["Customer asked to come later", "Vehicle problem", "Waiting for payment"];
  async function submit() {
    if (busy || !kind) return;
    if (reason.trim().length < 3) { toast.error("Please give a short reason"); return; }
    setBusy(true);
    const { error } = kind === "fail"
      ? await supabase.rpc("fail_delivery", { _task_id: task.id, _reason: reason })
      : await supabase.rpc("hold_delivery", { _task_id: task.id, _reason: reason });
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    toast.success(kind === "fail" ? "Delivery marked as failed" : "Delivery put on hold");
    invalidateMine(qc);
    setReason("");
    onClose();
  }
  return (
    <Dialog open={kind !== null} onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === "fail" ? "Report failed delivery" : "Put delivery on hold"}</DialogTitle>
          <DialogDescription>{kind === "fail" ? "No stock will be deducted." : "The office can return this task to your queue later."}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => <Button key={p} size="sm" variant={reason === p ? "default" : "outline"} onClick={() => setReason(p)}>{p}</Button>)}
        </div>
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        <DialogFooter>
          <Button variant={kind === "fail" ? "destructive" : "default"} className="w-full" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} {kind === "fail" ? "Mark as failed" : "Put on hold"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FinishedTaskRow({ task }: { task: MyTask }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{task.task_code} · {fmtDateTime(task.completed_at)}</p>
          <p className="font-semibold text-foreground">{task.customer_name}</p>
        </div>
        <StatusBadge status={task.status} />
      </div>
      <div className="mt-2"><Items task={task} delivered={task.status === "DELIVERED"} /></div>
      <p className="mt-2 text-xs text-muted-foreground">
        {task.duration_seconds != null && `Took ${formatClock(task.duration_seconds)}`}
        {task.empty_cans_returned > 0 && ` · ${task.empty_cans_returned} empty cans collected`}
        {task.failure_reason && ` · ${task.failure_reason}`}
      </p>
    </div>
  );
}
