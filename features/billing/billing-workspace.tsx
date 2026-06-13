"use client";

import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileText,
  Loader2,
  Printer,
  Search,
  ShieldAlert,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buildInvoicePrintHtml,
  formatCurrency,
  formatDate,
  formatDateTime,
  getBalanceDue,
  getPaymentStatusTone,
  isToday,
  matchesInvoiceSearch,
  paymentMethodOptions,
  type BillingInvoiceRow,
  type InvoicePaymentStatus
} from "@/features/billing/billing-utils";
import { useToast } from "@/hooks/use-toast";
import { canAccessBillingRole, canManageBillingRole } from "@/lib/guards";
import { commitLocalMutation, resolveOfflineQuery } from "@/lib/offline-core";
import { cacheInvoicesWithRelations, getInvoicesLocal } from "@/lib/offline-data";
import { queueAuditLog, recordInvoicePaymentOffline } from "@/lib/offline-mutations";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Json, TablesUpdate } from "@/types/supabase";

type PaymentFormState = {
  amount: number;
  method: string;
  notes: string;
  referenceNumber: string;
};

type PaymentDateFilter = "all" | "today" | "this_week";

const initialPaymentFormState: PaymentFormState = {
  amount: 0,
  method: paymentMethodOptions[0],
  notes: "",
  referenceNumber: ""
};

async function fetchInvoices() {
  const supabase = getSupabaseBrowserClient();
  return resolveOfflineQuery<BillingInvoiceRow[]>({
    cacheKey: "billing-invoices",
    offline: () => getInvoicesLocal(),
    online: async () => {
      if (!supabase) {
        return getInvoicesLocal();
      }

      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, facility_id, order_id, invoice_number, subtotal, discount_amount, total_amount, amount_paid, payment_status, notes, issued_at, due_at, created_at, created_by, updated_at, orders(id, facility_id, patient_id, order_number, ordered_at, priority, status, reported_at, created_at, updated_at, facilities(id, name, code), patients(id, name, lab_id, phone)), invoice_items(id, invoice_id, order_test_id, test_name, quantity, unit_price, line_total, created_at), invoice_payments(id, facility_id, invoice_id, receipt_number, amount, payment_method, reference_number, notes, received_at, received_by, created_at)"
        )
        .order("issued_at", { ascending: false })
        .limit(120);

      if (error) {
        throw new Error(error.message);
      }

      await cacheInvoicesWithRelations((data ?? []) as Record<string, unknown>[]);
      return (data ?? []) as BillingInvoiceRow[];
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

export function BillingWorkspace() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { facilityId, loading, role, user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<"all" | InvoicePaymentStatus>("all");
  const [dateFilter, setDateFilter] = useState<PaymentDateFilter>("all");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(initialPaymentFormState);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceDueAt, setInvoiceDueAt] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSuccess, setInvoiceSuccess] = useState<string | null>(null);
  const patientIdFilter = searchParams.get("patientId");

  const canAccessBilling = canAccessBillingRole(role);
  const canManageBilling = canManageBillingRole(role);

  const invoicesQuery = useQuery({
    queryKey: ["billing-invoices"],
    queryFn: fetchInvoices,
    enabled: canAccessBilling && Boolean(facilityId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  });

  const filteredInvoices = useMemo(() => {
    return (invoicesQuery.data ?? []).filter((invoice) => {
      if (!matchesInvoiceSearch(invoice, deferredSearch)) {
        return false;
      }

      if (statusFilter !== "all" && invoice.payment_status !== statusFilter) {
        return false;
      }

      if (patientIdFilter && invoice.orders?.patient_id !== patientIdFilter) {
        return false;
      }

      if (dateFilter === "today") {
        return isToday(invoice.issued_at);
      }

      if (dateFilter === "this_week") {
        const issued = new Date(invoice.issued_at);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return issued >= sevenDaysAgo;
      }

      return true;
    });
  }, [dateFilter, deferredSearch, invoicesQuery.data, patientIdFilter, statusFilter]);

  const selectedInvoice = useMemo(
    () =>
      filteredInvoices.find((invoice) => invoice.id === selectedInvoiceId) ??
      (invoicesQuery.data ?? []).find((invoice) => invoice.id === selectedInvoiceId) ??
      filteredInvoices[0] ??
      null,
    [filteredInvoices, invoicesQuery.data, selectedInvoiceId]
  );

  useEffect(() => {
    if (!selectedInvoiceId && filteredInvoices.length > 0) {
      setSelectedInvoiceId(filteredInvoices[0].id);
    }
  }, [filteredInvoices, selectedInvoiceId]);

  useEffect(() => {
    if (!patientIdFilter || filteredInvoices.length === 0) {
      return;
    }

    if (!filteredInvoices.some((invoice) => invoice.id === selectedInvoiceId)) {
      setSelectedInvoiceId(filteredInvoices[0].id);
    }
  }, [filteredInvoices, patientIdFilter, selectedInvoiceId]);

  useEffect(() => {
    if (!selectedInvoice) {
      return;
    }

    setInvoiceNotes(selectedInvoice.notes ?? "");
    setInvoiceDueAt(selectedInvoice.due_at ? selectedInvoice.due_at.slice(0, 10) : "");
    setPaymentForm((current) => ({
      ...current,
      amount: getBalanceDue(selectedInvoice)
    }));
  }, [selectedInvoice]);

  const summary = useMemo(() => {
    const invoices = invoicesQuery.data ?? [];
    const payments = invoices.flatMap((invoice) => invoice.invoice_payments ?? []);

    return {
      billed: invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount), 0),
      outstanding: invoices.reduce((sum, invoice) => sum + getBalanceDue(invoice), 0),
      todayRevenue: payments
        .filter((payment) => isToday(payment.received_at))
        .reduce((sum, payment) => sum + Number(payment.amount), 0),
      unpaidCount: invoices.filter((invoice) => invoice.payment_status !== "Paid").length
    };
  }, [invoicesQuery.data]);

  const writeAuditLog = async (
    action: string,
    entityId: string,
    payload: Record<string, unknown>
  ) => {
    if (!facilityId) {
      return;
    }

    await queueAuditLog({
      action,
      actorId: user?.id ?? null,
      entityId,
      entityTable: "invoices",
      facilityId: facilityId as string,
      payload: payload as Json
    });
  };

  const handlePrintInvoice = (invoice: BillingInvoiceRow) => {
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      toast({
        title: "Print blocked",
        description: "Allow popups in the browser to print this invoice.",
        variant: "error"
      });
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildInvoicePrintHtml(invoice));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleInvoiceUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedInvoice) {
      return;
    }

    try {
      setSavingInvoice(true);
      setInvoiceError(null);
      const updatePayload: TablesUpdate<"invoices"> = {
        due_at: invoiceDueAt || null,
        notes: invoiceNotes.trim() || null,
        updated_at: new Date().toISOString()
      };

      await commitLocalMutation({
        action: "update",
        critical: true,
        entity: "invoices",
        facilityId: activeFacilityId,
        payload: updatePayload,
        recordId: selectedInvoice.id,
        userId: user?.id ?? null
      });

      await writeAuditLog("invoice_updated", selectedInvoice.id, {
        due_at: updatePayload.due_at,
        notes: updatePayload.notes
      });

      setInvoiceSuccess("Invoice details updated successfully.");
      toast({
        title: "Invoice updated",
        description: `${selectedInvoice.invoice_number} details were saved successfully.`,
        variant: "success"
      });
      await queryClient.invalidateQueries({ queryKey: ["billing-invoices"] });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update invoice details.";
      setInvoiceError(message);
      toast({
        title: "Invoice update failed",
        description: message,
        variant: "error"
      });
    } finally {
      setSavingInvoice(false);
    }
  };

  const handlePaymentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedInvoice) {
      return;
    }

    try {
      setSavingPayment(true);
      setPaymentError(null);
      setPaymentSuccess(null);

      await recordInvoicePaymentOffline({
        actorId: user?.id ?? null,
        amount: paymentForm.amount,
        facilityId: activeFacilityId,
        invoice: selectedInvoice,
        method: paymentForm.method,
        notes: paymentForm.notes || null,
        referenceNumber: paymentForm.referenceNumber || null
      });

      setPaymentSuccess("Payment recorded successfully.");
      toast({
        title: "Payment recorded",
        description: `${selectedInvoice.invoice_number} received ${formatCurrency(paymentForm.amount)}.`,
        variant: "success"
      });
      setPaymentForm({
        ...initialPaymentFormState,
        amount: 0
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["billing-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] })
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to record payment.";
      setPaymentError(message);
      toast({
        title: "Payment failed",
        description: message,
        variant: "error"
      });
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDownloadReceipt = async (
    invoice: BillingInvoiceRow,
    payment: NonNullable<BillingInvoiceRow["invoice_payments"]>[number]
  ) => {
    try {
      setDownloadingReceiptId(payment.id);
      const [{ pdf }, { ReceiptDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/features/billing/receipt-pdf")
      ]);
      const blob = await pdf(
        <ReceiptDocument invoice={invoice} payment={payment} />
      ).toBlob();

      triggerBrowserDownload(
        blob,
        `${invoice.invoice_number.toLowerCase()}-${payment.receipt_number.toLowerCase()}.pdf`
      );

      await writeAuditLog("receipt_downloaded", invoice.id, {
        receipt_number: payment.receipt_number,
        payment_id: payment.id
      });
      toast({
        title: "Receipt generated",
        description: `${payment.receipt_number} was downloaded successfully.`,
        variant: "success"
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to generate the receipt PDF.";
      setPaymentError(message);
      toast({
        title: "Receipt generation failed",
        description: message,
        variant: "error"
      });
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading billing workspace...
        </CardContent>
      </Card>
    );
  }

  if (!canAccessBilling) {
    return (
      <Card className="border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="h-5 w-5" />
            Billing access is restricted
          </CardTitle>
          <CardDescription className="text-red-800">
            Only administrators and accountants can access invoices, receipts, and revenue
            operations.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!facilityId) {
    return (
      <Card className="border-amber-200 bg-amber-50/80">
        <CardHeader>
          <CardTitle className="text-amber-950">Facility assignment required</CardTitle>
          <CardDescription className="text-amber-900">
            Assign a facility before using billing and revenue workflows.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const activeFacilityId = facilityId as string;
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <Card className="border-blue-100">
          <CardHeader className="pb-3">
            <CardDescription>Total billed</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {formatCurrency(summary.billed)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-emerald-100">
          <CardHeader className="pb-3">
            <CardDescription>Today&apos;s revenue</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {formatCurrency(summary.todayRevenue)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-amber-100">
          <CardHeader className="pb-3">
            <CardDescription>Outstanding</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {formatCurrency(summary.outstanding)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-orange-100">
          <CardHeader className="pb-3">
            <CardDescription>Unsettled invoices</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{summary.unpaidCount}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card className="border-blue-100 shadow-soft">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-slate-950">Invoice and receipt workspace</CardTitle>
            <CardDescription>
              Automatic invoices are linked to test requests and priced from the current
              test catalogue.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search invoice, order, patient, lab ID"
                value={search}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "Unpaid", "Partial", "Paid"] as const).map((value) => (
                <Button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  size="sm"
                  type="button"
                  variant={statusFilter === value ? "default" : "outline"}
                >
                  {value}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "today", "this_week"] as const).map((value) => (
                <Button
                  key={value}
                  onClick={() => setDateFilter(value)}
                  size="sm"
                  type="button"
                  variant={dateFilter === value ? "secondary" : "outline"}
                >
                  {value === "all" ? "All dates" : value === "today" ? "Today" : "This week"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-slate-950">Invoices</CardTitle>
                <CardDescription>Filter by payment status and inspect each order invoice.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {invoicesQuery.isLoading ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                    Loading invoices...
                  </div>
                ) : null}

                {invoicesQuery.isError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-800">
                    {invoicesQuery.error instanceof Error
                      ? invoicesQuery.error.message
                      : "Unable to load invoices."}
                  </div>
                ) : null}

                {!invoicesQuery.isLoading && filteredInvoices.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                    {patientIdFilter
                      ? "No invoices were found for this patient yet."
                      : "No invoices matched the current filters."}
                  </div>
                ) : null}

                {filteredInvoices.map((invoice) => {
                  const active = selectedInvoice?.id === invoice.id;
                  const tone = getPaymentStatusTone(invoice.payment_status);

                  return (
                    <button
                      key={invoice.id}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        active
                          ? "border-blue-200 bg-blue-50/70"
                          : "border-slate-200 bg-white hover:border-blue-100 hover:bg-slate-50"
                      }`}
                      onClick={() => setSelectedInvoiceId(invoice.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">
                            {invoice.orders?.patients?.name || "Unknown patient"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {invoice.invoice_number} • {invoice.orders?.order_number || "-"}
                          </p>
                        </div>
                        <Badge
                          className={
                            tone === "paid"
                              ? "border-transparent bg-emerald-100 text-emerald-700"
                              : tone === "partial"
                                ? "border-transparent bg-amber-100 text-amber-700"
                                : "border-transparent bg-red-100 text-red-700"
                          }
                        >
                          {invoice.payment_status}
                        </Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{formatCurrency(invoice.total_amount)}</span>
                        <span>• Paid {formatCurrency(invoice.amount_paid)}</span>
                        <span>• Due {formatCurrency(getBalanceDue(invoice))}</span>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {selectedInvoice ? (
              <>
                <Card className="border-blue-100 shadow-soft">
                  <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="text-slate-950">
                        {selectedInvoice.invoice_number}
                      </CardTitle>
                      <CardDescription>
                        {selectedInvoice.orders?.order_number || "-"} •{" "}
                        {selectedInvoice.orders?.patients?.name || "Unknown patient"}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handlePrintInvoice(selectedInvoice)}
                      >
                        <Printer className="h-4 w-4" />
                        Print bill
                      </Button>
                      <Badge
                        className={
                          getPaymentStatusTone(selectedInvoice.payment_status) === "paid"
                            ? "border-transparent bg-emerald-100 text-emerald-700"
                            : getPaymentStatusTone(selectedInvoice.payment_status) === "partial"
                              ? "border-transparent bg-amber-100 text-amber-700"
                              : "border-transparent bg-red-100 text-red-700"
                        }
                      >
                        {selectedInvoice.payment_status}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Invoice total
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">
                          {formatCurrency(selectedInvoice.total_amount)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Amount paid
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">
                          {formatCurrency(selectedInvoice.amount_paid)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Balance due
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">
                          {formatCurrency(getBalanceDue(selectedInvoice))}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Issued
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">
                          {formatDate(selectedInvoice.issued_at)}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <div className="grid grid-cols-[1.7fr_0.6fr_1fr_1fr] gap-3 bg-blue-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                        <span>Test</span>
                        <span>Qty</span>
                        <span>Rate</span>
                        <span>Amount</span>
                      </div>
                      {(selectedInvoice.invoice_items ?? []).map((item) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-[1.7fr_0.6fr_1fr_1fr] gap-3 border-t border-slate-100 px-4 py-4 text-sm text-slate-700"
                        >
                          <p className="font-medium text-slate-950">{item.test_name}</p>
                          <p>{item.quantity}</p>
                          <p>{formatCurrency(item.unit_price)}</p>
                          <p>{formatCurrency(item.line_total)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-6 xl:grid-cols-2">
                  <Card className="border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-base text-slate-950">Invoice settings</CardTitle>
                      <CardDescription>
                        Add notes or due dates without breaking automatic totals.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {invoiceError ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                          {invoiceError}
                        </div>
                      ) : null}
                      {invoiceSuccess ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                          {invoiceSuccess}
                        </div>
                      ) : null}
                      <form className="space-y-4" onSubmit={(event) => void handleInvoiceUpdate(event)}>
                        <div className="space-y-2">
                          <Label htmlFor="invoice-due-at">Due date</Label>
                          <Input
                            id="invoice-due-at"
                            onChange={(event) => setInvoiceDueAt(event.target.value)}
                            type="date"
                            value={invoiceDueAt}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="invoice-notes">Notes</Label>
                          <Textarea
                            id="invoice-notes"
                            onChange={(event) => setInvoiceNotes(event.target.value)}
                            placeholder="Optional billing note or credit instruction"
                            rows={4}
                            value={invoiceNotes}
                          />
                        </div>
                        <Button disabled={!canManageBilling || savingInvoice} type="submit">
                          {savingInvoice ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                          Save invoice details
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-base text-slate-950">Register payment</CardTitle>
                      <CardDescription>
                        Record settlement and generate a downloadable receipt immediately.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {paymentError ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                          {paymentError}
                        </div>
                      ) : null}
                      {paymentSuccess ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                          {paymentSuccess}
                        </div>
                      ) : null}
                      <form className="space-y-4" onSubmit={(event) => void handlePaymentSubmit(event)}>
                        <div className="space-y-2">
                          <Label htmlFor="payment-amount">Amount</Label>
                          <Input
                            id="payment-amount"
                            max={getBalanceDue(selectedInvoice)}
                            min="0"
                            onChange={(event) =>
                              setPaymentForm((current) => ({
                                ...current,
                                amount: Number(event.target.value)
                              }))
                            }
                            step="0.01"
                            type="number"
                            value={paymentForm.amount}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="payment-method">Method</Label>
                          <select
                            className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                            id="payment-method"
                            onChange={(event) =>
                              setPaymentForm((current) => ({
                                ...current,
                                method: event.target.value
                              }))
                            }
                            value={paymentForm.method}
                          >
                            {paymentMethodOptions.map((method) => (
                              <option key={method} value={method}>
                                {method}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="payment-reference">Reference number</Label>
                          <Input
                            id="payment-reference"
                            onChange={(event) =>
                              setPaymentForm((current) => ({
                                ...current,
                                referenceNumber: event.target.value
                              }))
                            }
                            placeholder="Transfer reference or POS slip"
                            value={paymentForm.referenceNumber}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="payment-notes">Notes</Label>
                          <Textarea
                            id="payment-notes"
                            onChange={(event) =>
                              setPaymentForm((current) => ({
                                ...current,
                                notes: event.target.value
                              }))
                            }
                            rows={3}
                            value={paymentForm.notes}
                          />
                        </div>
                        <Button disabled={!canManageBilling || savingPayment} type="submit">
                          {savingPayment ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wallet className="h-4 w-4" />
                          )}
                          Record payment
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-base text-slate-950">Receipts and payment history</CardTitle>
                    <CardDescription>
                      Download receipts for each posted payment and review collection history.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(selectedInvoice.invoice_payments ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                        No payments have been posted against this invoice yet.
                      </div>
                    ) : null}

                    {(selectedInvoice.invoice_payments ?? []).map((payment) => (
                      <div
                        key={payment.id}
                        className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-950">
                            {payment.receipt_number}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {formatCurrency(payment.amount)} via {payment.payment_method}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDateTime(payment.received_at)}
                            {payment.reference_number ? ` • Ref ${payment.reference_number}` : ""}
                          </p>
                        </div>

                        <Button
                          disabled={downloadingReceiptId === payment.id}
                          onClick={() => void handleDownloadReceipt(selectedInvoice, payment)}
                          type="button"
                          variant="outline"
                        >
                          {downloadingReceiptId === payment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          Download receipt
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            ) : (
                <Card className="border-slate-200">
                  <CardContent className="p-10 text-center text-sm text-slate-600">
                    Choose an invoice to review charges, print the bill, register payments,
                    and generate receipts.
                  </CardContent>
                </Card>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
