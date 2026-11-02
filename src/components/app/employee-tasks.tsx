import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MapPin, PauseCircle, Phone, Play, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PriorityBadge, StatusBadge } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNow } from "@/hooks/use-realtime";
import { errorMessage, fmtDateTime, formatClock } from "@/lib/format";
import { unwrap } from "@/lib/queries";

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
  delivery_items: { id: string; product_name: string; product_kind: string; unit: string; requested_qty: number; delivered_qty: number | null }[];
};

const MY_SELECT =
  "id, task_code, customer_name, customer_phone, delivery_address, priority, status, notes, hold_reason, scheduled_date, created_at, started_at, completed_at, duration_seconds, failure_reason, empty_cans_returned, delivery_items(id, product_name, product_kind, unit, requested_qty, delivered_qty)";

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

function invalidateMine(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["my-queue"] });
  qc.invalidateQueries({ queryKey: ["my-finished"] });
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

function Contact({ task }: { task: MyTask }) {
  return (
    <div className="space-y-1.5 text-sm">
      <p className="flex items-start gap-2 text-foreground"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" /> {task.delivery_address}</p>
      <a href={`tel:${task.customer_phone}`} className="flex items-center gap-2 font-medium text-primary"><Phone className="size-4" /> {task.customer_phone}</a>
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
  isNext: boolean;
  blocked: boolean;
  canStart: boolean;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function start() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("start_delivery", { _task_id: task.id });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      invalidateMine(qc);
      return;
    }
    toast.success(`Delivery ${task.task_code} started`);
    invalidateMine(qc);
  }
  const futureDate = task.scheduled_date && task.scheduled_date > new Date().toISOString().slice(0, 10);
  return (
    <div className={"rounded-2xl border bg-card p-4 shadow-soft " + (isNext ? "ring-2 ring-primary/40" : "")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">{task.task_code}{isNext && <span className="ml-2 text-primary">NEXT UP</span>}</p>
          <p className="font-display text-lg font-semibold text-foreground">{task.customer_name}</p>
        </div>
        <div className="flex items-center gap-1.5"><PriorityBadge priority={task.priority} /><StatusBadge status={task.status} /></div>
      </div>
      <div className="mt-3 space-y-3">
        <Contact task={task} />
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

export function ActiveDeliveryCard({ task, perms }: { task: MyTask; perms: { can_complete_delivery: boolean; can_report_failure: boolean; can_hold_delivery: boolean } | null }) {
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

function CompleteDialog({ task, open, onClose }: { task: MyTask; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [empties, setEmpties] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const hasCans = task.delivery_items.some((i) => i.product_kind === "FILLED_CAN");
  const value = (id: string, req: number) => qty[id] ?? String(req);

  async function submit() {
    if (busy) return;
    const items = task.delivery_items.map((i) => ({ item_id: i.id, delivered_qty: Number(value(i.id, i.requested_qty)) }));
    for (const [n, i] of items.entries()) {
      const req = task.delivery_items[n].requested_qty;
      if (!Number.isInteger(i.delivered_qty) || i.delivered_qty < 0) { toast.error("Quantities must be whole numbers, 0 or more"); return; }
      if (i.delivered_qty > req) { toast.error(`You can't deliver more than ${req} ${task.delivery_items[n].product_name}`); return; }
    }
    if (items.every((i) => i.delivered_qty === 0)) { toast.error('Nothing delivered? Use "Report failed" instead.'); return; }
    const e = Number(empties);
    if (!Number.isInteger(e) || e < 0) { toast.error("Empty cans returned must be 0 or more"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("complete_delivery", { _task_id: task.id, _items: items, _empty_cans_returned: e, _notes: notes || undefined });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      invalidateMine(qc);
      return;
    }
    toast.success("Delivery completed. Great work!");
    invalidateMine(qc);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete {task.task_code}</DialogTitle>
          <DialogDescription>Confirm what you actually handed over to {task.customer_name}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {task.delivery_items.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3">
              <Label htmlFor={i.id} className="flex-1">{i.product_name} <span className="text-xs text-muted-foreground">(ordered {i.requested_qty})</span></Label>
              <Input id={i.id} className="w-24 text-center text-lg" type="number" inputMode="numeric" min={0} max={i.requested_qty} value={value(i.id, i.requested_qty)} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} />
            </div>
          ))}
          {hasCans && (
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <Label htmlFor="empties" className="flex-1">Empty cans collected</Label>
              <Input id="empties" className="w-24 text-center text-lg" type="number" inputMode="numeric" min={0} value={empties} onChange={(e) => setEmpties(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="cn">Notes (optional)</Label><Textarea id="cn" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="success" size="lg" className="w-full" onClick={submit} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirm delivered</Button>
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
