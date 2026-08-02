"use client";

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { activityReportDate, activityReportDateTime, type HospitalActivityReport } from "@/features/admin/hospital-activity-report";

const styles = StyleSheet.create({
  page: { backgroundColor: "#fff", color: "#0f172a", fontFamily: "Helvetica", fontSize: 6.8, padding: 24 },
  header: { borderBottomColor: "#1d4ed8", borderBottomWidth: 2, marginBottom: 10, paddingBottom: 8 },
  hospital: { fontSize: 16, fontWeight: 700 },
  address: { color: "#64748b", fontSize: 6.8, marginTop: 2 },
  title: { fontSize: 11, fontWeight: 700, marginTop: 7 },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 10 },
  metric: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", borderRadius: 5, borderWidth: 1, padding: 5, width: "15.8%" },
  metricLabel: { color: "#475569", fontSize: 6 },
  metricValue: { fontSize: 12, fontWeight: 700, marginTop: 2 },
  section: { marginBottom: 11 },
  sectionTitle: { borderBottomColor: "#93c5fd", borderBottomWidth: 1, fontSize: 9, fontWeight: 700, marginBottom: 4, paddingBottom: 3 },
  table: { borderColor: "#cbd5e1", borderLeftWidth: 1, borderTopWidth: 1 },
  row: { flexDirection: "row" },
  headerRow: { backgroundColor: "#eff6ff" },
  cell: { borderBottomColor: "#cbd5e1", borderBottomWidth: 1, borderRightColor: "#cbd5e1", borderRightWidth: 1, flex: 1, padding: 4 },
  headerCell: { fontSize: 6, fontWeight: 700, textTransform: "uppercase" },
  empty: { color: "#64748b", padding: 5 },
  footer: { borderTopColor: "#cbd5e1", borderTopWidth: 1, color: "#64748b", fontSize: 6, marginTop: 8, paddingTop: 5 }
});

export function HospitalActivityReportDocument({ report }: { report: HospitalActivityReport }) {
  return <Document title="Hospital activity report"><Page size="A4" orientation="landscape" style={styles.page} wrap>
    <View style={styles.header} fixed><Text style={styles.hospital}>{report.hospitalName}</Text><Text style={styles.address}>No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State</Text><Text style={styles.title}>Hospital activity report</Text><Text style={styles.address}>{activityReportDate(report.from)} to {activityReportDate(report.to)}</Text></View>
    <View style={styles.summary}>{report.summary.map((item) => <View key={item.label} style={styles.metric}><Text style={styles.metricLabel}>{item.label}</Text><Text style={styles.metricValue}>{item.value}</Text></View>)}</View>
    {report.sections.map((section) => <View key={section.title} style={styles.section}><Text style={styles.sectionTitle}>{section.title} ({section.rows.length})</Text><View style={styles.table}><View style={[styles.row, styles.headerRow]} fixed>{section.columns.map((column) => <Text key={column.key} style={[styles.cell, styles.headerCell]}>{column.label}</Text>)}</View>{section.rows.length ? section.rows.map((row, index) => <View key={`${section.title}-${index}`} style={styles.row} wrap={false}>{section.columns.map((column) => <Text key={column.key} style={styles.cell}>{String(row[column.key] ?? "-")}</Text>)}</View>) : <Text style={styles.empty}>No activity.</Text>}</View></View>)}
    <Text style={styles.footer} fixed>Generated {activityReportDateTime(report.generatedAt)}</Text>
  </Page></Document>;
}
