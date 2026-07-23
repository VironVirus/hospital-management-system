"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, PackagePlus, Pill, Plus, ReceiptText } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { canAccessPharmacyRole, canDispenseRole, canManageMedicationStockRole, canPrescribeRole } from "@/lib/guards";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import { generateId } from "@/lib/online-core";
import type { Encounter, Medication, Prescription } from "@/types/hospital";

function money(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function fetchPharmacyWorkspace() {
  const hospital = getHospitalClient();
  const [medicationsResponse, encountersResponse, prescriptionsResponse] = await Promise.all([
    hospital.from("medications").select("*").eq("is_active", true).order("generic_name", { ascending: true }),
    hospital.from("clinical_encounters").select("id, facility_id, patient_id, encounter_number, encounter_type, status, presenting_complaint, attending_clinician, started_at, ended_at, patients(id, name, hospital_id, lab_id, phone)").in("status", ["Open", "Admitted"]).order("started_at", { ascending: false }).limit(200),
    hospital.from("prescriptions").select("id, patient_id, encounter_id, status, notes, prescribed_at, dispensed_at, patients(id, name, hospital_id, lab_id, phone), clinical_encounters(id, encounter_number), prescription_items(id, medication_id, medication_name, dose, frequency, duration, route, quantity, dispensed_quantity, instructions, unit_price)").order("prescribed_at", { ascending: false }).limit(200)
  ]);
  [medicationsResponse, encountersResponse, prescriptionsResponse].forEach((response) => throwIfHospitalError(response.error));
  return {
    medications: (medicationsResponse.data ?? []) as Medication[],
    encounters: (encountersResponse.data ?? []) as Encounter[],
    prescriptions: (prescriptionsResponse.data ?? []) as Prescription[]
  };
}

export function PharmacyWorkspace() {
  const { facilityId, loading, role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canAccess = canAccessPharmacyRole(role);
  const canManageStock = canManageMedicationStockRole(role);
  const canPrescribe = canPrescribeRole(role);
  const canDispense = canDispenseRole(role);
  const [saving, setSaving] = useState(false);
  const [medicationForm, setMedicationForm] = useState({ generic_name: "", brand_name: "", strength: "", dosage_form: "Tablet", route: "Oral", unit_price: "", quantity_on_hand: "", reorder_level: "10", batch_number: "", expiry_date: "", storage_location: "" });
  const [prescriptionForm, setPrescriptionForm] = useState({ encounter_id: "", medication_id: "", dose: "", frequency: "", duration: "", quantity: "1", instructions: "" });
  const workspaceQuery = useQuery({ queryKey: ["hospital", "pharmacy"], queryFn: fetchPharmacyWorkspace, enabled: Boolean(facilityId && canAccess) });
  const data = workspaceQuery.data;
  const selectedMedication = data?.medications.find((item) => item.id === prescriptionForm.medication_id) ?? null;
  const selectedEncounter = data?.encounters.find((item) => item.id === prescriptionForm.encounter_id) ?? null;
  const lowStock = useMemo(() => (data?.medications ?? []).filter((item) => Number(item.quantity_on_hand) <= Number(item.reorder_level)), [data]);
  const pending = useMemo(() => (data?.prescriptions ?? []).filter((item) => item.status === "Pending" || item.status === "Partially Dispensed"), [data]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hospital", "pharmacy"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "overview"] })
    ]);
  };

  const createMedication = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !medicationForm.generic_name.trim() || !medicationForm.strength.trim()) return;
    try {
      setSaving(true);
      const { error } = await getHospitalClient().from("medications").insert({
        id: generateId(), facility_id: facilityId, created_by: user?.id ?? null,
        generic_name: medicationForm.generic_name.trim(), brand_name: medicationForm.brand_name.trim() || null,
        strength: medicationForm.strength.trim(), dosage_form: medicationForm.dosage_form.trim(), route: medicationForm.route.trim() || null,
        unit_price: Number(medicationForm.unit_price || 0), quantity_on_hand: Number(medicationForm.quantity_on_hand || 0), reorder_level: Number(medicationForm.reorder_level || 0),
        batch_number: medicationForm.batch_number.trim() || null, expiry_date: medicationForm.expiry_date || null, storage_location: medicationForm.storage_location.trim() || null
      });
      throwIfHospitalError(error);
      setMedicationForm({ generic_name: "", brand_name: "", strength: "", dosage_form: "Tablet", route: "Oral", unit_price: "", quantity_on_hand: "", reorder_level: "10", batch_number: "", expiry_date: "", storage_location: "" });
      await refresh();
      toast({ title: "Medication added", description: "The drug is now available in the pharmacy catalogue.", variant: "success" });
    } catch (error) {
      toast({ title: "Medication not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  const createPrescription = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !selectedEncounter || !selectedMedication) return;
    const prescriptionId = generateId();
    try {
      setSaving(true);
      const hospital = getHospitalClient();
      const prescriptionResponse = await hospital.from("prescriptions").insert({
        id: prescriptionId, facility_id: facilityId, patient_id: selectedEncounter.patient_id,
        encounter_id: selectedEncounter.id, prescribed_by: user?.id ?? null
      });
      throwIfHospitalError(prescriptionResponse.error);
      const itemResponse = await hospital.from("prescription_items").insert({
        id: generateId(), prescription_id: prescriptionId, medication_id: selectedMedication.id,
        medication_name: `${selectedMedication.generic_name} ${selectedMedication.strength}`,
        dose: prescriptionForm.dose.trim(), frequency: prescriptionForm.frequency.trim(), duration: prescriptionForm.duration.trim(),
        route: selectedMedication.route, quantity: Number(prescriptionForm.quantity), instructions: prescriptionForm.instructions.trim() || null,
        unit_price: Number(selectedMedication.unit_price)
      });
      throwIfHospitalError(itemResponse.error);
      setPrescriptionForm({ encounter_id: "", medication_id: "", dose: "", frequency: "", duration: "", quantity: "1", instructions: "" });
      await refresh();
      toast({ title: "Prescription sent", description: "Pharmacy can now review and dispense the medication.", variant: "success" });
    } catch (error) {
      toast({ title: "Prescription not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  const dispense = async (prescription: Prescription) => {
    if (!window.confirm(`Dispense all items for ${prescription.patients?.name ?? "this patient"}?`)) return;
    try {
      const { error } = await getHospitalClient().rpc("dispense_prescription", { target_prescription_id: prescription.id });
      throwIfHospitalError(error);
      await refresh();
      toast({ title: "Medication dispensed", description: "Stock was deducted and the dispensing record was completed.", variant: "success" });
    } catch (error) {
      toast({ title: "Could not dispense", description: error instanceof Error ? error.message : "Please check available stock.", variant: "error" });
    }
  };

  if (loading || workspaceQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading pharmacy...</CardContent></Card>;
  if (!canAccess || !facilityId) return <Card><CardHeader><CardTitle>Pharmacy access unavailable</CardTitle><CardDescription>Your role needs pharmacy or clinical access.</CardDescription></CardHeader></Card>;

  return <div className="space-y-6">
    <Card className="overflow-hidden border-emerald-100 bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-500 text-white"><CardContent className="grid gap-4 p-6 lg:grid-cols-[1.4fr_repeat(3,0.45fr)]"><div><h2 className="text-2xl font-semibold">Pharmacy</h2></div>{[["Medications", data?.medications.length ?? 0], ["Awaiting dispense", pending.length], ["Low stock", lowStock.length]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-emerald-100">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}</CardContent></Card>

    <div className="grid gap-6 xl:grid-cols-2">
      {canManageStock ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5 text-emerald-700" />Add medication stock</CardTitle><CardDescription>Create a formulary item with batch, price, expiry, and reorder details.</CardDescription></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2" onSubmit={createMedication}>{[
        ["generic_name", "Generic name"], ["brand_name", "Brand name"], ["strength", "Strength"], ["dosage_form", "Dosage form"], ["route", "Route"], ["storage_location", "Storage location"], ["batch_number", "Batch number"]
      ].map(([key, label]) => <div key={key}><Label>{label}</Label><Input className="mt-1" value={medicationForm[key as keyof typeof medicationForm]} onChange={(event) => setMedicationForm((current) => ({ ...current, [key]: event.target.value }))} required={["generic_name", "strength", "dosage_form"].includes(key)} /></div>)}<div><Label>Expiry date</Label><Input className="mt-1" type="date" value={medicationForm.expiry_date} onChange={(event) => setMedicationForm((current) => ({ ...current, expiry_date: event.target.value }))} /></div><div><Label>Quantity</Label><Input className="mt-1" type="number" min="0" value={medicationForm.quantity_on_hand} onChange={(event) => setMedicationForm((current) => ({ ...current, quantity_on_hand: event.target.value }))} /></div><div><Label>Reorder level</Label><Input className="mt-1" type="number" min="0" value={medicationForm.reorder_level} onChange={(event) => setMedicationForm((current) => ({ ...current, reorder_level: event.target.value }))} /></div><div><Label>Unit price (₦)</Label><Input className="mt-1" type="number" min="0" value={medicationForm.unit_price} onChange={(event) => setMedicationForm((current) => ({ ...current, unit_price: event.target.value }))} /></div><Button className="sm:col-span-2" disabled={saving}><Plus className="h-4 w-4" />Add to formulary</Button></form></CardContent></Card> : null}

      {canPrescribe ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-emerald-700" />New prescription</CardTitle><CardDescription>Select an active encounter, drug, dose, frequency, and duration.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={createPrescription}><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={prescriptionForm.encounter_id} onChange={(event) => setPrescriptionForm((current) => ({ ...current, encounter_id: event.target.value }))} required><option value="">Patient encounter / Hospital ID</option>{(data?.encounters ?? []).map((encounter) => <option key={encounter.id} value={encounter.id}>{encounter.patients?.name} — {encounter.patients?.hospital_id ?? encounter.patients?.lab_id} · {encounter.encounter_number}</option>)}</select><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={prescriptionForm.medication_id} onChange={(event) => setPrescriptionForm((current) => ({ ...current, medication_id: event.target.value }))} required><option value="">Medication</option>{(data?.medications ?? []).map((medication) => <option key={medication.id} value={medication.id}>{medication.generic_name} {medication.strength} — {medication.quantity_on_hand} available</option>)}</select><div className="grid gap-3 sm:grid-cols-2"><Input value={prescriptionForm.dose} onChange={(event) => setPrescriptionForm((current) => ({ ...current, dose: event.target.value }))} placeholder="Dose, e.g. 500 mg" required /><Input value={prescriptionForm.frequency} onChange={(event) => setPrescriptionForm((current) => ({ ...current, frequency: event.target.value }))} placeholder="Frequency, e.g. twice daily" required /><Input value={prescriptionForm.duration} onChange={(event) => setPrescriptionForm((current) => ({ ...current, duration: event.target.value }))} placeholder="Duration, e.g. 5 days" required /><Input type="number" min="1" value={prescriptionForm.quantity} onChange={(event) => setPrescriptionForm((current) => ({ ...current, quantity: event.target.value }))} placeholder="Quantity" required /></div><Textarea value={prescriptionForm.instructions} onChange={(event) => setPrescriptionForm((current) => ({ ...current, instructions: event.target.value }))} placeholder="Instructions and cautions" /><Button className="w-full" disabled={saving}><Pill className="h-4 w-4" />Send to pharmacy</Button></form></CardContent></Card> : null}
    </div>

    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card><CardHeader><CardTitle>Medication stock</CardTitle><CardDescription>Formulary, batch, price, expiry, and reorder visibility.</CardDescription></CardHeader><CardContent className="space-y-2">{(data?.medications ?? []).map((medication) => { const isLow = Number(medication.quantity_on_hand) <= Number(medication.reorder_level); return <div key={medication.id} className="flex items-center justify-between gap-4 rounded-xl border p-3"><div><p className="font-semibold">{medication.generic_name} {medication.strength}</p><p className="text-xs text-slate-500">{medication.brand_name || medication.dosage_form} · {medication.batch_number || "No batch"} · {money(Number(medication.unit_price))}</p></div><Badge variant={isLow ? "default" : "secondary"} className={isLow ? "bg-rose-600 text-white" : undefined}>{isLow ? <AlertTriangle className="h-3 w-3" /> : null}{medication.quantity_on_hand} {medication.unit}</Badge></div>})}</CardContent></Card>
      <Card><CardHeader><CardTitle>Prescription queue</CardTitle><CardDescription>Pending and completed medication orders by patient Hospital ID.</CardDescription></CardHeader><CardContent className="space-y-3">{(data?.prescriptions ?? []).map((prescription) => <div key={prescription.id} className="rounded-2xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{prescription.patients?.name}</p><p className="text-xs font-medium text-emerald-700">{prescription.patients?.hospital_id ?? prescription.patients?.lab_id} · {prescription.clinical_encounters?.encounter_number}</p></div><Badge variant={prescription.status === "Dispensed" ? "secondary" : "default"}>{prescription.status === "Dispensed" ? <CheckCircle2 className="h-3 w-3" /> : null}{prescription.status}</Badge></div><div className="mt-3 space-y-2">{(prescription.prescription_items ?? []).map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-medium">{item.medication_name}</p><p className="text-slate-600">{item.dose} · {item.frequency} · {item.duration} · Qty {item.quantity}</p></div>)}</div><div className="mt-3 flex items-center justify-between"><p className="text-xs text-slate-500">{formatDate(prescription.prescribed_at)}</p>{canDispense && prescription.status !== "Dispensed" ? <Button size="sm" onClick={() => dispense(prescription)}>Dispense all</Button> : null}</div></div>)}{!data?.prescriptions.length ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No prescriptions yet.</div> : null}</CardContent></Card>
    </div>
  </div>;
}
