export type BillingDocumentPayment = {
  amount: number;
  date: string;
  method: string;
  reference?: string | null;
};

export type BillingDocumentItem = {
  description: string;
  quantity: number;
  total: number;
  unitPrice: number;
};

export type BillingDocumentRecord = {
  amountPaid: number;
  date: string;
  items: BillingDocumentItem[];
  payments: BillingDocumentPayment[];
  patientHospitalId: string;
  patientName: string;
  patientPhone?: string | null;
  reference: string;
  status: string;
  total: number;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function currency(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2
  }).format(value || 0);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function buildBillingDocumentHtml({
  records,
  title
}: {
  records: BillingDocumentRecord[];
  title: string;
}) {
  const first = records[0];
  const total = records.reduce((sum, record) => sum + Number(record.total), 0);
  const paid = records.reduce((sum, record) => sum + Number(record.amountPaid), 0);
  const due = Math.max(total - paid, 0);
  const recordMarkup = records.map((record) => `
    <section class="record">
      <div class="record-head">
        <div><strong>${escapeHtml(record.reference)}</strong><span>${escapeHtml(dateTime(record.date))}</span></div>
        <span class="status">${escapeHtml(record.status)}</span>
      </div>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>${record.items.map((item) => `<tr><td>${escapeHtml(item.description)}</td><td>${item.quantity}</td><td>${escapeHtml(currency(item.unitPrice))}</td><td>${escapeHtml(currency(item.total))}</td></tr>`).join("")}</tbody>
      </table>
      ${record.payments.length ? `<div class="payments"><strong>Payments</strong>${record.payments.map((payment) => `<p>${escapeHtml(dateTime(payment.date))} · ${escapeHtml(payment.method)}${payment.reference ? ` · ${escapeHtml(payment.reference)}` : ""}<span>${escapeHtml(currency(payment.amount))}</span></p>`).join("")}</div>` : ""}
      <div class="record-total"><span>Total ${escapeHtml(currency(record.total))}</span><span>Paid ${escapeHtml(currency(record.amountPaid))}</span><strong>Due ${escapeHtml(currency(Math.max(record.total - record.amountPaid, 0)))}</strong></div>
    </section>
  `).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif}.page{max-width:850px;margin:auto;background:#fff;padding:28px}.head{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #0f766e;padding-bottom:16px}.head h1{font-size:22px;margin:0}.head p,.patient p{font-size:12px;color:#475569;margin:5px 0}.title{font-size:20px;margin:22px 0 12px}.patient{border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;padding:14px;margin-bottom:18px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}.summary div{border:1px solid #cbd5e1;border-radius:10px;padding:12px;font-size:12px}.summary strong{display:block;font-size:15px;margin-top:5px}.record{border:1px solid #cbd5e1;border-radius:12px;padding:14px;margin:0 0 16px;break-inside:avoid}.record-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px}.record-head span{display:block;color:#64748b;font-size:11px;margin-top:4px}.record-head .status{display:inline-block;color:#0f766e;font-weight:bold;text-transform:uppercase}table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:11px}th{background:#f0fdfa}.payments{margin-top:12px;background:#f8fafc;padding:10px;border-radius:8px;font-size:11px}.payments p{display:flex;justify-content:space-between;margin:7px 0}.record-total{display:flex;justify-content:flex-end;gap:16px;margin-top:12px;font-size:11px}.footer{border-top:1px solid #cbd5e1;padding-top:12px;color:#64748b;font-size:10px}@media print{body{background:#fff}.page{padding:0}}
  </style></head><body><main class="page"><header class="head"><div><h1>St Gianna Specialist Hospital</h1><p>No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State</p></div><p>${escapeHtml(new Date().toLocaleString("en-NG"))}</p></header><h2 class="title">${escapeHtml(title)}</h2><section class="patient"><p><strong>Patient:</strong> ${escapeHtml(first?.patientName || "Patient")}</p><p><strong>Hospital ID:</strong> ${escapeHtml(first?.patientHospitalId || "-")}</p><p><strong>Phone:</strong> ${escapeHtml(first?.patientPhone || "Not recorded")}</p></section><section class="summary"><div>Total billed<strong>${escapeHtml(currency(total))}</strong></div><div>Total paid<strong>${escapeHtml(currency(paid))}</strong></div><div>Balance due<strong>${escapeHtml(currency(due))}</strong></div></section>${recordMarkup || "<p>No billing records.</p>"}<footer class="footer">Generated by St Gianna Specialist Hospital.</footer></main></body></html>`;
}
