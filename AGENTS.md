<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture rules

- Business rules (task queue order, start/complete/fail/hold, stock movements, reports) live in SECURITY DEFINER Postgres functions called via `supabase.rpc`; they check role/ownership themselves, so the UI never writes tasks or stock directly. Why: atomic transactions and backend enforcement.
- Clients have only SELECT on delivery_tasks, delivery_items, inventory_transactions; products/employees have column-level UPDATE grants only for safe columns. Why: stock and identity can't be changed outside the functions.
- inventory_transactions is append-only (trigger blocks update/delete); corrections are new rows. Why: auditable stock history.
- Roles live in `user_roles` (`admin` | `employee`); route guards in `src/routes/admin.tsx` and `src/routes/employee.tsx` (ssr: false) use `requireRole` from `src/lib/auth.ts`. Why: sessions are in browser storage.
- Employees log in with a username mapped to `<username>@staff.waterplant.local`; accounts are created/banned/reset only by admin server functions in `src/lib/employees.functions.ts` (service role). Public signup is disabled. Why: no plain passwords, admins control access.
- First admin is created once via `/setup` (`src/lib/setup.functions.ts` + `bootstrap_first_admin` with an advisory lock). Why: no hard-coded admin password.
- Server function files must not live under `src/server/` (blocked from the client bundle); use `src/lib/*.functions.ts`.
- Delivery rows snapshot customer name/phone/address and item prices, so employees never need access to the customers table.
