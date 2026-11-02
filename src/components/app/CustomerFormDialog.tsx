import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { errorMessage, fmtMoney, MOBILE_REGEX } from "@/lib/format";
import { productsQuery, unwrap } from "@/lib/queries";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Item = { key: string; id?: string; item_name: string; unit: string; price: string };

const EMPTY = { name: "", mobile: "", address: "", customer_type: "HOME", custom_type: "", notes: "" };
const NEW_ITEM = { item_name: "", unit: "", price: "" };
let seq = 0;
const k = () => `i${++seq}`;

export function CustomerFormDialog({ customer, trigger }: { customer?: Customer; trigger: ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // item key or "new"
  const [draft, setDraft] = useState(NEW_ITEM);
  const [draftErr, setDraftErr] = useState("");
  const [empty, setEmpty] = useState({ opening: "0", current: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const products = useQuery({ ...productsQuery(), enabled: open });
  const existing = useQuery({
    queryKey: ["customer-items", customer?.id],
    enabled: open && Boolean(customer),
    queryFn: async () => {
      const [rows, opening] = await Promise.all([
        unwrap(supabase.from("customer_items").select("*").eq("customer_id", customer!.id).order("sort_order").order("item_name")),
        unwrap(supabase.from("customer_empty_can_txns").select("quantity").eq("customer_id", customer!.id).eq("txn_type", "OPENING_BALANCE").maybeSingle()),
      ]);
      return { rows, opening: opening?.quantity ?? null };
    },
  });

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setEditing(null);
    setDraftErr("");
    setForm(
      customer
        ? {
            name: customer.name,
            mobile: customer.mobile,
            address: customer.address,
            customer_type: customer.customer_type,
            custom_type: customer.custom_type ?? "",
            notes: customer.notes ?? "",
          }
        : EMPTY,
    );
    setEmpty(customer ? { opening: "", current: String(customer.empty_cans_balance), notes: "" } : { opening: "0", current: "", notes: "" });
    if (!customer) setItems([]);
  }, [open, customer]);

  useEffect(() => {
    if (open && customer && existing.data) {
      setItems(existing.data.rows.map((r) => ({ key: k(), id: r.id, item_name: r.item_name, unit: r.unit, price: String(r.price) })));
    }
  }, [open, customer, existing.data]);

  function startEdit(it?: Item) {
    setDraftErr("");
    if (it) {
      setEditing(it.key);
      setDraft({ item_name: it.item_name, unit: it.unit, price: it.price });
    } else {
      setEditing("new");
      setDraft(NEW_ITEM);
    }
  }

  function pickName(v: string) {
    const p = products.data?.find((x) => x.name.toLowerCase() === v.trim().toLowerCase());
    setDraft((d) => ({ ...d, item_name: v, unit: d.unit || p?.unit || d.unit }));
  }

  function saveDraft() {
    const name = draft.item_name.trim();
    const unit = draft.unit.trim();
    const price = Number(draft.price);
    if (!name) return setDraftErr("Enter an item name");
    if (name.length > 80) return setDraftErr("Item name is too long");
    if (!unit) return setDraftErr("Enter a unit, e.g. Can, Packet, Bottle");
    if (draft.price.trim() === "" || Number.isNaN(price) || price < 0) return setDraftErr("Enter a valid price (0 or more)");
    const dup = items.some((i) => i.key !== editing && i.item_name.trim().toLowerCase() === name.toLowerCase());
    if (dup) return setDraftErr("This customer already has an item with that name");
    const p = products.data?.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (p?.kind === "EMPTY_CAN") return setDraftErr("That's the empty-can stock item. Use a different name.");
    if (editing === "new") setItems([...items, { key: k(), item_name: name, unit, price: String(price) }]);
    else setItems(items.map((i) => (i.key === editing ? { ...i, item_name: name, unit, price: String(price) } : i)));
    setEditing(null);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e["name"] = "Name is required";
    if (!MOBILE_REGEX.test(form.mobile.replace(/\s/g, ""))) e["mobile"] = "Enter a valid 10–13 digit mobile number";
    if (form.address.trim().length < 3) e["address"] = "Address is required";
    if (form.customer_type === "CUSTOM" && !form.custom_type.trim()) e["custom_type"] = "Enter a custom customer type";
    if (form.customer_type === "CUSTOM" && form.custom_type.trim().length > 60) e["custom_type"] = "Keep it under 60 characters";
    const n = Number(customer ? empty.current : empty.opening);
    const raw = customer ? empty.current : empty.opening;
    if (raw.trim() === "" || !Number.isInteger(n) || n < 0) e[customer ? "current" : "opening"] = "Enter a whole number, 0 or more";
    if (editing) e["items"] = "Save or cancel the item you are editing";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (busy || !validate()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("save_customer", {
      _customer_id: (customer?.id ?? null) as unknown as string,
      _customer: {
        name: form.name.trim(),
        mobile: form.mobile.replace(/\s/g, ""),
        address: form.address.trim(),
        customer_type: form.customer_type,
        custom_type: form.customer_type === "CUSTOM" ? form.custom_type.trim() : null,
        notes: form.notes.trim() || null,
      },
      _items: items.map((i) => ({ id: i.id ?? null, item_name: i.item_name, unit: i.unit, price: Number(i.price) })),
      _empty: customer ? { current: Number(empty.current), notes: empty.notes } : { opening: Number(empty.opening), notes: empty.notes },
    });
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    toast.success(customer ? "Customer updated" : `Customer ${data.customer_code} added`);
    for (const key of ["customers", "customer", "customer-items", "dashboard", "products"]) qc.invalidateQueries({ queryKey: [key] });
    setOpen(false);
  }

  const field = (key: keyof typeof form, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...props} />
      {errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>}
    </div>
  );

  const editor = (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-accent/40 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_7rem_7rem]">
        <div className="space-y-1">
          <Label htmlFor="it-name" className="text-xs">Item name</Label>
          <Input id="it-name" list="inventory-names" placeholder="e.g. 20L Water Can" value={draft.item_name} onChange={(e) => pickName(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1">
          <Label htmlFor="it-unit" className="text-xs">Unit</Label>
          <Input id="it-unit" placeholder="Can" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="it-price" className="text-xs">Price (₹)</Label>
          <Input id="it-price" type="number" min={0} step="0.5" inputMode="decimal" placeholder="35" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
        </div>
      </div>
      {draftErr && <p className="text-xs text-destructive">{draftErr}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}><X /> Cancel</Button>
        <Button type="button" size="sm" onClick={saveDraft}><Check /> {editing === "new" ? "Add item" : "Save item"}</Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer ? `Edit ${customer.customer_code}` : "Add customer"}</DialogTitle>
        </DialogHeader>
        <datalist id="inventory-names">
          {(products.data ?? []).filter((p) => p.kind !== "EMPTY_CAN").map((p) => <option key={p.id} value={p.name} />)}
        </datalist>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("name", "Customer name")}</div>
          {field("mobile", "Mobile number", { inputMode: "tel", placeholder: "9876543210" })}
          <div className="space-y-1.5">
            <Label>Customer type</Label>
            <Select value={form.customer_type} onValueChange={(v) => setForm({ ...form, customer_type: v })}>
              <SelectTrigger aria-label="Customer type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HOME">Home</SelectItem>
                <SelectItem value="SHOP">Shop</SelectItem>
                <SelectItem value="OFFICE">Office</SelectItem>
                <SelectItem value="CUSTOM">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.customer_type === "CUSTOM" && (
            <div className="sm:col-span-2">{field("custom_type", "Enter Customer Type", { placeholder: "Enter a custom customer type", maxLength: 60 })}</div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            {errors["address"] && <p className="text-xs text-destructive">{errors["address"]}</p>}
          </div>

          {/* Items list */}
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Items list</Label>
                <p className="text-xs text-muted-foreground">What this customer buys and their fixed price for each.</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => startEdit()} disabled={editing !== null}>
                <Plus /> Add Item
              </Button>
            </div>
            {customer && existing.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading items…</p>
            ) : (
              <div className="divide-y rounded-xl border">
                {items.length === 0 && editing !== "new" && (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">No items yet. Add what this customer buys, e.g. 20L Water Can — Can — ₹35.</p>
                )}
                {items.map((it) =>
                  editing === it.key ? (
                    <div key={it.key} className="p-2">{editor}</div>
                  ) : (
                    <div key={it.key} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{it.item_name}</p>
                        <p className="text-xs text-muted-foreground">{it.unit}</p>
                      </div>
                      <p className="font-semibold tabular-nums text-foreground">{fmtMoney(it.price)}</p>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${it.item_name}`} disabled={editing !== null} onClick={() => startEdit(it)}><Pencil /></Button>
                      <ConfirmDialog
                        destructive
                        trigger={<Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${it.item_name}`} disabled={editing !== null}><Trash2 /></Button>}
                        title={`Remove ${it.item_name}?`}
                        description="It will be removed from this customer's items list when you save. Past bills keep their prices."
                        confirmLabel="Remove"
                        onConfirm={() => setItems(items.filter((x) => x.key !== it.key))}
                      />
                    </div>
                  ),
                )}
                {editing === "new" && <div className="p-2">{editor}</div>}
              </div>
            )}
            {errors["items"] && <p className="text-xs text-destructive">{errors["items"]}</p>}
          </div>

          {/* Empty cans */}
          <div className="space-y-3 rounded-xl border bg-muted/30 p-3 sm:col-span-2">
            <div>
              <Label>Empty water cans</Label>
              <p className="text-xs text-muted-foreground">
                {customer ? "Changing the current balance records a correction in the customer's empty-can history." : "Cans the customer has at the start. Collections and issues are added automatically later."}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="opening">Opening empty cans</Label>
                {customer ? (
                  <Input id="opening" value={existing.data?.opening ?? "—"} disabled />
                ) : (
                  <Input id="opening" type="number" min={0} step={1} inputMode="numeric" value={empty.opening} onChange={(e) => setEmpty({ ...empty, opening: e.target.value })} />
                )}
                {errors["opening"] && <p className="text-xs text-destructive">{errors["opening"]}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="current">Current empty cans</Label>
                {customer ? (
                  <Input id="current" type="number" min={0} step={1} inputMode="numeric" value={empty.current} onChange={(e) => setEmpty({ ...empty, current: e.target.value })} />
                ) : (
                  <Input id="current" value={empty.opening} disabled />
                )}
                {errors["current"] && <p className="text-xs text-destructive">{errors["current"]}</p>}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="enotes">Empty-can notes (optional)</Label>
                <Input id="enotes" value={empty.notes} onChange={(e) => setEmpty({ ...empty, notes: e.target.value })} placeholder={customer ? "Reason for the correction" : "e.g. Customer already holds 10 cans"} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Save Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
