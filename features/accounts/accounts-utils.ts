import { formatCurrency } from "@/features/billing/billing-utils";
import type { Tables } from "@/types/supabase";

export type AccountInvoiceRow = Tables<"invoices"> & {
  invoice_items:
    | Array<
        Tables<"invoice_items"> & {
          order_tests?: {
            test_id: string;
            tests?: {
              category: string | null;
              id: string;
              name: string;
            } | null;
          } | null;
        }
      >
    | null;
  invoice_payments: Tables<"invoice_payments">[] | null;
  orders: {
    id: string;
    order_number: string;
    ordered_at: string;
    patients: {
      id: string;
      lab_id: string;
      name: string;
      phone: string | null;
    } | null;
  } | null;
};

export type AccountExpenseRow = Tables<"expenses"> & {
  inventory_items?: {
    category: string | null;
    id: string;
    name: string;
    unit: string;
  } | null;
};

export type IncomeByTestRow = {
  category: string;
  quantity: number;
  revenue: number;
  testName: string;
};

export type IncomeByCategoryRow = {
  category: string;
  revenue: number;
  tests: number;
};

export type InventoryCostRow = Tables<"inventory_transactions"> & {
  itemName: string;
  unit: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

export function getMonthRange(monthKey: string) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  return {
    end,
    start
  };
}

export function isWithinMonth(value: string | null | undefined, monthKey: string) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const { end, start } = getMonthRange(monthKey);
  return date >= start && date < end;
}

export function normalizeCategory(value: string | null | undefined) {
  return value?.trim() || "Uncategorized";
}

export function buildIncomeByTest(
  invoices: AccountInvoiceRow[],
  fallbackTestMeta: Map<string, { category: string; name: string }>,
  monthKey: string
) {
  const totals = new Map<string, IncomeByTestRow>();

  invoices
    .filter((invoice) => isWithinMonth(invoice.issued_at, monthKey))
    .forEach((invoice) => {
      (invoice.invoice_items ?? []).forEach((item) => {
        const relation = item.order_tests?.tests ?? null;
        const fallback = item.order_test_id ? fallbackTestMeta.get(item.order_test_id) : null;
        const testName = relation?.name || fallback?.name || item.test_name;
        const category = normalizeCategory(relation?.category || fallback?.category || null);
        const key = `${category}::${testName}`;
        const current = totals.get(key) ?? {
          category,
          quantity: 0,
          revenue: 0,
          testName
        };

        current.quantity += Number(item.quantity);
        current.revenue += Number(item.line_total);
        totals.set(key, current);
      });
    });

  return [...totals.values()].sort((left, right) => right.revenue - left.revenue);
}

export function buildIncomeByCategory(rows: IncomeByTestRow[]) {
  const totals = new Map<string, IncomeByCategoryRow>();

  rows.forEach((row) => {
    const current = totals.get(row.category) ?? {
      category: row.category,
      revenue: 0,
      tests: 0
    };
    current.revenue += row.revenue;
    current.tests += 1;
    totals.set(row.category, current);
  });

  return [...totals.values()].sort((left, right) => right.revenue - left.revenue);
}

export function buildAccountsSummary(args: {
  expenses: AccountExpenseRow[];
  invoices: AccountInvoiceRow[];
  monthKey: string;
  payments: Tables<"invoice_payments">[];
  transactions: Tables<"inventory_transactions">[];
}) {
  const billed = args.invoices
    .filter((invoice) => isWithinMonth(invoice.issued_at, args.monthKey))
    .reduce((sum, invoice) => sum + Number(invoice.total_amount), 0);

  const collected = args.payments
    .filter((payment) => isWithinMonth(payment.received_at, args.monthKey))
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  const outstanding = args.invoices.reduce(
    (sum, invoice) => sum + Math.max(Number(invoice.total_amount) - Number(invoice.amount_paid), 0),
    0
  );

  const manualExpenses = args.expenses
    .filter((expense) => isWithinMonth(expense.expense_date, args.monthKey))
    .reduce((sum, expense) => sum + Number(expense.amount), 0);

  const inventoryPurchaseCost = args.transactions
    .filter(
      (transaction) =>
        transaction.transaction_type === "stock_in" &&
        isWithinMonth(transaction.created_at, args.monthKey)
    )
    .reduce((sum, transaction) => sum + Number(transaction.total_cost), 0);

  const inventoryUsageCost = args.transactions
    .filter(
      (transaction) =>
        (transaction.transaction_type === "usage" ||
          transaction.transaction_type === "stock_out") &&
        isWithinMonth(transaction.created_at, args.monthKey)
    )
    .reduce((sum, transaction) => sum + Number(transaction.total_cost), 0);

  return {
    billed,
    collected,
    inventoryPurchaseCost,
    inventoryUsageCost,
    manualExpenses,
    netCashflow: collected - (manualExpenses + inventoryPurchaseCost),
    outstanding,
    totalCost: manualExpenses + inventoryPurchaseCost + inventoryUsageCost
  };
}

export function buildInventoryCostRows(
  transactions: Tables<"inventory_transactions">[],
  itemMap: Map<string, { name: string; unit: string }>,
  monthKey: string
) {
  return transactions
    .filter(
      (transaction) =>
        isWithinMonth(transaction.created_at, monthKey) &&
        Number(transaction.total_cost) > 0
    )
    .map((transaction) => ({
      ...transaction,
      itemName: itemMap.get(transaction.item_id)?.name || "Unknown item",
      unit: itemMap.get(transaction.item_id)?.unit || "units"
    }))
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeSpreadsheetValue(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildSpreadsheetTable(
  title: string,
  rows: Array<Record<string, string | number>>
) {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const headerMarkup = headers
    .map((header) => `<th>${escapeSpreadsheetValue(header)}</th>`)
    .join("");
  const bodyMarkup = rows
    .map(
      (row) => `
        <tr>
          ${headers
            .map((header) => `<td>${escapeSpreadsheetValue(row[header])}</td>`)
            .join("")}
        </tr>
      `
    )
    .join("");

  return `
    <h2>${escapeSpreadsheetValue(title)}</h2>
    <table>
      <thead><tr>${headerMarkup}</tr></thead>
      <tbody>${bodyMarkup || `<tr><td>No records</td></tr>`}</tbody>
    </table>
  `;
}

export function exportAccountsWorkbook(args: {
  expenseRows: Array<Record<string, string | number>>;
  incomeByCategory: IncomeByCategoryRow[];
  incomeByTest: IncomeByTestRow[];
  inventoryCostRows: Array<Record<string, string | number>>;
  invoiceRows: Array<Record<string, string | number>>;
  monthKey: string;
  summary: ReturnType<typeof buildAccountsSummary>;
}) {
  const summaryRows = [
    {
      Month: args.monthKey,
      "Total Billed": args.summary.billed,
      "Total Collected": args.summary.collected,
      Outstanding: args.summary.outstanding,
      "Manual Expenses": args.summary.manualExpenses,
      "Inventory Purchase Cost": args.summary.inventoryPurchaseCost,
      "Inventory Usage Cost": args.summary.inventoryUsageCost,
      "Total Cost": args.summary.totalCost,
      "Net Cashflow": args.summary.netCashflow
    }
  ];

  const workbookHtml = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; }
          h2 { margin: 24px 0 8px; }
          table { border-collapse: collapse; margin-bottom: 24px; }
          th, td { border: 1px solid #9ca3af; padding: 6px 8px; text-align: left; }
          th { background: #e0f2fe; font-weight: 700; }
        </style>
      </head>
      <body>
        ${buildSpreadsheetTable("Summary", summaryRows)}
        ${buildSpreadsheetTable("Invoices", args.invoiceRows)}
        ${buildSpreadsheetTable(
          "Income By Test",
          args.incomeByTest.map((row) => ({
            Category: row.category,
            Test: row.testName,
            Quantity: row.quantity,
            Revenue: row.revenue
          }))
        )}
        ${buildSpreadsheetTable(
          "Income By Category",
          args.incomeByCategory.map((row) => ({
            Category: row.category,
            Tests: row.tests,
            Revenue: row.revenue
          }))
        )}
        ${buildSpreadsheetTable("Expenses", args.expenseRows)}
        ${buildSpreadsheetTable("Inventory Costs", args.inventoryCostRows)}
      </body>
    </html>
  `;

  const blob = new Blob([workbookHtml], {
    type: "application/vnd.ms-excel;charset=utf-8;"
  });

  downloadBlob(blob, `lims-accounts-${args.monthKey}.xls`);
}

export function buildInvoiceExportRows(invoices: AccountInvoiceRow[]) {
  return invoices.map((invoice) => ({
    "Invoice": invoice.invoice_number,
    "Issued At": invoice.issued_at,
    "Order Number": invoice.orders?.order_number || "-",
    "Patient": invoice.orders?.patients?.name || "Unknown patient",
    "Lab ID": invoice.orders?.patients?.lab_id || "-",
    "Billed Tests": (invoice.invoice_items ?? []).map((item) => item.test_name).join(", "),
    "Payment Status": invoice.payment_status,
    "Total Amount": Number(invoice.total_amount),
    "Amount Paid": Number(invoice.amount_paid),
    "Balance Due": Math.max(Number(invoice.total_amount) - Number(invoice.amount_paid), 0)
  }));
}

export function buildExpenseExportRows(expenses: AccountExpenseRow[]) {
  return expenses.map((expense) => ({
    "Date": expense.expense_date,
    "Title": expense.title,
    "Category": expense.category,
    "Source": expense.source,
    "Amount": Number(expense.amount),
    "Notes": expense.notes || ""
  }));
}

export function buildInventoryCostExportRows(rows: InventoryCostRow[]) {
  return rows.map((row) => ({
    "Date": row.created_at,
    "Item": row.itemName,
    "Type": row.transaction_type,
    "Quantity": Number(row.quantity),
    "Unit": row.unit,
    "Unit Cost": Number(row.unit_cost),
    "Total Cost": Number(row.total_cost),
    "Reason": row.reason || ""
  }));
}

export { formatCurrency };
