"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Loader2,
  UserPlus,
  Wallet
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatInventoryDate,
  getAlertSummary,
  type InventoryItemRow
} from "@/features/inventory/inventory-utils";
import {
  buildPaymentMethodBreakdown,
  buildRevenueSummary,
  buildRevenueTrend,
  buildTatStageMetrics,
  buildTatTrend,
  buildTodayOperationalSummary,
  buildTodayWorklistRows,
  buildTopTests,
  buildVolumeTrend,
  buildWorklistSummary,
  exportDashboardWorkbook,
  exportWorklistCsv,
  formatCurrency,
  type DashboardInvoiceRow,
  type DashboardPatientRow,
  type DashboardPaymentRow,
  type DashboardWorklistRow
} from "@/features/dashboard/dashboard-utils";
import { db } from "@/lib/dexie";
import {
  cacheInventoryItems,
  cacheInvoicesWithRelations,
  cacheOrderTestsWithRelations,
  cachePatients
} from "@/lib/offline-data";
import { resolveOfflineQuery } from "@/lib/offline-core";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type DashboardData = {
  inventoryItems: InventoryItemRow[];
  invoices: DashboardInvoiceRow[];
  patients: DashboardPatientRow[];
  payments: DashboardPaymentRow[];
  worklist: DashboardWorklistRow[];
};

type SummaryCardProps = {
  hint: string;
  icon: LucideIcon;
  label: string;
  tone?: "blue" | "emerald" | "amber";
  value: string;
};

const DashboardAnalyticsPanels = dynamic(
  () =>
    import("@/features/dashboard/dashboard-analytics-panels").then(
      (mod) => mod.DashboardAnalyticsPanels
    ),
  {
    ssr: false,
    loading: () => <DashboardAnalyticsLoading />
  }
);

function isToday(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

async function fetchDashboardData(): Promise<DashboardData> {
  const supabase = getSupabaseBrowserClient();
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 29);
  windowStart.setHours(0, 0, 0, 0);
  const startIso = windowStart.toISOString();

  return resolveOfflineQuery<DashboardData>({
    cacheKey: "dashboard-overview",
    offline: async () => {
      const [orderTests, invoices, payments, inventoryItems, patientsForWindow] = await Promise.all([
        db.order_tests.where("created_at").aboveOrEqual(startIso).reverse().limit(320).toArray(),
        db.invoices.where("issued_at").aboveOrEqual(startIso).reverse().limit(240).toArray(),
        db.invoice_payments
          .where("received_at")
          .aboveOrEqual(startIso)
          .reverse()
          .limit(320)
          .toArray(),
        db.inventory_items.orderBy("updated_at").reverse().limit(120).toArray(),
        db.patients.where("created_at").aboveOrEqual(startIso).reverse().limit(240).toArray()
      ]);

      const uniqueOrderIds = [...new Set(orderTests.map((row) => row.order_id))];
      const uniquePatientIds: string[] = [];
      const uniqueTestIds = [...new Set(orderTests.map((row) => row.test_id))];
      const orders = (await db.orders.bulkGet(uniqueOrderIds)).filter(
        (row): row is NonNullable<typeof row> => Boolean(row)
      );
      orders.forEach((row) => {
        if (!uniquePatientIds.includes(row.patient_id)) {
          uniquePatientIds.push(row.patient_id);
        }
      });
      const [patients, tests] = await Promise.all([
        db.patients.bulkGet(uniquePatientIds),
        db.tests.bulkGet(uniqueTestIds)
      ]);

      const orderMap = new Map(orders.map((row) => [row.id, row]));
      const patientMap = new Map(
        patients.filter((row): row is NonNullable<typeof row> => Boolean(row)).map((row) => [row.id, row])
      );
      const testMap = new Map(
        tests.filter((row): row is NonNullable<typeof row> => Boolean(row)).map((row) => [row.id, row])
      );

      return {
        inventoryItems: inventoryItems
          .filter((item) => item.is_active)
          .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
          .slice(0, 80),
        invoices: invoices
          .map((invoice) => ({
            amount_paid: invoice.amount_paid,
            id: invoice.id,
            issued_at: invoice.issued_at,
            payment_status: invoice.payment_status,
            total_amount: invoice.total_amount
          })),
        payments: payments
          .map((payment) => ({
            amount: payment.amount,
            payment_method: payment.payment_method,
            received_at: payment.received_at
          })),
        patients: patientsForWindow.map((patient) => ({
          created_at: patient.created_at,
          id: patient.id
        })),
        worklist: orderTests
          .map((row) => {
            const order = orderMap.get(row.order_id) ?? null;
            const patient = order ? patientMap.get(order.patient_id) ?? null : null;
            const test = testMap.get(row.test_id) ?? null;

            return {
              collected_at: row.collected_at,
              created_at: row.created_at,
              id: row.id,
              in_progress_at: row.in_progress_at,
              order_id: row.order_id,
              orders: order
                ? {
                    order_number: order.order_number,
                    ordered_at: order.ordered_at,
                    patients: patient
                      ? {
                          lab_id: patient.lab_id,
                          name: patient.name
                        }
                      : null,
                    priority: order.priority
                  }
                : null,
              reported_at: row.reported_at,
              results_entered_at: row.results_entered_at,
              sample_code: row.sample_code,
              specimen_label: row.specimen_label,
              status: row.status,
              tests: test ? { name: test.name } : null,
              updated_at: row.updated_at,
              verified_at: row.verified_at
            };
          })
      };
    },
    online: async () => {
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const [worklistResponse, invoicesResponse, paymentsResponse, inventoryResponse, patientsResponse] =
        await Promise.all([
          supabase
            .from("order_tests")
            .select(
              "id, order_id, test_id, sample_code, specimen_label, status, created_at, updated_at, collected_at, collected_by, in_progress_at, results_entered_at, verified_at, reported_at, tests(id, name), orders(id, patient_id, order_number, ordered_at, priority, patients(id, name, lab_id))"
            )
            .gte("created_at", startIso)
            .order("created_at", { ascending: false })
            .limit(320),
          supabase
            .from("invoices")
            .select("id, facility_id, order_id, invoice_number, subtotal, discount_amount, total_amount, amount_paid, payment_status, notes, issued_at, due_at, created_at, created_by, updated_at")
            .gte("issued_at", startIso)
            .order("issued_at", { ascending: false })
            .limit(240),
          supabase
            .from("invoice_payments")
            .select("id, facility_id, invoice_id, amount, payment_method, receipt_number, received_at, received_by, reference_number, notes, created_at")
            .gte("received_at", startIso)
            .order("received_at", { ascending: false })
            .limit(320),
          supabase
            .from("inventory_items")
            .select("*")
            .eq("is_active", true)
            .order("updated_at", { ascending: false })
            .limit(80),
          supabase
            .from("patients")
            .select("id, created_at")
            .gte("created_at", startIso)
            .order("created_at", { ascending: false })
            .limit(240)
        ]);

      if (worklistResponse.error) {
        throw new Error(worklistResponse.error.message);
      }

      if (invoicesResponse.error) {
        throw new Error(invoicesResponse.error.message);
      }

      if (paymentsResponse.error) {
        throw new Error(paymentsResponse.error.message);
      }

      if (inventoryResponse.error) {
        throw new Error(inventoryResponse.error.message);
      }

      if (patientsResponse.error) {
        throw new Error(patientsResponse.error.message);
      }

      await Promise.all([
        cacheOrderTestsWithRelations((worklistResponse.data ?? []) as Record<string, unknown>[]),
        cacheInvoicesWithRelations(
          (invoicesResponse.data ?? []).map((invoice) => ({
            ...invoice,
            invoice_items: [],
            invoice_payments: (paymentsResponse.data ?? []).filter(
              (payment) => payment.invoice_id === invoice.id
            ),
            orders: null
          })) as Record<string, unknown>[]
        ),
        cacheInventoryItems((inventoryResponse.data ?? []) as InventoryItemRow[]),
        cachePatients((patientsResponse.data ?? []) as Array<DashboardPatientRow & { id: string }>)
      ]);

      return {
        inventoryItems: (inventoryResponse.data ?? []) as InventoryItemRow[],
        invoices: (invoicesResponse.data ?? []) as DashboardInvoiceRow[],
        patients: (patientsResponse.data ?? []) as DashboardPatientRow[],
        payments: (paymentsResponse.data ?? []) as DashboardPaymentRow[],
        worklist: (worklistResponse.data ?? []) as DashboardWorklistRow[]
      };
    }
  });
}

function SummaryCard({ hint, icon: Icon, label, tone = "blue", value }: SummaryCardProps) {
  const toneClasses =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700"
        : "bg-blue-100 text-blue-700";

  return (
    <Card className="border-blue-100 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-600">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
            <p className="mt-2 text-sm text-slate-500">{hint}</p>
          </div>
          <div className={`rounded-2xl p-3 ${toneClasses}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartShell({
  actions,
  children,
  description,
  title
}: {
  actions?: ReactNode;
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card className="border-blue-100 shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-5 text-center text-sm text-slate-600">
      {message}
    </div>
  );
}

function DashboardAnalyticsLoading() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((section) => (
        <section
          key={section}
          className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]"
        >
          {[0, 1].map((card) => (
            <Card key={`${section}-${card}`} className="border-blue-100 shadow-sm">
              <CardHeader className="space-y-3">
                <Skeleton className="h-5 w-40 bg-blue-100" />
                <Skeleton className="h-4 w-64 bg-slate-100" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[320px] w-full rounded-2xl bg-slate-100" />
              </CardContent>
            </Card>
          ))}
        </section>
      ))}
    </div>
  );
}

export function DashboardOverview() {
  const { facilityId, loading } = useAuth();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingWorkbook, setExportingWorkbook] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard-overview", facilityId],
    queryFn: fetchDashboardData,
    enabled: Boolean(facilityId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  });

  const analytics = useMemo(() => {
    const worklist = dashboardQuery.data?.worklist ?? [];
    const invoices = dashboardQuery.data?.invoices ?? [];
    const patients = dashboardQuery.data?.patients ?? [];
    const payments = dashboardQuery.data?.payments ?? [];
    const inventoryItems = dashboardQuery.data?.inventoryItems ?? [];
    const activeWorklist = worklist.filter((item) => item.status !== "Reported");
    const todayWorklistRows = buildTodayWorklistRows(activeWorklist);
    const alertItems = inventoryItems
      .map((item) => ({ item, alert: getAlertSummary(item) }))
      .filter(
        (entry): entry is { alert: NonNullable<ReturnType<typeof getAlertSummary>>; item: InventoryItemRow } =>
          Boolean(entry.alert)
      )
      .sort((left, right) => {
        const leftWeight = left.alert.severity === "high" ? 0 : 1;
        const rightWeight = right.alert.severity === "high" ? 0 : 1;
        return leftWeight - rightWeight;
      });

    const revenueSummary = buildRevenueSummary(invoices, payments);
    const todayOperationalSummary = buildTodayOperationalSummary(worklist, patients);
    const worklistSummary = buildWorklistSummary(activeWorklist);
    const tatStageMetrics = buildTatStageMetrics(worklist);
    const tatTrend = buildTatTrend(worklist, 14);
    const volumeTrend = buildVolumeTrend(worklist, 14);
    const topTests = buildTopTests(worklist, 6);
    const revenueTrend = buildRevenueTrend(payments, 14);
    const paymentMethodBreakdown = buildPaymentMethodBreakdown(payments);
    const todayRevenue = payments
      .filter((payment) => isToday(payment.received_at))
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const averageReportingTat =
      tatStageMetrics.find((metric) => metric.label === "Reporting")?.averageHours ?? 0;

    return {
      alertItems,
      averageReportingTat,
      inventoryItems,
      paymentMethodBreakdown,
      revenueSummary,
      revenueTrend,
      tatStageMetrics,
      tatTrend,
      todayOperationalSummary,
      todayRevenue,
      todayWorklistRows,
      topTests,
      volumeTrend,
      worklistSummary
    };
  }, [dashboardQuery.data]);

  const summaryCards = useMemo(
    () => [
      {
        hint: "Samples physically collected today.",
        icon: FlaskConical,
        label: "Samples collected today",
        tone: "blue" as const,
        value: String(analytics.todayOperationalSummary.samplesCollected)
      },
      {
        hint: "Patient records opened today.",
        icon: UserPlus,
        label: "Patients registered today",
        tone: "blue" as const,
        value: String(analytics.todayOperationalSummary.patientsRegistered)
      },
      {
        hint: "Tests verified today and ready for reporting.",
        icon: CheckCircle2,
        label: "Tests verified today",
        tone: "amber" as const,
        value: String(analytics.todayOperationalSummary.testsVerified)
      },
      {
        hint: "Tests released as reports today.",
        icon: Activity,
        label: "Tests reported today",
        tone: "emerald" as const,
        value: String(analytics.todayOperationalSummary.testsReported)
      },
      {
        hint: "Payments received since midnight.",
        icon: Wallet,
        label: "Today's revenue",
        tone: "emerald" as const,
        value: formatCurrency(analytics.todayRevenue)
      },
      {
        hint: "Average hours from registration to report release.",
        icon: Clock3,
        label: "Average reporting TAT",
        tone: "emerald" as const,
        value: `${analytics.averageReportingTat.toFixed(1)} hrs`
      }
    ],
    [analytics]
  );

  const handleExportCsv = async () => {
    setExportError(null);
    setExportingCsv(true);

    try {
      await exportWorklistCsv(analytics.todayWorklistRows);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Unable to export today's worklist.");
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportWorkbook = async () => {
    setExportError(null);
    setExportingWorkbook(true);

    try {
      await exportDashboardWorkbook({
        paymentMethods: analytics.paymentMethodBreakdown,
        revenueSummary: analytics.revenueSummary,
        revenueTrend: analytics.revenueTrend,
        tatStages: analytics.tatStageMetrics,
        tatTrend: analytics.tatTrend,
        topTests: analytics.topTests,
        volumeTrend: analytics.volumeTrend,
        worklistRows: analytics.todayWorklistRows
      });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Unable to export dashboard workbook.");
    } finally {
      setExportingWorkbook(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading dashboard...
        </CardContent>
      </Card>
    );
  }

  if (!facilityId) {
    return (
      <Card className="border-amber-200 bg-amber-50/80">
        <CardHeader>
          <CardTitle className="text-amber-950">Facility assignment required</CardTitle>
          <CardDescription className="text-amber-900">
            Assign a facility before using operational dashboards and analytics.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <Card className="border-red-200 bg-red-50/80">
        <CardHeader>
          <CardTitle className="text-red-950">Dashboard data could not load</CardTitle>
          <CardDescription className="text-red-900">
            {dashboardQuery.error instanceof Error
              ? dashboardQuery.error.message
              : "Unable to load dashboard analytics."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-blue-100 bg-gradient-to-r from-slate-950 via-blue-950 to-blue-900 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <Badge className="bg-white/10 text-white hover:bg-white/10">
              Operations dashboard
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              Keep the lab moving from intake to cash collection
            </h1>
            <p className="mt-3 text-sm leading-6 text-blue-100">
              Monitor today&apos;s worklist, turnaround time, testing demand, inventory pressure,
              and revenue from one operational view.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleExportCsv}
              disabled={exportingCsv || analytics.todayWorklistRows.length === 0}
            >
              {exportingCsv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export CSV
            </Button>
            <Button
              type="button"
              className="bg-white text-slate-950 hover:bg-blue-50"
              onClick={handleExportWorkbook}
              disabled={exportingWorkbook}
            >
              {exportingWorkbook ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Export Excel
            </Button>
          </div>
        </div>

        {exportError ? (
          <div className="mt-4 rounded-2xl border border-red-200/70 bg-red-50 px-4 py-3 text-sm text-red-800">
            {exportError}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((card) => (
          <SummaryCard key={card.label} {...card} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <ChartShell
          title="Today's worklist"
          description="Open samples created today, prioritized for bench flow and verifier attention."
          actions={
            <Badge variant="outline" className="border-blue-200 text-blue-700">
              {analytics.worklistSummary.urgent} urgent/stat sample(s)
            </Badge>
          }
        >
          {dashboardQuery.isLoading ? (
            <EmptyChartState message="Loading today's worklist..." />
          ) : analytics.todayWorklistRows.length === 0 ? (
            <EmptyChartState message="No active samples have been registered today yet." />
          ) : (
            <div className="space-y-3">
              {analytics.todayWorklistRows.map((row) => (
                <div
                  key={`${row.orderNumber}-${row.sampleCode}`}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">{row.patient}</p>
                        <Badge variant={row.priority === "routine" ? "outline" : "secondary"}>
                          {row.priority}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {row.test} / {row.sampleCode}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.orderNumber} / {row.createdAt}
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit border-slate-200 text-slate-700">
                      {row.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartShell>

        <ChartShell
          title="Inventory alerts"
          description="Consumables and reagents needing attention before they interrupt daily testing."
        >
          {dashboardQuery.isLoading ? (
            <EmptyChartState message="Loading inventory alerts..." />
          ) : analytics.alertItems.length === 0 ? (
            <EmptyChartState message="No low stock or near-expiry items need action right now." />
          ) : (
            <div className="space-y-3">
              {analytics.alertItems.slice(0, 6).map(({ item, alert }) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={
                        alert.severity === "high"
                          ? "rounded-2xl bg-red-100 p-2 text-red-700"
                          : "rounded-2xl bg-amber-100 p-2 text-amber-700"
                      }
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">{item.name}</p>
                      <p className="mt-1 text-sm text-slate-600">{alert.description}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        Lot {item.lot_number || "N/A"} / Expiry {formatInventoryDate(item.expiry_date)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartShell>
      </section>

      <DashboardAnalyticsPanels
        loading={dashboardQuery.isLoading}
        paymentMethodBreakdown={analytics.paymentMethodBreakdown}
        revenueSummary={analytics.revenueSummary}
        revenueTrend={analytics.revenueTrend}
        tatStageMetrics={analytics.tatStageMetrics}
        tatTrend={analytics.tatTrend}
        topTests={analytics.topTests}
        volumeTrend={analytics.volumeTrend}
      />
    </div>
  );
}
