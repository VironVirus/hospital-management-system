import type { Tables } from "@/types/supabase";

export type InvoicePaymentStatus = Tables<"invoices">["payment_status"];

export type BillingInvoiceRow = Tables<"invoices"> & {
  invoice_items: Tables<"invoice_items">[] | null;
  invoice_payments: Tables<"invoice_payments">[] | null;
  orders: {
    id: string;
    order_number: string;
    ordered_at: string;
    patient_id?: string;
    priority: string;
    facilities: {
      code: string;
      id: string;
      name: string;
    } | null;
    patients: {
      id: string;
      lab_id: string;
      name: string;
      phone: string | null;
    } | null;
  } | null;
};

export const paymentMethodOptions = [
  "Cash",
  "Transfer",
  "POS",
  "Card",
  "Mobile Money"
] as const;

export function formatCurrency(value: number | null | undefined) {
  const amount = new Intl.NumberFormat("en-NG", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(value ?? 0);

  return `N${amount}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function getBalanceDue(invoice: Pick<BillingInvoiceRow, "amount_paid" | "total_amount">) {
  return Math.max(Number(invoice.total_amount) - Number(invoice.amount_paid), 0);
}

export function matchesInvoiceSearch(invoice: BillingInvoiceRow, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    invoice.invoice_number,
    invoice.orders?.order_number,
    invoice.orders?.patients?.name,
    invoice.orders?.patients?.lab_id,
    invoice.orders?.patients?.phone
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function isToday(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export function getPaymentStatusTone(status: InvoicePaymentStatus) {
  if (status === "Paid") {
    return "paid" as const;
  }

  if (status === "Partial") {
    return "partial" as const;
  }

  return "unpaid" as const;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildInvoicePrintHtml(invoice: BillingInvoiceRow) {
  const facilityName = invoice.orders?.facilities?.name || "LIMS Nigeria Diagnostics";
  const facilityCode = invoice.orders?.facilities?.code || "Clinical billing desk";
  const patientName = invoice.orders?.patients?.name || "Unknown patient";
  const patientLabId = invoice.orders?.patients?.lab_id || "-";
  const patientPhone = invoice.orders?.patients?.phone || "Not recorded";
  const items = invoice.invoice_items ?? [];
  const itemsMarkup = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.test_name)}</td>
          <td>${item.quantity}</td>
          <td>${escapeHtml(formatCurrency(item.unit_price))}</td>
          <td>${escapeHtml(formatCurrency(item.line_total))}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice ${escapeHtml(invoice.invoice_number)}</title>
        <style>
          @page { size: A4; margin: 16mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; background: #f8fafc; }
          .page { max-width: 840px; margin: 0 auto; background: white; padding: 28px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 3px solid #0f4c81; padding-bottom: 16px; }
          .brand h1 { margin: 0; font-size: 24px; }
          .brand p { margin: 4px 0 0; color: #475569; font-size: 12px; }
          .badge { display: inline-flex; align-items: center; border-radius: 999px; background: #dbeafe; color: #0f4c81; padding: 6px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
          .title-row { display: flex; justify-content: space-between; gap: 20px; margin: 24px 0; }
          .title-row h2 { margin: 6px 0 0; font-size: 22px; }
          .eyebrow { color: #0f4c81; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700; margin: 0; }
          .meta, .panel { border: 1px solid #dbeafe; border-radius: 16px; background: #f8fbff; padding: 16px; }
          .meta p, .panel p { margin: 6px 0; font-size: 13px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th { background: #eff6ff; text-align: left; font-size: 12px; padding: 12px; border-bottom: 1px solid #bfdbfe; }
          td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; vertical-align: top; }
          .totals { margin-top: 20px; margin-left: auto; width: 300px; }
          .total-line { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
          .strong { font-weight: 700; }
          .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #475569; font-size: 12px; }
        </style>
      </head>
      <body>
        <section class="page">
          <header class="header">
            <div class="brand">
              <h1>${escapeHtml(facilityName)}</h1>
              <p>${escapeHtml(facilityCode)}</p>
              <p>Medical laboratory invoice</p>
            </div>
            <div class="badge">${escapeHtml(invoice.payment_status)}</div>
          </header>

          <div class="title-row">
            <div>
              <p class="eyebrow">Billing</p>
              <h2>Patient invoice</h2>
            </div>
            <div class="meta">
              <p><strong>Invoice:</strong> ${escapeHtml(invoice.invoice_number)}</p>
              <p><strong>Test ref:</strong> ${escapeHtml(invoice.orders?.order_number || "-")}</p>
              <p><strong>Issued:</strong> ${escapeHtml(formatDate(invoice.issued_at))}</p>
              <p><strong>Due:</strong> ${escapeHtml(formatDate(invoice.due_at))}</p>
            </div>
          </div>

          <div class="grid">
            <div class="panel">
              <p class="eyebrow">Patient</p>
              <p><strong>Name:</strong> ${escapeHtml(patientName)}</p>
              <p><strong>Lab ID:</strong> ${escapeHtml(patientLabId)}</p>
              <p><strong>Phone:</strong> ${escapeHtml(patientPhone)}</p>
            </div>
            <div class="panel">
              <p class="eyebrow">Request</p>
              <p><strong>Priority:</strong> ${escapeHtml(invoice.orders?.priority || "-")}</p>
              <p><strong>Issued on:</strong> ${escapeHtml(formatDateTime(invoice.issued_at))}</p>
              <p><strong>Notes:</strong> ${escapeHtml(invoice.notes || "No billing notes recorded.")}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Test</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>${itemsMarkup}</tbody>
          </table>

          <div class="totals">
            <div class="total-line">
              <span>Subtotal</span>
              <span>${escapeHtml(formatCurrency(invoice.subtotal))}</span>
            </div>
            <div class="total-line">
              <span>Discount</span>
              <span>${escapeHtml(formatCurrency(invoice.discount_amount))}</span>
            </div>
            <div class="total-line">
              <span>Amount paid</span>
              <span>${escapeHtml(formatCurrency(invoice.amount_paid))}</span>
            </div>
            <div class="total-line strong">
              <span>Balance due</span>
              <span>${escapeHtml(formatCurrency(getBalanceDue(invoice)))}</span>
            </div>
            <div class="total-line strong">
              <span>Total invoice</span>
              <span>${escapeHtml(formatCurrency(invoice.total_amount))}</span>
            </div>
          </div>

          <p class="footer">
            This invoice summarizes the patient's billed laboratory tests and can be used for payment and reconciliation.
          </p>
        </section>
      </body>
    </html>
  `;
}
