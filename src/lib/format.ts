import { format, formatDistanceToNowStrict } from "date-fns";

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "DELIVERED" | "FAILED" | "ON_HOLD" | "CANCELLED";

export const TASK_STATUSES: TaskStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "DELIVERED",
  "FAILED",
  "ON_HOLD",
  "CANCELLED",
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  ON_HOLD: "On hold",
  CANCELLED: "Cancelled",
};

export const PRODUCT_KIND_LABEL: Record<string, string> = {
  FILLED_CAN: "Filled water can",
  PACKET: "Water packet",
  EMPTY_CAN: "Empty water can",
  OTHER: "Other",
};

export const TXN_LABEL: Record<string, string> = {
  OPENING_STOCK: "Opening stock",
  STOCK_ADDED: "Stock added",
  DELIVERY: "Delivery",
  DAMAGE: "Damage",
  ADJUSTMENT: "Adjustment",
  EMPTY_CAN_RETURN: "Empty can return",
  CORRECTION: "Correction",
};

export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  HOME: "Home",
  SHOP: "Shop",
  OFFICE: "Office",
};

/** Formats a number of seconds as "1h 05m", "12m 30s" or "45s". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

/** Live clock style "01:05:09". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "dd MMM yyyy, h:mm a");
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "dd MMM yyyy");
}

export function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "h:mm a");
}

export function fmtAgo(value: string | null | undefined): string {
  if (!value) return "—";
  return `${formatDistanceToNowStrict(new Date(value))} ago`;
}

export function fmtMoney(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}

/** Employees sign in with a username; their account uses this internal address. */
export const EMPLOYEE_EMAIL_DOMAIN = "staff.waterplant.local";

export function employeeLoginEmail(input: string): string {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${EMPLOYEE_EMAIL_DOMAIN}`;
}

export const MOBILE_REGEX = /^\+?[0-9]{10,13}$/;
export const USERNAME_REGEX = /^[a-z0-9._-]{3,30}$/;

/** Turns database errors into friendly messages. */
export function errorMessage(err: unknown): string {
  if (!err) return "Something went wrong";
  const e = err as { message?: string; code?: string; details?: string };
  const msg = e.message ?? String(err);
  if (e.code === "23503" || /foreign key/i.test(msg)) {
    return "This record is linked to deliveries and cannot be deleted. Deactivate it instead.";
  }
  if (e.code === "23505" || /duplicate key/i.test(msg)) return "This value already exists.";
  if (e.code === "42501" && !/Not authorized|permission|assigned/i.test(msg)) {
    return "You are not allowed to do that.";
  }
  if (/check constraint/i.test(msg)) return "Some values are invalid. Please check the form.";
  if (/Failed to fetch/i.test(msg)) return "Network error. Please check your connection.";
  return msg.replace(/^Unauthorized: /, "");
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const first = rows[0];
  if (!first) return;
  const headers = Object.keys(first);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
