"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, Loader2, PackagePlus, Pill, Plus, Printer, ReceiptText } from "lucide-react";
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
import { printHtmlDocument } from "@/lib/print";
import { buildPrescriptionHistoryHtml, type PrescriptionHistoryReport } from "@/features/pharmacy/prescription-history-report";
import type { Encounter, Medication, Prescription } from "@/types/hospital";

function money(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function parseExpiryDate(value: string | null | undefined) {
  if (!value) return null;
  const datePart = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const parsed = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatExpiryDate(value: string | null | undefined) {
  const parsed = parseExpiryDate(value);
  if (!parsed) return "Not recorded";
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function daysUntilExpiry(value: string | null | undefined) {
  const parsed = parseExpiryDate(value);
  if (!parsed) return null;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.ceil((parsed.getTime() - startOfToday) / 86_400_000);
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

async function fetchPrescriptionHistory() {
  const response = await getHospitalClient().from("prescriptions").select("id, patient_id, encounter_id, status, notes, prescribed_at, dispensed_at, patients(id, name, hospital_id, lab_id, phone), clinical_encounters(id, encounter_number), prescription_items(id, medication_id, medication_name, dose, frequency, duration, route, quantity, dispensed_quantity, instructions, unit_price)").order("prescribed_at", { ascending: false });
  throwIfHospitalError(response.error);
  return (response.data ?? []) as Prescription[];
}

export function PharmacyWorkspace() {
  const { facilityId, facilityName, loading, role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canAccess = canAccessPharmacyRole(role);
  const canManageStock = canManageMedicationStockRole(role);
  const canPrescribe = canPrescribeRole(role);
  const canDispense = canDispenseRole(role);
  const [saving, setSaving] = useState(false);
  const [reportBusy, setReportBusy] = useState<"print" | "download" | null>(null);
  const [medicationForm, setMedicationForm] = useState({ generic_name: "", brand_name: "", strength: "", dosage_form: "Tablet", route: "Oral", unit_price: "", quantity_on_hand: "", reorder_level: "10", batch_number: "", expiry_date: "", expiry_warning_days: "90", storage_location: "" });
  const [prescriptionForm, setPrescriptionForm] = useState({ encounter_id: "", medication_id: "", dose: "", frequency_code: "", duration_days: "", units_per_dose: "1", instructions: "" });
  const [stockGroup, setStockGroup] = useState("");
  const [expiryGroup, setExpiryGroup] = useState("");
  const [prescriptionGroup, setPrescriptionGroup] = useState("Pending");
  const workspaceQuery = useQuery({ queryKey: ["hospital", "pharmacy"], queryFn: fetchPharmacyWorkspace, enabled: Boolean(facilityId && canAccess) });
  const data = workspaceQuery.data;
  const selectedMedication = data?.medications.find((item) => item.id === prescriptionForm.medication_id) ?? null;
  const selectedEncounter = data?.encounters.find((item) => item.id === prescriptionForm.encounter_id) ?? null;
  const prescriptionQuantity = calculateMedicationQuantity(Number(prescriptionForm.units_per_dose), prescriptionForm.frequency_code, Number(prescriptionForm.duration_days));
  const lowStock = useMemo(() => (data?.medications ?? []).filter((item) => Number(item.quantity_on_hand) <= Number(item.reorder_level)), [data]);
  const expiryGroups = useMemo(() => {
    const groups: Array<[string, Medication[]]> = [["Expired", []], ["Warning started", []]];
    (data?.medications ?? []).forEach((medication) => {
      const days = daysUntilExpiry(medication.expiry_date);
      const warningDays = Math.max(Number(medication.expiry_warning_days ?? 90), 0);
      if (days === null || days > warningDays) return;
      if (days < 0) groups[0][1].push(medication);
      else groups[1][1].push(medication);
    });
    groups.forEach(([, medications]) => medications.sort((left, right) => (left.expiry_date ?? "").localeCompare(right.expiry_date ?? "")));
    return groups;
  }, [data]);
  const expiringStock = useMemo(() => expiryGroups.flatMap(([, medications]) => medications), [expiryGroups]);
  const activeExpiryGroup = expiryGroups.some(([group]) => group === expiryGroup) ? expiryGroup : expiryGroups.find(([, medications]) => medications.length > 0)?.[0] ?? "Expired";
  const visibleExpiryStock = expiryGroups.find(([group]) => group === activeExpiryGroup)?.[1] ?? [];
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
        batch_number: medicationForm.batch_number.trim() || null, expiry_date: medicationForm.expiry_date || null, expiry_warning_days: Number(medicationForm.expiry_warning_days || 0), storage_location: medicationForm.storage_location.trim() || null
      });
      throwIfHospitalError(error);
      setMedicationForm({ generic_name: "", brand_name: "", strength: "", dosage_form: "Tablet", route: "Oral", unit_price: "", quantity_on_hand: "", reorder_level: "10", batch_number: "", expiry_date: "", expiry_warning_days: "90", storage_location: "" });
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

  const loadPrescriptionReport = async (): Promise<PrescriptionHistoryReport> => ({
    generatedAt: new Date().toISOString(),
    hospitalName: facilityName || "St Gianna Specialist Hospital",
    prescriptions: await fetchPrescriptionHistory()
  });

  const printPrescriptionHistory = async () => {
    try {
      setReportBusy("print");
      const report = await loadPrescriptionReport();
      printHtmlDocument(buildPrescriptionHistoryHtml(report));
    } catch (error) {
      toast({ title: "Prescription report not available", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setReportBusy(null);
    }
  };

  const downloadPrescriptionHistory = async () => {
    try {
      setReportBusy("download");
      const report = await loadPrescriptionReport();
      const [{ pdf }, { PrescriptionHistoryDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/features/pharmacy/prescription-history-pdf")
      ]);
      const blob = await pdf(<PrescriptionHistoryDocument report={report} />).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `prescription-history-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Prescription history downloaded", variant: "success" });
    } catch (error) {
      toast({ title: "Prescription report not downloaded", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setReportBusy(null);
    }
  };

  if (loading || workspaceQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading pharmacy...</CardContent></Card>;
  if (workspaceQuery.isError) return <Card><CardHeader><CardTitle>Pharmacy unavailable</CardTitle></CardHeader><CardContent><Button variant="outline" onClick={() => void workspaceQuery.refetch()}>Try again</Button></CardContent></Card>;
  if (!canAccess || !facilityId) return <Card><CardHeader><CardTitle>Pharmacy access unavailable</CardTitle></CardHeader></Card>;

  return <div className="space-y-6">
    <Card className="overflow-hidden border-emerald-100 bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-500 text-white"><CardContent className="grid grid-cols-2 gap-3 p-4 sm:p-6 xl:grid-cols-[1.3fr_repeat(4,0.45fr)]"><div className="col-span-2 xl:col-span-1"><h2 className="text-2xl font-semibold">Pharmacy</h2></div>{[["Medications", data?.medications.length ?? 0], ["Awaiting dispense", pending.length], ["Low stock", lowStock.length], ["Expiry notice", expiringStock.length]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-emerald-100">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}</CardContent></Card>

    {expiringStock.length > 0 ? <Card className="border-amber-200 bg-amber-50/60"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-950"><AlertTriangle className="h-5 w-5 text-amber-600" />Drug expiry notice</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2">{expiryGroups.map(([group, medications]) => <button key={group} type="button" onClick={() => setExpiryGroup(group)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${activeExpiryGroup === group ? "border-amber-500 bg-amber-100 text-amber-950" : "border-amber-200 bg-white text-slate-700"}`}>{group} · {medications.length}</button>)}</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleExpiryStock.map((medication) => { const days = daysUntilExpiry(medication.expiry_date); const expired = typeof days === "number" && days < 0; return <div key={medication.id} className={`rounded-xl border bg-white p-3 ${expired ? "border-rose-300" : "border-amber-200"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{medication.generic_name} {medication.strength}</p><p className="mt-1 text-xs text-slate-500">Batch {medication.batch_number || "Not recorded"}</p></div><Badge className={expired ? "bg-rose-600 text-white" : "bg-amber-500 text-white"}>{expired ? `Expired ${Math.abs(days ?? 0)}d ago` : `${days}d left`}</Badge></div><p className="mt-3 text-sm font-medium text-slate-700">Expires {formatExpiryDate(medication.expiry_date as string)}</p><p className="mt-1 text-xs text-slate-500">Warning starts {medication.expiry_warning_days ?? 90} days before expiry</p><p className="mt-1 text-xs text-slate-500">{medication.quantity_on_hand} {medication.unit} · {medication.storage_location || "No location"}</p></div>})}</div>{visibleExpiryStock.length === 0 ? <p className="rounded-xl border border-dashed border-amber-200 bg-white p-6 text-center text-sm text-slate-500">No drugs in this expiry group.</p> : null}</CardContent></Card> : null}

    <div className="grid gap-6 xl:grid-cols-2">
      {canManageStock ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5 text-emerald-700" />Add medication stock</CardTitle></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2" onSubmit={createMedication}>{[
        ["generic_name", "Generic name"], ["brand_name", "Brand name"], ["strength", "Strength"], ["dosage_form", "Dosage form"], ["route", "Route"], ["storage_location", "Storage location"], ["batch_number", "Batch number"]
      ].map(([key, label]) => <div key={key}><Label>{label}</Label><Input className="mt-1" value={medicationForm[key as keyof typeof medicationForm]} onChange={(event) => setMedicationForm((current) => ({ ...current, [key]: event.target.value }))} required={["generic_name", "strength", "dosage_form"].includes(key)} /></div>)}<div><Label>Expiry date</Label><Input className="mt-1" type="date" value={medicationForm.expiry_date} onChange={(event) => setMedicationForm((current) => ({ ...current, expiry_date: event.target.value }))} /></div><div><Label>Start expiry warning</Label><div className="mt-1 flex items-center gap-2"><Input type="number" min="0" max="3650" value={medicationForm.expiry_warning_days} onChange={(event) => setMedicationForm((current) => ({ ...current, expiry_warning_days: event.target.value }))} required /><span className="shrink-0 text-sm text-slate-600">days before</span></div></div><div><Label>Quantity</Label><Input className="mt-1" type="number" min="0" value={medicationForm.quantity_on_hand} onChange={(event) => setMedicationForm((current) => ({ ...current, quantity_on_hand: event.target.value }))} /></div><div><Label>Reorder level</Label><Input className="mt-1" type="number" min="0" value={medicationForm.reorder_level} onChange={(event) => setMedicationForm((current) => ({ ...current, reorder_level: event.target.value }))} /></div><div><Label>Unit price (₦)</Label><Input className="mt-1" type="number" min="0" value={medicationForm.unit_price} onChange={(event) => setMedicationForm((current) => ({ ...current, unit_price: event.target.value }))} /></div><Button className="sm:col-span-2" disabled={saving}><Plus className="h-4 w-4" />Add to formulary</Button></form></CardContent></Card> : null}

      {canPrescribe ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-emerald-700" />New prescription</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={createPrescription}>
        <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={prescriptionForm.encounter_id} onChange={(event) => setPrescriptionForm((current) => ({ ...current, encounter_id: event.target.value }))} required><option value="">Patient encounter / Hospital ID</option>{(data?.encounters ?? []).map((encounter) => <option key={encounter.id} value={encounter.id}>{encounter.patients?.name} — {encounter.patients?.hospital_id ?? encounter.patients?.lab_id} · {encounter.encounter_number}</option>)}</select>
        <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={prescriptionForm.medication_id} onChange={(event) => setPrescriptionForm((current) => ({ ...current, medication_id: event.target.value }))} required><option value="">Medication</option>{(data?.medications ?? []).filter((medication) => { const days = daysUntilExpiry(medication.expiry_date); return days === null || days >= 0; }).map((medication) => <option key={medication.id} value={medication.id}>{medication.generic_name} {medication.strength} — {medication.quantity_on_hand} available</option>)}</select>
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
      <Card><CardHeader><CardTitle>Medication stock</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2">{stockGroups.map(([group, medications]) => <button key={group} type="button" onClick={() => setStockGroup(group)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${activeStockGroup === group ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200"}`}>{group} · {medications.length}</button>)}</div>{visibleStock.map((medication) => { const isLow = Number(medication.quantity_on_hand) <= Number(medication.reorder_level); const expiryDays = daysUntilExpiry(medication.expiry_date); const expiring = expiryDays !== null && expiryDays <= Number(medication.expiry_warning_days ?? 90); return <div key={medication.id} className="flex items-center justify-between gap-4 rounded-xl border p-3"><div><p className="font-semibold">{medication.generic_name} {medication.strength}</p><p className="text-xs text-slate-500">{medication.brand_name || medication.dosage_form} · {medication.batch_number || "No batch"} · {money(Number(medication.unit_price))}</p>{medication.expiry_date ? <p className={`mt-1 text-xs font-medium ${expiring ? "text-amber-700" : "text-slate-500"}`}>Expires {formatExpiryDate(medication.expiry_date)} · warning {medication.expiry_warning_days ?? 90} days before</p> : null}</div><div className="flex flex-col items-end gap-1"><Badge variant={isLow ? "default" : "secondary"} className={isLow ? "bg-rose-600 text-white" : undefined}>{isLow ? <AlertTriangle className="h-3 w-3" /> : null}{medication.quantity_on_hand} {medication.unit}</Badge>{expiring ? <Badge className={expiryDays !== null && expiryDays < 0 ? "bg-rose-600 text-white" : "bg-amber-500 text-white"}>{expiryDays !== null && expiryDays < 0 ? "Expired" : `${expiryDays}d left`}</Badge> : null}</div></div>})}{!visibleStock.length ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No medication in this group.</div> : null}</CardContent></Card>
      <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Prescription queue</CardTitle><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={reportBusy !== null} onClick={() => void printPrescriptionHistory()}>{reportBusy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Print history</Button><Button size="sm" variant="outline" disabled={reportBusy !== null} onClick={() => void downloadPrescriptionHistory()}>{reportBusy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download PDF</Button></div></div></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2">{prescriptionGroups.map(([group, prescriptions]) => <button key={group} type="button" onClick={() => setPrescriptionGroup(group)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${activePrescriptionGroup === group ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200"}`}>{group} · {prescriptions.length}</button>)}</div>{visiblePrescriptions.map((prescription) => <div key={prescription.id} className="rounded-2xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{prescription.patients?.name}</p><p className="text-xs font-medium text-emerald-700">{prescription.patients?.hospital_id ?? prescription.patients?.lab_id} · {prescription.clinical_encounters?.encounter_number}</p></div><Badge variant={prescription.status === "Dispensed" ? "secondary" : "default"}>{prescription.status === "Dispensed" ? <CheckCircle2 className="h-3 w-3" /> : null}{prescription.status}</Badge></div><div className="mt-3 space-y-2">{(prescription.prescription_items ?? []).map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-medium">{item.medication_name}</p><p className="text-slate-600">{item.dose} · {item.frequency} · {item.duration} · Qty {item.quantity}</p></div>)}</div><div className="mt-3 flex items-center justify-between"><p className="text-xs text-slate-500">{formatDate(prescription.prescribed_at)}</p>{canDispense && prescription.status !== "Dispensed" ? <Button size="sm" onClick={() => dispense(prescription)}>Dispense all</Button> : null}</div></div>)}{!visiblePrescriptions.length ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No prescriptions in this group.</div> : null}</CardContent></Card>
    </div>
  </div>;
}
