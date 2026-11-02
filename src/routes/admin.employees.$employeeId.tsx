import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, Clock, KeyRound, Loader2, Power, Timer, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ActiveBadge, EmptyState, ErrorNote, Loading, PageHeader, Panel, PriorityBadge, StatCard, StatusBadge } from "@/components/app/ui-bits";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage, fmtDate, fmtDateTime, formatDuration, MOBILE_REGEX } from "@/lib/format";
import { TASK_SELECT, unwrap } from "@/lib/queries";
import { resetEmployeePassword, setEmployeeStatus } from "@/server/employees.functions";

export const Route = createFileRoute("/admin/employees/$employeeId")({
  head: () => ({ meta: [{ title: "Employee — Water Plant Admin" }] }),
  component: EmployeeDetail,
});

const PERMS = [
  { key: "can_start_delivery", label: "Start deliveries" },
  { key: "can_complete_delivery", label: "Complete deliveries" },
  { key: "can_report_failure", label: "Report failed deliveries" },
  { key: "can_hold_delivery", label: "Put deliveries on hold" },
  { key: "can_view_history", label: "View own delivery history" },
] as const;

function EmployeeDetail() {
  const { employeeId } = Route.useParams();
  const qc = useQueryClient();
  const setStatus = useServerFn(setEmployeeStatus);

  const q = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: async () => {
      const [emp, perms, stats, tasks] = await Promise.all([
        unwrap(supabase.from("employees").select("*").eq("id", employeeId).maybeSingle()),
        unwrap(supabase.from("employee_permissions").select("*").eq("employee_id", employeeId).maybeSingle()),
        unwrap(supabase.from("employee_stats").select("*").eq("employee_id", employeeId).maybeSingle()),
        unwrap(supabase.from("delivery_tasks").select(TASK_SELECT).eq("employee_id", employeeId).order("created_at", { ascending: false }).limit(200)),
      ]);
      return { emp, perms, stats, tasks };
    },
  });

  const [details, setDetails] = useState({ name: "", mobile: "", contact_email: "" });
  useEffect(() => {
    if (q.data?.emp) setDetails({ name: q.data.emp.name, mobile: q.data.emp.mobile, contact_email: q.data.emp.contact_email ?? "" });
  }, [q.data?.emp]);
  const [saving, setSaving] = useState(false);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const { emp, perms, stats, tasks } = q.data!;
  if (!emp) return <EmptyState title="Employee not found" />;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["employee", employeeId] });
    qc.invalidateQueries({ queryKey: ["employees"] });
  };

  async function saveDetails() {
    if (!details.name.trim()) return toast.error("Name is required");
    if (!MOBILE_REGEX.test(details.mobile.replace(/\s/g, ""))) return toast.error("Enter a valid mobile number");
    setSaving(true);
    const { error } = await supabase
      .from("employees")
      .update({ name: details.name.trim(), mobile: details.mobile.replace(/\s/g, ""), contact_email: details.contact_email.trim() || null })
      .eq("id", employeeId);
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    toast.success("Details saved");
    refresh();
  }

  async function togglePerm(key: (typeof PERMS)[number]["key"], value: boolean) {
    const { error } = await supabase.from("employee_permissions").update({ [key]: value }).eq("employee_id", employeeId);
    if (error) return toast.error(errorMessage(error));
    toast.success("Permission updated");
    refresh();
  }

  async function changeStatus() {
    try {
      await setStatus({ data: { employeeId, status: emp!.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } });
      toast.success(emp!.status === "ACTIVE" ? "Employee deactivated — they can no longer sign in" : "Employee activated");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const open = tasks.filter((t) => ["PENDING", "IN_PROGRESS", "ON_HOLD"].includes(t.status));

  return (
    <div className="space-y-6">
      <Link to="/admin/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Employees
      </Link>
      <PageHeader
        title={emp.name}
        description={`${emp.employee_code} · ${emp.role_title} · username "${emp.username}" · joined ${fmtDate(emp.joined_at)}`}
        actions={
          <>
            <ActiveBadge status={emp.status} />
            <ResetPasswordDialog employeeId={employeeId} />
            <ConfirmDialog
              destructive={emp.status === "ACTIVE"}
              trigger={<Button variant={emp.status === "ACTIVE" ? "outline" : "success"}><Power /> {emp.status === "ACTIVE" ? "Deactivate" : "Activate"}</Button>}
              title={emp.status === "ACTIVE" ? `Deactivate ${emp.name}?` : `Activate ${emp.name}?`}
              description={emp.status === "ACTIVE" ? "They will be signed out and blocked from logging in. Their history is kept." : "They will be able to sign in again."}
              confirmLabel={emp.status === "ACTIVE" ? "Deactivate" : "Activate"}
              onConfirm={changeStatus}
            />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Delivered" value={stats?.delivered ?? 0} icon={CheckCircle2} tone="success" />
        <StatCard label="Failed" value={stats?.failed ?? 0} icon={XCircle} tone="destructive" />
        <StatCard label="Open tasks" value={open.length} icon={Clock} tone="warning" />
        <StatCard label="Avg delivery time" value={<span className="text-xl">{formatDuration(stats?.avg_duration_seconds)}</span>} icon={Timer} tone="info" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="n">Name</Label>
              <Input id="n" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m">Mobile</Label>
              <Input id="m" value={details.mobile} onChange={(e) => setDetails({ ...details, mobile: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ce">Email</Label>
              <Input id="ce" type="email" value={details.contact_email} onChange={(e) => setDetails({ ...details, contact_email: e.target.value })} />
            </div>
          </div>
          <Button className="mt-4" onClick={saveDetails} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save details</Button>
        </Panel>

        <Panel title="Permissions">
          {!perms ? (
            <p className="text-sm text-muted-foreground">No permissions set.</p>
          ) : (
            <ul className="divide-y">
              {PERMS.map((p) => (
                <li key={p.key} className="flex items-center justify-between py-3">
                  <Label htmlFor={p.key} className="font-medium">{p.label}</Label>
                  <Switch id={p.key} checked={perms[p.key]} onCheckedChange={(v) => togglePerm(p.key, v)} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Employees can never manage customers, stock, other staff or reports.</p>
        </Panel>
      </div>

      <Panel title="Task history">
        {!tasks.length ? (
          <EmptyState title="No tasks assigned yet" />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.task_code}</TableCell>
                    <TableCell className="font-medium">{t.customer_name}</TableCell>
                    <TableCell className="text-sm">{t.delivery_items.map((i) => `${i.product_name} × ${i.delivered_qty ?? i.requested_qty}`).join(", ")}</TableCell>
                    <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateTime(t.created_at)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateTime(t.completed_at)}</TableCell>
                    <TableCell>{formatDuration(t.duration_seconds)}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function ResetPasswordDialog({ employeeId }: { employeeId: string }) {
  const reset = useServerFn(resetEmployeePassword);
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    try {
      await reset({ data: { employeeId, password: pw } });
      toast.success("Password reset. Share the new password with the employee.");
      setOpen(false);
      setPw("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline"><KeyRound /> Reset password</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Set a new password</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="npw">New password</Label>
          <Input id="npw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
