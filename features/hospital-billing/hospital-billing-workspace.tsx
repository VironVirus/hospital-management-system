"use client";

import { useDeferredValue, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CreditCard, Download, Loader2, Plus, Printer, Receipt, Search } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AccountInvoiceRow } from "@/features/accounts/accounts-utils";
import { buildBillingDocumentHtml, encounterChargeToBillingRecord, type BillingDocumentRecord } from "@/features/billing/billing-document";
import { useToast } from "@/hooks/use-toast";
import { canAccessHospitalBillingRole, canManageHospitalBillingRole } from "@/lib/guards";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import { getAppClient } from "@/lib/app-client";
import { generateId } from "@/lib/online-core";
import { recordInvoicePayment } from "@/lib/online-mutations";
import { downloadHtmlDocument, printHtmlDocument } from "@/lib/print";
import type { Encounter, EncounterCharge, PatientOption } from "@/types/hospital";

type LedgerStatus = "All" | EncounterCharge["payment_status"];
type UnifiedBill = {
  category: string;
  date: string;
  document: BillingDocumentRecord;
  id: string;
  invoice?: AccountInvoiceRow;
  patientId: string;
  source: "charge" | "invoice";
  sourceCharge?: EncounterCharge;
  status: EncounterCharge["payment_status"];
};

function money(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function invoiceDocument(invoice: AccountInvoiceRow): BillingDocumentRecord {
  return {
    amountPaid: Number(invoice.amount_paid),
    date: invoice.issued_at,
    items: (invoice.invoice_items ?? []).map((item) => ({ description: item.test_name, quantity: Number(item.quantity), total: Number(item.line_total), unitPrice: Number(item.unit_price) })),
    payments: (invoice.invoice_payments ?? []).map((payment) => ({ amount: Number(payment.amount), date: payment.received_at, method: payment.payment_method, reference: payment.reference_number })),
    patientHospitalId: invoice.orders?.patients?.hospital_id || invoice.orders?.patients?.lab_id || "-",
    patientName: invoice.orders?.patients?.name || "Patient",
    patientPhone: invoice.orders?.patients?.phone,
    reference: invoice.invoice_number,
    status: invoice.payment_status,
    total: Number(invoice.total_amount)
  };
}

function billHtml(bill: UnifiedBill) {
  return buildBillingDocumentHtml({ records: [bill.document], title: "Patient bill" });
}

function billFilename(bill: UnifiedBill) {
  return `${bill.document.patientHospitalId.replace(/[^a-z0-9-]+/gi, "-")}-${bill.document.reference.replace(/[^a-z0-9-]+/gi, "-")}-bill.html`;
}

async function fetchBillingWorkspace(facilityId: string) {
  const database = getAppClient();
  if (!database) throw new Error("Service unavailable.");
  const hospital = getHospitalClient();
  const [patientsResponse, encountersResponse, chargesResponse, invoicesResponse] = await Promise.all([
    database.from("patients").select("id, name, hospital_id, lab_id, phone").eq("facility_id", facilityId).order("name", { ascending: true }).limit(1000),
    hospital.from("clinical_encounters").select("id, facility_id, patient_id, encounter_number, encounter_type, status, presenting_complaint, attending_clinician, started_at, ended_at, patients(id, name, hospital_id, lab_id, phone)").eq("facility_id", facilityId).order("started_at", { ascending: false }).limit(1000),
    hospital.from("encounter_charges").select("id, patient_id, encounter_id, description, category, quantity, unit_price, total_amount, amount_paid, payment_status, charged_at, patients(id, name, hospital_id, lab_id, phone), clinical_encounters(id, encounter_number)").eq("facility_id", facilityId).order("charged_at", { ascending: false }).limit(5000),
    database.from("invoices").select("id, facility_id, order_id, invoice_number, subtotal, discount_amount, total_amount, amount_paid, payment_status, notes, issued_at, due_at, created_at, created_by, updated_at, orders(id, patient_id, order_number, ordered_at, patients(id, name, hospital_id, lab_id, phone)), invoice_items(id, invoice_id, order_test_id, test_name, quantity, unit_price, line_total, created_at), invoice_payments(id, facility_id, invoice_id, receipt_number, amount, payment_method, reference_number, notes, received_at, received_by, created_at)").eq("facility_id", facilityId).order("issued_at", { ascending: false }).limit(5000)
  ]);
  if (patientsResponse.error) throw new Error(patientsResponse.error.message);
  if (invoicesResponse.error) throw new Error(invoicesResponse.error.message);
  [encountersResponse, chargesResponse].forEach((response) => throwIfHospitalError(response.error));
  return {
    patients: (patientsResponse.data ?? []) as PatientOption[],
    encounters: (encountersResponse.data ?? []) as Encounter[],
    charges: (chargesResponse.data ?? []) as EncounterCharge[],
    invoices: (invoicesResponse.data ?? []) as AccountInvoiceRow[]
  };
}

export function HospitalBillingWorkspace() {
  const searchParams = useSearchParams();
  const { facilityId, loading, role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canAccess = canAccessHospitalBillingRole(role);
  const canManage = canManageHospitalBillingRole(role);
  const patientIdFilter = searchParams.get("patientId");
  const orderIdFilter = searchParams.get("orderId");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [chargeForm, setChargeForm] = useState({ patient_id: patientIdFilter || "", encounter_id: "", description: "", category: "Consultation", quantity: "1", unit_price: "" });
  const [paymentForm, setPaymentForm] = useState({ bill_id: "", amount: "", payment_method: "Cash", reference_number: "", notes: "" });
  const [ledgerGroup, setLedgerGroup] = useState<LedgerStatus>("All");
  const workspaceQuery = useQuery({ queryKey: ["hospital", "billing", facilityId], queryFn: () => fetchBillingWorkspace(facilityId as string), enabled: Boolean(facilityId && canAccess) });
  const data = workspaceQuery.data;
  const patientEncounters = useMemo(() => (data?.encounters ?? []).filter((item) => item.patient_id === chargeForm.patient_id), [chargeForm.patient_id, data]);
  const bills = useMemo<UnifiedBill[]>(() => [
    ...(data?.charges ?? []).map((charge) => ({ category: charge.category, date: charge.charged_at, document: encounterChargeToBillingRecord(charge), id: `charge:${charge.id}`, patientId: charge.patient_id, source: "charge" as const, sourceCharge: charge, status: charge.payment_status })),
    ...(data?.invoices ?? []).map((invoice) => ({ category: "Laboratory", date: invoice.issued_at, document: invoiceDocument(invoice), id: `invoice:${invoice.id}`, invoice, patientId: invoice.orders?.patient_id || "", source: "invoice" as const, status: invoice.payment_status }))
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()), [data]);
  const visibleBills = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return bills.filter((bill) => {
      if (ledgerGroup !== "All" && bill.status !== ledgerGroup) return false;
      if (patientIdFilter && bill.patientId !== patientIdFilter) return false;
      if (orderIdFilter && bill.invoice?.order_id !== orderIdFilter) return false;
      if (!needle) return true;
      return [bill.document.patientName, bill.document.patientHospitalId, bill.document.reference, bill.category, ...bill.document.items.map((item) => item.description)].join(" ").toLowerCase().includes(needle);
    });
  }, [bills, deferredSearch, ledgerGroup, orderIdFilter, patientIdFilter]);
  const paymentBills = bills.filter((bill) => bill.status === "Unpaid" || bill.status === "Partial").filter((bill) => bill.source === "charge" || role === "Admin" || role === "Accountant");
  const selectedBill = bills.find((bill) => bill.id === paymentForm.bill_id) ?? null;
  const totals = bills.reduce((summary, bill) => ({ billed: summary.billed + bill.document.total, paid: summary.paid + bill.document.amountPaid, outstanding: summary.outstanding + Math.max(bill.document.total - bill.document.amountPaid, 0) }), { billed: 0, paid: 0, outstanding: 0 });
  const statuses: LedgerStatus[] = ["All", "Unpaid", "Partial", "Paid", "Waived"];

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hospital", "billing"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "overview"] }),
      queryClient.invalidateQueries({ queryKey: ["accounts-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "patient-record"] }),
      queryClient.invalidateQueries({ queryKey: ["billing-invoices"] })
    ]);
  };

  const createCharge = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !chargeForm.patient_id || !chargeForm.description.trim()) return;
    try {
      setSaving(true);
      const { error } = await getHospitalClient().from("encounter_charges").insert({
        id: generateId(), facility_id: facilityId, patient_id: chargeForm.patient_id, encounter_id: chargeForm.encounter_id || null,
        description: chargeForm.description.trim(), category: chargeForm.category, quantity: Number(chargeForm.quantity),
        unit_price: Number(chargeForm.unit_price), charged_by: user?.id ?? null
      });
      throwIfHospitalError(error);
      setChargeForm({ patient_id: "", encounter_id: "", description: "", category: "Consultation", quantity: "1", unit_price: "" });
      await refresh();
      toast({ title: "Charge posted", variant: "success" });
    } catch (error) {
      toast({ title: "Charge not posted", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  const recordPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !selectedBill || !paymentForm.amount) return;
    try {
      setSaving(true);
      if (selectedBill.source === "invoice" && selectedBill.invoice) {
        await recordInvoicePayment({ actorId: user?.id ?? null, amount: Number(paymentForm.amount), facilityId, invoice: selectedBill.invoice, method: paymentForm.payment_method, referenceNumber: paymentForm.reference_number.trim() || null, notes: paymentForm.notes.trim() || null });
      } else if (selectedBill.sourceCharge) {
        const { error } = await getHospitalClient().rpc("record_hospital_payment", { target_charge_id: selectedBill.sourceCharge.id, amount_value: Number(paymentForm.amount), payment_method_value: paymentForm.payment_method, reference_number_value: paymentForm.reference_number.trim() || null, notes_value: paymentForm.notes.trim() || null });
        throwIfHospitalError(error);
      }
      setPaymentForm({ bill_id: "", amount: "", payment_method: "Cash", reference_number: "", notes: "" });
      await refresh();
      toast({ title: "Payment recorded", variant: "success" });
    } catch (error) {
      toast({ title: "Payment not recorded", description: error instanceof Error ? error.message : "Please check the balance.", variant: "error" });
    } finally { setSaving(false); }
  };

  if (loading || workspaceQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading patient accounts...</CardContent></Card>;
  if (!canAccess || !facilityId) return <Card><CardHeader><CardTitle>Billing unavailable</CardTitle></CardHeader></Card>;

  return <div className="space-y-6">
    <Card className="overflow-hidden border-amber-100 bg-gradient-to-br from-amber-800 via-amber-700 to-orange-500 text-white"><CardContent className="grid grid-cols-2 gap-3 p-4 sm:p-6 lg:grid-cols-[1.4fr_repeat(3,0.48fr)]"><div className="col-span-2 lg:col-span-1"><h2 className="text-2xl font-semibold">Patient billing</h2></div>{[["Billed", money(totals.billed)], ["Collected", money(totals.paid)], ["Outstanding", money(totals.outstanding)]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-amber-100">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}</CardContent></Card>

    {canManage ? <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-amber-700" />Post patient charge</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={createCharge}><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={chargeForm.patient_id} onChange={(event) => setChargeForm((current) => ({ ...current, patient_id: event.target.value, encounter_id: "" }))} required><option value="">Patient / Hospital ID</option>{(data?.patients ?? []).map((patient) => <option key={patient.id} value={patient.id}>{patient.name} — {patient.hospital_id ?? patient.lab_id}</option>)}</select><div className="grid gap-3 sm:grid-cols-2"><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={chargeForm.encounter_id} onChange={(event) => setChargeForm((current) => ({ ...current, encounter_id: event.target.value }))}><option value="">No encounter</option>{patientEncounters.map((encounter) => <option key={encounter.id} value={encounter.id}>{encounter.encounter_number}</option>)}</select><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={chargeForm.category} onChange={(event) => setChargeForm((current) => ({ ...current, category: event.target.value }))}>{["Registration", "Consultation", "Procedure", "Admission", "Medication", "Nursing", "Imaging", "Laboratory", "Other"].map((item) => <option key={item}>{item}</option>)}</select></div><Input value={chargeForm.description} onChange={(event) => setChargeForm((current) => ({ ...current, description: event.target.value }))} placeholder="Service description" required /><div className="grid gap-3 sm:grid-cols-2"><div><Label>Quantity</Label><Input className="mt-1" type="number" min="0.01" step="0.01" value={chargeForm.quantity} onChange={(event) => setChargeForm((current) => ({ ...current, quantity: event.target.value }))} /></div><div><Label>Unit price (₦)</Label><Input className="mt-1" type="number" min="0" step="0.01" value={chargeForm.unit_price} onChange={(event) => setChargeForm((current) => ({ ...current, unit_price: event.target.value }))} required /></div></div><Button className="w-full" disabled={saving}>Post charge</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-amber-700" />Record payment</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={recordPayment}><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={paymentForm.bill_id} onChange={(event) => { const billId = event.target.value; const bill = bills.find((item) => item.id === billId); setPaymentForm((current) => ({ ...current, bill_id: billId, amount: bill ? String(Math.max(bill.document.total - bill.document.amountPaid, 0)) : "" })); }} required><option value="">Outstanding patient bill</option>{paymentBills.map((bill) => <option key={bill.id} value={bill.id}>{bill.document.patientName} — {bill.category} · {money(bill.document.total - bill.document.amountPaid)}</option>)}</select><div className="grid gap-3 sm:grid-cols-2"><div><Label>Amount</Label><Input className="mt-1" type="number" min="0.01" step="0.01" max={selectedBill ? selectedBill.document.total - selectedBill.document.amountPaid : undefined} value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} required /></div><div><Label>Method</Label><select className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" value={paymentForm.payment_method} onChange={(event) => setPaymentForm((current) => ({ ...current, payment_method: event.target.value }))}>{["Cash", "Transfer", "POS", "Card", "Insurance", "Mobile Money"].map((item) => <option key={item}>{item}</option>)}</select></div></div><Input value={paymentForm.reference_number} onChange={(event) => setPaymentForm((current) => ({ ...current, reference_number: event.target.value }))} placeholder="Reference number" /><Textarea value={paymentForm.notes} onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Payment notes" /><Button className="w-full" disabled={saving}><Banknote className="h-4 w-4" />Record payment</Button></form></CardContent></Card>
    </div> : null}

    <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-amber-700" />Patient account ledger</CardTitle><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Patient, ID or bill" /></div></div></CardHeader><CardContent><div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{statuses.map((status) => { const count = status === "All" ? bills.length : bills.filter((bill) => bill.status === status).length; return <button key={status} type="button" onClick={() => setLedgerGroup(status)} className={`rounded-xl border p-3 text-left ${ledgerGroup === status ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}><span className="block text-xs text-slate-500">{status}</span><strong className="text-lg">{count}</strong></button>; })}</div><div className="space-y-3">{visibleBills.map((bill) => <div key={bill.id} className="grid gap-3 rounded-2xl border p-4 lg:grid-cols-[1.1fr_1fr_0.7fr_auto_auto] lg:items-center"><div><p className="font-semibold">{bill.document.patientName}</p><p className="text-xs font-medium text-amber-700">{bill.document.patientHospitalId}</p></div><div><p className="text-sm font-medium">{bill.document.items.map((item) => item.description).join(", ") || bill.category}</p><p className="text-xs text-slate-500">{bill.category} · {bill.document.reference} · {formatDate(bill.date)}</p></div><div className="text-sm"><p>{money(bill.document.total)}</p><p className="text-xs text-slate-500">Balance {money(Math.max(bill.document.total - bill.document.amountPaid, 0))}</p></div><Badge className="w-fit" variant={bill.status === "Paid" ? "secondary" : bill.status === "Partial" ? "outline" : "default"}>{bill.status}</Badge><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => printHtmlDocument(billHtml(bill))}><Printer className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Print</span></Button><Button type="button" variant="outline" size="sm" onClick={() => downloadHtmlDocument(billHtml(bill), billFilename(bill))}><Download className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Download</span></Button></div></div>)}{!visibleBills.length ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No bills in this group.</div> : null}</div></CardContent></Card>
  </div>;
}
