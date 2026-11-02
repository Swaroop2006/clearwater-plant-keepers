import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, Ban, Loader2, MoreHorizontal, Play, UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activeEmployeesQuery } from "@/lib/queries";
import { errorMessage } from "@/lib/format";

type Mode = null | "reassign" | "priority" | "cancel";

export function TaskActions({ task }: { task: { id: string; task_code: string; status: string; priority: number; employee_id: string } }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [emp, setEmp] = useState(task.employee_id);
  const [prio, setPrio] = useState(String(task.priority));
  const [reason, setReason] = useState("");
  const employees = useQuery({ ...activeEmployeesQuery(), enabled: mode === "reassign" });

  const canReassign = ["PENDING", "ON_HOLD", "FAILED"].includes(task.status);
  const canPriority = ["PENDING", "ON_HOLD"].includes(task.status);
  const canCancel = ["PENDING", "ON_HOLD", "IN_PROGRESS"].includes(task.status);
  const canResume = task.status === "ON_HOLD";
  if (!canReassign && !canPriority && !canCancel) return null;

  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setMode(null);
  };

  async function run() {
    setBusy(true);
    let error;
    if (mode === "reassign") ({ error } = await supabase.rpc("reassign_delivery_task", { _task_id: task.id, _employee_id: emp, _priority: Number(prio) }));
    else if (mode === "priority") ({ error } = await supabase.rpc("set_task_priority", { _task_id: task.id, _priority: Number(prio) }));
    else if (mode === "cancel") ({ error } = await supabase.rpc("cancel_delivery_task", { _task_id: task.id, _reason: reason }));
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    done(mode === "reassign" ? "Task reassigned" : mode === "priority" ? "Priority updated" : "Task cancelled");
  }

  async function resume() {
    const { error } = await supabase.rpc("resume_delivery_task", { _task_id: task.id });
    if (error) { toast.error(errorMessage(error)); return; }
    done("Task returned to the queue");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={`Actions for ${task.task_code}`}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canResume && <DropdownMenuItem onClick={resume}><Play /> Return to queue</DropdownMenuItem>}
          {canReassign && <DropdownMenuItem onClick={() => { setEmp(task.employee_id); setPrio(String(task.priority)); setMode("reassign"); }}><UserRoundCog /> {task.status === "FAILED" ? "Retry / reassign" : "Reassign"}</DropdownMenuItem>}
          {canPriority && <DropdownMenuItem onClick={() => { setPrio(String(task.priority)); setMode("priority"); }}><ArrowUpDown /> Change priority</DropdownMenuItem>}
          {canCancel && <DropdownMenuItem className="text-destructive" onClick={() => { setReason(""); setMode("cancel"); }}><Ban /> Cancel task</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode !== null} onOpenChange={(o) => !busy && !o && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "reassign" ? `Reassign ${task.task_code}` : mode === "priority" ? `Priority for ${task.task_code}` : `Cancel ${task.task_code}?`}
            </DialogTitle>
            {mode === "cancel" && <DialogDescription>No stock will be deducted. This can't be undone.</DialogDescription>}
            {mode === "reassign" && task.status === "FAILED" && <DialogDescription>The task goes back to the employee's queue as pending.</DialogDescription>}
          </DialogHeader>
          {mode === "reassign" && (
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Select value={emp} onValueChange={setEmp}>
                <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
                <SelectContent>
                  {(employees.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name} ({e.employee_code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {(mode === "reassign" || mode === "priority") && (
            <div className="space-y-1.5">
              <Label>Priority (1 = highest)</Label>
              <Select value={prio} onValueChange={setPrio}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {mode === "cancel" && (
            <div className="space-y-1.5">
              <Label htmlFor="cr">Reason</Label>
              <Textarea id="cr" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer called to cancel" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>Close</Button>
            <Button variant={mode === "cancel" ? "destructive" : "default"} onClick={run} disabled={busy || (mode === "cancel" && reason.trim().length < 3)}>
              {busy && <Loader2 className="animate-spin" />} {mode === "cancel" ? "Cancel task" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
