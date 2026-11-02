/** Shared billing, payment and daily-goods rules (mirrors the database functions). */

export type PaymentStatus = "PAID" | "PARTIALLY_PAID" | "UNPAID";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partially paid",
  UNPAID: "Unpaid",
};

export const PAYMENT_METHODS = ["CASH", "UPI", "BANK_TRANSFER", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};

export const EMPTY_CAN_TXN_LABEL: Record<string, string> = {
  OPENING_BALANCE: "Opening balance",
  EMPTY_CANS_COLLECTED: "Collected",
  EMPTY_CANS_ISSUED: "Issued",
  BALANCE_ADJUSTMENT: "Correction",
};

/** Rounds to paise (2 decimals) without floating point drift. */
export function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export type BillLine = { quantity: number; unitPrice: number };

/** Item amount = quantity delivered × customer price; bill = sum of item amounts. */
export function billTotal(lines: BillLine[]): number {
  return money(lines.reduce((sum, l) => sum + money(l.quantity * l.unitPrice), 0));
}

export function paymentStatus(total: number, paid: number): PaymentStatus {
  const pending = money(total - paid);
  if (pending <= 0) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";
  return "UNPAID";
}

/** Outstanding across all bills = Σ(bill total − payments allocated to that bill). */
export function customerOutstanding(bills: { total: number; paid: number }[]): number {
  return money(bills.reduce((sum, b) => sum + money(b.total - b.paid), 0));
}

/** Applies a payment to the oldest open bills first. Returns allocations and leftover credit. */
export function allocateOldestFirst(
  bills: { id: string; outstanding: number }[],
  amount: number,
): { allocations: { id: string; amount: number }[]; unapplied: number } {
  let remaining = money(amount);
  const allocations: { id: string; amount: number }[] = [];
  for (const b of bills) {
    if (remaining <= 0) break;
    if (b.outstanding <= 0) continue;
    const take = money(Math.min(remaining, b.outstanding));
    allocations.push({ id: b.id, amount: take });
    remaining = money(remaining - take);
  }
  return { allocations, unapplied: remaining };
}

// ===== Employee daily goods =====

export type GoodsTask = {
  id: string;
  task_code: string;
  customer_name: string;
  status: string;
  scheduled_date: string | null;
  created_at: string;
  delivery_items: { product_id: string; product_name: string; unit: string; requested_qty: number; delivered_qty: number | null }[];
};

const OPEN = new Set(["PENDING", "IN_PROGRESS", "ON_HOLD"]);

/** Local yyyy-mm-dd for a timestamp. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A task's delivery date: its scheduled date, otherwise the day it was assigned. */
export function deliveryDay(t: Pick<GoodsTask, "scheduled_date" | "created_at">): string {
  return t.scheduled_date ?? localDay(t.created_at);
}

/**
 * Tasks that belong to a given day. Unfinished tasks from earlier days are carried
 * over to today, because the employee still has to deliver them.
 */
export function tasksForDay<T extends GoodsTask>(tasks: T[], day: string, today: string): T[] {
  return tasks.filter((t) => {
    if (t.status === "CANCELLED" || t.status === "FAILED") return false;
    const d = deliveryDay(t);
    if (d === day) return true;
    return day === today && d < today && OPEN.has(t.status);
  });
}

export type GoodsLine = { product_id: string; name: string; unit: string; required: number; delivered: number; remaining: number };

/** Totals of goods per product for the given tasks (grouped by product identity). */
export function dailyGoods(tasks: GoodsTask[]): GoodsLine[] {
  const map = new Map<string, GoodsLine>();
  for (const t of tasks) {
    if (t.status === "CANCELLED" || t.status === "FAILED") continue;
    for (const i of t.delivery_items) {
      const line = map.get(i.product_id) ?? { product_id: i.product_id, name: i.product_name, unit: i.unit, required: 0, delivered: 0, remaining: 0 };
      line.required += i.requested_qty;
      if (t.status === "DELIVERED") line.delivered += i.delivered_qty ?? 0;
      else line.remaining += Math.max(0, i.requested_qty - (i.delivered_qty ?? 0));
      map.set(i.product_id, line);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
