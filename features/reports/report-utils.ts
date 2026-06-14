import {
  formatPanelResultValue,
  getReferenceRange,
  getResultFlagCode,
  type ResultFlagCode
} from "@/features/results/result-utils";
import type { Tables } from "@/types/supabase";

export type ReportOrderTest = Tables<"order_tests"> & {
  order_test_results: Tables<"order_test_results"> | null;
  tests: Tables<"tests"> | null;
};

export type ReportOrderRow = Tables<"orders"> & {
  facilities: Pick<Tables<"facilities">, "id" | "name" | "code"> | null;
  patients: Pick<
    Tables<"patients">,
    "id" | "lab_id" | "name" | "phone" | "dob" | "sex" | "address"
  > | null;
  order_tests: ReportOrderTest[];
};

export type ReportBranding = {
  accreditation: string;
  address: string;
  footerNote: string;
  labName: string;
  logoUrl?: string;
  signatoryName: string;
  signatoryTitle: string;
  supportLine: string;
};

export type ReportResultRow = {
  abnormal: boolean;
  abnormalReason: string | null;
  category: string;
  orderNumber: string;
  orderTestId: string;
  flagCode: ResultFlagCode;
  price: number;
  referenceRange: string;
  result: string;
  sampleCode: string;
  status: string;
  testName: string;
  unit: string;
};

export type PatientReportBundle = {
  facility: ReportOrderRow["facilities"];
  notes: string[];
  orderNumbers: string[];
  orderedAt: string | null;
  patient: ReportOrderRow["patients"];
  patientKey: string;
  priorities: string[];
  reportedAt: string | null;
  rows: ReportResultRow[];
  sampleCode: string;
  sampleKey: string;
  totalAmount: number;
};

export function formatCurrency(value: number | null | undefined) {
  const amount = new Intl.NumberFormat("en-NG", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(value ?? 0);

  return `N${amount}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function buildReportBranding(
  facilityName: string | null | undefined,
  logoUrl?: string
): ReportBranding {
  return {
    labName: facilityName || "LIMS Nigeria Diagnostics",
    accreditation: "ISO-aligned diagnostic workflow",
    address: "Clinical reporting suite, Lagos, Nigeria",
    supportLine: "support@lims.ng | +234 800 000 0000",
    footerNote:
      "Results should be interpreted alongside clinical findings and patient history.",
    signatoryName: "Authorized Verifier",
    signatoryTitle: "Head of Laboratory / Verifier",
    logoUrl
  };
}

export function formatResultValue(
  result: Tables<"order_test_results"> | null,
  test: Tables<"tests"> | null
) {
  if (!result) {
    return "Pending result entry";
  }

  const range = getReferenceRange(test?.reference_range ?? null);

  if (typeof result.value_numeric === "number") {
    return result.value_numeric.toString();
  }

  if (typeof result.value_boolean === "boolean") {
    const labels =
      range?.mode === "boolean"
        ? {
            positive: range.positive_label,
            negative: range.negative_label
          }
        : {
            positive: "Positive",
            negative: "Negative"
          };
    return result.value_boolean ? labels.positive : labels.negative;
  }

  if (result.value_text) {
    const range = getReferenceRange(test?.reference_range ?? null);
    if (range?.mode === "panel" && test) {
      return formatPanelResultValue(result.value_text, test);
    }

    return result.value_text;
  }

  return "Pending result entry";
}

export function formatReferenceRangeLabel(test: Tables<"tests"> | null) {
  const range = getReferenceRange(test?.reference_range ?? null);

  if (!range) {
    return "As documented by laboratory";
  }

  if (range.mode === "numeric") {
    const min =
      typeof range.min === "number" ? range.min.toString() : "-infinity";
    const max =
      typeof range.max === "number" ? range.max.toString() : "+infinity";

    return `${min} - ${max}`;
  }

  if (range.mode === "select") {
    return range.options.join(", ");
  }

  if (range.mode === "boolean") {
    const labels = {
      positive: range.positive_label,
      negative: range.negative_label
    };
    return `${labels.positive} / ${labels.negative}`;
  }

  if (range.mode === "panel") {
    return "See parameter ranges";
  }

  return range.text || "As documented by laboratory";
}

export function buildResultRows(order: ReportOrderRow): ReportResultRow[] {
  return (order.order_tests ?? [])
    .filter((orderTest) => Boolean(orderTest.order_test_results?.verified_at))
    .map((orderTest) => ({
      abnormal: orderTest.order_test_results?.abnormal_flag ?? false,
      abnormalReason: orderTest.order_test_results?.abnormal_reason ?? null,
      category: orderTest.tests?.category ?? "Uncategorized",
      flagCode: getResultFlagCode(orderTest.order_test_results, orderTest.tests),
      orderNumber: order.order_number,
      orderTestId: orderTest.id,
      price: Number(orderTest.tests?.price ?? 0),
      referenceRange: formatReferenceRangeLabel(orderTest.tests),
      result: formatResultValue(orderTest.order_test_results, orderTest.tests),
      sampleCode: orderTest.sample_code,
      status: formatStatusLabel(orderTest.status),
      testName: orderTest.tests?.name ?? "Unnamed test",
      unit: orderTest.tests?.unit ?? "-"
    }));
}

export function calculateOrderTotal(order: ReportOrderRow) {
  return (order.order_tests ?? []).reduce(
    (sum, orderTest) => sum + (orderTest.tests?.price ?? 0),
    0
  );
}

function mergeUnique(values: string[], nextValue: string | null | undefined) {
  if (!nextValue) {
    return values;
  }

  return values.includes(nextValue) ? values : [...values, nextValue];
}

function pickEarliestDate(
  current: string | null,
  nextValue: string | null | undefined
) {
  if (!nextValue) {
    return current;
  }

  if (!current) {
    return nextValue;
  }

  return new Date(nextValue).getTime() < new Date(current).getTime()
    ? nextValue
    : current;
}

function pickLatestDate(
  current: string | null,
  nextValue: string | null | undefined
) {
  if (!nextValue) {
    return current;
  }

  if (!current) {
    return nextValue;
  }

  return new Date(nextValue).getTime() > new Date(current).getTime()
    ? nextValue
    : current;
}

export function buildPatientReportBundles(
  orders: ReportOrderRow[]
): PatientReportBundle[] {
  const bundles = new Map<string, PatientReportBundle>();

  for (const order of orders) {
    const rows = buildResultRows(order);

    if (rows.length === 0) {
      continue;
    }

    const patientKey = order.patients?.id ?? `order-${order.id}`;

    const sampleCode = order.order_number || rows[0]?.sampleCode || "Unassigned";
    const sampleKey = `${patientKey}:${order.id}`;
    const existing = bundles.get(sampleKey);

    if (!existing) {
      bundles.set(sampleKey, {
        facility: order.facilities,
        notes: order.notes ? [order.notes] : [],
        orderNumbers: [order.order_number],
        orderedAt: order.ordered_at,
        patient: order.patients,
        patientKey,
        priorities: [order.priority],
        reportedAt: order.reported_at,
        rows,
        sampleCode,
        sampleKey,
        totalAmount: rows.reduce((sum, row) => sum + row.price, 0)
      });
      continue;
    }

    existing.notes = mergeUnique(existing.notes, order.notes);
    existing.orderNumbers = mergeUnique(existing.orderNumbers, order.order_number);
    existing.orderedAt = pickEarliestDate(existing.orderedAt, order.ordered_at);
    existing.priorities = mergeUnique(existing.priorities, order.priority);
    existing.reportedAt = pickLatestDate(existing.reportedAt, order.reported_at);
    existing.rows.push(...rows);
    existing.totalAmount += rows.reduce((sum, row) => sum + row.price, 0);

    if (!existing.facility && order.facilities) {
      existing.facility = order.facilities;
    }

    if (!existing.patient && order.patients) {
      existing.patient = order.patients;
    }
  }

  return Array.from(bundles.values()).map((bundle) => ({
    ...bundle,
    rows: bundle.rows.sort(
      (left, right) =>
        left.orderNumber.localeCompare(right.orderNumber) ||
        left.category.localeCompare(right.category) ||
        left.testName.localeCompare(right.testName)
    )
  })).sort(
    (left, right) =>
      (left.patient?.name ?? "").localeCompare(right.patient?.name ?? "") ||
      left.sampleCode.localeCompare(right.sampleCode)
  );
}

export function isReportableOrder(order: ReportOrderRow) {
  const rows = buildResultRows(order);
  return rows.length > 0;
}

export function isFullyReported(order: ReportOrderRow) {
  const reportableTests = (order.order_tests ?? []).filter(
    (orderTest) => Boolean(orderTest.order_test_results?.verified_at)
  );

  return (
    reportableTests.length > 0 &&
    reportableTests.every((orderTest) => orderTest.status === "Reported")
  );
}

export function groupReportRowsByCategory(rows: ReportResultRow[]) {
  const grouped = new Map<string, ReportResultRow[]>();

  for (const row of rows) {
    const category = row.category || "Uncategorized";
    grouped.set(category, [...(grouped.get(category) ?? []), row]);
  }

  return Array.from(grouped.entries()).sort(([left], [right]) =>
    left.localeCompare(right)
  );
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildPrintHtml(
  orders: ReportOrderRow[],
  branding: ReportBranding
) {
  const pages = buildPatientReportBundles(orders)
    .map((bundle) => {
      const patient = bundle.patient;
      const facility = bundle.facility;
      const orderLabel = bundle.orderNumbers.join(", ");
      const priorityLabel = bundle.priorities.join(", ");
      const notesLabel =
        bundle.notes.length > 0
          ? bundle.notes.join(" | ")
          : "No additional notes recorded.";

      const categoryTables = groupReportRowsByCategory(bundle.rows)
        .map(([category, rows]) => {
          const resultRows = rows
            .map(
              (row) => `
            <tr>
              <td>
                <strong>${escapeHtml(row.testName)}</strong>
                <div class="muted">Unit: ${escapeHtml(row.unit)}</div>
              </td>
              <td class="result-cell">${escapeHtml(row.result)}</td>
              <td>${escapeHtml(row.referenceRange)}</td>
              <td>${
                row.flagCode
                  ? `<span class=\\\"flag\\\">${escapeHtml(row.flagCode)}</span>`
                  : "<span class=\\\"normal\\\">-</span>"
              }</td>
            </tr>
          `
            )
            .join("");

          return `
            <section class="category-block">
              <h3>${escapeHtml(category)}</h3>
              <table>
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Result</th>
                    <th>Reference range</th>
                    <th>Flag</th>
                  </tr>
                </thead>
                <tbody>${resultRows}</tbody>
              </table>
            </section>
          `;
        })
        .join("");

      return `
        <section class="page">
          <header class="header">
            <div>
              <div class="logo">LN</div>
            </div>
            <div class="brand">
              <h1>${escapeHtml(branding.labName)}</h1>
              <p>${escapeHtml(facility?.code || "Medical laboratory report")}</p>
              <p>${escapeHtml(branding.address)}</p>
              <p>${escapeHtml(branding.supportLine)}</p>
            </div>
          </header>

          <div class="title-row">
            <div>
              <p class="eyebrow">Patient report</p>
              <h2>Verified laboratory findings</h2>
            </div>
            <div class="meta-card">
              <p><strong>Sample ID:</strong> ${escapeHtml(bundle.sampleCode)}</p>
              <p><strong>Orders:</strong> ${escapeHtml(orderLabel)}</p>
              <p><strong>Collected:</strong> ${escapeHtml(formatDate(bundle.orderedAt))}</p>
              <p><strong>Reported:</strong> ${escapeHtml(formatDate(bundle.reportedAt || new Date().toISOString()))}</p>
            </div>
          </div>

          <div class="grid">
            <div class="panel">
              <p class="eyebrow">Patient</p>
              <p><strong>Name:</strong> ${escapeHtml(patient?.name || "Unknown patient")}</p>
              <p><strong>Lab ID:</strong> ${escapeHtml(patient?.lab_id || "-")}</p>
              <p><strong>Phone:</strong> ${escapeHtml(patient?.phone || "-")}</p>
              <p><strong>Sex:</strong> ${escapeHtml(patient?.sex || "-")}</p>
              <p><strong>DOB:</strong> ${escapeHtml(formatDate(patient?.dob || null))}</p>
              <p><strong>Sample ID:</strong> ${escapeHtml(bundle.sampleCode)}</p>
            </div>
            <div class="panel">
              <p class="eyebrow">Clinical context</p>
              <p><strong>Facility:</strong> ${escapeHtml(facility?.name || branding.labName)}</p>
              <p><strong>Priority:</strong> ${escapeHtml(priorityLabel)}</p>
              <p><strong>Notes:</strong> ${escapeHtml(notesLabel)}</p>
              <p><strong>Total:</strong> ${escapeHtml(formatCurrency(bundle.totalAmount))}</p>
            </div>
          </div>

          ${categoryTables}

          <footer class="footer">
            <div>
              <p class="eyebrow">Interpretation note</p>
              <p>${escapeHtml(branding.footerNote)}</p>
            </div>
            <div class="signature">
              <div class="line"></div>
              <p>${escapeHtml(branding.signatoryName)}</p>
              <p>${escapeHtml(branding.signatoryTitle)}</p>
            </div>
          </footer>
        </section>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Laboratory report</title>
        <style>
          @page { size: A4; margin: 16mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; background: #f8fafc; }
          .page { background: white; padding: 28px; margin: 0 auto 24px; max-width: 840px; box-sizing: border-box; page-break-after: always; }
          .page:last-child { page-break-after: auto; }
          .header { display: flex; gap: 16px; align-items: center; border-bottom: 3px solid #0f4c81; padding-bottom: 16px; }
          .logo { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, #0f4c81, #5ab4ff); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; }
          .brand h1 { margin: 0 0 4px; font-size: 24px; }
          .brand p { margin: 2px 0; color: #475569; font-size: 12px; }
          .title-row { display: flex; justify-content: space-between; gap: 20px; margin: 24px 0; }
          .title-row h2 { margin: 4px 0 0; font-size: 22px; }
          .eyebrow { margin: 0; color: #0f4c81; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }
          .meta-card, .panel { border: 1px solid #dbeafe; border-radius: 16px; padding: 16px; background: #f8fbff; }
          .meta-card p, .panel p { margin: 6px 0; font-size: 13px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
          .category-block { break-inside: avoid; margin-bottom: 18px; }
          .category-block h3 { background: #0f4c81; border-radius: 10px 10px 0 0; color: white; font-size: 13px; letter-spacing: 0.08em; margin: 0; padding: 10px 12px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
          th { background: #eff6ff; color: #0f172a; text-align: left; font-size: 12px; padding: 12px; border-bottom: 1px solid #bfdbfe; }
          td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; vertical-align: top; }
          .result-cell { white-space: pre-line; }
          .muted { color: #64748b; font-size: 11px; margin-top: 3px; }
          .flag { color: #b91c1c; font-weight: 800; font-size: 14px; }
          .normal { color: #64748b; font-weight: 700; }
          .footer { display: flex; justify-content: space-between; gap: 24px; align-items: flex-end; }
          .footer p { margin: 4px 0; font-size: 12px; }
          .signature { min-width: 240px; text-align: center; }
          .line { height: 1px; background: #0f172a; margin-bottom: 10px; }
        </style>
      </head>
      <body>${pages}</body>
    </html>
  `;
}
