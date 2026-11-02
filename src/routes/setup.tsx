import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { createFirstAdmin } from "@/server/setup.functions";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "First-time Setup — Water Plant Management System" },
      { name: "description", content: "Create the first administrator account for your Water Plant Management System." },
      { property: "og:title", content: "First-time Setup — Water Plant" },
      { property: "og:description", content: "Create the first administrator account." },
    ],
  }),
  component: Setup,
});

function Setup() {
  const navigate = useNavigate();
  const create = useServerFn(createFirstAdmin);
  const [exists, setExists] = useState<boolean | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("admin_exists").then(({ data }) => setExists(Boolean(data)));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!form.name.trim()) { setError("Enter your name."); return; }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) { setError("Enter a valid email."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.password !== form.confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      await create({ data: { name: form.name, email: form.email, password: form.password } });
      const { error: err } = await supabase.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password });
      if (err) throw err;
      toast.success("Administrator account created");
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout tone="navy" badge="First-time setup" title="Create the administrator" subtitle="This page works only once, before any administrator exists.">
      {exists === null ? (
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
      ) : exists ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <p className="text-sm text-muted-foreground">Setup is already complete.</p>
          <Button asChild variant="navy" className="w-full">
            <Link to="/login/admin">Go to Admin Login</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {(["name", "email", "password", "confirm"] as const).map((k) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={k}>{{ name: "Your name", email: "Email", password: "Password", confirm: "Confirm password" }[k]}</Label>
              <Input
                id={k}
                type={k === "email" ? "email" : k === "name" ? "text" : "password"}
                autoComplete={k === "email" ? "email" : k === "name" ? "name" : "new-password"}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" variant="navy" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Create administrator
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
