import { describe, expect, it } from "vitest";
import { employeeLoginEmail, formatDuration, MOBILE_REGEX, USERNAME_REGEX } from "@/lib/format";
import { presetRange } from "@/lib/date-ranges";

describe("employee login", () => {
  it("maps a username to the internal staff address", () => {
    expect(employeeLoginEmail("  Ravi.K ")).toBe("ravi.k@staff.waterplant.local");
  });
  it("keeps a full email unchanged", () => {
    expect(employeeLoginEmail("ravi@shop.in")).toBe("ravi@shop.in");
  });
  it("rejects usernames with spaces or capitals", () => {
    expect(USERNAME_REGEX.test("Ravi K")).toBe(false);
    expect(USERNAME_REGEX.test("ravi_k")).toBe(true);
  });
});

describe("validation", () => {
  it("accepts 10–13 digit mobile numbers only", () => {
    expect(MOBILE_REGEX.test("9876543210")).toBe(true);
    expect(MOBILE_REGEX.test("+919876543210")).toBe(true);
    expect(MOBILE_REGEX.test("98765")).toBe(false);
  });
});

describe("delivery duration", () => {
  it("formats seconds into readable durations", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(750)).toBe("12m 30s");
    expect(formatDuration(3900)).toBe("1h 05m");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("date presets", () => {
  it("yesterday covers the whole previous day", () => {
    const [a, b] = presetRange("yesterday", undefined, new Date(2026, 10, 2, 9, 0))!;
    expect(a).toEqual(new Date(2026, 10, 1, 0, 0, 0, 0));
    expect(b.getDate()).toBe(1);
    expect(b.getHours()).toBe(23);
  });
});
