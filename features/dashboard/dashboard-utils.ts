import type { Tables } from "@/types/supabase";

export type DashboardWorklistRow = {
  collected_at: string | null;
  created_at: string;
  id: string;
  in_progress_at: string | null;
  order_id: string;
  reported_at: string | null;
  results_entered_at: string | null;
  sample_code: string;
  specimen_label: string | null;
  status: Tables<"order_tests">["status"];
  tests: {
    name: string;
  } | null;
  updated_at: string;
  verified_at: string | null;
  orders: {
    order_number: string;
    ordered_at: string;
    priority: string;
    patients: {
      lab_id: string;
      name: string;
    } | null;
  } | null;
};

export type DashboardInvoiceRow = Pick<
  Tables<"invoices">,
  "amount_paid" | "id" | "issued_at" | "payment_status" | "total_amount"
>;

export type DashboardPaymentRow = Pick<
  Tables<"invoice_payments">,
  "amount" | "payment_method" | "received_at"
>;

export type DashboardPatientRow = Pick<Tables<"patients">, "created_at" | "id">;

export type DashboardInventoryAlertRow = Pick<
  Tables<"inventory_items">,
  "expiry_date" | "id" | "is_active" | "lot_number" | "name" | "quantity" | "reorder_level" | "unit"
>;

export type SummaryMetric = {
  hint: string;
  label: string;
  value: string;
};

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short"
  }).format(date);
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatCurrency(value: number) {
  const amount = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

  return `N${amount}`;
}

export function formatDate(value: string | null | undefined) {
  const date = parseDate(value);
  if (!date) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function formatDateTime(value: string | null | undefined) {
  const date = parseDate(value);
  if (!date) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function getHoursBetween(start: string | null | undefined, end: string | null | undefined) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);

  if (!startDate || !endDate) {
    return null;
  }

  return (endDate.getTime() - startDate.getTime()) / 3600000;
}

export function buildWorklistSummary(worklist: DashboardWorklistRow[]) {
  const today = new Date();
  const todayItems = worklist.filter((item) => {
    const created = parseDate(item.created_at);
    return created ? isSameCalendarDay(created, today) : false;
  });

  const urgent = worklist.filter(
    (item) => item.orders?.priority === "urgent" || item.orders?.priority === "stat"
  ).length;
  const awaitingVerification = worklist.filter(
    (item) => item.status === "Results_Entered"
  ).length;

  return {
    active: worklist.length,
    awaitingVerification,
    todayItems: todayItems.length,
    urgent
  };
}

export function buildTodayOperationalSummary(
  worklist: DashboardWorklistRow[],
  patients: DashboardPatientRow[]
) {
  const today = new Date();
  const happenedToday = (value: string | null | undefined) => {
    const date = parseDate(value);
    return date ? isSameCalendarDay(date, today) : false;
  };

  return {
    patientsRegistered: patients.filter((patient) => happenedToday(patient.created_at)).length,
    samplesCollected: worklist.filter((item) => happenedToday(item.collected_at)).length,
    testsReported: worklist.filter((item) => happenedToday(item.reported_at)).length,
    testsVerified: worklist.filter((item) => happenedToday(item.verified_at)).length
  };
}

export function buildTatStageMetrics(worklist: DashboardWorklistRow[]) {
  const metrics = [
    {
      endKey: "collected_at" as const,
      label: "Collection"
    },
    {
      endKey: "results_entered_at" as const,
      label: "Result entry"
    },
    {
      endKey: "verified_at" as const,
      label: "Verification"
    },
    {
      endKey: "reported_at" as const,
      label: "Reporting"
    }
  ];

  return metrics.map((metric) => {
    const values = worklist
      .map((item) => getHoursBetween(item.created_at, item[metric.endKey]))
      .filter((value): value is number => value !== null && value >= 0);

    const average = values.length > 0 ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

    return {
      averageHours: average,
      label: metric.label,
      sampleCount: values.length
    };
  });
}

export function buildTatTrend(worklist: DashboardWorklistRow[], days = 14) {
  const today = new Date();
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    date.setHours(0, 0, 0, 0);
    return {
      count: 0,
      date,
      label: formatDateLabel(date),
      totalHours: 0
    };
  });

  worklist.forEach((item) => {
    const endValue = item.reported_at || item.verified_at;
    const hours = getHoursBetween(item.created_at, endValue);
    const endDate = parseDate(endValue);

    if (hours === null || !endDate) {
      return;
    }

    const bucket = buckets.find((entry) => isSameCalendarDay(entry.date, endDate));
    if (!bucket) {
      return;
    }

    bucket.count += 1;
    bucket.totalHours += hours;
  });

  return buckets.map((bucket) => ({
    averageHours: bucket.count > 0 ? round(bucket.totalHours / bucket.count) : 0,
    label: bucket.label,
    reports: bucket.count
  }));
}

export function buildVolumeTrend(worklist: DashboardWorklistRow[], days = 14) {
  const today = new Date();
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    date.setHours(0, 0, 0, 0);
    return {
      date,
      label: formatDateLabel(date),
      routine: 0,
      total: 0,
      urgent: 0
    };
  });

  worklist.forEach((item) => {
    const created = parseDate(item.created_at);
    if (!created) {
      return;
    }

    const bucket = buckets.find((entry) => isSameCalendarDay(entry.date, created));
    if (!bucket) {
      return;
    }

    bucket.total += 1;
    if (item.orders?.priority === "urgent" || item.orders?.priority === "stat") {
      bucket.urgent += 1;
    } else {
      bucket.routine += 1;
    }
  });

  return buckets.map(({ label, total, urgent, routine }) => ({
    label,
    routine,
    total,
    urgent
  }));
}

export function buildTopTests(worklist: DashboardWorklistRow[], limit = 6) {
  const counts = new Map<string, number>();

  worklist.forEach((item) => {
    const name = item.tests?.name || "Unknown test";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([name, volume]) => ({ name, volume }))
    .sort((left, right) => right.volume - left.volume)
    .slice(0, limit);
}

export function buildRevenueTrend(payments: DashboardPaymentRow[], days = 14) {
  const today = new Date();
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    date.setHours(0, 0, 0, 0);
    return {
      amount: 0,
      date,
      label: formatDateLabel(date)
    };
  });

  payments.forEach((payment) => {
    const received = parseDate(payment.received_at);
    if (!received) {
      return;
    }

    const bucket = buckets.find((entry) => isSameCalendarDay(entry.date, received));
    if (!bucket) {
      return;
    }

    bucket.amount += Number(payment.amount);
  });

  return buckets.map((bucket) => ({
    amount: round(bucket.amount, 2),
    label: bucket.label
  }));
}

export function buildPaymentMethodBreakdown(payments: DashboardPaymentRow[]) {
  const totals = new Map<string, number>();

  payments.forEach((payment) => {
    const method = payment.payment_method || "Unknown";
    totals.set(method, (totals.get(method) ?? 0) + Number(payment.amount));
  });

  return [...totals.entries()]
    .map(([method, amount]) => ({
      amount: round(amount, 2),
      method
    }))
    .sort((left, right) => right.amount - left.amount);
}

export function buildRevenueSummary(invoices: DashboardInvoiceRow[], payments: DashboardPaymentRow[]) {
  const outstanding = invoices.reduce(
    (sum, invoice) => sum + Math.max(Number(invoice.total_amount) - Number(invoice.amount_paid), 0),
    0
  );

  const billed = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount), 0);
  const collected = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const paidInvoices = invoices.filter((invoice) => invoice.payment_status === "Paid").length;

  return {
    billed: round(billed, 2),
    collected: round(collected, 2),
    outstanding: round(outstanding, 2),
    paidInvoices
  };
}

export function buildTodayWorklistRows(worklist: DashboardWorklistRow[]) {
  const today = new Date();

  return worklist
    .filter((item) => {
      const created = parseDate(item.created_at);
      return created ? isSameCalendarDay(created, today) : false;
    })
    .slice()
    .sort((left, right) => {
      const leftPriority = left.orders?.priority === "urgent" || left.orders?.priority === "stat";
      const rightPriority =
        right.orders?.priority === "urgent" || right.orders?.priority === "stat";

      if (leftPriority !== rightPriority) {
        return leftPriority ? -1 : 1;
      }

      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    })
    .slice(0, 12)
    .map((item) => ({
      createdAt: formatDateTime(item.created_at),
      orderNumber: item.orders?.order_number || "-",
      patient: item.orders?.patients?.name || "Unknown patient",
      priority: item.orders?.priority || "routine",
      sampleCode: item.sample_code,
      status: item.status.replaceAll("_", " "),
      test: item.tests?.name || "Unknown test"
    }));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportWorklistCsv(rows: ReturnType<typeof buildTodayWorklistRows>) {
  const header = ["Created At", "Order Number", "Patient", "Test", "Sample Code", "Status", "Priority"];
  const csvRows = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.createdAt,
        row.orderNumber,
        row.patient,
        row.test,
        row.sampleCode,
        row.status,
        row.priority
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",")
    )
  ];

  const blob = new Blob([csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `lims-worklist-${new Date().toISOString().slice(0, 10)}.csv`);
}

function escapeSpreadsheetValue(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildSpreadsheetTable(title: string, rows: Array<Record<string, unknown>>) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const body =
    rows.length === 0
      ? `<tr><td>No records</td></tr>`
      : [
          `<tr>${headers.map((header) => `<th>${escapeSpreadsheetValue(header)}</th>`).join("")}</tr>`,
          ...rows.map(
            (row) =>
              `<tr>${headers
                .map((header) => `<td>${escapeSpreadsheetValue(row[header])}</td>`)
                .join("")}</tr>`
          )
        ].join("");

  return `
    <h2>${escapeSpreadsheetValue(title)}</h2>
    <table>${body}</table>
  `;
}

export async function exportDashboardWorkbook(args: {
  paymentMethods: Array<{ amount: number; method: string }>;
  revenueSummary: ReturnType<typeof buildRevenueSummary>;
  revenueTrend: Array<{ amount: number; label: string }>;
  tatStages: Array<{ averageHours: number; label: string; sampleCount: number }>;
  tatTrend: Array<{ averageHours: number; label: string; reports: number }>;
  topTests: Array<{ name: string; volume: number }>;
  volumeTrend: Array<{ label: string; routine: number; total: number; urgent: number }>;
  worklistRows: ReturnType<typeof buildTodayWorklistRows>;
}) {
  const summaryRows = [
    {
      "Fully Paid Invoices": args.revenueSummary.paidInvoices,
      "Outstanding Balance": args.revenueSummary.outstanding,
      "Total Billed": args.revenueSummary.billed,
      "Total Collected": args.revenueSummary.collected
    }
  ];
  const sections = [
    buildSpreadsheetTable("Summary", summaryRows),
    buildSpreadsheetTable("Today Worklist", args.worklistRows),
    buildSpreadsheetTable("Volume Trend", args.volumeTrend),
    buildSpreadsheetTable("Top Tests", args.topTests),
    buildSpreadsheetTable("TAT Trend", args.tatTrend),
    buildSpreadsheetTable("TAT Stages", args.tatStages),
    buildSpreadsheetTable("Revenue Trend", args.revenueTrend),
    buildSpreadsheetTable("Payment Methods", args.paymentMethods)
  ];
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; }
          h2 { color: #0f4c81; margin-top: 28px; }
          table { border-collapse: collapse; margin-bottom: 24px; width: 100%; }
          th { background: #eaf5ff; color: #0f172a; font-weight: 700; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
        </style>
      </head>
      <body>${sections.join("")}</body>
    </html>
  `;
  const blob = new Blob([html], {
    type: "application/vnd.ms-excel;charset=utf-8;"
  });

  downloadBlob(blob, `lims-dashboard-${new Date().toISOString().slice(0, 10)}.xls`);
}
