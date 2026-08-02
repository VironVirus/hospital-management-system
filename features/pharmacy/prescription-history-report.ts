import type { Prescription } from "@/types/hospital";

export type PrescriptionHistoryReport = {
  generatedAt: string;
  hospitalName: string;
  prescriptions: Prescription[];
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function prescriptionReportDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function buildPrescriptionHistoryHtml(report: PrescriptionHistoryReport) {
  const rows = report.prescriptions.flatMap((prescription) => {
    const patient = prescription.patients;
    const items = prescription.prescription_items ?? [];
    if (!items.length) {
      return [`<tr><td>${escapeHtml(prescriptionReportDate(prescription.prescribed_at))}</td><td>${escapeHtml(patient?.name || "Unknown patient")}<br><span>${escapeHtml(patient?.hospital_id || patient?.lab_id || "-")}</span></td><td>No items</td><td>-</td><td>-</td><td>${escapeHtml(prescription.status)}</td></tr>`];
    }
    return items.map((item) => `<tr>
      <td>${escapeHtml(prescriptionReportDate(prescription.prescribed_at))}</td>
      <td>${escapeHtml(patient?.name || "Unknown patient")}<br><span>${escapeHtml(patient?.hospital_id || patient?.lab_id || "-")}</span></td>
      <td>${escapeHtml(item.medication_name)}<br><span>${escapeHtml(item.route || "-")}</span></td>
      <td>${escapeHtml(item.dose)} / ${escapeHtml(item.frequency)}</td>
      <td>${escapeHtml(item.duration)} / Qty ${escapeHtml(item.quantity)}</td>
      <td>${escapeHtml(prescription.status)}${prescription.dispensed_at ? `<br><span>${escapeHtml(prescriptionReportDate(prescription.dispensed_at))}</span>` : ""}</td>
    </tr>`);
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Prescription history</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#0f172a;margin:0;font-size:10px}.head{border-bottom:3px solid #047857;padding-bottom:12px;margin-bottom:16px}.head h1{font-size:20px;margin:0}.head p{color:#475569;margin:4px 0}.summary{display:flex;justify-content:space-between;gap:20px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:10px 12px;margin-bottom:14px}.summary strong{font-size:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}th{background:#ecfdf5;font-size:9px;text-transform:uppercase}td span{color:#64748b;font-size:9px}.footer{border-top:1px solid #cbd5e1;margin-top:14px;padding-top:8px;color:#64748b}@media print{body{padding:0}}
  </style></head><body><header class="head"><h1>${escapeHtml(report.hospitalName)}</h1><p>No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State</p><h2>Prescription history</h2></header><section class="summary"><div><span>Total prescriptions</span><br><strong>${report.prescriptions.length}</strong></div><div>Generated ${escapeHtml(prescriptionReportDate(report.generatedAt))}</div></section><table><thead><tr><th>Date</th><th>Patient</th><th>Medication</th><th>Dose / frequency</th><th>Duration / quantity</th><th>Status</th></tr></thead><tbody>${rows || `<tr><td colspan="6">No prescriptions found.</td></tr>`}</tbody></table><footer class="footer">St Gianna Specialist Hospital prescription history</footer></body></html>`;
}
