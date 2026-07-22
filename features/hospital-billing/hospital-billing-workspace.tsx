"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CreditCard, Loader2, Plus, Receipt, WalletCards } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { canAccessHospitalBillingRole, canManageHospitalBillingRole } from "@/lib/guards";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import { generateId } from "@/lib/online-core";
import { getAppClient } from "@/lib/app-client";
import type { Encounter, EncounterCharge, PatientOption } from "@/types/hospital";

function money(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function fetchBillingWorkspace() {
  const database = getAppClient();
  if (!database) throw new Error("MySQL is not configured.");
  const hospital = getHospitalClient();
  const [patientsResponse, encountersResponse, chargesResponse] = await Promise.all([
    database.from("patients").select("id, name, hospital_id, lab_id, phone").order("name", { ascending: true }).limit(500),
    hospital.from("clinical_encounters").select("id, facility_id, patient_id, encounter_number, encounter_type, status, presenting_complaint, attending_clinician, started_at, ended_at, patients(id, name, hospital_id, lab_id, phone)").order("started_at", { ascending: false }).limit(300),
    hospital.from("encounter_charges").select("id, patient_id, encounter_id, description, category, quantity, unit_price, total_amount, amount_paid, payment_status, charged_at, patients(id, name, hospital_id, lab_id, phone), clinical_encounters(id, encounter_number)").order("charged_at", { ascending: false }).limit(400)
  ]);
  if (patientsResponse.error) throw new Error(patientsResponse.error.message);
  [encountersResponse, chargesResponse].forEach((response) => throwIfHospitalError(response.error));
  return { patients: (patientsResponse.data ?? []) as PatientOption[], encounters: (encountersResponse.data ?? []) as Encounter[], charges: (chargesResponse.data ?? []) as EncounterCharge[] };
}

export function HospitalBillingWorkspace() {
  const { facilityId, loading, role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canAccess = canAccessHospitalBillingRole(role);
  const canManage = canManageHospitalBillingRole(role);
  const [saving, setSaving] = useState(false);
  const [chargeForm, setChargeForm] = useState({ patient_id: "", encounter_id: "", description: "", category: "Consultation", quantity: "1", unit_price: "" });
  const [paymentForm, setPaymentForm] = useState({ charge_id: "", amount: "", payment_method: "Cash", reference_number: "", notes: "" });
  const workspaceQuery = useQuery({ queryKey: ["hospital", "billing"], queryFn: fetchBillingWorkspace, enabled: Boolean(facilityId && canAccess) });
  const data = workspaceQuery.data;
  const patientEncounters = useMemo(() => (data?.encounters ?? []).filter((item) => item.patient_id === chargeForm.patient_id), [chargeForm.patient_id, data]);
  const outstandingCharges = useMemo(() => (data?.charges ?? []).filter((item) => item.payment_status === "Unpaid" || item.payment_status === "Partial"), [data]);
  const selectedCharge = data?.charges.find((item) => item.id === paymentForm.charge_id) ?? null;
  const totals = useMemo(() => (data?.charges ?? []).reduce((summary, charge) => ({ billed: summary.billed + Number(charge.total_amount), paid: summary.paid + Number(charge.amount_paid), outstanding: summary.outstanding + Math.max(Number(charge.total_amount) - Number(charge.amount_paid), 0) }), { billed: 0, paid: 0, outstanding: 0 }), [data]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hospital", "billing"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "overview"] })
    ]);
  };

  const createCharge = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !chargeForm.patient_id || !chargeForm.description.trim()) return;
    try {
      setSaving(true);
      const { error } = await getHospitalClient().from("encounter_charges").insert({
        id: generateId(), facility_id: facilityId, patient_id: chargeForm.patient_id,
        encounter_id: chargeForm.encounter_id || null, description: chargeForm.description.trim(),
        category: chargeForm.category, quantity: Number(chargeForm.quantity), unit_price: Number(chargeForm.unit_price),
        charged_by: user?.id ?? null
      });
      throwIfHospitalError(error);
      setChargeForm({ patient_id: "", encounter_id: "", description: "", category: "Consultation", quantity: "1", unit_price: "" });
      await refresh();
      toast({ title: "Charge posted", description: "The service is now on the patient account.", variant: "success" });
    } catch (error) {
      toast({ title: "Charge not posted", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  const recordPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCharge || !paymentForm.amount) return;
    try {
      setSaving(true);
      const { error } = await getHospitalClient().rpc("record_hospital_payment", {
        target_charge_id: selectedCharge.id, amount_value: Number(paymentForm.amount), payment_method_value: paymentForm.payment_method,
        reference_number_value: paymentForm.reference_number.trim() || null, notes_value: paymentForm.notes.trim() || null
      });
      throwIfHospitalError(error);
      setPaymentForm({ charge_id: "", amount: "", payment_method: "Cash", reference_number: "", notes: "" });
      await refresh();
      toast({ title: "Payment recorded", description: "The patient balance and payment status were updated.", variant: "success" });
    } catch (error) {
      toast({ title: "Payment not recorded", description: error instanceof Error ? error.message : "Please check the balance.", variant: "error" });
    } finally { setSaving(false); }
  };

  if (loading || workspaceQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading patient accounts...</CardContent></Card>;
  if (!canAccess || !facilityId) return <Card><CardHeader><CardTitle>Hospital billing unavailable</CardTitle><CardDescription>Your role needs billing access and a completed hospital setup.</CardDescription></CardHeader></Card>;

  return <div className="space-y-6">
    <Card className="overflow-hidden border-amber-100 bg-gradient-to-br from-amber-800 via-amber-700 to-orange-500 text-white"><CardContent className="grid gap-4 p-6 lg:grid-cols-[1.4fr_repeat(3,0.48fr)]"><div><Badge className="bg-white/15 text-white">Patient accounts</Badge><h2 className="mt-3 text-2xl font-semibold">Clinical billing & collections</h2><p className="mt-2 text-sm text-amber-50">Consultations, procedures, admissions, drugs, and services grouped under the Hospital ID.</p></div>{[["Billed", money(totals.billed)], ["Collected", money(totals.paid)], ["Outstanding", money(totals.outstanding)]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-amber-100">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}</CardContent></Card>

    {canManage ? <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-amber-700" />Post patient charge</CardTitle><CardDescription>Add a consultation, procedure, admission, medication, or other service.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={createCharge}><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={chargeForm.patient_id} onChange={(event) => setChargeForm((current) => ({ ...current, patient_id: event.target.value, encounter_id: "" }))} required><option value="">Patient / Hospital ID</option>{(data?.patients ?? []).map((patient) => <option key={patient.id} value={patient.id}>{patient.name} — {patient.hospital_id ?? patient.lab_id}</option>)}</select><div className="grid gap-3 sm:grid-cols-2"><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={chargeForm.encounter_id} onChange={(event) => setChargeForm((current) => ({ ...current, encounter_id: event.target.value }))}><option value="">No encounter</option>{patientEncounters.map((encounter) => <option key={encounter.id} value={encounter.id}>{encounter.encounter_number}</option>)}</select><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={chargeForm.category} onChange={(event) => setChargeForm((current) => ({ ...current, category: event.target.value }))}>{["Consultation", "Procedure", "Admission", "Medication", "Nursing", "Imaging", "Other"].map((item) => <option key={item}>{item}</option>)}</select></div><Input value={chargeForm.description} onChange={(event) => setChargeForm((current) => ({ ...current, description: event.target.value }))} placeholder="Service description" required /><div className="grid gap-3 sm:grid-cols-2"><div><Label>Quantity</Label><Input className="mt-1" type="number" min="0.01" step="0.01" value={chargeForm.quantity} onChange={(event) => setChargeForm((current) => ({ ...current, quantity: event.target.value }))} /></div><div><Label>Unit price (₦)</Label><Input className="mt-1" type="number" min="0" step="0.01" value={chargeForm.unit_price} onChange={(event) => setChargeForm((current) => ({ ...current, unit_price: event.target.value }))} required /></div></div><Button className="w-full" disabled={saving}>Post charge</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-amber-700" />Record payment</CardTitle><CardDescription>Apply a cash, transfer, POS, insurance, or mobile payment.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={recordPayment}><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={paymentForm.charge_id} onChange={(event) => { const chargeId = event.target.value; const charge = data?.charges.find((item) => item.id === chargeId); setPaymentForm((current) => ({ ...current, charge_id: chargeId, amount: charge ? String(Number(charge.total_amount) - Number(charge.amount_paid)) : "" })); }} required><option value="">Outstanding patient charge</option>{outstandingCharges.map((charge) => <option key={charge.id} value={charge.id}>{charge.patients?.name} — {charge.description} · {money(Number(charge.total_amount) - Number(charge.amount_paid))}</option>)}</select><div className="grid gap-3 sm:grid-cols-2"><div><Label>Amount</Label><Input className="mt-1" type="number" min="0.01" step="0.01" max={selectedCharge ? Number(selectedCharge.total_amount) - Number(selectedCharge.amount_paid) : undefined} value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} required /></div><div><Label>Method</Label><select className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" value={paymentForm.payment_method} onChange={(event) => setPaymentForm((current) => ({ ...current, payment_method: event.target.value }))}>{["Cash", "Transfer", "POS", "Insurance", "Mobile Money"].map((item) => <option key={item}>{item}</option>)}</select></div></div><Input value={paymentForm.reference_number} onChange={(event) => setPaymentForm((current) => ({ ...current, reference_number: event.target.value }))} placeholder="Reference number" /><Textarea value={paymentForm.notes} onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Payment notes" /><Button className="w-full" disabled={saving}><Banknote className="h-4 w-4" />Record payment</Button></form></CardContent></Card>
    </div> : null}

    <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-amber-700" />Patient account ledger</CardTitle><CardDescription>Clinical charges and balances by Hospital ID and encounter.</CardDescription></div><Button asChild variant="outline"><Link href="/accounts"><WalletCards className="h-4 w-4" />Open full accounts</Link></Button></div></CardHeader><CardContent><div className="space-y-3">{(data?.charges ?? []).map((charge) => <div key={charge.id} className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[1.2fr_1fr_0.7fr_auto] md:items-center"><div><p className="font-semibold">{charge.patients?.name}</p><p className="text-xs font-medium text-amber-700">{charge.patients?.hospital_id ?? charge.patients?.lab_id}</p></div><div><p className="text-sm font-medium">{charge.description}</p><p className="text-xs text-slate-500">{charge.category} · {charge.clinical_encounters?.encounter_number ?? "No encounter"} · {formatDate(charge.charged_at)}</p></div><div className="text-sm"><p>{money(Number(charge.total_amount))}</p><p className="text-xs text-slate-500">Balance {money(Math.max(Number(charge.total_amount) - Number(charge.amount_paid), 0))}</p></div><Badge variant={charge.payment_status === "Paid" ? "secondary" : charge.payment_status === "Partial" ? "outline" : "default"}>{charge.payment_status}</Badge></div>)}{!data?.charges.length ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No hospital service charges yet.</div> : null}</div></CardContent></Card>
  </div>;
}
