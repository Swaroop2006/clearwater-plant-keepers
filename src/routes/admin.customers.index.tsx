import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Plus, Power, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ActiveBadge, EmptyState, ErrorNote, Loading, PageHeader } from "@/components/app/ui-bits";
import { CustomerFormDialog } from "@/components/app/CustomerFormDialog";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CUSTOMER_TYPE_LABEL, errorMessage, fmtDate } from "@/lib/format";
import { unwrap } from "@/lib/queries";

export const Route = createFileRoute("/admin/customers/")({
  head: () => ({ meta: [{ title: "Customers — Water Plant Admin" }] }),
  component: CustomersPage,
});

const PAGE = 25;

function CustomersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(0);

  const list = useQuery({
    queryKey: ["customers", "list", q, status, type, page],
    queryFn: async () => {
      let query = supabase.from("customers").select("*", { count: "exact" }).order("customer_code", { ascending: false });
      if (status !== "all") query = query.eq("status", status as "ACTIVE");
      if (type !== "all") query = query.eq("customer_type", type as "HOME");
      const term = q.trim().replace(/[%,()]/g, "");
      if (term) query = query.or(`name.ilike.%${term}%,mobile.ilike.%${term}%,customer_code.ilike.%${term}%,address.ilike.%${term}%`);
      const { data, error, count } = await query.range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      const ids = (data ?? []).map((c) => c.id);
      const stats = ids.length ? await unwrap(supabase.from("customer_stats").select("*").in("customer_id", ids)) : [];
      const byId = new Map(stats.map((s) => [s.customer_id, s]));
      return { rows: (data ?? []).map((c) => ({ ...c, stats: byId.get(c.id) })), count: count ?? 0 };
    },
  });

  const pages = useMemo(() => Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE)), [list.data?.count]);

  async function toggle(id: string, next: "ACTIVE" | "INACTIVE") {
    const { error } = await supabase.from("customers").update({ status: next }).eq("id", id);
    if (error) return toast.error(errorMessage(error));
    toast.success(next === "ACTIVE" ? "Customer activated" : "Customer deactivated");
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return toast.error(errorMessage(error));
    toast.success("Customer deleted");
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Homes, shops and offices you deliver to."
        actions={
          <CustomerFormDialog
            trigger={
              <Button variant="water">
                <Plus /> Add customer
              </Button>
            }
          />
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="bg-card pl-9"
            placeholder="Search name, phone, ID or address"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
          <SelectTrigger className="bg-card sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => { setType(v); setPage(0); }}>
          <SelectTrigger className="bg-card sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="HOME">Home</SelectItem>
            <SelectItem value="SHOP">Shop</SelectItem>
            <SelectItem value="OFFICE">Office</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <div className="p-4"><ErrorNote error={list.error} /></div>
        ) : !list.data?.rows.length ? (
          <EmptyState
            icon={Users}
            title={q || status !== "all" || type !== "all" ? "No customers match" : "No customers yet"}
            description="Add your first customer to start creating delivery tasks."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="min-w-48">Address</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Cans</TableHead>
                  <TableHead className="text-right">Packets</TableHead>
                  <TableHead>Last delivery</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.customer_code}</TableCell>
                    <TableCell className="font-semibold">
                      <Link to="/admin/customers/$customerId" params={{ customerId: c.id }} className="hover:text-primary">{c.name}</Link>
                    </TableCell>
                    <TableCell>{c.mobile}</TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">{c.address}</TableCell>
                    <TableCell>{CUSTOMER_TYPE_LABEL[c.customer_type]}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.stats?.total_cans ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.stats?.total_packets ?? 0}</TableCell>
                    <TableCell>{fmtDate(c.stats?.last_delivery_at)}</TableCell>
                    <TableCell><ActiveBadge status={c.status} /></TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button asChild size="icon" variant="ghost" aria-label="View">
                          <Link to="/admin/customers/$customerId" params={{ customerId: c.id }}><Eye /></Link>
                        </Button>
                        <CustomerFormDialog customer={c} trigger={<Button size="icon" variant="ghost" aria-label="Edit"><Pencil /></Button>} />
                        <ConfirmDialog
                          trigger={<Button size="icon" variant="ghost" aria-label={c.status === "ACTIVE" ? "Deactivate" : "Activate"}><Power /></Button>}
                          title={c.status === "ACTIVE" ? `Deactivate ${c.name}?` : `Activate ${c.name}?`}
                          description={c.status === "ACTIVE" ? "Inactive customers can't receive new delivery tasks. History is kept." : "The customer can receive deliveries again."}
                          confirmLabel={c.status === "ACTIVE" ? "Deactivate" : "Activate"}
                          onConfirm={() => toggle(c.id, c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}
                        />
                        <ConfirmDialog
                          destructive
                          trigger={<Button size="icon" variant="ghost" aria-label="Delete" className="text-destructive"><Trash2 /></Button>}
                          title={`Delete ${c.name}?`}
                          description="Only customers without any delivery tasks can be deleted. Otherwise, deactivate them."
                          confirmLabel="Delete"
                          onConfirm={() => remove(c.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {(list.data?.count ?? 0) > PAGE && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">{list.data?.count} customers · page {page + 1} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
