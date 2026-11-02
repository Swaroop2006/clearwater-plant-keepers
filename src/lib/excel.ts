/** Builds real .xlsx workbooks (bold headers, filters, frozen header row, number formats). */

export type ColType = "text" | "int" | "money" | "date" | "datetime" | "minutes";
export type Col = { header: string; key: string; type?: ColType; width?: number };
export type SheetSpec = { name: string; columns: Col[]; rows: Record<string, unknown>[] };

const FORMATS: Partial<Record<ColType, string>> = {
  int: "#,##0",
  money: '"₹"#,##0.00',
  date: "dd-mmm-yyyy",
  datetime: "dd-mmm-yyyy hh:mm AM/PM",
  minutes: "0.0",
};

function cellValue(v: unknown, type: ColType): unknown {
  if (v === null || v === undefined || v === "") return null;
  switch (type) {
    case "int":
    case "money":
    case "minutes": {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    case "date":
    case "datetime": {
      const d = v instanceof Date ? v : new Date(String(v));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    default:
      return String(v);
  }
}

/** Excel sheet names: max 31 chars, no []:*?/\ */
export function safeSheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet";
}

export async function buildWorkbook(sheets: SheetSpec[]) {
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Water Plant Management System";
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(safeSheetName(s.name), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = s.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? Math.min(48, Math.max(12, c.header.length + 4)),
      style: FORMATS[c.type ?? "text"] ? { numFmt: FORMATS[c.type ?? "text"] } : {},
    }));
    for (const r of s.rows) {
      const row: Record<string, unknown> = {};
      for (const c of s.columns) row[c.key] = cellValue(r[c.key], c.type ?? "text");
      ws.addRow(row);
    }
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B4F8A" } };
    header.alignment = { vertical: "middle", wrapText: true };
    header.height = 28;
    if (s.columns.length) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, s.rows.length + 1), column: s.columns.length } };
    }
    // Widen text columns to fit their content (capped)
    s.columns.forEach((c, i) => {
      if ((c.type ?? "text") !== "text" || c.width) return;
      const longest = s.rows.reduce((m, r) => Math.max(m, String(r[c.key] ?? "").length), c.header.length);
      ws.getColumn(i + 1).width = Math.min(60, Math.max(12, longest + 2));
    });
  }
  return wb;
}

export async function downloadWorkbook(filename: string, sheets: SheetSpec[]) {
  const wb = await buildWorkbook(sheets);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Collects dynamic per-item columns from rows that carry an `items` map. */
export function itemColumns(rows: { items?: Record<string, number> }[], prefix = "Qty: "): Col[] {
  const names = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.items ?? {})) names.add(k);
  return [...names].sort().map((n) => ({ header: `${prefix}${n}`, key: `item:${n}`, type: "int" as const }));
}

export function flattenItems<T extends { items?: Record<string, number> }>(rows: T[]): (T & Record<string, unknown>)[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    for (const [k, v] of Object.entries(r.items ?? {})) out[`item:${k}`] = v;
    return out as T & Record<string, unknown>;
  });
}
