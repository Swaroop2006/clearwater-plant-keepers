import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ErrorNote, Loading, PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage } from "@/lib/format";
import { unwrap } from "@/lib/queries";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — Water Plant Admin" }] }),
  component: SettingsPage,
});

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Dhaka", "Asia/Kathmandu", "Asia/Colombo", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];

function SettingsPage() {
  const qc = useQueryClient();
  const { session } = Route.useRouteContext();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => unwrap(supabase.from("app_settings").select("*").eq("id", 1).single()) });
  const [f, setF] = useState({ business_name: "", timezone: "Asia/Kolkata", late: "60" });
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (q.data) setF({ business_name: q.data.business_name, timezone: q.data.timezone, late: String(q.data.late_threshold_minutes) });
  }, [q.data]);

  async function save() {
    const late = Number(f.late);
    if (!f.business_name.trim()) { toast.error("Business name is required"); return; }
    if (!Number.isInteger(late) || late < 5 || late > 1440) { toast.error("Late threshold must be between 5 and 1440 minutes"); return; }
    setBusy(true);
    const { error } = await supabase.from("app_settings").update({ business_name: f.business_name.trim(), timezone: f.timezone, late_threshold_minutes: late }).eq("id", 1);
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    toast.success("Settings saved");
    qc.invalidateQueries();
  }

  async function changePassword() {
    if (pw.next.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (pw.next !== pw.confirm) { toast.error("Passwords do not match"); return; }
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setPwBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password changed");
    setPw({ next: "", confirm: "" });
  }

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Business preferences and your administrator account." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Business">
          <div className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="bn">Business name</Label><Input id="bn" value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Time zone (used for "today" and daily reports)</Label>
              <Select value={f.timezone} onValueChange={(v) => setF({ ...f, timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="lt">Late delivery after (minutes)</Label><Input id="lt" type="number" min={5} max={1440} value={f.late} onChange={(e) => setF({ ...f, late: e.target.value })} /></div>
            <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save settings</Button>
          </div>
        </Panel>
        <Panel title="Your account">
          <p className="mb-4 text-sm text-muted-foreground">Signed in as <span className="font-semibold text-foreground">{session.email}</span></p>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="np">New password</Label><Input id="np" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="cp">Confirm new password</Label><Input id="cp" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></div>
            <Button variant="outline" onClick={changePassword} disabled={pwBusy}>{pwBusy && <Loader2 className="animate-spin" />} Change password</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
