import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "employee";

export async function getSessionRoles(): Promise<{ userId: string; email: string; roles: AppRole[] } | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: rows } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
  return {
    userId: data.user.id,
    email: data.user.email ?? "",
    roles: (rows ?? []).map((r) => r.role as AppRole),
  };
}

/** Route guard: only lets users with the given role through. */
export async function requireRole(role: AppRole) {
  const session = await getSessionRoles();
  const loginPath = role === "admin" ? "/login/admin" : "/login/employee";
  if (!session) throw redirect({ to: loginPath });
  if (!session.roles.includes(role)) {
    // Signed in, but to the wrong portal: send them to their own area.
    if (session.roles.includes("admin")) throw redirect({ to: "/admin" });
    if (session.roles.includes("employee")) throw redirect({ to: "/employee" });
    await supabase.auth.signOut();
    throw redirect({ to: loginPath });
  }
  return session;
}

export async function signOutTo(path: "/login/admin" | "/login/employee" | "/") {
  await supabase.auth.signOut();
  window.location.assign(path);
}
