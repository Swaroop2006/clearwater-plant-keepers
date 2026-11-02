import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminShell } from "@/components/app/AdminShell";
import { requireRole } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => ({ session: await requireRole("admin") }),
  head: () => ({ meta: [{ title: "Admin — Water Plant Management System" }, { name: "robots", content: "noindex" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { session } = Route.useRouteContext();
  return (
    <AdminShell email={session.email}>
      <Outlet />
    </AdminShell>
  );
}
