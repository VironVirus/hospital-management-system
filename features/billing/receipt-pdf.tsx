"use client";

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View
} from "@react-pdf/renderer";
import type { BillingInvoiceRow } from "@/features/billing/billing-utils";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getBalanceDue
} from "@/features/billing/billing-utils";

const THERMAL_WIDTH = 226.77;

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontFamily: "Helvetica",
    fontSize: 8.5,
    paddingBottom: 14,
    paddingHorizontal: 12,
    paddingTop: 12
  },
  header: {
    alignItems: "center",
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 1,
    paddingBottom: 10
  },
  logoFallback: {
    alignItems: "center",
    backgroundColor: "#0f4c81",
    borderRadius: 10,
    color: "#ffffff",
    display: "flex",
    fontSize: 14,
    fontWeight: 700,
    height: 30,
    justifyContent: "center",
    marginBottom: 6,
    textAlign: "center",
    width: 30
  },
  brandTitle: {
    fontSize: 10.5,
    fontWeight: 700,
    textAlign: "center"
  },
  brandMeta: {
    color: "#475569",
    fontSize: 7.5,
    marginTop: 2,
    textAlign: "center"
  },
  title: {
    fontSize: 9.5,
    fontWeight: 700,
    marginTop: 10,
    textAlign: "center"
  },
  section: {
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    paddingVertical: 8
  },
  sectionTitle: {
    color: "#0f4c81",
    fontSize: 7.25,
    fontWeight: 700,
    letterSpacing: 0.8,
    marginBottom: 5,
    textTransform: "uppercase"
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3
  },
  lineLabel: {
    color: "#475569",
    fontSize: 7.75,
    paddingRight: 8
  },
  lineValue: {
    fontSize: 7.75,
    textAlign: "right"
  },
  itemsHeader: {
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingBottom: 4
  },
  itemsRow: {
    borderBottomColor: "#f1f5f9",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingVertical: 5
  },
  itemsHeaderText: {
    color: "#334155",
    fontSize: 7,
    fontWeight: 700
  },
  itemCell: {
    fontSize: 7.5
  },
  itemName: {
    fontSize: 7.5,
    paddingRight: 6
  },
  totalsSection: {
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 1,
    paddingVertical: 8
  },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4
  },
  totalLabel: {
    color: "#334155",
    fontSize: 8
  },
  totalValue: {
    fontSize: 8,
    textAlign: "right"
  },
  totalStrong: {
    fontSize: 8.5,
    fontWeight: 700
  },
  footer: {
    color: "#475569",
    fontSize: 7.25,
    marginTop: 10,
    textAlign: "center"
  }
});

export function ReceiptDocument({
  invoice,
  payment
}: {
  invoice: BillingInvoiceRow;
  payment: NonNullable<BillingInvoiceRow["invoice_payments"]>[number];
}) {
  const patient = invoice.orders?.patients;
  const facility = invoice.orders?.facilities;
  const items = invoice.invoice_items ?? [];
  const pageHeight = Math.max(360, 290 + items.length * 26);

  return (
    <Document title="Payment receipt">
      <Page size={[THERMAL_WIDTH, pageHeight]} style={styles.page}>
        <View style={styles.header}>
          <View style={styles.logoFallback}>
            <Text>SG</Text>
          </View>
          <Text style={styles.brandTitle}>
            {facility?.name || "St Gianna Specialist Hospital"}
          </Text>
          <Text style={styles.brandMeta}>
            {facility?.code || "Clinical laboratory billing desk"}
          </Text>
          <Text style={styles.brandMeta}>Official thermal receipt</Text>
          <Text style={styles.title}>PAYMENT RECEIPT</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Receipt Details</Text>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Receipt No.</Text>
            <Text style={styles.lineValue}>{payment.receipt_number}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Invoice No.</Text>
            <Text style={styles.lineValue}>{invoice.invoice_number}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Date</Text>
            <Text style={styles.lineValue}>{formatDateTime(payment.received_at)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Method</Text>
            <Text style={styles.lineValue}>{payment.payment_method}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Status</Text>
            <Text style={styles.lineValue}>{invoice.payment_status}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Patient / Order</Text>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Patient</Text>
            <Text style={styles.lineValue}>{patient?.name || "Unknown patient"}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Lab ID</Text>
            <Text style={styles.lineValue}>{patient?.lab_id || "-"}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Phone</Text>
            <Text style={styles.lineValue}>{patient?.phone || "-"}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Order No.</Text>
            <Text style={styles.lineValue}>{invoice.orders?.order_number || "-"}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Ordered</Text>
            <Text style={styles.lineValue}>
              {formatDate(invoice.orders?.ordered_at || null)}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Billed Tests</Text>
          <View style={styles.itemsHeader}>
            <Text style={[styles.itemsHeaderText, { width: "50%" }]}>Test</Text>
            <Text style={[styles.itemsHeaderText, { textAlign: "right", width: "12%" }]}>
              Qty
            </Text>
            <Text style={[styles.itemsHeaderText, { textAlign: "right", width: "18%" }]}>
              Rate
            </Text>
            <Text style={[styles.itemsHeaderText, { textAlign: "right", width: "20%" }]}>
              Total
            </Text>
          </View>

          {items.map((item) => (
            <View key={item.id} style={styles.itemsRow}>
              <Text style={[styles.itemName, { width: "50%" }]}>{item.test_name}</Text>
              <Text style={[styles.itemCell, { textAlign: "right", width: "12%" }]}>
                {item.quantity}
              </Text>
              <Text style={[styles.itemCell, { textAlign: "right", width: "18%" }]}>
                {formatCurrency(item.unit_price)}
              </Text>
              <Text style={[styles.itemCell, { textAlign: "right", width: "20%" }]}>
                {formatCurrency(item.line_total)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsSection}>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Invoice total</Text>
            <Text style={styles.totalValue}>{formatCurrency(invoice.total_amount)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Paid now</Text>
            <Text style={styles.totalValue}>{formatCurrency(payment.amount)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Balance due</Text>
            <Text style={styles.totalValue}>{formatCurrency(getBalanceDue(invoice))}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={[styles.totalLabel, styles.totalStrong]}>Acknowledged</Text>
            <Text style={[styles.totalValue, styles.totalStrong]}>
              {formatCurrency(payment.amount)}
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          This thermal receipt confirms payment collection for the billed laboratory
          services. Keep it for reconciliation and patient support.
        </Text>
      </Page>
    </Document>
  );
}
