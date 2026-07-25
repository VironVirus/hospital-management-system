import type {
  ClinicalNote,
  Diagnosis,
  Encounter,
  PatientOption,
  Prescription,
  VitalSign
} from "@/types/hospital";

export type ClinicalReportPayload = {
  diagnoses: Diagnosis[];
  encounter: Encounter;
  generatedAt: string;
  hospitalName: string;
  notes: ClinicalNote[];
  patient: PatientOption;
  prescriptions: Prescription[];
  scope: "full" | "medications";
  vitals: VitalSign[];
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function buildClinicalReportHtml(report: ClinicalReportPayload) {
  const reportTitle = report.scope === "medications" ? "Medication report" : "Clinical report";
  const latestVitals = report.vitals[0];
  const medicationRows = report.prescriptions.flatMap((prescription) =>
    (prescription.prescription_items ?? []).map((item) => `
      <tr>
        <td>${escapeHtml(item.medication_name)}</td>
        <td>${escapeHtml(item.dose)}</td>
        <td>${escapeHtml(item.frequency)}</td>
        <td>${escapeHtml(item.duration)}</td>
        <td>${escapeHtml(item.route || "-")}</td>
        <td>${escapeHtml(item.instructions || "-")}</td>
      </tr>`)
  ).join("");
  const diagnosisRows = report.diagnoses.map((item) => `
    <li><strong>${escapeHtml(item.diagnosis_name)}</strong>${item.icd10_code ? ` (${escapeHtml(item.icd10_code)})` : ""} — ${escapeHtml(item.diagnosis_type)}</li>`).join("");
  const noteRows = report.notes.map((item) => `
    <section class="note"><strong>${escapeHtml(item.report_title || item.note_type)}</strong><p>${escapeHtml(item.chief_complaint || item.assessment || item.plan || "-")}</p></section>`).join("");
  const clinicalSections = report.scope === "full" ? `
    <section class="section"><h2>Latest vital signs</h2>${latestVitals ? `<div class="vitals"><span class="pill">BP ${escapeHtml(latestVitals.systolic_bp ?? "-")}/${escapeHtml(latestVitals.diastolic_bp ?? "-")} mmHg</span><span class="pill">Temperature ${escapeHtml(latestVitals.temperature_c ?? "-")} °C</span><span class="pill">Pulse ${escapeHtml(latestVitals.pulse_bpm ?? "-")} bpm</span><span class="pill">Respiration ${escapeHtml(latestVitals.respiratory_rate ?? "-")}/min</span><span class="pill">SpO₂ ${escapeHtml(latestVitals.oxygen_saturation ?? "-")}%</span></div>` : "<p>No vital signs recorded.</p>"}</section>
    <section class="section"><h2>Diagnoses</h2>${diagnosisRows ? `<ul>${diagnosisRows}</ul>` : "<p>No diagnosis recorded.</p>"}</section>
    <section class="section"><h2>Clinical notes and plan</h2>${noteRows || "<p>No clinical notes recorded.</p>"}</section>` : "";

  return `<!doctype html>
  <html><head><meta charset="utf-8"><title>${reportTitle}</title><style>
    body{font-family:Arial,sans-serif;color:#0f172a;margin:32px;font-size:13px;line-height:1.45}h1,h2,p{margin:0}.header{border-bottom:3px solid #0f766e;padding-bottom:14px;margin-bottom:20px}.header h1{font-size:22px}.muted{color:#64748b}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:14px;margin-bottom:18px}.section{margin-top:20px}.section h2{font-size:15px;border-bottom:1px solid #cbd5e1;padding-bottom:6px;margin-bottom:10px}.vitals{display:flex;flex-wrap:wrap;gap:8px}.pill{border:1px solid #cbd5e1;border-radius:999px;padding:5px 9px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;vertical-align:top}th{background:#f8fafc}.note{margin-bottom:8px;padding:10px;border:1px solid #e2e8f0;border-radius:8px}.footer{margin-top:28px;border-top:1px solid #cbd5e1;padding-top:10px;color:#64748b;font-size:11px}@page{size:A4;margin:16mm}
  </style></head><body>
    <header class="header"><h1>${escapeHtml(report.hospitalName)}</h1><p class="muted">No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State</p><h2 style="margin-top:12px">${reportTitle}</h2></header>
    <div class="meta"><div><strong>Patient</strong><br>${escapeHtml(report.patient.name)}</div><div><strong>Hospital ID</strong><br>${escapeHtml(report.patient.hospital_id || report.patient.lab_id)}</div><div><strong>Encounter</strong><br>${escapeHtml(report.encounter.encounter_number)}</div><div><strong>Date</strong><br>${escapeHtml(dateTime(report.encounter.started_at))}</div></div>
    ${clinicalSections}
    <section class="section"><h2>Medication and treatment plan</h2>${medicationRows ? `<table><thead><tr><th>Drug</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Route</th><th>Instructions</th></tr></thead><tbody>${medicationRows}</tbody></table>` : "<p>No medication prescribed.</p>"}</section>
    <footer class="footer">Generated ${escapeHtml(dateTime(report.generatedAt))}</footer>
  </body></html>`;
}
