"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileStack,
  Loader2,
  MessageSquareShare,
  Printer,
  Search,
  Send,
  ShieldAlert
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  buildPrintHtml,
  buildPatientReportBundles,
  buildReportBranding,
  buildResultRows,
  calculateOrderTotal,
  formatCurrency,
  formatDate,
  formatDateTime,
  isFullyReported,
  isReportableOrder,
  type ReportOrderRow
} from "@/features/reports/report-utils";
import { useToast } from "@/hooks/use-toast";
import { canAccessReportsRole } from "@/lib/guards";
import {
  cacheOrdersWithRelations,
  getReportsQueueLocal
} from "@/lib/offline-data";
import { resolveOfflineQuery } from "@/lib/offline-core";
import { markReportsReleasedOffline } from "@/lib/offline-mutations";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type ReportStatusFilter = "all" | "ready" | "reported" | "flagged";

async function fetchReportsQueue() {
  const supabase = getSupabaseBrowserClient();
  return resolveOfflineQuery<ReportOrderRow[]>({
    cacheKey: "reports-queue",
    offline: async () => (await getReportsQueueLocal()).filter(isReportableOrder),
    online: async () => {
      if (!supabase) {
        return (await getReportsQueueLocal()).filter(isReportableOrder);
      }

      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, facility_id, patient_id, order_number, priority, status, notes, reported_at, ordered_at, ordered_by, created_at, updated_at, facilities(id, name, code), patients(id, lab_id, name, phone, dob, sex, address), order_tests(id, order_id, test_id, sample_code, specimen_label, barcode_value, qr_value, status, collected_at, collected_by, in_progress_at, results_entered_at, verified_at, reported_at, created_at, updated_at, tests(*), order_test_results(*))"
        )
        .order("ordered_at", { ascending: false })
        .limit(60);

      if (error) {
        throw new Error(error.message);
      }

      await cacheOrdersWithRelations((data ?? []) as Record<string, unknown>[]);
      return ((data ?? []) as ReportOrderRow[]).filter(isReportableOrder);
    }
  });
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportsWorkspace() {
  const queryClient = useQueryClient();
  const { facilityId, loading, role, user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>("ready");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState<
    "download" | "bulk-download" | "print" | "bulk-print" | "placeholder" | null
  >(null);
  const [feedback, setFeedback] = useState<{
    error: string | null;
    success: string | null;
  }>({ error: null, success: null });

  const reportsQuery = useQuery({
    queryKey: ["reports-queue"],
    queryFn: fetchReportsQueue,
    enabled: Boolean(facilityId)
  });

  const branding = useMemo(
    () => buildReportBranding(reportsQuery.data?.[0]?.facilities?.name ?? null),
    [reportsQuery.data]
  );

  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return (reportsQuery.data ?? []).filter((order) => {
      const rows = buildResultRows(order);
      const matchesSearch =
        !needle ||
        [
          order.order_number,
          order.patients?.name,
          order.patients?.lab_id,
          order.patients?.phone,
          order.facilities?.name
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);

      if (!matchesSearch) {
        return false;
      }

      if (statusFilter === "reported") {
        return isFullyReported(order);
      }

      if (statusFilter === "ready") {
        return !isFullyReported(order);
      }

      if (statusFilter === "flagged") {
        return rows.some((row) => row.abnormal);
      }

      return true;
    });
  }, [reportsQuery.data, search, statusFilter]);

  const selectedOrder = useMemo(
    () =>
      filteredOrders.find((order) => order.id === selectedId) ??
      filteredOrders[0] ??
      null,
    [filteredOrders, selectedId]
  );

  const selectedOrders = useMemo(
    () => filteredOrders.filter((order) => selectedIds.includes(order.id)),
    [filteredOrders, selectedIds]
  );

  const selectedReportDateGroups = useMemo(() => {
    if (!selectedOrder) {
      return [];
    }

    const groups = new Map<string, ReturnType<typeof buildPatientReportBundles>>();
    buildPatientReportBundles([selectedOrder]).forEach((bundle) => {
      const dateLabel = formatDate(bundle.orderedAt);
      const current = groups.get(dateLabel) ?? [];
      current.push(bundle);
      groups.set(dateLabel, current);
    });

    return Array.from(groups.entries()).map(([dateLabel, bundles]) => ({
      bundles,
      dateLabel
    }));
  }, [selectedOrder]);

  const stats = useMemo(() => {
    const orders = reportsQuery.data ?? [];

    return {
      flagged: orders.filter((order) =>
        buildResultRows(order).some((row) => row.abnormal)
      ).length,
      ready: orders.filter((order) => !isFullyReported(order)).length,
      reported: orders.filter(isFullyReported).length
    };
  }, [reportsQuery.data]);

  useEffect(() => {
    if (!selectedId && filteredOrders.length > 0) {
      setSelectedId(filteredOrders[0].id);
    }
  }, [filteredOrders, selectedId]);

  useEffect(() => {
    if (selectedId && !filteredOrders.some((order) => order.id === selectedId)) {
      setSelectedId(filteredOrders[0]?.id ?? null);
    }
  }, [filteredOrders, selectedId]);

  const runReportAudit = async (
    orders: ReportOrderRow[],
    action: "report_downloaded" | "report_printed" | "report_delivery_placeholder"
  ) => {
    if (!facilityId) {
      return;
    }

    await markReportsReleasedOffline({
      action,
      actorId: user?.id ?? null,
      facilityId,
      orders
    });

    await queryClient.invalidateQueries({ queryKey: ["reports-queue"] });
  };

  const handleDownload = async (orders: ReportOrderRow[], bulk = false) => {
    if (orders.length === 0) {
      setFeedback({
        error: "Select at least one report-ready order first.",
        success: null
      });
      return;
    }

    try {
      setBusyAction(bulk ? "bulk-download" : "download");
      setFeedback({ error: null, success: null });

      const [{ pdf }, { LaboratoryReportDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/features/reports/report-pdf")
      ]);
      const blob = await pdf(
        <LaboratoryReportDocument branding={branding} orders={orders} />
      ).toBlob();

      const filename = bulk
        ? `lims-bulk-reports-${new Date().toISOString().slice(0, 10)}.pdf`
        : `${orders[0].order_number.toLowerCase()}-report.pdf`;

      triggerBrowserDownload(blob, filename);
      await runReportAudit(orders, "report_downloaded");

      setFeedback({
        error: null,
        success: bulk
          ? "Bulk PDF report downloaded successfully."
          : "Patient PDF report downloaded successfully."
      });
      toast({
        title: bulk ? "Bulk reports downloaded" : "Report downloaded",
        description: bulk
          ? `${orders.length} report(s) were downloaded successfully.`
          : `${orders[0].order_number} report PDF is ready.`,
        variant: "success"
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to generate the PDF report.";
      setFeedback({
        error: message,
        success: null
      });
      toast({
        title: "Report download failed",
        description: message,
        variant: "error"
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePrint = async (orders: ReportOrderRow[], bulk = false) => {
    if (orders.length === 0) {
      setFeedback({
        error: "Select at least one report-ready order first.",
        success: null
      });
      return;
    }

    try {
      setBusyAction(bulk ? "bulk-print" : "print");
      setFeedback({ error: null, success: null });

      const printWindow = window.open("", "_blank", "noopener,noreferrer");
      if (!printWindow) {
        throw new Error("The print window was blocked by the browser.");
      }

      printWindow.document.open();
      printWindow.document.write(buildPrintHtml(orders, branding));
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();

      await runReportAudit(orders, "report_printed");

      setFeedback({
        error: null,
        success: bulk
          ? "Bulk print view prepared successfully."
          : "Print-ready report opened successfully."
      });
      toast({
        title: bulk ? "Bulk print prepared" : "Print view opened",
        description: bulk
          ? `${orders.length} report(s) were prepared for printing.`
          : `${orders[0].order_number} opened in a print-ready format.`,
        variant: "success"
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to prepare print view.";
      setFeedback({
        error: message,
        success: null
      });
      toast({
        title: "Print preparation failed",
        description: message,
        variant: "error"
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeliveryPlaceholder = async (channel: "sms" | "whatsapp") => {
    if (!selectedOrder) {
      setFeedback({
        error: "Select a report before using the delivery placeholder.",
        success: null
      });
      return;
    }

    try {
      setBusyAction("placeholder");
      setFeedback({ error: null, success: null });
      await runReportAudit([selectedOrder], "report_delivery_placeholder");
      setFeedback({
        error: null,
        success:
          channel === "sms"
            ? "SMS placeholder logged. AfricasTalking wiring can be added next."
            : "WhatsApp placeholder logged. AfricasTalking wiring can be added next."
      });
      toast({
        title: channel === "sms" ? "SMS placeholder logged" : "WhatsApp placeholder logged",
        description: "Delivery integration can now be connected to AfricasTalking.",
        variant: "success"
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to store delivery placeholder audit entry.";
      setFeedback({
        error: message,
        success: null
      });
      toast({
        title: "Delivery placeholder failed",
        description: message,
        variant: "error"
      });
    } finally {
      setBusyAction(null);
    }
  };

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading reports workspace...
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
            Assign a facility before generating laboratory reports.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!canAccessReportsRole(role)) {
    return (
      <Card className="border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="h-5 w-5" />
            Reporting access is restricted
          </CardTitle>
          <CardDescription className="text-red-800">
            Only administrators, reception staff, and verifiers can release patient
            reports.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-blue-100 bg-white/95">
          <CardHeader className="pb-3">
            <CardDescription>Ready for release</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{stats.ready}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-emerald-100 bg-white/95">
          <CardHeader className="pb-3">
            <CardDescription>Already reported</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{stats.reported}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-amber-100 bg-white/95">
          <CardHeader className="pb-3">
            <CardDescription>Out-of-range findings</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{stats.flagged}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card className="border-blue-100 shadow-soft">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-slate-950">Medical-grade reporting workspace</CardTitle>
            <CardDescription>
              Generate professional PDFs, print verified reports, and prepare delivery
              workflows.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search order, patient, lab ID, phone"
                value={search}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["ready", "reported", "flagged", "all"] as ReportStatusFilter[]).map(
                (filter) => (
                  <Button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    size="sm"
                    type="button"
                    variant={statusFilter === filter ? "default" : "outline"}
                  >
                    {filter === "all"
                      ? "All"
                      : filter === "ready"
                        ? "Ready"
                        : filter === "reported"
                          ? "Reported"
                          : "Out of range"}
                  </Button>
                )
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <Button
              disabled={busyAction !== null || selectedOrders.length === 0}
              onClick={() => void handleDownload(selectedOrders, true)}
              type="button"
            >
              {busyAction === "bulk-download" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileStack className="h-4 w-4" />
              )}
              Bulk PDF download
            </Button>
            <Button
              disabled={busyAction !== null || selectedOrders.length === 0}
              onClick={() => void handlePrint(selectedOrders, true)}
              type="button"
              variant="outline"
            >
              {busyAction === "bulk-print" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Bulk print
            </Button>
            <Badge variant="outline" className="border-blue-200 bg-white text-slate-700">
              {selectedOrders.length} selected
            </Badge>
          </div>

          {feedback.error ? (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{feedback.error}</span>
            </div>
          ) : null}

          {feedback.success ? (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{feedback.success}</span>
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-4">
              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-slate-950">Verified orders</CardTitle>
                  <CardDescription>
                    Choose one or more orders to preview, print, or download.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {reportsQuery.isLoading ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                      Loading report-ready orders...
                    </div>
                  ) : null}

                  {reportsQuery.isError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-800">
                      {reportsQuery.error instanceof Error
                        ? reportsQuery.error.message
                        : "Unable to load report queue."}
                    </div>
                  ) : null}

                  {!reportsQuery.isLoading && filteredOrders.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                      No verified reports matched the current filters.
                    </div>
                  ) : null}

                  {filteredOrders.map((order) => {
                    const rows = buildResultRows(order);
                    const active = selectedOrder?.id === order.id;
                    const selected = selectedIds.includes(order.id);
                    const flagged = rows.some((row) => row.abnormal);

                    return (
                      <button
                        key={order.id}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          active
                            ? "border-blue-200 bg-blue-50/80"
                            : "border-slate-200 bg-white hover:border-blue-100 hover:bg-slate-50"
                        }`}
                        onClick={() => setSelectedId(order.id)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">
                              {order.patients?.name || "Unknown patient"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {order.order_number} · {order.patients?.lab_id || "No lab ID"}
                            </p>
                          </div>
                          <input
                            aria-label={`Select ${order.order_number}`}
                            checked={selected}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                            onChange={() =>
                              setSelectedIds((current) =>
                                current.includes(order.id)
                                  ? current.filter((id) => id !== order.id)
                                  : [...current, order.id]
                              )
                            }
                            onClick={(event) => event.stopPropagation()}
                            type="checkbox"
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant={isFullyReported(order) ? "secondary" : "default"}>
                            {isFullyReported(order) ? "Reported" : "Ready"}
                          </Badge>
                          <Badge variant="outline">{rows.length} results</Badge>
                          {flagged ? (
                            <Badge className="border-transparent bg-red-100 text-red-700">
                              Out of range
                            </Badge>
                          ) : null}
                        </div>

                        <p className="mt-3 text-xs text-slate-500">
                          Verified on{" "}
                          {formatDate(
                            order.order_tests.find((item) => item.verified_at)?.verified_at ??
                              null
                          )}
                        </p>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              {selectedOrder ? (
                <>
                  <Card className="border-blue-100 shadow-soft">
                    <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <CardTitle className="text-slate-950">
                          {selectedOrder.patients?.name || "Unknown patient"}
                        </CardTitle>
                        <CardDescription>
                          {selectedOrder.order_number} · {selectedOrder.facilities?.name || branding.labName}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline">
                          <Link href={`/results?orderId=${selectedOrder.id}`}>Edit results</Link>
                        </Button>
                        <Button
                          disabled={busyAction !== null}
                          onClick={() => void handleDownload([selectedOrder])}
                          type="button"
                        >
                          {busyAction === "download" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          Download PDF
                        </Button>
                        <Button
                          disabled={busyAction !== null}
                          onClick={() => void handlePrint([selectedOrder])}
                          type="button"
                          variant="outline"
                        >
                          {busyAction === "print" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Printer className="h-4 w-4" />
                          )}
                          Print
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-6">
                      <div className="rounded-[28px] border border-blue-100 bg-[linear-gradient(180deg,_rgba(255,255,255,1),_rgba(244,249,255,1))] p-6">
                        <div className="flex flex-col gap-5 border-b border-blue-100 pb-5 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-700 to-sky-400 text-lg font-semibold text-white shadow-soft">
                              LN
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-slate-950">
                                {branding.labName}
                              </p>
                              <p className="text-sm text-slate-500">
                                {selectedOrder.facilities?.code || branding.accreditation}
                              </p>
                              <p className="text-xs text-slate-500">{branding.address}</p>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-600">
                            <p>
                              <span className="font-medium text-slate-900">Reported:</span>{" "}
                              {formatDate(selectedOrder.reported_at || new Date().toISOString())}
                            </p>
                            <p>
                              <span className="font-medium text-slate-900">Order:</span>{" "}
                              {selectedOrder.order_number}
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                              Patient information
                            </p>
                            <div className="mt-3 space-y-2 text-sm text-slate-600">
                              <p>
                                <span className="font-medium text-slate-900">Name:</span>{" "}
                                {selectedOrder.patients?.name || "Unknown patient"}
                              </p>
                              <p>
                                <span className="font-medium text-slate-900">Lab ID:</span>{" "}
                                {selectedOrder.patients?.lab_id || "-"}
                              </p>
                              <p>
                                <span className="font-medium text-slate-900">Phone:</span>{" "}
                                {selectedOrder.patients?.phone || "-"}
                              </p>
                              <p>
                                <span className="font-medium text-slate-900">DOB:</span>{" "}
                                {formatDate(selectedOrder.patients?.dob || null)}
                              </p>
                              <p>
                                <span className="font-medium text-slate-900">Sex:</span>{" "}
                                {selectedOrder.patients?.sex || "-"}
                              </p>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                              Laboratory context
                            </p>
                            <div className="mt-3 space-y-2 text-sm text-slate-600">
                              <p>
                                <span className="font-medium text-slate-900">Priority:</span>{" "}
                                {selectedOrder.priority}
                              </p>
                              <p>
                                <span className="font-medium text-slate-900">Ordered:</span>{" "}
                                {formatDateTime(selectedOrder.ordered_at)}
                              </p>
                              <p>
                                <span className="font-medium text-slate-900">Notes:</span>{" "}
                                {selectedOrder.notes || "No additional notes recorded."}
                              </p>
                              <p>
                                <span className="font-medium text-slate-900">Order total:</span>{" "}
                                {formatCurrency(calculateOrderTotal(selectedOrder))}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 space-y-4">
                          {selectedReportDateGroups.map((group) => (
                            <div key={group.dateLabel} className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-950">
                                  {group.dateLabel}
                                </p>
                                <Badge variant="outline">
                                  {group.bundles.length} sample
                                  {group.bundles.length === 1 ? "" : "s"}
                                </Badge>
                              </div>
                              {group.bundles.map((bundle) => (
                                <div
                                  key={bundle.sampleKey}
                                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 bg-blue-50 px-4 py-3">
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                                        Sample ID
                                      </p>
                                      <p className="text-sm font-semibold text-slate-950">
                                        {bundle.sampleCode}
                                      </p>
                                    </div>
                                    <Badge variant="outline">
                                      {bundle.rows.length} test
                                      {bundle.rows.length === 1 ? "" : "s"}
                                    </Badge>
                                  </div>
                                  <div className="grid grid-cols-[1.6fr_1fr_0.7fr_1.2fr_0.8fr] gap-3 border-t border-blue-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                                    <span>Test</span>
                                    <span>Result</span>
                                    <span>Unit</span>
                                    <span>Reference range</span>
                                    <span>Flag</span>
                                  </div>
                                  {bundle.rows.map((row, index) => (
                                    <div
                                      key={`${bundle.sampleKey}-${row.orderTestId}-${index}`}
                                      className="grid grid-cols-[1.6fr_1fr_0.7fr_1.2fr_0.8fr] gap-3 border-t border-slate-100 px-4 py-4 text-sm text-slate-700"
                                    >
                                      <div>
                                        <p className="font-medium text-slate-950">
                                          {row.testName}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                          {row.orderNumber}
                                        </p>
                                      </div>
                                      <p className="font-medium text-slate-950">{row.result}</p>
                                      <p>{row.unit}</p>
                                      <p>{row.referenceRange}</p>
                                      <div>
                                        <Badge
                                          className={
                                            row.flagCode
                                              ? "border-transparent bg-red-100 text-red-700"
                                              : ""
                                          }
                                          variant="secondary"
                                        >
                                          {row.flagCode ?? "-"}
                                        </Badge>
                                        {row.abnormalReason ? (
                                          <p className="mt-2 text-xs text-red-700">
                                            {row.abnormalReason}
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>

                        <div className="mt-6 flex flex-col gap-6 border-t border-slate-100 pt-6 md:flex-row md:items-end md:justify-between">
                          <div className="max-w-xl text-sm text-slate-600">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                              Clinical note
                            </p>
                            <p className="mt-2">{branding.footerNote}</p>
                          </div>
                          <div className="min-w-[220px] border-t border-slate-900 pt-3 text-center text-sm text-slate-700">
                            <p className="font-medium text-slate-950">
                              {branding.signatoryName}
                            </p>
                            <p>{branding.signatoryTitle}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-base text-slate-950">
                        Delivery placeholders
                      </CardTitle>
                      <CardDescription>
                        AfricasTalking integration can plug into these actions once credentials
                        and templates are ready.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-3">
                      <Button
                        disabled={busyAction !== null}
                        onClick={() => void handleDeliveryPlaceholder("sms")}
                        type="button"
                        variant="outline"
                      >
                        {busyAction === "placeholder" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        SMS placeholder
                      </Button>
                      <Button
                        disabled={busyAction !== null}
                        onClick={() => void handleDeliveryPlaceholder("whatsapp")}
                        type="button"
                        variant="outline"
                      >
                        {busyAction === "placeholder" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MessageSquareShare className="h-4 w-4" />
                        )}
                        WhatsApp placeholder
                      </Button>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card className="border-slate-200">
                  <CardContent className="p-10 text-center text-sm text-slate-600">
                    Choose a verified order to preview its professional report.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <Separator />

          <p className="text-xs text-slate-500">
            Report release automatically writes to the audit trail and advances verified
            samples to the reported state.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
