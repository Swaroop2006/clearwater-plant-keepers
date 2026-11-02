import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login/admin")({
  head: () => ({
    meta: [
      { title: "Admin Login — Water Plant Management System" },
      { name: "description", content: "Administrator sign-in for the Water Plant Management System." },
      { property: "og:title", content: "Admin Login — Water Plant" },
      { property: "og:description", content: "Administrator sign-in for the Water Plant Management System." },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (err || !data.user) {
        setError(err?.message === "Invalid login credentials" ? "Incorrect email or password." : err?.message ?? "Sign-in failed.");
        return;
      }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      if (!roles?.some((r) => r.role === "admin")) {
        await supabase.auth.signOut();
        setError("This account is not an administrator. Delivery staff should use Employee Login.");
        return;
      }
      navigate({ to: "/admin", replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      tone="navy"
      badge="Administrator"
      title="Admin Login"
      subtitle="Sign in to manage customers, staff, deliveries and stock."
      footer={
        <>
          Delivery staff?{" "}
          <Link to="/login/employee" className="font-semibold text-primary hover:underline">
            Employee Login
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" variant="navy" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Sign in as Admin
        </Button>
      </form>
    </AuthLayout>
  );
}
