import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Loader2, Plus, Search, UserCog } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ActiveBadge, EmptyState, ErrorNote, Loading, PageHeader } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, formatDuration, MOBILE_REGEX, USERNAME_REGEX } from "@/lib/format";
import { unwrap } from "@/lib/queries";
import { createEmployee } from "@/server/employees.functions";

export const Route = createFileRoute("/admin/employees/")({
  head: () => ({ meta: [{ title: "Employees — Water Plant Admin" }] }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["employees", "list"],
    queryFn: async () => {
      const [emps, stats] = await Promise.all([
        unwrap(supabase.from("employees").select("*").order("employee_code")),
        unwrap(supabase.from("employee_stats").select("*")),
      ]);
      const byId = new Map(stats.map((s) => [s.employee_id, s]));
      return emps.map((e) => ({ ...e, stats: byId.get(e.id) }));
    },
  });
  const term = q.trim().toLowerCase();
  const rows = (list.data ?? []).filter(
    (e) => !term || [e.name, e.username, e.employee_code, e.mobile].some((v) => v.toLowerCase().includes(term)),
  );

  return (
    <div>
      <PageHeader title="Employees" description="Delivery staff accounts, permissions and performance." actions={<AddEmployeeDialog />} />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="bg-card pl-9" placeholder="Search name, username, ID or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <div className="p-4"><ErrorNote error={list.error} /></div>
        ) : !rows.length ? (
          <EmptyState icon={UserCog} title={term ? "No employees match" : "No employees yet"} description="Add delivery staff so you can assign tasks." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead>Avg time</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.employee_code}</TableCell>
                    <TableCell className="font-semibold">{e.name}</TableCell>
                    <TableCell className="text-muted-foreground">{e.username}</TableCell>
                    <TableCell>{e.mobile}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.stats?.delivered ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.stats?.failed ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{(e.stats?.pending ?? 0) + (e.stats?.in_progress ?? 0) + (e.stats?.on_hold ?? 0)}</TableCell>
                    <TableCell>{formatDuration(e.stats?.avg_duration_seconds)}</TableCell>
                    <TableCell>{fmtDate(e.joined_at)}</TableCell>
                    <TableCell><ActiveBadge status={e.status} /></TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/admin/employees/$employeeId" params={{ employeeId: e.id }}><Eye /> Manage</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function AddEmployeeDialog() {
  const qc = useQueryClient();
  const create = useServerFn(createEmployee);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", mobile: "", username: "", contactEmail: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    if (busy) return;
    const e: Record<string, string> = {};
    if (!form.name.trim()) e["name"] = "Name is required";
    if (!MOBILE_REGEX.test(form.mobile.replace(/\s/g, ""))) e["mobile"] = "Enter a valid mobile number";
    if (!USERNAME_REGEX.test(form.username.trim().toLowerCase())) e["username"] = "3–30 lowercase letters, numbers, dot, dash or underscore";
    if (form.contactEmail && !/^\S+@\S+\.\S+$/.test(form.contactEmail)) e["contactEmail"] = "Enter a valid email";
    if (form.password.length < 8) e["password"] = "At least 8 characters";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await create({ data: { ...form, mobile: form.mobile.replace(/\s/g, ""), username: form.username.trim().toLowerCase() } });
      toast.success(`Employee ${res.employeeCode} created. They can sign in with username "${form.username.trim().toLowerCase()}".`);
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      setForm({ name: "", mobile: "", username: "", contactEmail: "", password: "" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const f = (k: keyof typeof form, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={form[k]} onChange={(ev) => setForm({ ...form, [k]: ev.target.value })} {...props} />
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="water"><Plus /> Add employee</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>Creates a delivery worker login. Share the username and password with them in person.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{f("name", "Full name")}</div>
          {f("mobile", "Mobile number", { inputMode: "tel" })}
          {f("contactEmail", "Email (optional)", { type: "email" })}
          {f("username", "Login username", { autoCapitalize: "none", placeholder: "ravi.k" })}
          {f("password", "Temporary password", { type: "password", autoComplete: "new-password" })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Create employee</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
