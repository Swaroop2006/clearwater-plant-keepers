import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * First-run setup: creates the very first administrator account.
 * Refuses to run once any administrator exists (checked under a database lock).
 */
export const createFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().toLowerCase().email("Enter a valid email"),
        password: z.string().min(6, "Password must be at least 6 characters").max(72),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: exists } = await supabaseAdmin.rpc("admin_exists");
    if (exists) throw new Error("Setup is already complete. Please sign in as administrator.");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, kind: "admin" },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create the account");

    const { error: roleErr } = await supabaseAdmin.rpc("bootstrap_first_admin", { _user_id: created.user.id });
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error("Setup is already complete. Please sign in as administrator.");
    }
    return { ok: true };
  });
