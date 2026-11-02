import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

export const productsQuery = () =>
  queryOptions({
    queryKey: ["products"],
    queryFn: () => unwrap(supabase.from("products").select("*").order("kind").order("name")),
  });

export const activeEmployeesQuery = () =>
  queryOptions({
    queryKey: ["employees", "active"],
    queryFn: () =>
      unwrap(supabase.from("employees").select("id, employee_code, name").eq("status", "ACTIVE").order("name")),
  });

export const allEmployeesLiteQuery = () =>
  queryOptions({
    queryKey: ["employees", "lite"],
    queryFn: () => unwrap(supabase.from("employees").select("id, employee_code, name, status").order("name")),
  });

export const activeCustomersQuery = () =>
  queryOptions({
    queryKey: ["customers", "active-lite"],
    queryFn: () =>
      unwrap(
        supabase
          .from("customers")
          .select("id, customer_code, name, address, mobile, price_per_can, price_per_packet")
          .eq("status", "ACTIVE")
          .order("name"),
      ),
  });

export const allCustomersLiteQuery = () =>
  queryOptions({
    queryKey: ["customers", "lite"],
    queryFn: () => unwrap(supabase.from("customers").select("id, customer_code, name").order("name")),
  });

export const TASK_SELECT =
  "*, delivery_items(id, product_id, product_name, product_kind, unit, requested_qty, delivered_qty, unit_price), employees(id, name, employee_code)";

export type DashboardData = {
  total_customers: number;
  active_customers: number;
  total_employees: number;
  active_employees: number;
  today_tasks: number;
  today_delivered: number;
  today_failed: number;
  pending: number;
  in_progress: number;
  on_hold: number;
  filled_cans: number;
  packets: number;
  empty_cans: number;
  low_stock: { id: string; name: string; unit: string; available: number; min: number }[];
  employee_today: { id: string; name: string; code: string; delivered: number; failed: number; pending: number; in_progress: number; avg_minutes: number | null }[];
  monthly: { month: string; delivered: number; failed: number; cans: number; packets: number }[];
};

export { unwrap };
