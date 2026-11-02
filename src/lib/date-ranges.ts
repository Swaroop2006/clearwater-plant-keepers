import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";

export type RangePreset = "today" | "yesterday" | "week" | "month" | "custom" | "all";

export const RANGE_LABEL: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  month: "This month",
  custom: "Custom range",
  all: "All time",
};

/** Returns [start, end] Date objects (local time) for a preset. */
export function presetRange(
  preset: RangePreset,
  custom?: { from?: string; to?: string },
  now: Date = new Date(),
): [Date, Date] | null {
  switch (preset) {
    case "today":
      return [startOfDay(now), endOfDay(now)];
    case "yesterday": {
      const y = subDays(now, 1);
      return [startOfDay(y), endOfDay(y)];
    }
    case "week":
      return [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })];
    case "month":
      return [startOfMonth(now), endOfMonth(now)];
    case "custom": {
      if (!custom?.from || !custom?.to) return null;
      return [startOfDay(new Date(custom.from)), endOfDay(new Date(custom.to))];
    }
    default:
      return null;
  }
}

export const isoDate = (d: Date) => format(d, "yyyy-MM-dd");
