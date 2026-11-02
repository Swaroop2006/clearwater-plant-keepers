import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { errorMessage, MOBILE_REGEX } from "@/lib/format";

type Customer = Database["public"]["Tables"]["customers"]["Row"];

const EMPTY = { name: "", mobile: "", address: "", customer_type: "HOME", price_per_can: "0", price_per_packet: "0", notes: "" };

export function CustomerFormDialog({ customer, trigger }: { customer?: Customer; trigger: ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      customer
        ? {
            name: customer.name,
            mobile: customer.mobile,
            address: customer.address,
            customer_type: customer.customer_type,
            price_per_can: String(customer.price_per_can),
            price_per_packet: String(customer.price_per_packet),
            notes: customer.notes ?? "",
          }
        : EMPTY,
    );
  }, [open, customer]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!MOBILE_REGEX.test(form.mobile.replace(/\s/g, ""))) e.mobile = "Enter a valid 10–13 digit mobile number";
    if (form.address.trim().length < 3) e.address = "Address is required";
    for (const k of ["price_per_can", "price_per_packet"] as const) {
      const n = Number(form[k]);
      if (form[k] === "" || Number.isNaN(n) || n < 0) e[k] = "Enter a valid price (0 or more)";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (busy || !validate()) return;
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      mobile: form.mobile.replace(/\s/g, ""),
      address: form.address.trim(),
      customer_type: form.customer_type as Customer["customer_type"],
      price_per_can: Number(form.price_per_can),
      price_per_packet: Number(form.price_per_packet),
      notes: form.notes.trim() || null,
    };
    const res = customer
      ? await supabase.from("customers").update(payload).eq("id", customer.id).select("customer_code").single()
      : await supabase.from("customers").insert(payload).select("customer_code").single();
    setBusy(false);
    if (res.error) return toast.error(errorMessage(res.error));
    toast.success(customer ? "Customer updated" : `Customer ${res.data.customer_code} added`);
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["customer"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setOpen(false);
  }

  const field = (k: keyof typeof form, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...props} />
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? `Edit ${customer.customer_code}` : "Add customer"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("name", "Customer name")}</div>
          {field("mobile", "Mobile number", { inputMode: "tel", placeholder: "9876543210" })}
          <div className="space-y-1.5">
            <Label>Customer type</Label>
            <Select value={form.customer_type} onValueChange={(v) => setForm({ ...form, customer_type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HOME">Home</SelectItem>
                <SelectItem value="SHOP">Shop</SelectItem>
                <SelectItem value="OFFICE">Office</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            {errors.address && <p className="text-xs text-destructive">{errors.address}</p>}
          </div>
          {field("price_per_can", "Price per water can (₹)", { type: "number", min: 0, step: "0.5", inputMode: "decimal" })}
          {field("price_per_packet", "Price per water packet (₹)", { type: "number", min: 0, step: "0.5", inputMode: "decimal" })}
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
            {busy && <Loader2 className="animate-spin" />} {customer ? "Save changes" : "Add customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
