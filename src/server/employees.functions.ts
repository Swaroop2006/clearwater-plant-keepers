import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPLOYEE_EMAIL_DOMAIN } from "@/lib/format";

const BAN_FOREVER = "876000h";

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Not authorized: administrator access required");
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  mobile: z.string().trim().regex(/^\+?[0-9]{10,13}$/, "Enter a valid mobile number"),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, "Username: 3–30 lowercase letters, numbers, . _ -"),
  contactEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin.from("employees").select("id").eq("username", data.username).maybeSingle();
    if (existing) throw new Error("That username is already taken");

    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: `${data.username}@${EMPLOYEE_EMAIL_DOMAIN}`,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, kind: "employee" },
    });
    if (authErr || !created.user) {
      throw new Error(authErr?.message?.includes("already") ? "That username is already taken" : authErr?.message ?? "Could not create the login");
    }
    const uid = created.user.id;

    const { data: emp, error: empErr } = await supabaseAdmin
      .from("employees")
      .insert({ user_id: uid, name: data.name, mobile: data.mobile, username: data.username, contact_email: data.contactEmail || null })
      .select("id, employee_code")
      .single();
    if (empErr || !emp) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(empErr?.message ?? "Could not save the employee");
    }
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "employee" });
    const { error: permErr } = await supabaseAdmin.from("employee_permissions").insert({ employee_id: emp.id });
    if (roleErr || permErr) {
      await supabaseAdmin.from("employees").delete().eq("id", emp.id);
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error("Could not finish setting up the employee account");
    }
    return { id: emp.id, employeeCode: emp.employee_code };
  });

export const setEmployeeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ employeeId: z.string().uuid(), status: z.enum(["ACTIVE", "INACTIVE"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emp, error } = await supabaseAdmin.from("employees").select("id, user_id").eq("id", data.employeeId).single();
    if (error || !emp) throw new Error("Employee not found");

    if (data.status === "INACTIVE") {
      const { count } = await supabaseAdmin
        .from("delivery_tasks")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", emp.id)
        .eq("status", "IN_PROGRESS");
      if ((count ?? 0) > 0) throw new Error("This employee has a delivery in progress. Wait for it to finish or cancel it first.");
    }
    if (emp.user_id) {
      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(emp.user_id, {
        ban_duration: data.status === "INACTIVE" ? BAN_FOREVER : "none",
      });
      if (banErr) throw new Error("Could not update the login: " + banErr.message);
    }
    const { error: upErr } = await supabaseAdmin.from("employees").update({ status: data.status }).eq("id", emp.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const resetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ employeeId: z.string().uuid(), password: z.string().min(8, "Password must be at least 8 characters").max(72) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emp } = await supabaseAdmin.from("employees").select("user_id").eq("id", data.employeeId).single();
    if (!emp?.user_id) throw new Error("Employee login not found");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(emp.user_id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
