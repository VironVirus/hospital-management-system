export type ActivityReportValue = string | number | null;

export type ActivityReportSection = {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, ActivityReportValue>>;
  title: string;
};

export type HospitalActivityReport = {
  from: string;
  generatedAt: string;
  hospitalName: string;
  sections: ActivityReportSection[];
  summary: Array<{ label: string; value: number }>;
  to: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function activityReportDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

export function activityReportDateTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function buildHospitalActivityHtml(report: HospitalActivityReport) {
  const summary = report.summary.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${item.value}</strong></div>`).join("");
  const sections = report.sections.map((section) => {
    const headers = section.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
    const rows = section.rows.map((row) => `<tr>${section.columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join("")}</tr>`).join("");
    return `<section><h2>${escapeHtml(section.title)} <span>${section.rows.length}</span></h2><table><thead><tr>${headers}</tr></thead><tbody>${rows || `<tr><td colspan="${section.columns.length}">No activity.</td></tr>`}</tbody></table></section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Hospital activity report</title><style>
    @page{size:A4 landscape;margin:11mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#0f172a;margin:0;font-size:9px}.head{border-bottom:3px solid #1d4ed8;padding-bottom:10px;margin-bottom:12px}.head h1{font-size:19px;margin:0}.head p{color:#475569;margin:4px 0}.head h2{font-size:14px;margin:8px 0 0}.summary{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:14px}.summary div{border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;padding:7px}.summary span{display:block;color:#475569;font-size:8px}.summary strong{display:block;font-size:15px;margin-top:3px}section{break-inside:avoid;margin:0 0 15px}section h2{font-size:12px;margin:0 0 6px;border-bottom:1px solid #93c5fd;padding-bottom:4px}section h2 span{color:#64748b;font-size:9px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:5px;text-align:left;vertical-align:top}th{background:#eff6ff;font-size:8px;text-transform:uppercase}.footer{border-top:1px solid #cbd5e1;margin-top:12px;padding-top:6px;color:#64748b}
  </style></head><body><header class="head"><h1>${escapeHtml(report.hospitalName)}</h1><p>No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State</p><h2>Hospital activity report</h2><p>${escapeHtml(activityReportDate(report.from))} to ${escapeHtml(activityReportDate(report.to))}</p></header><div class="summary">${summary}</div>${sections}<footer class="footer">Generated ${escapeHtml(activityReportDateTime(report.generatedAt))}</footer></body></html>`;
}
