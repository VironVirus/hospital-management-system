"use client";

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ClinicalReportPayload } from "@/features/clinical/clinical-report";

const styles = StyleSheet.create({
  page: { backgroundColor: "#fff", color: "#0f172a", fontFamily: "Helvetica", fontSize: 9, padding: 30 },
  header: { borderBottomColor: "#0f766e", borderBottomWidth: 2, marginBottom: 16, paddingBottom: 10 },
  hospital: { fontSize: 18, fontWeight: 700 },
  address: { color: "#64748b", fontSize: 8, marginTop: 3 },
  title: { fontSize: 14, fontWeight: 700, marginTop: 10 },
  meta: { backgroundColor: "#f0fdfa", borderColor: "#99f6e4", borderRadius: 8, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", marginBottom: 14, padding: 10 },
  metaItem: { marginBottom: 7, width: "50%" },
  label: { color: "#64748b", fontSize: 7, marginBottom: 2, textTransform: "uppercase" },
  value: { fontSize: 9, fontWeight: 700 },
  section: { marginTop: 13 },
  sectionTitle: { borderBottomColor: "#cbd5e1", borderBottomWidth: 1, fontSize: 11, fontWeight: 700, marginBottom: 7, paddingBottom: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: { borderColor: "#cbd5e1", borderRadius: 10, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 4 },
  row: { borderBottomColor: "#e2e8f0", borderBottomWidth: 1, flexDirection: "row", paddingVertical: 6 },
  drug: { width: "25%" },
  cell: { width: "15%" },
  instruction: { width: "30%" },
  note: { borderColor: "#e2e8f0", borderRadius: 6, borderWidth: 1, marginBottom: 5, padding: 7 },
  muted: { color: "#64748b" },
  footer: { borderTopColor: "#cbd5e1", borderTopWidth: 1, color: "#64748b", fontSize: 7, marginTop: 20, paddingTop: 7 }
});

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function ClinicalReportDocument({ report }: { report: ClinicalReportPayload }) {
  const latestVitals = report.vitals[0];
  const medications = report.prescriptions.flatMap((prescription) => prescription.prescription_items ?? []);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.hospital}>{report.hospitalName}</Text>
          <Text style={styles.address}>No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State</Text>
          <Text style={styles.title}>{report.scope === "medications" ? "Medication report" : "Clinical report"}</Text>
        </View>
        <View style={styles.meta}>
          <View style={styles.metaItem}><Text style={styles.label}>Patient</Text><Text style={styles.value}>{report.patient.name}</Text></View>
          <View style={styles.metaItem}><Text style={styles.label}>Hospital ID</Text><Text style={styles.value}>{report.patient.hospital_id || report.patient.lab_id}</Text></View>
          <View style={styles.metaItem}><Text style={styles.label}>Encounter</Text><Text style={styles.value}>{report.encounter.encounter_number}</Text></View>
          <View style={styles.metaItem}><Text style={styles.label}>Date</Text><Text style={styles.value}>{displayDate(report.encounter.started_at)}</Text></View>
        </View>
        {report.scope === "full" ? <><View style={styles.section}><Text style={styles.sectionTitle}>Latest vital signs</Text>{latestVitals ? <View style={styles.chips}>{[
          `BP ${latestVitals.systolic_bp ?? "-"}/${latestVitals.diastolic_bp ?? "-"} mmHg`,
          `Temperature ${latestVitals.temperature_c ?? "-"} °C`,
          `Pulse ${latestVitals.pulse_bpm ?? "-"} bpm`,
          `Respiration ${latestVitals.respiratory_rate ?? "-"}/min`,
          `SpO₂ ${latestVitals.oxygen_saturation ?? "-"}%`
        ].map((item) => <Text key={item} style={styles.chip}>{item}</Text>)}</View> : <Text style={styles.muted}>No vital signs recorded.</Text>}</View>
        <View style={styles.section}><Text style={styles.sectionTitle}>Diagnoses</Text>{report.diagnoses.length ? report.diagnoses.map((item) => <Text key={item.id} style={styles.note}>{item.diagnosis_name}{item.icd10_code ? ` (${item.icd10_code})` : ""} — {item.diagnosis_type}</Text>) : <Text style={styles.muted}>No diagnosis recorded.</Text>}</View>
        <View style={styles.section}><Text style={styles.sectionTitle}>Clinical notes and plan</Text>{report.notes.length ? report.notes.map((item) => <View key={item.id} style={styles.note}><Text style={styles.value}>{item.report_title || item.note_type}</Text><Text>{item.chief_complaint || item.assessment || item.plan || "-"}</Text></View>) : <Text style={styles.muted}>No clinical notes recorded.</Text>}</View></> : null}
        <View style={styles.section}><Text style={styles.sectionTitle}>Medication and treatment plan</Text>{medications.length ? <View><View style={styles.row}><Text style={[styles.drug, styles.value]}>Drug</Text><Text style={[styles.cell, styles.value]}>Dose</Text><Text style={[styles.cell, styles.value]}>Frequency</Text><Text style={[styles.cell, styles.value]}>Duration</Text><Text style={[styles.instruction, styles.value]}>Route / instructions</Text></View>{medications.map((item) => <View key={item.id} style={styles.row}><Text style={styles.drug}>{item.medication_name}</Text><Text style={styles.cell}>{item.dose}</Text><Text style={styles.cell}>{item.frequency}</Text><Text style={styles.cell}>{item.duration}</Text><Text style={styles.instruction}>{[item.route, item.instructions].filter(Boolean).join(" · ") || "-"}</Text></View>)}</View> : <Text style={styles.muted}>No medication prescribed.</Text>}</View>
        <Text style={styles.footer}>Generated {displayDate(report.generatedAt)}</Text>
      </Page>
    </Document>
  );
}
