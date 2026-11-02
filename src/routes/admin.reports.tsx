import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, startOfMonth } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Download,
  Droplet,
  IndianRupee,
  Package,
  PackageOpen,
  Search,
  Timer,
  Truck,
  Users,
  UserCheck,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorNote, Loading, PageHeader, Panel, StatCard } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { customerTypeLabel, fmtDate, fmtDateTime, fmtMoney, formatDuration, PRODUCT_KIND_LABEL } from "@/lib/format";
import { isoDate } from "@/lib/date-ranges";
import { unwrap } from "@/lib/queries";
import { downloadWorkbook, itemColumns, flattenItems } from "@/lib/excel";

export const Route = createFileRoute("/admin/reports")({
  validateSearch: (s: Record<string, unknown>): { view?: string; from?: string; to?: string } => {
    const res: { view?: string; from?: string; to?: string } = {};
    if (typeof s["view"] === "string") res.view = s["view"];
    if (typeof s["from"] === "string") res.from = s["from"];
    if (typeof s["to"] === "string") res.to = s["to"];
    return res;
  },
  head: () => ({ meta: [{ title: "Reports — Water Plant Admin" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/reports" });

  const now = new Date();
  const defaultFrom = isoDate(startOfMonth(now));
  const defaultTo = isoDate(endOfMonth(now));

  const [from, setFrom] = useState(search.from ?? defaultFrom);
  const [to, setTo] = useState(search.to ?? defaultTo);
  const [searchTerm, setSearchTerm] = useState("");

  const valid = Boolean(from && to && from <= to);

  // Queries for the three reports
  const customersReportQuery = useQuery({
    queryKey: ["customer-report", from, to],
    enabled: valid,
    queryFn: async () => {
      const data = await unwrap(supabase.rpc("customer_report", { _from: from, _to: to }));
      return (data ?? []) as any[];
    },
  });

  const employeesReportQuery = useQuery({
    queryKey: ["employee-report", from, to],
    enabled: valid,
    queryFn: async () => {
      const data = await unwrap(supabase.rpc("employee_report", { _from: from, _to: to }));
      return (data ?? []) as any[];
    },
  });

  const inventoryReportQuery = useQuery({
    queryKey: ["inventory-report", from, to],
    enabled: valid,
    queryFn: async () => {
      const data = await unwrap(supabase.rpc("inventory_report", { _from: from, _to: to }));
      return data as { products: any[]; movements: any[] };
    },
  });

  const view = search.view ?? "cards";

  // Data
  const customerRows = customersReportQuery.data ?? [];
  const employeeRows = employeesReportQuery.data ?? [];
  const inventoryData = inventoryReportQuery.data ?? { products: [], movements: [] };

  // Summary Metrics
  const totalCustomerDeliveries = customerRows.reduce((s, r) => s + (r.deliveries || 0), 0);
  const totalBilled = customerRows.reduce((s, r) => s + Number(r.billed || 0), 0);
  const totalOutstanding = customerRows.reduce((s, r) => s + Number(r.outstanding || 0), 0);

  const totalAssignedDeliveries = employeeRows.reduce((s, r) => s + (r.assigned || 0), 0);
  const totalCompletedDeliveries = employeeRows.reduce((s, r) => s + (r.delivered || 0), 0);
  const totalCollectedByStaff = employeeRows.reduce((s, r) => s + Number(r.amount_collected || 0), 0);

  const totalProducts = inventoryData.products.length;
  const lowStockProducts = inventoryData.products.filter((p) => p.low).length;
  const totalDeliveriesStock = inventoryData.products.reduce((s, p) => s + (p.delivered || 0), 0);

  // Filtered views
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customerRows;
    const term = searchTerm.toLowerCase();
    return customerRows.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.code.toLowerCase().includes(term) ||
        c.mobile.includes(term),
    );
  }, [customerRows, searchTerm]);

  const filteredEmployees = useMemo(() => {
    if (!searchTerm.trim()) return employeeRows;
    const term = searchTerm.toLowerCase();
    return employeeRows.filter(
      (e) =>
        e.name.toLowerCase().includes(term) ||
        e.code.toLowerCase().includes(term) ||
        e.mobile.includes(term),
    );
  }, [employeeRows, searchTerm]);

  const filteredInventory = useMemo(() => {
    if (!searchTerm.trim()) return inventoryData.products;
    const term = searchTerm.toLowerCase();
    return inventoryData.products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.code.toLowerCase().includes(term),
    );
  }, [inventoryData.products, searchTerm]);

  // Excel Exporters
  async function exportCustomerExcel() {
    const dynamicCols = itemColumns(customerRows, "Delivered ");
    const flattened = flattenItems(customerRows);

    await downloadWorkbook(`Customer_Totals_${from}_to_${to}.xlsx`, [
      {
        name: "Customer Totals",
        columns: [
          { header: "Customer ID", key: "code" },
          { header: "Customer Name", key: "name" },
          { header: "Mobile", key: "mobile" },
          { header: "Customer Type", key: "type_label" },
          { header: "Deliveries", key: "deliveries", type: "int" },
          { header: "Delivery Days", key: "delivery_days", type: "int" },
          { header: "20L Cans Delivered", key: "cans", type: "int" },
          { header: "Packets Delivered", key: "packets", type: "int" },
          ...dynamicCols,
          { header: "Period Billed", key: "billed", type: "money" },
          { header: "Period Received", key: "received", type: "money" },
          { header: "Current Outstanding", key: "outstanding", type: "money" },
          { header: "Empty Cans Balance", key: "empty_balance", type: "int" },
        ],
        rows: flattened.map((c) => ({
          ...c,
          type_label: customerTypeLabel({ customer_type: c.type, custom_type: c.custom_type }),
        })),
      },
    ]);
  }

  async function exportEmployeeExcel() {
    await downloadWorkbook(`Employee_Performance_${from}_to_${to}.xlsx`, [
      {
        name: "Employee Performance",
        columns: [
          { header: "Employee Code", key: "code" },
          { header: "Employee Name", key: "name" },
          { header: "Mobile", key: "mobile" },
          { header: "Status", key: "status" },
          { header: "Assigned", key: "assigned", type: "int" },
          { header: "Delivered", key: "delivered", type: "int" },
          { header: "Failed", key: "failed", type: "int" },
          { header: "Avg Time", key: "avg_time_formatted" },
          { header: "Empty Cans Collected", key: "empty_collected", type: "int" },
          { header: "Amount Collected", key: "amount_collected", type: "money" },
        ],
        rows: employeeRows.map((e) => ({
          ...e,
          avg_time_formatted: formatDuration(e.avg_duration_seconds),
        })),
      },
    ]);
  }

  async function exportInventoryExcel() {
    await downloadWorkbook(`Inventory_Report_${from}_to_${to}.xlsx`, [
      {
        name: "Stock Summary",
        columns: [
          { header: "Product Code", key: "code" },
          { header: "Product Name", key: "name" },
          { header: "Type", key: "kind_label" },
          { header: "Unit", key: "unit" },
          { header: "Opening Stock", key: "opening", type: "int" },
          { header: "Added (In)", key: "added", type: "int" },
          { header: "Returned Empties", key: "returned", type: "int" },
          { header: "Delivered (Out)", key: "delivered", type: "int" },
          { header: "Damaged", key: "damaged", type: "int" },
          { header: "Current Available", key: "current", type: "int" },
          { header: "Min Alert Level", key: "min", type: "int" },
          { header: "Status", key: "status" },
        ],
        rows: inventoryData.products.map((p) => ({
          ...p,
          kind_label: PRODUCT_KIND_LABEL[p.kind] ?? p.kind,
          status: p.low ? "Low Stock" : "Healthy",
        })),
      },
      {
        name: "Transactions Audit",
        columns: [
          { header: "Txn Code", key: "code" },
          { header: "Date", key: "date", type: "datetime" },
          { header: "Product", key: "product" },
          { header: "Type", key: "type" },
          { header: "Quantity", key: "quantity", type: "int" },
          { header: "Previous Stock", key: "previous", type: "int" },
          { header: "New Stock", key: "new", type: "int" },
          { header: "Task Code", key: "task_code" },
          { header: "Notes", key: "notes" },
        ],
        rows: inventoryData.movements.map((m) => ({
          ...m,
          task_code: m.task_code ?? "—",
        })),
      },
    ]);
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {view !== "cards" ? (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mb-1 text-muted-foreground hover:text-foreground"
              onClick={() => navigate({ search: { from, to } })}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Report Cards
            </Button>
          ) : null}
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {view === "customers"
              ? "Customer-wise Totals Report"
              : view === "employees"
                ? "Employee-wise Performance Report"
                : view === "inventory"
                  ? "Inventory Movements & Current Stock Report"
                  : "Business Reports"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Calculated strictly from completed transactions and audit logs.
          </p>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border bg-card p-1 shadow-soft">
            <span className="px-2 text-xs font-semibold text-muted-foreground">From</span>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-36 border-0 bg-transparent text-xs"
            />
            <span className="px-1 text-xs font-semibold text-muted-foreground">To</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-36 border-0 bg-transparent text-xs"
            />
          </div>
        </div>
      </div>

      {!valid ? (
        <ErrorNote error={{ message: "Choose a valid date range (start date before end date)." }} />
      ) : customersReportQuery.isLoading || employeesReportQuery.isLoading || inventoryReportQuery.isLoading ? (
        <Loading />
      ) : customersReportQuery.error ? (
        <ErrorNote error={customersReportQuery.error} />
      ) : (
        <>
          {/* VIEW: 3 DISTINCT REPORT SUMMARY CARDS */}
          {view === "cards" && (
            <div className="grid gap-6 md:grid-cols-3">
              {/* Card 1: Customer-wise Totals */}
              <div className="flex flex-col justify-between rounded-3xl border bg-card p-6 shadow-card transition-all hover:border-primary/40">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="rounded-2xl bg-primary/10 p-3 text-primary">
                      <Users className="h-6 w-6" />
                    </span>
                    <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                      {customerRows.length} Customers
                    </span>
                  </div>

                  <div>
                    <h2 className="font-display text-xl font-bold text-foreground">Customer-wise Totals</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Deliveries, item-wise breakdown, billing amount, payments, and outstanding balances per customer.
                    </p>
                  </div>

                  {/* Preview Metrics */}
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/30 p-3 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Deliveries</p>
                      <p className="text-lg font-extrabold tabular-nums text-foreground">{totalCustomerDeliveries}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Period Billed</p>
                      <p className="text-lg font-extrabold tabular-nums text-primary">{fmtMoney(totalBilled)}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2 border-t pt-4">
                  <Button
                    variant="water"
                    className="w-full justify-between"
                    onClick={() => navigate({ search: { view: "customers", from, to } })}
                  >
                    View Detailed Report <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-xs"
                    onClick={exportCustomerExcel}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Export to Excel (.xlsx)
                  </Button>
                </div>
              </div>

              {/* Card 2: Employee-wise Performance */}
              <div className="flex flex-col justify-between rounded-3xl border bg-card p-6 shadow-card transition-all hover:border-primary/40">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="rounded-2xl bg-success/10 p-3 text-success-foreground">
                      <UserCheck className="h-6 w-6" />
                    </span>
                    <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                      {employeeRows.length} Staff Members
                    </span>
                  </div>

                  <div>
                    <h2 className="font-display text-xl font-bold text-foreground">Employee-wise Performance</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Deliveries completed, completion rates, delivery speed, payments collected, and empty cans returned.
                    </p>
                  </div>

                  {/* Preview Metrics */}
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/30 p-3 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Deliveries Done</p>
                      <p className="text-lg font-extrabold tabular-nums text-success-foreground">{totalCompletedDeliveries} / {totalAssignedDeliveries}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Collected by Staff</p>
                      <p className="text-lg font-extrabold tabular-nums text-foreground">{fmtMoney(totalCollectedByStaff)}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2 border-t pt-4">
                  <Button
                    variant="water"
                    className="w-full justify-between"
                    onClick={() => navigate({ search: { view: "employees", from, to } })}
                  >
                    View Detailed Report <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-xs"
                    onClick={exportEmployeeExcel}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Export to Excel (.xlsx)
                  </Button>
                </div>
              </div>

              {/* Card 3: Inventory Movements & Current Stock */}
              <div className="flex flex-col justify-between rounded-3xl border bg-card p-6 shadow-card transition-all hover:border-primary/40">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="rounded-2xl bg-navy/10 p-3 text-navy-foreground">
                      <Boxes className="h-6 w-6" />
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      lowStockProducts > 0 ? "bg-warning/15 text-warning-foreground" : "bg-success/15 text-success-foreground"
                    }`}>
                      {lowStockProducts > 0 ? `${lowStockProducts} Low Stock Alerts` : "All Healthy"}
                    </span>
                  </div>

                  <div>
                    <h2 className="font-display text-xl font-bold text-foreground">Inventory Movements & Stock</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Opening stock, additions, returns, delivered quantities, damages, and current live warehouse inventory.
                    </p>
                  </div>

                  {/* Preview Metrics */}
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/30 p-3 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Products Tracked</p>
                      <p className="text-lg font-extrabold tabular-nums text-foreground">{totalProducts}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Delivered from Stock</p>
                      <p className="text-lg font-extrabold tabular-nums text-foreground">{totalDeliveriesStock}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2 border-t pt-4">
                  <Button
                    variant="water"
                    className="w-full justify-between"
                    onClick={() => navigate({ search: { view: "inventory", from, to } })}
                  >
                    View Detailed Report <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-xs"
                    onClick={exportInventoryExcel}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Export to Excel (.xlsx)
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: CUSTOMER-WISE TOTALS DETAILED REPORT */}
          {view === "customers" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by customer name, phone or code..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-80 pl-8"
                  />
                </div>
                <Button variant="outline" onClick={exportCustomerExcel}>
                  <Download className="mr-1.5 h-4 w-4" /> Export to Excel (.xlsx)
                </Button>
              </div>

              <div className="rounded-2xl border bg-card shadow-soft overflow-x-auto">
                {filteredCustomers.length === 0 ? (
                  <EmptyState title="No customer activity found" description="No deliveries or transactions found in this period." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer ID</TableHead>
                        <TableHead>Customer Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Deliveries</TableHead>
                        <TableHead className="text-right">Days</TableHead>
                        <TableHead className="text-right">20L Cans</TableHead>
                        <TableHead className="text-right">Packets</TableHead>
                        <TableHead className="text-right">Period Billed</TableHead>
                        <TableHead className="text-right">Period Paid</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead className="text-center">Empty Cans</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-xs font-semibold">{c.code}</TableCell>
                          <TableCell>
                            <p className="font-medium text-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.mobile}</p>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {customerTypeLabel({ customer_type: c.type, custom_type: c.custom_type })}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{c.deliveries}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{c.delivery_days}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-foreground">{c.cans}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-foreground">{c.packets}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{fmtMoney(c.billed)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-success-foreground">{fmtMoney(c.received)}</TableCell>
                          <TableCell className={`text-right font-bold tabular-nums ${c.outstanding > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                            {fmtMoney(c.outstanding)}
                          </TableCell>
                          <TableCell className="text-center font-bold tabular-nums text-primary">
                            {c.empty_balance}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}

          {/* VIEW: EMPLOYEE-WISE PERFORMANCE DETAILED REPORT */}
          {view === "employees" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by employee name or code..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-80 pl-8"
                  />
                </div>
                <Button variant="outline" onClick={exportEmployeeExcel}>
                  <Download className="mr-1.5 h-4 w-4" /> Export to Excel (.xlsx)
                </Button>
              </div>

              <div className="rounded-2xl border bg-card shadow-soft overflow-x-auto">
                {filteredEmployees.length === 0 ? (
                  <EmptyState title="No employee records" description="No activity logged for employees in this period." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee Code</TableHead>
                        <TableHead>Employee Name</TableHead>
                        <TableHead className="text-right">Assigned</TableHead>
                        <TableHead className="text-right">Delivered</TableHead>
                        <TableHead className="text-right">Failed</TableHead>
                        <TableHead className="text-right">Avg Duration</TableHead>
                        <TableHead className="text-center">Empties Collected</TableHead>
                        <TableHead className="text-right">Amount Collected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-mono text-xs font-semibold">{e.code}</TableCell>
                          <TableCell>
                            <p className="font-medium text-foreground">{e.name}</p>
                            <p className="text-xs text-muted-foreground">{e.mobile}</p>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{e.assigned}</TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-success-foreground">{e.delivered}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-destructive">{e.failed}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                            {formatDuration(e.avg_duration_seconds)}
                          </TableCell>
                          <TableCell className="text-center font-bold tabular-nums text-foreground">
                            {e.empty_collected}
                          </TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-primary">
                            {fmtMoney(e.amount_collected)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}

          {/* VIEW: INVENTORY MOVEMENTS & STOCK DETAILED REPORT */}
          {view === "inventory" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-80 pl-8"
                  />
                </div>
                <Button variant="outline" onClick={exportInventoryExcel}>
                  <Download className="mr-1.5 h-4 w-4" /> Export to Excel (.xlsx)
                </Button>
              </div>

              <div className="rounded-2xl border bg-card shadow-soft overflow-x-auto">
                {filteredInventory.length === 0 ? (
                  <EmptyState title="No products found" description="Inventory products will appear here." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product Name</TableHead>
                        <TableHead>Kind</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        <TableHead className="text-right">Added (+)</TableHead>
                        <TableHead className="text-right">Empties (+)</TableHead>
                        <TableHead className="text-right">Delivered (-)</TableHead>
                        <TableHead className="text-right">Damaged (-)</TableHead>
                        <TableHead className="text-right">Current Available</TableHead>
                        <TableHead className="text-right">Min Alert</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInventory.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-semibold text-foreground">{p.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{PRODUCT_KIND_LABEL[p.kind] ?? p.kind}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{p.opening} {p.unit}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-success-foreground">+{p.added}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-primary">+{p.returned}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-destructive">-{p.delivered}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-destructive">-{p.damaged}</TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-foreground">{p.current} {p.unit}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{p.min}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              p.low
                                ? "bg-warning/15 text-warning-foreground"
                                : "bg-success/15 text-success-foreground"
                            }`}>
                              {p.low ? "Low Stock" : "Healthy"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
