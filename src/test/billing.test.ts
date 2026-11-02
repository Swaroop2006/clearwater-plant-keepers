import { describe, expect, it } from "vitest";
import { allocateOldestFirst, billTotal, customerOutstanding, dailyGoods, paymentStatus, tasksForDay, type GoodsTask } from "@/lib/billing";

describe("bill calculation", () => {
  it("multiplies delivered quantity by the customer price", () => {
    // 5 cans × ₹35 + 10 packets × ₹10 = ₹275
    expect(billTotal([{ quantity: 5, unitPrice: 35 }, { quantity: 10, unitPrice: 10 }])).toBe(275);
  });
});

describe("payment status", () => {
  it("₹300 bill fully paid is PAID", () => expect(paymentStatus(300, 300)).toBe("PAID"));
  it("₹300 bill with ₹200 paid is PARTIALLY_PAID", () => expect(paymentStatus(300, 200)).toBe("PARTIALLY_PAID"));
  it("₹300 bill with nothing paid is UNPAID", () => expect(paymentStatus(300, 0)).toBe("UNPAID"));
});

describe("cumulative outstanding", () => {
  it("accumulates across days until paid", () => {
    // Day 1: 300 paid 200, Day 2: 300 paid 0 → 400
    expect(customerOutstanding([{ total: 300, paid: 200 }, { total: 300, paid: 0 }])).toBe(400);
    // Day 3: 300 paid 100 → 600
    expect(customerOutstanding([{ total: 300, paid: 200 }, { total: 300, paid: 0 }, { total: 300, paid: 100 }])).toBe(600);
  });
  it("day 4: ₹300 bill paid in full plus ₹200 toward old dues leaves ₹400", () => {
    const old = allocateOldestFirst([{ id: "d1", outstanding: 100 }, { id: "d2", outstanding: 300 }, { id: "d3", outstanding: 200 }], 200);
    const paid: Record<string, number> = { d1: 200, d2: 0, d3: 100 };
    for (const a of old.allocations) paid[a.id] = (paid[a.id] ?? 0) + a.amount;
    expect(customerOutstanding([
      { total: 300, paid: paid["d1"]! },
      { total: 300, paid: paid["d2"]! },
      { total: 300, paid: paid["d3"]! },
      { total: 300, paid: 300 },
    ])).toBe(400);
  });
});

describe("payment allocation", () => {
  it("₹150 toward a ₹100 bill settles it and keeps ₹50 as credit", () => {
    const r = allocateOldestFirst([{ id: "old", outstanding: 100 }], 150);
    expect(r.allocations).toEqual([{ id: "old", amount: 100 }]);
    expect(r.unapplied).toBe(50);
  });
});

const task = (id: string, status: string, items: [string, number][], scheduled = "2026-11-02"): GoodsTask => ({
  id, task_code: id, customer_name: id, status, scheduled_date: scheduled, created_at: "2026-11-02T05:00:00Z",
  delivery_items: items.map(([p, q]) => ({ product_id: p, product_name: p, unit: "unit", requested_qty: q, delivered_qty: status === "DELIVERED" ? q : null })),
});

describe("daily required goods", () => {
  it("adds up 5 + 3 cans and 10 packets", () => {
    const goods = dailyGoods([task("A", "PENDING", [["can", 5]]), task("B", "PENDING", [["can", 3], ["packet", 10]])]);
    expect(goods.find((g) => g.product_id === "can")?.remaining).toBe(8);
    expect(goods.find((g) => g.product_id === "packet")?.remaining).toBe(10);
  });
  it("after the first task is delivered, 3 cans and 10 packets remain", () => {
    const goods = dailyGoods([task("A", "DELIVERED", [["can", 5]]), task("B", "PENDING", [["can", 3], ["packet", 10]])]);
    expect(goods.find((g) => g.product_id === "can")?.remaining).toBe(3);
    expect(goods.find((g) => g.product_id === "packet")?.remaining).toBe(10);
  });
  it("ignores cancelled and failed tasks", () => {
    const goods = dailyGoods([task("A", "CANCELLED", [["can", 5]]), task("B", "FAILED", [["can", 2]])]);
    expect(goods).toEqual([]);
  });
  it("carries unfinished tasks from earlier days into today only", () => {
    const tasks = [task("old", "PENDING", [["can", 2]], "2026-11-01"), task("today", "PENDING", [["can", 1]], "2026-11-02")];
    expect(tasksForDay(tasks, "2026-11-02", "2026-11-02").map((t) => t.id)).toEqual(["old", "today"]);
    expect(tasksForDay(tasks, "2026-11-01", "2026-11-02").map((t) => t.id)).toEqual(["old"]);
  });
});
