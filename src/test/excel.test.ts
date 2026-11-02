import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook } from "@/lib/excel";

describe("excel export", () => {
  it("writes a real xlsx with every column and row, bold frozen headers and rupee format", async () => {
    const wb = await buildWorkbook([
      {
        name: "Customer Summary",
        columns: [
          { header: "Customer ID", key: "code" },
          { header: "Total Bill Amount", key: "billed", type: "money" },
          { header: "Total Pending Amount", key: "pending", type: "money" },
          { header: "Last Delivery Date", key: "last", type: "date" },
        ],
        rows: [
          { code: "CUST0001", billed: 300, pending: 100, last: "2026-11-01T10:00:00Z" },
          { code: "CUST0002", billed: "600.50", pending: 0, last: null },
        ],
      },
    ]);
    const buf = await wb.xlsx.writeBuffer();
    // xlsx files are zip archives starting with "PK"
    expect(new Uint8Array(buf as ArrayBuffer).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));

    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);
    const ws = back.getWorksheet("Customer Summary")!;
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(1).values).toEqual([undefined, "Customer ID", "Total Bill Amount", "Total Pending Amount", "Last Delivery Date"]);
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.getCell("B3").value).toBe(600.5);
    expect(ws.getCell("B2").numFmt).toContain("₹");
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });
});
