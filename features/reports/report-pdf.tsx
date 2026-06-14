"use client";

import {
  Document,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View
} from "@react-pdf/renderer";
import type {
  PatientReportBundle,
  ReportBranding,
  ReportOrderRow
} from "@/features/reports/report-utils";
import {
  buildPatientReportBundles,
  formatCurrency,
  formatDate
} from "@/features/reports/report-utils";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingBottom: 28,
    paddingHorizontal: 28,
    paddingTop: 28
  },
  header: {
    alignItems: "center",
    borderBottomColor: "#0f4c81",
    borderBottomWidth: 2,
    flexDirection: "row",
    gap: 12,
    paddingBottom: 14
  },
  logoFallback: {
    alignItems: "center",
    backgroundColor: "#0f4c81",
    borderRadius: 12,
    color: "#ffffff",
    display: "flex",
    fontSize: 18,
    fontWeight: 700,
    height: 42,
    justifyContent: "center",
    textAlign: "center",
    width: 42
  },
  logoImage: {
    borderRadius: 12,
    height: 42,
    width: 42
  },
  labName: {
    fontSize: 18,
    fontWeight: 700
  },
  brandMeta: {
    color: "#475569",
    fontSize: 9,
    marginTop: 2
  },
  titleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
    marginTop: 18
  },
  eyebrow: {
    color: "#0f4c81",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.2,
    marginBottom: 4,
    textTransform: "uppercase"
  },
  title: {
    fontSize: 16,
    fontWeight: 700
  },
  metaCard: {
    backgroundColor: "#f8fbff",
    borderColor: "#dbeafe",
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 210,
    padding: 12
  },
  metaLine: {
    fontSize: 9,
    marginBottom: 4
  },
  twoColumn: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18
  },
  panel: {
    backgroundColor: "#f8fbff",
    borderColor: "#dbeafe",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    padding: 12
  },
  panelLine: {
    fontSize: 9,
    marginBottom: 5
  },
  table: {
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden"
  },
  tableHeader: {
    backgroundColor: "#eff6ff",
    flexDirection: "row"
  },
  tableHeaderCell: {
    borderRightColor: "#bfdbfe",
    borderRightWidth: 1,
    color: "#0f172a",
    fontSize: 8.5,
    fontWeight: 700,
    padding: 10
  },
  tableRow: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    flexDirection: "row"
  },
  tableCell: {
    borderRightColor: "#e2e8f0",
    borderRightWidth: 1,
    fontSize: 8.5,
    padding: 10
  },
  cellSubtext: {
    color: "#64748b",
    fontSize: 7.5,
    marginTop: 3
  },
  flagText: {
    color: "#b91c1c",
    fontWeight: 800
  },
  normalText: {
    color: "#64748b",
    fontWeight: 700
  },
  footer: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 20,
    justifyContent: "space-between",
    marginTop: 20
  },
  footerNote: {
    color: "#334155",
    flex: 1,
    fontSize: 9
  },
  signatureBlock: {
    minWidth: 180
  },
  signatureLine: {
    borderTopColor: "#0f172a",
    borderTopWidth: 1,
    marginBottom: 8,
    marginTop: 26
  },
  signatureText: {
    fontSize: 9,
    marginBottom: 3,
    textAlign: "center"
  }
});

function ReportPage({
  branding,
  bundle
}: {
  branding: ReportBranding;
  bundle: PatientReportBundle;
}) {
  const patient = bundle.patient;
  const facility = bundle.facility;
  const orderLabel = bundle.orderNumbers.join(", ");
  const priorityLabel = bundle.priorities.join(", ");
  const notesLabel =
    bundle.notes.length > 0
      ? bundle.notes.join(" | ")
      : "No additional notes recorded.";

  return (
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.header}>
        {branding.logoUrl ? (
          <PdfImage src={branding.logoUrl} style={styles.logoImage} />
        ) : (
          <View style={styles.logoFallback}>
            <Text>LN</Text>
          </View>
        )}

        <View>
          <Text style={styles.labName}>{branding.labName}</Text>
          <Text style={styles.brandMeta}>
            {facility?.code || branding.accreditation}
          </Text>
          <Text style={styles.brandMeta}>{branding.address}</Text>
          <Text style={styles.brandMeta}>{branding.supportLine}</Text>
        </View>
      </View>

      <View style={styles.titleRow}>
        <View>
          <Text style={styles.eyebrow}>Patient report</Text>
          <Text style={styles.title}>Verified laboratory findings</Text>
        </View>
        <View style={styles.metaCard}>
          <Text style={styles.metaLine}>Sample ID: {bundle.sampleCode}</Text>
          <Text style={styles.metaLine}>Orders: {orderLabel}</Text>
          <Text style={styles.metaLine}>
            Collected: {formatDate(bundle.orderedAt)}
          </Text>
          <Text style={styles.metaLine}>
            Reported: {formatDate(bundle.reportedAt || new Date().toISOString())}
          </Text>
        </View>
      </View>

      <View style={styles.twoColumn}>
        <View style={styles.panel}>
          <Text style={styles.eyebrow}>Patient</Text>
          <Text style={styles.panelLine}>Name: {patient?.name || "Unknown patient"}</Text>
          <Text style={styles.panelLine}>Lab ID: {patient?.lab_id || "-"}</Text>
          <Text style={styles.panelLine}>Phone: {patient?.phone || "-"}</Text>
          <Text style={styles.panelLine}>Sex: {patient?.sex || "-"}</Text>
          <Text style={styles.panelLine}>DOB: {formatDate(patient?.dob || null)}</Text>
          <Text style={styles.panelLine}>Address: {patient?.address || "-"}</Text>
          <Text style={styles.panelLine}>Sample ID: {bundle.sampleCode}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.eyebrow}>Clinical context</Text>
          <Text style={styles.panelLine}>
            Facility: {facility?.name || branding.labName}
          </Text>
          <Text style={styles.panelLine}>Priority: {priorityLabel}</Text>
          <Text style={styles.panelLine}>
            Total billed: {formatCurrency(bundle.totalAmount)}
          </Text>
          <Text style={styles.panelLine}>Notes: {notesLabel}</Text>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { width: "29%" }]}>Test</Text>
          <Text style={[styles.tableHeaderCell, { width: "19%" }]}>
            Order / Sample
          </Text>
          <Text style={[styles.tableHeaderCell, { width: "18%" }]}>Result</Text>
          <Text style={[styles.tableHeaderCell, { width: "22%" }]}>
            Reference range
          </Text>
          <Text style={[styles.tableHeaderCell, { borderRightWidth: 0, width: "12%" }]}>
            Flag
          </Text>
        </View>

        {bundle.rows.map((row, index) => (
          <View key={`${bundle.patientKey}-${row.sampleCode}-${index}`} style={styles.tableRow}>
            <View style={[styles.tableCell, { width: "29%" }]}>
              <Text>{row.testName}</Text>
              <Text style={styles.cellSubtext}>Unit: {row.unit}</Text>
            </View>
            <View style={[styles.tableCell, { width: "19%" }]}>
              <Text>{row.orderNumber}</Text>
              <Text style={styles.cellSubtext}>{row.sampleCode}</Text>
            </View>
            <Text style={[styles.tableCell, { width: "18%" }]}>{row.result}</Text>
            <Text style={[styles.tableCell, { width: "22%" }]}>
              {row.referenceRange}
            </Text>
            <Text
              style={[
                styles.tableCell,
                { borderRightWidth: 0, width: "12%" },
                row.flagCode ? styles.flagText : styles.normalText
              ]}
            >
              {row.flagCode ?? "-"}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerNote}>{branding.footerNote}</Text>

        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureText}>{branding.signatoryName}</Text>
          <Text style={styles.signatureText}>{branding.signatoryTitle}</Text>
        </View>
      </View>
    </Page>
  );
}

export function LaboratoryReportDocument({
  branding,
  orders
}: {
  branding: ReportBranding;
  orders: ReportOrderRow[];
}) {
  const bundles = buildPatientReportBundles(orders);

  return (
    <Document title="Laboratory report">
      {bundles.map((bundle) => (
        <ReportPage key={bundle.sampleKey} branding={branding} bundle={bundle} />
      ))}
    </Document>
  );
}
