"use client";

import dynamic from "next/dynamic";
import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  CreditCard,
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
import { getAppClient } from "@/lib/app-client";

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

async function fetchDashboardData(facilityId: string): Promise<DashboardData> {
  const database = getAppClient();
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 29);
  windowStart.setHours(0, 0, 0, 0);
  const startIso = windowStart.toISOString();

  if (!database) {
    throw new Error("Service unavailable.");
  }

  const [
    worklistResponse,
    invoicesResponse,
    paymentsResponse,
    inventoryResponse,
    patientsResponse
  ] = await Promise.all([
      database
        .from("order_tests")
        .select(
          "id, order_id, test_id, sample_code, specimen_label, status, created_at, updated_at, collected_at, collected_by, in_progress_at, results_entered_at, verified_at, reported_at, tests(id, name), orders(id, facility_id, patient_id, order_number, ordered_at, priority, facilities(id, name, code), patients(id, name, lab_id))"
        )
        .eq("orders.facility_id", facilityId)
        .gte("created_at", startIso)
        .order("created_at", { ascending: false })
        .limit(320),
      database
        .from("invoices")
        .select("id, facility_id, order_id, invoice_number, subtotal, discount_amount, total_amount, amount_paid, payment_status, notes, issued_at, due_at, created_at, created_by, updated_at")
        .eq("facility_id", facilityId)
        .gte("issued_at", startIso)
        .order("issued_at", { ascending: false })
        .limit(240),
      database
        .from("invoice_payments")
        .select("id, facility_id, invoice_id, amount, payment_method, receipt_number, received_at, received_by, reference_number, notes, created_at")
        .eq("facility_id", facilityId)
        .gte("received_at", startIso)
        .order("received_at", { ascending: false })
        .limit(320),
      database
        .from("inventory_items")
        .select("*")
        .eq("facility_id", facilityId)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(80),
      database
        .from("patients")
        .select("id, facility_id, created_at")
        .eq("facility_id", facilityId)
        .gte("created_at", startIso)
        .order("created_at", { ascending: false })
        .limit(240),
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

  return {
    inventoryItems: (inventoryResponse.data ?? []) as InventoryItemRow[],
    invoices: (invoicesResponse.data ?? []) as DashboardInvoiceRow[],
    patients: (patientsResponse.data ?? []) as DashboardPatientRow[],
    payments: (paymentsResponse.data ?? []) as DashboardPaymentRow[],
    worklist: (worklistResponse.data ?? []) as DashboardWorklistRow[]
  };
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

function ActivityNotificationsPanel({
  alertItems,
  invoices,
  worklist
}: {
  alertItems: Array<{
    alert: NonNullable<ReturnType<typeof getAlertSummary>>;
    item: InventoryItemRow;
  }>;
  invoices: DashboardInvoiceRow[];
  worklist: DashboardWorklistRow[];
}) {
  const pendingVerification = worklist.filter(
    (item) => item.status === "Results_Entered"
  ).length;
  const unpaidInvoices = invoices.filter(
    (invoice) => invoice.payment_status === "Unpaid" || invoice.payment_status === "Partial"
  );
  const unpaidAmount = unpaidInvoices.reduce(
    (sum, invoice) =>
      sum + Math.max(Number(invoice.total_amount) - Number(invoice.amount_paid), 0),
    0
  );
  const criticalStock = alertItems.filter(
    ({ alert }) => alert.severity === "high"
  ).length;

  const notifications = [
    {
      href: "/results",
      icon: CheckCircle2,
      severity: pendingVerification > 0 ? "warning" : "info",
      title: "Pending HOD verification",
      value: `${pendingVerification} result(s)`,
      description:
        pendingVerification > 0
          ? "Results entered by the bench and waiting for HOD of Lab / Chief Scientist approval."
          : "No result is waiting for verification right now."
    },
    {
      href: "/inventory",
      icon: AlertTriangle,
      severity: criticalStock > 0 ? "critical" : alertItems.length > 0 ? "warning" : "info",
      title: "Inventory alerts",
      value: `${alertItems.length} item(s)`,
      description:
        alertItems.length > 0
          ? `${criticalStock} critical item(s), including low stock, expired, or near-expiry reagents.`
          : "No low-stock or near-expiry item is currently flagged."
    },
    {
      href: "/billing",
      icon: CreditCard,
      severity: unpaidInvoices.length > 0 ? "warning" : "info",
      title: "Unpaid invoices",
      value: formatCurrency(unpaidAmount),
      description:
        unpaidInvoices.length > 0
          ? `${unpaidInvoices.length} invoice(s) still need payment follow-up.`
          : "All visible invoices in the dashboard window are settled."
    }
  ];

  return (
    <Card className="border-blue-100 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-blue-700" />
          Activity notifications
        </CardTitle>
        <CardDescription>
          Live action items for verification, stock pressure, expiry risk, and receivables.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-3">
        {notifications.map((notification) => {
          const Icon = notification.icon;
          const tone =
            notification.severity === "critical"
              ? "border-red-200 bg-red-50 text-red-800"
              : notification.severity === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-blue-100 bg-blue-50 text-blue-800";

          return (
            <Link
              key={notification.title}
              href={notification.href as Route}
              className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${tone}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{notification.title}</p>
                  <p className="mt-2 text-2xl font-semibold">{notification.value}</p>
                </div>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-xs leading-5 opacity-90">{notification.description}</p>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function DashboardOverview() {
  const { facilityId, loading } = useAuth();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingWorkbook, setExportingWorkbook] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard-overview", facilityId],
    queryFn: () => fetchDashboardData(facilityId as string),
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
          <CardTitle className="text-amber-950">Access unavailable</CardTitle>
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
            <h1 className="text-3xl font-semibold tracking-tight">Laboratory</h1>
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

      <ActivityNotificationsPanel
        alertItems={analytics.alertItems}
        invoices={dashboardQuery.data?.invoices ?? []}
        worklist={dashboardQuery.data?.worklist ?? []}
      />

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <ChartShell
          title="Today's worklist"
          description="Open samples created today, prioritized for bench flow and HOD/chief scientist attention."
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
