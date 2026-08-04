import { formatResultValue, formatReferenceRangeLabel, formatStatusLabel, type ReportOrderRow } from "@/features/reports/report-utils";
import type { BillingDocumentRecord } from "@/features/billing/billing-document";
import type { Admission, ClinicalNote, Diagnosis, Encounter, Prescription, RadiologyRequest, VitalSign } from "@/types/hospital";

export type PatientCareProfile = {
  address?: string | null;
  allergies?: string | null;
  bloodGroup?: string | null;
  dateOfBirth?: string | null;
  email?: string | null;
  emergencyContact?: string | null;
  genotype?: string | null;
  hospitalId: string;
  insuranceNumber?: string | null;
  insuranceProvider?: string | null;
  lga?: string | null;
  medicalRecordNumber?: string | null;
  name: string;
  nationalId?: string | null;
  phone?: string | null;
  sex?: string | null;
  state?: string | null;
};

export type PatientCareLabTest = {
  date: string;
  orderNumber: string;
  referenceRange: string;
  result: string;
  status: string;
  testName: string;
  unit: string;
};

export type PatientCareReportPayload = {
  admissions: Admission[];
  bills: BillingDocumentRecord[];
  diagnoses: Diagnosis[];
  encounters: Encounter[];
  generatedAt: string;
  hospitalName: string;
  labTests: PatientCareLabTest[];
  notes: ClinicalNote[];
  patient: PatientCareProfile;
  prescriptions: Prescription[];
  radiology: RadiologyRequest[];
  vitals: VitalSign[];
};

export function buildPatientCareLabTests(orders: ReportOrderRow[]): PatientCareLabTest[] {
  return orders.flatMap((order) => (order.order_tests ?? []).map((test) => ({
    date: test.reported_at || test.results_entered_at || order.ordered_at,
    orderNumber: order.order_number,
    referenceRange: formatReferenceRangeLabel(test.tests),
    result: formatResultValue(test.order_test_results, test.tests),
    status: formatStatusLabel(test.status),
    testName: test.tests?.name || "Laboratory test",
    unit: test.tests?.unit || "-"
  })));
}

function escapeHtml(value: unknown) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function patientCareDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function patientCareMoney(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(value || 0);
}

function table(headers: string[], rows: string[][], empty: string) {
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">${escapeHtml(empty)}</td></tr>`}</tbody></table>`;
}

export function buildPatientCareReportHtml(report: PatientCareReportPayload) {
  const billed = report.bills.reduce((sum, bill) => sum + bill.total, 0);
  const paid = report.bills.reduce((sum, bill) => sum + bill.amountPaid, 0);
  const profile = [
    ["Patient", report.patient.name], ["Hospital ID", report.patient.hospitalId], ["Medical record no.", report.patient.medicalRecordNumber || "Not recorded"], ["Phone", report.patient.phone || "Not recorded"],
    ["Email", report.patient.email || "Not recorded"], ["National ID", report.patient.nationalId || "Not recorded"],
    ["Date of birth", report.patient.dateOfBirth || "Not recorded"], ["Sex", report.patient.sex || "Not recorded"], ["Blood group", report.patient.bloodGroup || "Not recorded"],
    ["Genotype", report.patient.genotype || "Not recorded"], ["Address", report.patient.address || "Not recorded"], ["State / LGA", [report.patient.state, report.patient.lga].filter(Boolean).join(" / ") || "Not recorded"],
    ["Emergency contact", report.patient.emergencyContact || "Not recorded"], ["Insurance", [report.patient.insuranceProvider, report.patient.insuranceNumber].filter(Boolean).join(" - ") || "Not recorded"], ["Allergies", report.patient.allergies || "None recorded"]
  ];
  const encounterRows = report.encounters.map((item) => [patientCareDate(item.started_at), item.encounter_number, item.encounter_type, item.status, item.presenting_complaint || "-"]);
  const admissionRows = report.admissions.map((item) => [patientCareDate(item.admitted_at), item.wards?.name || "-", item.beds?.bed_number || "-", item.status, item.admission_reason || "-"]);
  const vitalRows = report.vitals.map((item) => [patientCareDate(item.measured_at), `${item.systolic_bp ?? "-"}/${item.diastolic_bp ?? "-"}`, String(item.temperature_c ?? "-"), String(item.pulse_bpm ?? "-"), String(item.respiratory_rate ?? "-"), String(item.oxygen_saturation ?? "-"), String(item.weight_kg ?? "-")]);
  const diagnosisRows = report.diagnoses.map((item) => [patientCareDate(item.diagnosed_at), item.diagnosis_name, item.icd10_code || "-", item.diagnosis_type, item.status, item.notes || "-"]);
  const prescriptionRows = report.prescriptions.flatMap((prescription) => (prescription.prescription_items ?? []).map((item) => [patientCareDate(prescription.prescribed_at), item.medication_name, item.dose, item.frequency, item.duration, item.route || "-", String(item.quantity), prescription.status]));
  const labRows = report.labTests.map((item) => [patientCareDate(item.date), item.orderNumber, item.testName, item.result, item.unit, item.referenceRange, item.status]);
  const radiologyRows = report.radiology.map((item) => [patientCareDate(item.requested_at), item.request_number, item.radiology_services?.name || "-", item.status, item.radiology_reports?.[0]?.findings || "Pending", item.radiology_reports?.[0]?.impression || "Pending"]);
  const billRows = report.bills.map((item) => [patientCareDate(item.date), item.reference, item.items.map((line) => line.description).join(", "), patientCareMoney(item.total), patientCareMoney(item.amountPaid), patientCareMoney(Math.max(item.total - item.amountPaid, 0)), item.status]);
  const noteMarkup = report.notes.map((note) => `<article class="note"><h3>${escapeHtml(note.report_title || note.note_type)} <span>${escapeHtml(patientCareDate(note.authored_at))}</span></h3>${[["History", note.history_of_presenting_illness], ["Examination", note.examination], ["Assessment", note.assessment], ["Plan", note.plan]].filter(([, value]) => value).map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("") || "<p>No details recorded.</p>"}</article>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Patient care report</title><style>
  @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#0f172a;margin:0;font-size:8.5px;line-height:1.4}.header{border-bottom:3px solid #0f766e;padding-bottom:10px;margin-bottom:12px}.header h1{font-size:19px;margin:0}.header p{color:#475569;margin:3px 0}.header h2{font-size:14px;margin:8px 0 0}.profile{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}.profile div,.summary div{border:1px solid #cbd5e1;border-radius:7px;padding:7px}.profile span,.summary span{display:block;color:#64748b;font-size:7px;text-transform:uppercase}.profile strong,.summary strong{display:block;margin-top:2px}.allergy{background:#fff1f2;border-color:#fda4af!important;color:#9f1239}.summary{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:14px}.summary div{background:#f0fdfa;border-color:#99f6e4}.summary strong{font-size:12px}.section{break-inside:avoid;margin:0 0 14px}.section h2{font-size:11px;border-bottom:1px solid #94a3b8;padding-bottom:4px;margin:0 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:4px;text-align:left;vertical-align:top}th{background:#f0fdfa;font-size:7px;text-transform:uppercase}.note{border:1px solid #cbd5e1;border-radius:7px;padding:8px;margin-bottom:6px;break-inside:avoid}.note h3{font-size:9px;margin:0 0 4px}.note h3 span{float:right;color:#64748b;font-size:7px;font-weight:normal}.note p{margin:3px 0}.footer{border-top:1px solid #cbd5e1;padding-top:6px;color:#64748b}
  </style></head><body><header class="header"><h1>${escapeHtml(report.hospitalName)}</h1><p>No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State</p><h2>Comprehensive patient care report</h2><p>Generated ${escapeHtml(patientCareDate(report.generatedAt))}</p></header><section class="profile">${profile.map(([label, value]) => `<div${label === "Allergies" ? ' class="allergy"' : ""}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</section><section class="summary">${[["Encounters", report.encounters.length], ["Admissions", report.admissions.length], ["Diagnoses", report.diagnoses.length], ["Prescriptions", report.prescriptions.length], ["Tests", report.labTests.length], ["Outstanding", patientCareMoney(Math.max(billed - paid, 0))]].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</section>
  <section class="section"><h2>Encounters</h2>${table(["Date", "Encounter", "Type", "Status", "Reason"], encounterRows, "No encounters recorded.")}</section>
  <section class="section"><h2>Ward care</h2>${table(["Admitted", "Ward", "Bed", "Status", "Reason"], admissionRows, "No admissions recorded.")}</section>
  <section class="section"><h2>Vital signs history</h2>${table(["Date", "BP", "Temp C", "Pulse", "Resp", "SpO2", "Weight kg"], vitalRows, "No vital signs recorded.")}</section>
  <section class="section"><h2>Diagnoses</h2>${table(["Date", "Diagnosis", "ICD-10", "Type", "Status", "Notes"], diagnosisRows, "No diagnoses recorded.")}</section>
  <section class="section"><h2>Clinical notes and care plans</h2>${noteMarkup || "<p>No clinical notes recorded.</p>"}</section>
  <section class="section"><h2>Medication and treatment</h2>${table(["Date", "Medication", "Dose", "Frequency", "Duration", "Route", "Qty", "Status"], prescriptionRows, "No prescriptions recorded.")}</section>
  <section class="section"><h2>Laboratory tests and results</h2>${table(["Date", "Request", "Test", "Result", "Unit", "Reference", "Status"], labRows, "No laboratory tests recorded.")}</section>
  <section class="section"><h2>Radiology requests and reports</h2>${table(["Date", "Request", "Study", "Status", "Findings", "Impression"], radiologyRows, "No radiology records.")}</section>
  <section class="section"><h2>Bills and payments</h2>${table(["Date", "Reference", "Care / service", "Billed", "Paid", "Due", "Status"], billRows, "No billing records.")}</section><footer class="footer">St Gianna Specialist Hospital - Patient care record</footer></body></html>`;
}
