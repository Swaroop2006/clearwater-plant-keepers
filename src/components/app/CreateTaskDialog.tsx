import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activeCustomersQuery, activeEmployeesQuery, productsQuery } from "@/lib/queries";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

type Line = { product_id: string; quantity: string };

export function CreateTaskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const customers = useQuery({ ...activeCustomersQuery(), enabled: open });
  const employees = useQuery({ ...activeEmployeesQuery(), enabled: open });
  const products = useQuery({ ...productsQuery(), enabled: open });
  const deliverable = (products.data ?? []).filter((p) => p.is_active && p.kind !== "EMPTY_CAN");

  const [customerId, setCustomerId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [priority, setPriority] = useState("3");
  const [scheduled, setScheduled] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: "1" }]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCustomerId("");
      setEmployeeId("");
      setPriority("3");
      setScheduled("");
      setNotes("");
      setLines([{ product_id: "", quantity: "1" }]);
    }
  }, [open]);

  useEffect(() => {
    if (open && lines.length === 1 && !lines[0].product_id && deliverable.length) {
      setLines([{ product_id: (deliverable.find((p) => p.kind === "FILLED_CAN") ?? deliverable[0]).id, quantity: "1" }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deliverable.length]);

  const customer = customers.data?.find((c) => c.id === customerId);

  async function submit() {
    if (busy) return;
    if (!customerId) { toast.error("Choose a customer"); return; }
    if (!employeeId) { toast.error("Assign an employee"); return; }
    const items = lines.filter((l) => l.product_id);
    if (!items.length) { toast.error("Add at least one product"); return; }
    if (new Set(items.map((i) => i.product_id)).size !== items.length) { toast.error("Each product can only be added once"); return; }
    for (const i of items) {
      const n = Number(i.quantity);
      if (!Number.isInteger(n) || n <= 0) { toast.error("Quantities must be positive whole numbers"); return; }
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_delivery_task", {
      _customer_id: customerId,
      _employee_id: employeeId,
      _priority: Number(priority),
      _items: items.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) })),
      _scheduled_date: scheduled || undefined,
      _notes: notes || undefined,
    });
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    toast.success(`Task ${data.task_code} created`);
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New delivery task</DialogTitle>
          <DialogDescription>Stock is only deducted when the employee completes the delivery.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {customer ? `${customer.customer_code} · ${customer.name}` : "Search customers…"}
                  <ChevronsUpDown className="opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Name, phone or ID" />
                  <CommandList>
                    <CommandEmpty>No active customer found.</CommandEmpty>
                    <CommandGroup>
                      {(customers.data ?? []).map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.customer_code} ${c.name} ${c.mobile}`}
                          onSelect={() => {
                            setCustomerId(c.id);
                            setPickerOpen(false);
                          }}
                        >
                          <Check className={cn("mr-1", customerId === c.id ? "opacity-100" : "opacity-0")} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.name} <span className="text-xs text-muted-foreground">{c.customer_code}</span></p>
                            <p className="truncate text-xs text-muted-foreground">{c.address}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {customer && <p className="text-xs text-muted-foreground">{customer.address} · {customer.mobile}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Assign to</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder={employees.data?.length === 0 ? "No active employees" : "Choose employee"} /></SelectTrigger>
                <SelectContent>
                  {(employees.data ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name} ({e.employee_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}{n === 1 ? " — highest" : n === 10 ? " — lowest" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Products</Label>
            {products.data && deliverable.length === 0 && (
              <p className="rounded-lg bg-warning/15 p-2 text-xs text-warning-foreground">Add products in Inventory first.</p>
            )}
            {lines.map((l, idx) => (
              <div key={idx} className="flex gap-2">
                <Select value={l.product_id} onValueChange={(v) => setLines(lines.map((x, i) => (i === idx ? { ...x, product_id: v } : x)))}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Product" /></SelectTrigger>
                  <SelectContent>
                    {deliverable.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} · {p.available_quantity} {p.unit} in stock</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="w-24"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={l.quantity}
                  onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))}
                />
                <Button variant="ghost" size="icon" aria-label="Remove" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== idx))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            {lines.length < deliverable.length && (
              <Button variant="outline" size="sm" onClick={() => setLines([...lines, { product_id: "", quantity: "1" }])}>
                <Plus /> Add product
              </Button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sd">Scheduled date (optional)</Label>
              <Input id="sd" type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tn">Notes (optional)</Label>
              <Textarea id="tn" rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="water" onClick={submit} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Create task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
