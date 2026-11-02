import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Package, PackagePlus, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { EmptyState, ErrorNote, Loading, PageHeader, Panel } from "@/components/app/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { errorMessage, fmtDateTime, PRODUCT_KIND_LABEL, TXN_LABEL } from "@/lib/format";
import { productsQuery } from "@/lib/queries";

type Product = Database["public"]["Tables"]["products"]["Row"];
type TxnType = Database["public"]["Enums"]["txn_type"];

export const Route = createFileRoute("/admin/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Water Plant Admin" }] }),
  component: InventoryPage,
});

const PAGE = 30;

function InventoryPage() {
  useRealtimeRefresh(["products"], [["products"], ["txns"]]);
  const products = useQuery(productsQuery());
  const [addOpen, setAddOpen] = useState(false);
  const [move, setMove] = useState<Product | null>(null);
  const [edit, setEdit] = useState<Product | null>(null);
  const [fProduct, setFProduct] = useState("all");
  const [fType, setFType] = useState("all");
  const [page, setPage] = useState(0);

  const txns = useQuery({
    queryKey: ["txns", fProduct, fType, page],
    queryFn: async () => {
      let q = supabase.from("inventory_transactions").select("*, products(name, unit), delivery_tasks(task_code)", { count: "exact" });
      if (fProduct !== "all") q = q.eq("product_id", fProduct);
      if (fType !== "all") q = q.eq("txn_type", fType as TxnType);
      const { data, error, count } = await q.order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const low = (products.data ?? []).filter((p) => p.is_active && p.kind !== "EMPTY_CAN" && p.available_quantity <= p.min_stock_level);
  const pages = Math.max(1, Math.ceil((txns.data?.count ?? 0) / PAGE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Stock changes only through recorded transactions. Deliveries deduct stock automatically when completed."
        actions={<Button variant="water" onClick={() => setAddOpen(true)}><Plus /> Add product</Button>}
      />

      {low.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 text-warning-foreground" />
          <p className="text-sm text-warning-foreground">
            <span className="font-semibold">Low stock:</span> {low.map((p) => `${p.name} (${p.available_quantity}/${p.min_stock_level})`).join(", ")}
          </p>
        </div>
      )}

      {products.isLoading ? (
        <Loading />
      ) : products.error ? (
        <ErrorNote error={products.error} />
      ) : !products.data?.length ? (
        <Panel>
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Add your filled water cans, water packets and an empty-can product to track returns."
            action={<Button onClick={() => setAddOpen(true)}><Plus /> Add product</Button>}
          />
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.data.map((p) => {
            const isLow = p.kind !== "EMPTY_CAN" && p.available_quantity <= p.min_stock_level;
            return (
              <div key={p.id} className={"rounded-2xl border bg-card p-5 shadow-soft " + (isLow && p.is_active ? "border-warning/60" : "")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.product_code} · {PRODUCT_KIND_LABEL[p.kind]}</p>
                  </div>
                  <div className="flex gap-1">
                    {!p.is_active && <Badge variant="muted">Inactive</Badge>}
                    {isLow && p.is_active && <Badge variant="pending">Low</Badge>}
                  </div>
                </div>
                <p className="mt-4 font-display text-4xl font-semibold tabular-nums">
                  {p.available_quantity} <span className="text-base font-medium text-muted-foreground">{p.unit}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Minimum {p.min_stock_level} · updated {fmtDateTime(p.updated_at)}</p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={() => setMove(p)}><PackagePlus /> Record movement</Button>
                  <Button size="sm" variant="outline" onClick={() => setEdit(p)}><Pencil /> Edit</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Panel
        title="Stock transaction history"
        action={
          <div className="flex gap-2">
            <Select value={fProduct} onValueChange={(v) => { setFProduct(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {(products.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fType} onValueChange={(v) => { setFType(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(TXN_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {txns.isLoading ? (
          <Loading />
        ) : !txns.data?.rows.length ? (
          <EmptyState title="No transactions" icon={Package} />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Txn</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Before</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.data.rows.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-mono text-xs">{x.txn_code}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(x.created_at)}</TableCell>
                    <TableCell className="font-medium">{x.products?.name}</TableCell>
                    <TableCell>{TXN_LABEL[x.txn_type]}</TableCell>
                    <TableCell className={"text-right font-semibold tabular-nums " + (x.quantity > 0 ? "text-success" : "text-destructive")}>{x.quantity > 0 ? "+" : ""}{x.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{x.previous_stock}</TableCell>
                    <TableCell className="text-right tabular-nums">{x.new_stock}</TableCell>
                    <TableCell className="font-mono text-xs">{x.delivery_tasks?.task_code ?? "—"}</TableCell>
                    <TableCell className="max-w-56 truncate text-sm text-muted-foreground">{x.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {(txns.data?.count ?? 0) > PAGE && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Page {page + 1} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Panel>

      <AddProductDialog open={addOpen} onOpenChange={setAddOpen} />
      <MovementDialog product={move} onClose={() => setMove(null)} />
      <EditProductDialog product={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function AddProductDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", unit: "can", kind: "FILLED_CAN", opening: "0", min: "10" });
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!f.name.trim()) { toast.error("Enter a product name"); return; }
    const opening = Number(f.opening), min = Number(f.min);
    if (!Number.isInteger(opening) || opening < 0 || !Number.isInteger(min) || min < 0) { toast.error("Stock values must be whole numbers, 0 or more"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("create_product", { _name: f.name, _unit: f.unit || "unit", _kind: f.kind as Product["kind"], _opening_stock: opening, _min_stock: min });
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    toast.success("Product added");
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["txns"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setF({ name: "", unit: "can", kind: "FILLED_CAN", opening: "0", min: "10" });
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add product</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pn">Name</Label><Input id="pn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="20L Water Can" /></div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v, unit: v === "PACKET" ? "packet" : v === "OTHER" ? "unit" : "can" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PRODUCT_KIND_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="pu">Unit</Label><Input id="pu" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="po">Opening stock</Label><Input id="po" type="number" min={0} value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pm">Minimum stock level</Label><Input id="pm" type="number" min={0} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Add product</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<TxnType>("STOCK_ADDED");
  const [qty, setQty] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const isEmpty = product?.kind === "EMPTY_CAN";
  const types: TxnType[] = isEmpty ? ["EMPTY_CAN_RETURN", "STOCK_ADDED", "DAMAGE", "ADJUSTMENT", "CORRECTION"] : ["STOCK_ADDED", "DAMAGE", "ADJUSTMENT", "CORRECTION"];
  const signed = type === "ADJUSTMENT" || type === "CORRECTION";

  async function submit() {
    if (!product) return;
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) { toast.error("Enter a whole number greater than zero"); return; }
    if ((type === "DAMAGE" || signed) && notes.trim().length < 3) { toast.error("Please add a note explaining this change"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("record_stock_movement", {
      _product_id: product.id,
      _type: type,
      _quantity: signed && direction === "out" ? -n : n,
      ...(notes.trim() ? { _notes: notes } : {}),
    });
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    toast.success("Stock updated");
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["txns"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setQty(""); setNotes(""); setType("STOCK_ADDED"); setDirection("in");
    onClose();
  }

  return (
    <Dialog open={Boolean(product)} onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record stock movement</DialogTitle>
          <DialogDescription>{product?.name}: {product?.available_quantity} {product?.unit} available now.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Movement</Label>
            <Select value={type} onValueChange={(v) => setType(v as TxnType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{types.map((t) => <SelectItem key={t} value={t}>{TXN_LABEL[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {signed && (
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "in" | "out")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="in">Increase stock</SelectItem><SelectItem value="out">Decrease stock</SelectItem></SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="mq">Quantity</Label><Input id="mq" type="number" min={1} step={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="mn">Notes {type === "STOCK_ADDED" || type === "EMPTY_CAN_RETURN" ? "(optional)" : "(required)"}</Label><Textarea id="mn" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">Past transactions can't be edited. Fix mistakes with a correction.</p>
        </div>
        <DialogFooter><Button onClick={submit} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save movement</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditProductDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", unit: "", min: "0", active: true });
  const [busy, setBusy] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (product && loadedId !== product.id) {
    setLoadedId(product.id);
    setF({ name: product.name, unit: product.unit, min: String(product.min_stock_level), active: product.is_active });
  }
  async function submit() {
    if (!product) return;
    const min = Number(f.min);
    if (!f.name.trim() || !f.unit.trim()) { toast.error("Name and unit are required"); return; }
    if (!Number.isInteger(min) || min < 0) { toast.error("Minimum stock must be 0 or more"); return; }
    setBusy(true);
    const { error } = await supabase.from("products").update({ name: f.name.trim(), unit: f.unit.trim(), min_stock_level: min, is_active: f.active }).eq("id", product.id);
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    toast.success("Product updated");
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setLoadedId(null);
    onClose();
  }
  return (
    <Dialog open={Boolean(product)} onOpenChange={(o) => { if (!busy && !o) { setLoadedId(null); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit {product?.product_code}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="en">Name</Label><Input id="en" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="eu">Unit</Label><Input id="eu" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="em">Minimum stock</Label><Input id="em" type="number" min={0} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></div>
          <div className="flex items-center justify-between sm:col-span-2"><Label htmlFor="ea">Active</Label><Switch id="ea" checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Stock quantity can only change through a recorded movement.</p>
        <DialogFooter><Button onClick={submit} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
