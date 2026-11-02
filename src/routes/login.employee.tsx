import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { employeeLoginEmail } from "@/lib/format";

export const Route = createFileRoute("/login/employee")({
  head: () => ({
    meta: [
      { title: "Employee Login — Water Plant Management System" },
      { name: "description", content: "Delivery staff sign-in to view and complete assigned water deliveries." },
      { property: "og:title", content: "Employee Login — Water Plant" },
      { property: "og:description", content: "Delivery staff sign-in for assigned water deliveries." },
    ],
  }),
  component: EmployeeLogin,
});

function EmployeeLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!username.trim() || !password) { setError("Enter your username and password."); return; }
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: employeeLoginEmail(username), password });
      if (err || !data.user) {
        if (err?.message?.toLowerCase().includes("banned")) setError("Your account is inactive. Please contact the office.");
        else setError(err?.message === "Invalid login credentials" ? "Incorrect username or password." : err?.message ?? "Sign-in failed.");
        return;
      }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      if (!roles?.some((r) => r.role === "employee")) {
        await supabase.auth.signOut();
        setError("This is not an employee account. Administrators should use Admin Login.");
        return;
      }
      navigate({ to: "/employee", replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      badge="Delivery staff"
      title="Employee Login"
      subtitle="Sign in with the username your manager gave you."
      footer={
        <>
          Owner or manager?{" "}
          <Link to="/login/admin" className="font-semibold text-primary hover:underline">
            Admin Login
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoCapitalize="none"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. ravi.k"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" variant="water" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Sign in
        </Button>
        <p className="text-center text-xs text-muted-foreground">Forgot your password? Ask your manager to reset it.</p>
      </form>
    </AuthLayout>
  );
}
