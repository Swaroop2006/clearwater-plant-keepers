import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, QrCode, Trash2, Upload } from "lucide-react";
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

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Dhaka",
  "Asia/Kathmandu",
  "Asia/Colombo",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "UTC",
];

function SettingsPage() {
  const qc = useQueryClient();
  const { session } = Route.useRouteContext();
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: () => unwrap(supabase.from("app_settings").select("*").eq("id", 1).single()),
  });

  const [f, setF] = useState({
    business_name: "",
    timezone: "Asia/Kolkata",
    late: "60",
    upi_id: "",
    qr_image_path: "",
  });
  const [busy, setBusy] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);

  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (q.data) {
      setF({
        business_name: q.data.business_name ?? "",
        timezone: q.data.timezone ?? "Asia/Kolkata",
        late: String(q.data.late_threshold_minutes ?? 60),
        upi_id: q.data.upi_id ?? "",
        qr_image_path: q.data.qr_image_path ?? "",
      });

      if (q.data.qr_image_path) {
        supabase.storage
          .from("payment-qr")
          .createSignedUrl(q.data.qr_image_path, 3600)
          .then(({ data }) => {
            if (data?.signedUrl) setQrPreviewUrl(data.signedUrl);
          });
      } else {
        setQrPreviewUrl(null);
      }
    }
  }, [q.data]);

  async function save() {
    const late = Number(f.late);
    if (!f.business_name.trim()) { toast.error("Business name is required"); return; }
    if (!Number.isInteger(late) || late < 5 || late > 1440) {
      toast.error("Late threshold must be between 5 and 1440 minutes");
      return;
    }
    const cleanUpi = f.upi_id.trim();
    if (cleanUpi && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(cleanUpi)) {
      toast.error("Enter a valid UPI ID (e.g. merchant@upi)");
      return;
    }

    setBusy(true);
    const { error } = await supabase
      .from("app_settings")
      .update({
        business_name: f.business_name.trim(),
        timezone: f.timezone,
        late_threshold_minutes: late,
        upi_id: cleanUpi || null,
      })
      .eq("id", 1);
    setBusy(false);

    if (error) { toast.error(errorMessage(error)); return; }
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, etc.)");
      return;
    }
    setQrUploading(true);
    const fileExt = file.name.split(".").pop() || "png";
    const filePath = `payment-qr-${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from("payment-qr")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setQrUploading(false);
      toast.error(errorMessage(uploadError));
      return;
    }

    const { error: updateError } = await supabase
      .from("app_settings")
      .update({ qr_image_path: filePath })
      .eq("id", 1);

    setQrUploading(false);
    if (updateError) {
      toast.error(errorMessage(updateError));
      return;
    }

    setF((prev) => ({ ...prev, qr_image_path: filePath }));
    const { data: signData } = await supabase.storage.from("payment-qr").createSignedUrl(filePath, 3600);
    if (signData?.signedUrl) setQrPreviewUrl(signData.signedUrl);
    toast.success("Payment QR image uploaded and saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  async function handleRemoveQr() {
    setBusy(true);
    const { error } = await supabase.from("app_settings").update({ qr_image_path: null }).eq("id", 1);
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    setF((prev) => ({ ...prev, qr_image_path: "" }));
    setQrPreviewUrl(null);
    toast.success("QR image removed");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  async function changePassword() {
    if (pw.next.length < 6) { toast.error("Password must be at least 6 characters"); return; }
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
      <PageHeader title="Settings" description="Business preferences, payment QR codes, and your administrator account." />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Business Settings */}
        <Panel title="Business Profile">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bn">Business name</Label>
              <Input id="bn" value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Time zone (used for "today" and daily reports)</Label>
              <Select value={f.timezone} onValueChange={(v) => setF({ ...f, timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt">Late delivery threshold (minutes)</Label>
              <Input id="lt" type="number" min={5} max={1440} value={f.late} onChange={(e) => setF({ ...f, late: e.target.value })} />
            </div>
            <Button variant="water" onClick={save} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Save settings
            </Button>
          </div>
        </Panel>

        {/* UPI & Payment QR Settings */}
        <Panel title="UPI & Payment QR Code">
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Configure your business UPI ID and QR code to display in the customer profile "Show QR" payment dialog.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="upi">Business UPI ID</Label>
              <Input
                id="upi"
                placeholder="e.g. waterplant@okhdfcbank"
                value={f.upi_id}
                onChange={(e) => setF({ ...f, upi_id: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">Format: name@bank (e.g. plantkeepers@icici)</p>
            </div>

            <div className="space-y-2">
              <Label>Payment QR Image</Label>
              {qrPreviewUrl ? (
                <div className="flex items-center gap-4 rounded-xl border bg-card p-3">
                  <img src={qrPreviewUrl} alt="Payment QR" className="h-24 w-24 rounded-lg object-contain border bg-white p-1" />
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">Current QR code active</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => document.getElementById("qr-upload-input")?.click()}
                        disabled={qrUploading}
                      >
                        {qrUploading ? <Loader2 className="animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />} Replace
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10"
                        onClick={handleRemoveQr}
                        disabled={busy}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => document.getElementById("qr-upload-input")?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors hover:bg-accent/40"
                >
                  <QrCode className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-xs font-semibold text-foreground">Click to upload UPI QR image</p>
                  <p className="text-[11px] text-muted-foreground">PNG, JPG, or SVG up to 5MB</p>
                </div>
              )}
              <input
                id="qr-upload-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleQrUpload}
              />
            </div>

            <Button variant="water" onClick={save} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Save UPI settings
            </Button>
          </div>
        </Panel>

        {/* Account Password */}
        <Panel title="Administrator Account" className="lg:col-span-2">
          <p className="mb-4 text-sm text-muted-foreground">
            Signed in as <span className="font-semibold text-foreground">{session.email}</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="np">New password</Label>
              <Input id="np" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp">Confirm new password</Label>
              <Input id="cp" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </div>
          </div>
          <div className="mt-4">
            <Button variant="outline" onClick={changePassword} disabled={pwBusy}>
              {pwBusy && <Loader2 className="animate-spin" />} Change password
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
