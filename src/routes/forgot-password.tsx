import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, MailCheck } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset Admin Password — Water Plant" },
      { name: "description", content: "Request a password reset link for your administrator account." },
      { property: "og:title", content: "Reset Admin Password — Water Plant" },
      { property: "og:description", content: "Request a password reset link for your administrator account." },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (err) return setError(err.message);
    setSent(true);
  }

  return (
    <AuthLayout tone="navy" badge="Administrator" title="Forgot password" subtitle="We'll email you a link to set a new password.">
      {sent ? (
        <div className="space-y-4 text-center">
          <MailCheck className="mx-auto size-10 text-success" />
          <p className="text-sm text-muted-foreground">If an account exists for that email, a reset link is on its way.</p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login/admin">Back to Admin Login</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Admin email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" variant="navy" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Send reset link
          </Button>
          <p className="text-center text-xs text-muted-foreground">Delivery staff: ask your manager to reset your password.</p>
        </form>
      )}
    </AuthLayout>
  );
}
