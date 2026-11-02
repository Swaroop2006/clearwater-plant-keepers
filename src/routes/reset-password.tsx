import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set New Password — Water Plant" },
      { name: "description", content: "Choose a new password for your administrator account." },
      { property: "og:title", content: "Set New Password — Water Plant" },
      { property: "og:description", content: "Choose a new password for your administrator account." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session || window.location.hash.includes("type=recovery")) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    toast.success("Password updated. Please sign in.");
    await supabase.auth.signOut();
    navigate({ to: "/login/admin", replace: true });
  }

  return (
    <AuthLayout tone="navy" badge="Administrator" title="Set a new password" subtitle="Choose a strong password you don't use elsewhere.">
      {!ready ? (
        <p className="text-sm text-muted-foreground">Open this page from the link in your reset email.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="pw">New password</Label>
            <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw2">Confirm password</Label>
            <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" variant="navy" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
