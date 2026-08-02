"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, PackagePlus, Pill, Plus, ReceiptText } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { canAccessPharmacyRole, canDispenseRole, canManageMedicationStockRole, canPrescribeRole } from "@/lib/guards";
import { getAppClient } from "@/lib/app-client";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import { calculateMedicationQuantity, medicationFrequencies } from "@/lib/medication-schedule";
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
  const [prescriptionForm, setPrescriptionForm] = useState({ encounter_id: "", medication_id: "", dose: "", frequency_code: "", duration_days: "", units_per_dose: "1", instructions: "" });
  const [stockGroup, setStockGroup] = useState("");
  const [prescriptionGroup, setPrescriptionGroup] = useState("Pending");
  const workspaceQuery = useQuery({ queryKey: ["hospital", "pharmacy"], queryFn: fetchPharmacyWorkspace, enabled: Boolean(facilityId && canAccess) });
  const data = workspaceQuery.data;
  const selectedMedication = data?.medications.find((item) => item.id === prescriptionForm.medication_id) ?? null;
  const selectedEncounter = data?.encounters.find((item) => item.id === prescriptionForm.encounter_id) ?? null;
  const prescriptionQuantity = calculateMedicationQuantity(Number(prescriptionForm.units_per_dose), prescriptionForm.frequency_code, Number(prescriptionForm.duration_days));
  const lowStock = useMemo(() => (data?.medications ?? []).filter((item) => Number(item.quantity_on_hand) <= Number(item.reorder_level)), [data]);
  const pending = useMemo(() => (data?.prescriptions ?? []).filter((item) => item.status === "Pending" || item.status === "Partially Dispensed"), [data]);
  const stockGroups = useMemo(() => {
    const groups = new Map<string, Medication[]>();
    (data?.medications ?? []).forEach((medication) => groups.set(medication.dosage_form || "Other", [...(groups.get(medication.dosage_form || "Other") ?? []), medication]));
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [data]);
  const activeStockGroup = stockGroups.some(([group]) => group === stockGroup) ? stockGroup : stockGroups[0]?.[0] ?? "";
  const visibleStock = stockGroups.find(([group]) => group === activeStockGroup)?.[1] ?? [];
  const prescriptionGroups = useMemo(() => {
    const groups = new Map<string, Prescription[]>();
    (data?.prescriptions ?? []).forEach((prescription) => groups.set(prescription.status, [...(groups.get(prescription.status) ?? []), prescription]));
    return [...groups.entries()];
  }, [data]);
  const activePrescriptionGroup = prescriptionGroups.some(([group]) => group === prescriptionGroup) ? prescriptionGroup : prescriptionGroups[0]?.[0] ?? "";
  const visiblePrescriptions = prescriptionGroups.find(([group]) => group === activePrescriptionGroup)?.[1] ?? [];

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hospital", "pharmacy"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "overview"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "billing"] }),
      queryClient.invalidateQueries({ queryKey: ["accounts-workspace"] })
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
      toast({ title: "Medication added", variant: "success" });
    } catch (error) {
      toast({ title: "Medication not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  const createPrescription = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !selectedEncounter || !selectedMedication) return;
    try {
      setSaving(true);
      const { error } = await getAppClient().rpc("create_clinical_prescription", {
        patient_id: selectedEncounter.patient_id,
        encounter_id: selectedEncounter.id,
        items: [{
          medication_id: selectedMedication.id,
          dose: prescriptionForm.dose.trim(),
          frequency_code: prescriptionForm.frequency_code,
          duration_days: Number(prescriptionForm.duration_days),
          units_per_dose: Number(prescriptionForm.units_per_dose),
          route: selectedMedication.route,
          instructions: prescriptionForm.instructions.trim() || null
        }]
      });
      if (error) throw new Error(error.message);
      setPrescriptionForm({ encounter_id: "", medication_id: "", dose: "", frequency_code: "", duration_days: "", units_per_dose: "1", instructions: "" });
      await refresh();
      toast({ title: "Prescription sent", variant: "success" });
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
      toast({ title: "Medication dispensed", variant: "success" });
    } catch (error) {
      toast({ title: "Could not dispense", description: error instanceof Error ? error.message : "Please check available stock.", variant: "error" });
    }
  };

  if (loading || workspaceQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading pharmacy...</CardContent></Card>;
  if (!canAccess || !facilityId) return <Card><CardHeader><CardTitle>Pharmacy access unavailable</CardTitle></CardHeader></Card>;

  return <div className="space-y-6">
    <Card className="overflow-hidden border-emerald-100 bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-500 text-white"><CardContent className="grid grid-cols-2 gap-3 p-4 sm:p-6 lg:grid-cols-[1.4fr_repeat(3,0.45fr)]"><div className="col-span-2 lg:col-span-1"><h2 className="text-2xl font-semibold">Pharmacy</h2></div>{[["Medications", data?.medications.length ?? 0], ["Awaiting dispense", pending.length], ["Low stock", lowStock.length]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-emerald-100">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}</CardContent></Card>

    <div className="grid gap-6 xl:grid-cols-2">
      {canManageStock ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5 text-emerald-700" />Add medication stock</CardTitle></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2" onSubmit={createMedication}>{[
        ["generic_name", "Generic name"], ["brand_name", "Brand name"], ["strength", "Strength"], ["dosage_form", "Dosage form"], ["route", "Route"], ["storage_location", "Storage location"], ["batch_number", "Batch number"]
      ].map(([key, label]) => <div key={key}><Label>{label}</Label><Input className="mt-1" value={medicationForm[key as keyof typeof medicationForm]} onChange={(event) => setMedicationForm((current) => ({ ...current, [key]: event.target.value }))} required={["generic_name", "strength", "dosage_form"].includes(key)} /></div>)}<div><Label>Expiry date</Label><Input className="mt-1" type="date" value={medicationForm.expiry_date} onChange={(event) => setMedicationForm((current) => ({ ...current, expiry_date: event.target.value }))} /></div><div><Label>Quantity</Label><Input className="mt-1" type="number" min="0" value={medicationForm.quantity_on_hand} onChange={(event) => setMedicationForm((current) => ({ ...current, quantity_on_hand: event.target.value }))} /></div><div><Label>Reorder level</Label><Input className="mt-1" type="number" min="0" value={medicationForm.reorder_level} onChange={(event) => setMedicationForm((current) => ({ ...current, reorder_level: event.target.value }))} /></div><div><Label>Unit price (₦)</Label><Input className="mt-1" type="number" min="0" value={medicationForm.unit_price} onChange={(event) => setMedicationForm((current) => ({ ...current, unit_price: event.target.value }))} /></div><Button className="sm:col-span-2" disabled={saving}><Plus className="h-4 w-4" />Add to formulary</Button></form></CardContent></Card> : null}

      {canPrescribe ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-emerald-700" />New prescription</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={createPrescription}>
        <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={prescriptionForm.encounter_id} onChange={(event) => setPrescriptionForm((current) => ({ ...current, encounter_id: event.target.value }))} required><option value="">Patient encounter / Hospital ID</option>{(data?.encounters ?? []).map((encounter) => <option key={encounter.id} value={encounter.id}>{encounter.patients?.name} — {encounter.patients?.hospital_id ?? encounter.patients?.lab_id} · {encounter.encounter_number}</option>)}</select>
        <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={prescriptionForm.medication_id} onChange={(event) => setPrescriptionForm((current) => ({ ...current, medication_id: event.target.value }))} required><option value="">Medication</option>{(data?.medications ?? []).map((medication) => <option key={medication.id} value={medication.id}>{medication.generic_name} {medication.strength} — {medication.quantity_on_hand} available</option>)}</select>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input value={prescriptionForm.dose} onChange={(event) => setPrescriptionForm((current) => ({ ...current, dose: event.target.value }))} placeholder="Dose, e.g. 500 mg" required />
          <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={prescriptionForm.frequency_code} onChange={(event) => setPrescriptionForm((current) => ({ ...current, frequency_code: event.target.value }))} required><option value="">Select frequency</option>{medicationFrequencies.map((frequency) => <option key={frequency.code} value={frequency.code}>{frequency.label}</option>)}</select>
          <Input type="number" min="1" max="90" step="1" value={prescriptionForm.duration_days} onChange={(event) => setPrescriptionForm((current) => ({ ...current, duration_days: event.target.value }))} placeholder="Number of days" required />
          <Input type="number" min="0.25" max="100" step="0.25" value={prescriptionForm.units_per_dose} onChange={(event) => setPrescriptionForm((current) => ({ ...current, units_per_dose: event.target.value }))} placeholder="Units per dose" required />
          <div className="rounded-lg border bg-emerald-50 px-3 py-2 sm:col-span-2"><p className="text-xs text-emerald-700">Total quantity</p><p className="text-lg font-semibold text-emerald-950">{prescriptionQuantity || 0}</p></div>
        </div>
        <Textarea value={prescriptionForm.instructions} onChange={(event) => setPrescriptionForm((current) => ({ ...current, instructions: event.target.value }))} placeholder="Instructions and cautions" /><Button className="w-full" disabled={saving || prescriptionQuantity <= 0}><Pill className="h-4 w-4" />Send to pharmacy</Button>
      </form></CardContent></Card> : null}
    </div>

    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card><CardHeader><CardTitle>Medication stock</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2">{stockGroups.map(([group, medications]) => <button key={group} type="button" onClick={() => setStockGroup(group)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${activeStockGroup === group ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200"}`}>{group} · {medications.length}</button>)}</div>{visibleStock.map((medication) => { const isLow = Number(medication.quantity_on_hand) <= Number(medication.reorder_level); return <div key={medication.id} className="flex items-center justify-between gap-4 rounded-xl border p-3"><div><p className="font-semibold">{medication.generic_name} {medication.strength}</p><p className="text-xs text-slate-500">{medication.brand_name || medication.dosage_form} · {medication.batch_number || "No batch"} · {money(Number(medication.unit_price))}</p></div><Badge variant={isLow ? "default" : "secondary"} className={isLow ? "bg-rose-600 text-white" : undefined}>{isLow ? <AlertTriangle className="h-3 w-3" /> : null}{medication.quantity_on_hand} {medication.unit}</Badge></div>})}{!visibleStock.length ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No medication in this group.</div> : null}</CardContent></Card>
      <Card><CardHeader><CardTitle>Prescription queue</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2">{prescriptionGroups.map(([group, prescriptions]) => <button key={group} type="button" onClick={() => setPrescriptionGroup(group)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${activePrescriptionGroup === group ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200"}`}>{group} · {prescriptions.length}</button>)}</div>{visiblePrescriptions.map((prescription) => <div key={prescription.id} className="rounded-2xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{prescription.patients?.name}</p><p className="text-xs font-medium text-emerald-700">{prescription.patients?.hospital_id ?? prescription.patients?.lab_id} · {prescription.clinical_encounters?.encounter_number}</p></div><Badge variant={prescription.status === "Dispensed" ? "secondary" : "default"}>{prescription.status === "Dispensed" ? <CheckCircle2 className="h-3 w-3" /> : null}{prescription.status}</Badge></div><div className="mt-3 space-y-2">{(prescription.prescription_items ?? []).map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-medium">{item.medication_name}</p><p className="text-slate-600">{item.dose} · {item.frequency} · {item.duration} · Qty {item.quantity}</p></div>)}</div><div className="mt-3 flex items-center justify-between"><p className="text-xs text-slate-500">{formatDate(prescription.prescribed_at)}</p>{canDispense && prescription.status !== "Dispensed" ? <Button size="sm" onClick={() => dispense(prescription)}>Dispense all</Button> : null}</div></div>)}{!visiblePrescriptions.length ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No prescriptions in this group.</div> : null}</CardContent></Card>
    </div>
  </div>;
}
