import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { EmployeeShell } from "@/components/app/EmployeeShell";
import { supabase } from "@/integrations/supabase/client";
import { requireRole } from "@/lib/auth";

export const Route = createFileRoute("/employee")({
  ssr: false,
  beforeLoad: async () => {
    const session = await requireRole("employee");
    const { data: employee } = await supabase.from("employees").select("*").eq("user_id", session.userId).maybeSingle();
    if (!employee || employee.status !== "ACTIVE") {
      await supabase.auth.signOut();
      throw redirect({ to: "/login/employee" });
    }
    const { data: permissions } = await supabase.from("employee_permissions").select("*").eq("employee_id", employee.id).maybeSingle();
    return { session, employee, permissions };
  },
  head: () => ({ meta: [{ title: "My Deliveries — Water Plant" }, { name: "robots", content: "noindex" }] }),
  component: EmployeeLayout,
});

function EmployeeLayout() {
  const { employee } = Route.useRouteContext();
  return (
    <EmployeeShell name={employee.name} code={employee.employee_code}>
      <Outlet />
    </EmployeeShell>
  );
}
