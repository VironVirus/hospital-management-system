"use client";

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { RadiologyRequest } from "@/types/hospital";

const styles = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: "#0f172a", fontFamily: "Helvetica", fontSize: 10, padding: 42 },
  header: { borderBottomColor: "#5b21b6", borderBottomWidth: 3, paddingBottom: 14 },
  hospital: { fontSize: 18, fontWeight: 700 },
  address: { color: "#475569", fontSize: 8.5, marginTop: 5 },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 14, marginTop: 20 },
  metadata: { backgroundColor: "#faf5ff", borderColor: "#ddd6fe", borderRadius: 8, borderWidth: 1, marginBottom: 18, padding: 12 },
  metadataLine: { fontSize: 9, marginBottom: 5 },
  section: { marginBottom: 16 },
  sectionTitle: { color: "#5b21b6", fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, marginBottom: 7, textTransform: "uppercase" },
  sectionBody: { borderColor: "#e2e8f0", borderRadius: 7, borderWidth: 1, fontSize: 10, lineHeight: 1.55, padding: 12 },
  footer: { borderTopColor: "#cbd5e1", borderTopWidth: 1, bottom: 25, color: "#64748b", fontSize: 7.5, left: 42, paddingTop: 8, position: "absolute", right: 42 }
});

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function RadiologyReportDocument({ request }: { request: RadiologyRequest }) {
  const report = request.radiology_reports?.[0];
  if (!report) return <Document><Page size="A4" style={styles.page}><Text>Report not ready.</Text></Page></Document>;
  return <Document title={`${request.request_number} radiology report`}>
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.header}><Text style={styles.hospital}>St Gianna Specialist Hospital</Text><Text style={styles.address}>No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State</Text></View>
      <Text style={styles.title}>Radiology report</Text>
      <View style={styles.metadata}>
        <Text style={styles.metadataLine}>Patient: {request.patients?.name || "Unknown patient"}</Text>
        <Text style={styles.metadataLine}>Hospital ID: {request.patients?.hospital_id || request.patients?.lab_id || "-"}</Text>
        <Text style={styles.metadataLine}>Request: {request.request_number}</Text>
        <Text style={styles.metadataLine}>Study: {[request.radiology_services?.name, request.radiology_services?.modality].filter(Boolean).join(" - ")}</Text>
        <Text style={styles.metadataLine}>Reported: {formatDate(report.reported_at)}</Text>
      </View>
      <View style={styles.section}><Text style={styles.sectionTitle}>Clinical indication</Text><Text style={styles.sectionBody}>{request.clinical_indication}</Text></View>
      <View style={styles.section}><Text style={styles.sectionTitle}>Findings</Text><Text style={styles.sectionBody}>{report.findings}</Text></View>
      <View style={styles.section}><Text style={styles.sectionTitle}>Impression</Text><Text style={styles.sectionBody}>{report.impression}</Text></View>
      {report.recommendation ? <View style={styles.section}><Text style={styles.sectionTitle}>Recommendation</Text><Text style={styles.sectionBody}>{report.recommendation}</Text></View> : null}
      {report.pacs_reference ? <View style={styles.section}><Text style={styles.sectionTitle}>Study reference</Text><Text style={styles.sectionBody}>{report.pacs_reference}</Text></View> : null}
      <Text style={styles.footer} fixed>St Gianna Specialist Hospital - Radiology Department</Text>
    </Page>
  </Document>;
}
