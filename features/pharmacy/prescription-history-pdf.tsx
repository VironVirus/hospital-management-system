"use client";

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { prescriptionReportDate, type PrescriptionHistoryReport } from "@/features/pharmacy/prescription-history-report";

const styles = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: "#0f172a", fontFamily: "Helvetica", fontSize: 7.5, padding: 26 },
  header: { borderBottomColor: "#047857", borderBottomWidth: 2, marginBottom: 12, paddingBottom: 9 },
  hospital: { fontSize: 17, fontWeight: 700 },
  address: { color: "#64748b", fontSize: 7.5, marginTop: 3 },
  title: { fontSize: 12, fontWeight: 700, marginTop: 8 },
  summary: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", borderRadius: 7, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", marginBottom: 10, padding: 8 },
  summaryCount: { fontSize: 13, fontWeight: 700 },
  table: { borderColor: "#cbd5e1", borderLeftWidth: 1, borderTopWidth: 1 },
  row: { flexDirection: "row" },
  headerRow: { backgroundColor: "#ecfdf5" },
  cell: { borderBottomColor: "#cbd5e1", borderBottomWidth: 1, borderRightColor: "#cbd5e1", borderRightWidth: 1, padding: 5 },
  headerCell: { fontSize: 7, fontWeight: 700, textTransform: "uppercase" },
  muted: { color: "#64748b", fontSize: 6.5, marginTop: 2 },
  footer: { borderTopColor: "#cbd5e1", borderTopWidth: 1, color: "#64748b", fontSize: 6.5, marginTop: 12, paddingTop: 6 }
});

export function PrescriptionHistoryDocument({ report }: { report: PrescriptionHistoryReport }) {
  const rows = report.prescriptions.flatMap((prescription) => {
    const items = prescription.prescription_items ?? [];
    return (items.length ? items : [null]).map((item, index) => ({ item, key: `${prescription.id}-${item?.id ?? index}`, prescription }));
  });

  return <Document title="Prescription history"><Page size="A4" orientation="landscape" style={styles.page} wrap>
    <View style={styles.header} fixed><Text style={styles.hospital}>{report.hospitalName}</Text><Text style={styles.address}>No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State</Text><Text style={styles.title}>Prescription history</Text></View>
    <View style={styles.summary}><View><Text>Total prescriptions</Text><Text style={styles.summaryCount}>{report.prescriptions.length}</Text></View><Text>Generated {prescriptionReportDate(report.generatedAt)}</Text></View>
    <View style={styles.table}>
      <View style={[styles.row, styles.headerRow]} fixed><Text style={[styles.cell, styles.headerCell, { width: "14%" }]}>Date</Text><Text style={[styles.cell, styles.headerCell, { width: "18%" }]}>Patient</Text><Text style={[styles.cell, styles.headerCell, { width: "22%" }]}>Medication</Text><Text style={[styles.cell, styles.headerCell, { width: "18%" }]}>Dose / frequency</Text><Text style={[styles.cell, styles.headerCell, { width: "15%" }]}>Duration / qty</Text><Text style={[styles.cell, styles.headerCell, { width: "13%" }]}>Status</Text></View>
      {rows.map(({ item, key, prescription }) => <View key={key} style={styles.row} wrap={false}><Text style={[styles.cell, { width: "14%" }]}>{prescriptionReportDate(prescription.prescribed_at)}</Text><View style={[styles.cell, { width: "18%" }]}><Text>{prescription.patients?.name || "Unknown patient"}</Text><Text style={styles.muted}>{prescription.patients?.hospital_id || prescription.patients?.lab_id || "-"}</Text></View><View style={[styles.cell, { width: "22%" }]}><Text>{item?.medication_name || "No items"}</Text><Text style={styles.muted}>{item?.route || "-"}</Text></View><Text style={[styles.cell, { width: "18%" }]}>{item ? `${item.dose} / ${item.frequency}` : "-"}</Text><Text style={[styles.cell, { width: "15%" }]}>{item ? `${item.duration} / ${item.quantity}` : "-"}</Text><View style={[styles.cell, { width: "13%" }]}><Text>{prescription.status}</Text>{prescription.dispensed_at ? <Text style={styles.muted}>{prescriptionReportDate(prescription.dispensed_at)}</Text> : null}</View></View>)}
    </View>
    <Text style={styles.footer} fixed>St Gianna Specialist Hospital prescription history</Text>
  </Page></Document>;
}
