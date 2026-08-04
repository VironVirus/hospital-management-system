"use client";

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PatientCareReportPayload } from "@/features/patients/patient-care-report";

const styles = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: "#0f172a", fontFamily: "Helvetica", fontSize: 6.5, paddingBottom: 28, paddingHorizontal: 24, paddingTop: 24 },
  header: { borderBottomColor: "#0f766e", borderBottomWidth: 2, marginBottom: 9, paddingBottom: 7 },
  hospital: { fontSize: 15, fontWeight: 700 },
  address: { color: "#475569", fontSize: 6.5, marginTop: 2 },
  title: { fontSize: 10, fontWeight: 700, marginTop: 5 },
  profile: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 8 },
  profileItem: { borderColor: "#cbd5e1", borderRadius: 4, borderWidth: 1, minHeight: 28, padding: 4, width: "24.3%" },
  allergyItem: { backgroundColor: "#fff1f2", borderColor: "#fda4af" },
  label: { color: "#64748b", fontSize: 5.3, textTransform: "uppercase" },
  value: { fontSize: 6.8, fontWeight: 700, marginTop: 2 },
  summary: { flexDirection: "row", gap: 4, marginBottom: 10 },
  summaryItem: { backgroundColor: "#f0fdfa", borderColor: "#99f6e4", borderRadius: 4, borderWidth: 1, padding: 4, width: "16.1%" },
  summaryValue: { fontSize: 10, fontWeight: 700, marginTop: 2 },
  section: { marginBottom: 10 },
  sectionTitle: { borderBottomColor: "#94a3b8", borderBottomWidth: 1, fontSize: 8.5, fontWeight: 700, marginBottom: 4, paddingBottom: 3 },
  table: { borderColor: "#cbd5e1", borderLeftWidth: 1, borderTopWidth: 1 },
  row: { flexDirection: "row" },
  headerRow: { backgroundColor: "#f0fdfa" },
  cell: { borderBottomColor: "#cbd5e1", borderBottomWidth: 1, borderRightColor: "#cbd5e1", borderRightWidth: 1, flex: 1, lineHeight: 1.3, padding: 3 },
  headerCell: { fontSize: 5.4, fontWeight: 700, textTransform: "uppercase" },
  empty: { color: "#64748b", padding: 5 },
  note: { borderColor: "#cbd5e1", borderRadius: 4, borderWidth: 1, marginBottom: 4, padding: 5 },
  noteTitle: { fontSize: 7, fontWeight: 700, marginBottom: 3 },
  noteLine: { fontSize: 6.2, lineHeight: 1.4, marginBottom: 2 },
  footer: { borderTopColor: "#cbd5e1", borderTopWidth: 1, bottom: 12, color: "#64748b", fontSize: 5.5, left: 24, paddingTop: 4, position: "absolute", right: 24 }
});

function date(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(value || 0);
}

function ReportTable({ empty, headers, rows }: { empty: string; headers: string[]; rows: string[][] }) {
  return <View style={styles.table}><View style={[styles.row, styles.headerRow]} fixed>{headers.map((header) => <Text key={header} style={[styles.cell, styles.headerCell]}>{header}</Text>)}</View>{rows.length ? rows.map((row, rowIndex) => <View key={rowIndex} style={styles.row} wrap={false}>{row.map((cell, cellIndex) => <Text key={cellIndex} style={styles.cell}>{cell || "-"}</Text>)}</View>) : <Text style={styles.empty}>{empty}</Text>}</View>;
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return <View style={styles.section}><Text style={styles.sectionTitle} minPresenceAhead={75}>{title}</Text>{children}</View>;
}

export function PatientCareReportDocument({ report }: { report: PatientCareReportPayload }) {
  const billed = report.bills.reduce((sum, bill) => sum + bill.total, 0);
  const paid = report.bills.reduce((sum, bill) => sum + bill.amountPaid, 0);
  const profile = [
    ["Patient", report.patient.name], ["Hospital ID", report.patient.hospitalId], ["Medical record no.", report.patient.medicalRecordNumber || "Not recorded"], ["Phone", report.patient.phone || "Not recorded"],
    ["Email", report.patient.email || "Not recorded"], ["National ID", report.patient.nationalId || "Not recorded"],
    ["Date of birth", report.patient.dateOfBirth || "Not recorded"], ["Sex", report.patient.sex || "Not recorded"], ["Blood group", report.patient.bloodGroup || "Not recorded"],
    ["Genotype", report.patient.genotype || "Not recorded"], ["Address", report.patient.address || "Not recorded"], ["State / LGA", [report.patient.state, report.patient.lga].filter(Boolean).join(" / ") || "Not recorded"],
    ["Emergency contact", report.patient.emergencyContact || "Not recorded"], ["Insurance", [report.patient.insuranceProvider, report.patient.insuranceNumber].filter(Boolean).join(" - ") || "Not recorded"], ["Allergies", report.patient.allergies || "None recorded"]
  ];
  const encounterRows = report.encounters.map((item) => [date(item.started_at), item.encounter_number, item.encounter_type, item.status, item.presenting_complaint || "-"]);
  const admissionRows = report.admissions.map((item) => [date(item.admitted_at), item.wards?.name || "-", item.beds?.bed_number || "-", item.status, item.admission_reason || "-"]);
  const vitalRows = report.vitals.map((item) => [date(item.measured_at), `${item.systolic_bp ?? "-"}/${item.diastolic_bp ?? "-"}`, String(item.temperature_c ?? "-"), String(item.pulse_bpm ?? "-"), String(item.respiratory_rate ?? "-"), String(item.oxygen_saturation ?? "-"), String(item.weight_kg ?? "-")]);
  const diagnosisRows = report.diagnoses.map((item) => [date(item.diagnosed_at), item.diagnosis_name, item.icd10_code || "-", item.diagnosis_type, item.status, item.notes || "-"]);
  const prescriptionRows = report.prescriptions.flatMap((prescription) => (prescription.prescription_items ?? []).map((item) => [date(prescription.prescribed_at), item.medication_name, item.dose, item.frequency, item.duration, item.route || "-", String(item.quantity), prescription.status]));
  const labRows = report.labTests.map((item) => [date(item.date), item.orderNumber, item.testName, item.result, item.unit, item.referenceRange, item.status]);
  const radiologyRows = report.radiology.map((item) => [date(item.requested_at), item.request_number, item.radiology_services?.name || "-", item.status, item.radiology_reports?.[0]?.findings || "Pending", item.radiology_reports?.[0]?.impression || "Pending"]);
  const billRows = report.bills.map((item) => [date(item.date), item.reference, item.items.map((line) => line.description).join(", "), money(item.total), money(item.amountPaid), money(Math.max(item.total - item.amountPaid, 0)), item.status]);

  return <Document title={`${report.patient.hospitalId} patient care report`}><Page size="A4" orientation="landscape" style={styles.page} wrap><View style={styles.header}><Text style={styles.hospital}>{report.hospitalName}</Text><Text style={styles.address}>No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State</Text><Text style={styles.title}>Comprehensive patient care report</Text><Text style={styles.address}>Generated {date(report.generatedAt)}</Text></View><View style={styles.profile}>{profile.map(([label, value]) => <View key={label} style={[styles.profileItem, label === "Allergies" ? styles.allergyItem : {}]}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}</View><View style={styles.summary}>{[["Encounters", report.encounters.length], ["Admissions", report.admissions.length], ["Diagnoses", report.diagnoses.length], ["Prescriptions", report.prescriptions.length], ["Tests", report.labTests.length], ["Outstanding", money(Math.max(billed - paid, 0))]].map(([label, value]) => <View key={label} style={styles.summaryItem}><Text style={styles.label}>{label}</Text><Text style={styles.summaryValue}>{String(value)}</Text></View>)}</View>
    <Section title="Encounters"><ReportTable headers={["Date", "Encounter", "Type", "Status", "Reason"]} rows={encounterRows} empty="No encounters recorded." /></Section>
    <Section title="Ward care"><ReportTable headers={["Admitted", "Ward", "Bed", "Status", "Reason"]} rows={admissionRows} empty="No admissions recorded." /></Section>
    <Section title="Vital signs history"><ReportTable headers={["Date", "BP", "Temp C", "Pulse", "Resp", "SpO2", "Weight kg"]} rows={vitalRows} empty="No vital signs recorded." /></Section>
    <Section title="Diagnoses"><ReportTable headers={["Date", "Diagnosis", "ICD-10", "Type", "Status", "Notes"]} rows={diagnosisRows} empty="No diagnoses recorded." /></Section>
    <Section title="Clinical notes and care plans">{report.notes.length ? report.notes.map((note) => <View key={note.id} style={styles.note} wrap={false}><Text style={styles.noteTitle}>{note.report_title || note.note_type} - {date(note.authored_at)}</Text>{[["History", note.history_of_presenting_illness], ["Examination", note.examination], ["Assessment", note.assessment], ["Plan", note.plan]].filter(([, value]) => value).map(([label, value]) => <Text key={label} style={styles.noteLine}>{label}: {value}</Text>)}</View>) : <Text style={styles.empty}>No clinical notes recorded.</Text>}</Section>
    <Section title="Medication and treatment"><ReportTable headers={["Date", "Medication", "Dose", "Frequency", "Duration", "Route", "Qty", "Status"]} rows={prescriptionRows} empty="No prescriptions recorded." /></Section>
    <Section title="Laboratory tests and results"><ReportTable headers={["Date", "Request", "Test", "Result", "Unit", "Reference", "Status"]} rows={labRows} empty="No laboratory tests recorded." /></Section>
    <Section title="Radiology requests and reports"><ReportTable headers={["Date", "Request", "Study", "Status", "Findings", "Impression"]} rows={radiologyRows} empty="No radiology records." /></Section>
    <Section title="Bills and payments"><ReportTable headers={["Date", "Reference", "Care / service", "Billed", "Paid", "Due", "Status"]} rows={billRows} empty="No billing records." /></Section>
    <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `St Gianna Specialist Hospital - Patient care record - Page ${pageNumber} of ${totalPages}`} />
  </Page></Document>;
}
