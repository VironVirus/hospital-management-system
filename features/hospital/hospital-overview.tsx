"use client";

import Link from "next/link";
import type { Route } from "next";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BedDouble, ClipboardPlus, Download, HeartPulse, Loader2, Pill, Printer, ReceiptText, ScanSearch, Store, Syringe, UserRound, UsersRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildBillingDocumentHtml, encounterChargeToBillingRecord } from "@/features/billing/billing-document";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import { getAppClient } from "@/lib/app-client";
import { downloadHtmlDocument, printHtmlDocument } from "@/lib/print";
import type { Admission, Encounter, EncounterCharge, Medication, NursingMedicationDashboard, PatientOption, Prescription } from "@/types/hospital";

function money(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function buildChargeDocument(charge: EncounterCharge) {
  return buildBillingDocumentHtml({
    records: [encounterChargeToBillingRecord(charge)],
    title: "Patient bill"
  });
}

function billFilename(charge: EncounterCharge) {
  const hospitalId = charge.patients?.hospital_id ?? charge.patients?.lab_id ?? "patient";
  return `${hospitalId.replace(/[^a-z0-9-]+/gi, "-")}-bill.html`;
}

async function fetchHospitalOverview() {
  const database = getAppClient();
  if (!database) throw new Error("Service unavailable.");
  const hospital = getHospitalClient();
  const [patientsResponse, encountersResponse, admissionsResponse, medicationsResponse, prescriptionsResponse, chargesResponse] = await Promise.all([
    database.from("patients").select("id, name, hospital_id, lab_id, phone").order("created_at", { ascending: false }).limit(300),
    hospital.from("clinical_encounters").select("id, facility_id, patient_id, encounter_number, encounter_type, status, presenting_complaint, attending_clinician, started_at, ended_at, patients(id, name, hospital_id, lab_id, phone)").order("started_at", { ascending: false }).limit(200),
    hospital.from("admissions").select("id, patient_id, encounter_id, ward_id, bed_id, status, admission_reason, admitted_at, discharged_at, patients(id, name, hospital_id, lab_id, phone), wards(id, name, code), beds(id, bed_number), clinical_encounters(id, encounter_number)").eq("status", "Admitted").order("admitted_at", { ascending: false }).limit(100),
    hospital.from("medications").select("*").eq("is_active", true).limit(300),
    hospital.from("prescriptions").select("id, patient_id, encounter_id, status, notes, prescribed_at, dispensed_at, patients(id, name, hospital_id, lab_id, phone), clinical_encounters(id, encounter_number), prescription_items(id, medication_id, medication_name, dose, frequency, duration, route, quantity, dispensed_quantity, instructions, unit_price)").in("status", ["Pending", "Partially Dispensed"]).limit(100),
    hospital.from("encounter_charges").select("id, patient_id, encounter_id, description, category, quantity, unit_price, total_amount, amount_paid, payment_status, charged_at, patients(id, name, hospital_id, lab_id, phone), clinical_encounters(id, encounter_number)").in("payment_status", ["Unpaid", "Partial"]).limit(300)
  ]);
  if (patientsResponse.error) throw new Error(patientsResponse.error.message);
  [encountersResponse, admissionsResponse, medicationsResponse, prescriptionsResponse, chargesResponse].forEach((response) => throwIfHospitalError(response.error));
  return {
    patients: (patientsResponse.data ?? []) as PatientOption[], encounters: (encountersResponse.data ?? []) as Encounter[],
    admissions: (admissionsResponse.data ?? []) as Admission[], medications: (medicationsResponse.data ?? []) as Medication[],
    prescriptions: (prescriptionsResponse.data ?? []) as Prescription[], charges: (chargesResponse.data ?? []) as EncounterCharge[]
  };
}

async function fetchNursingSummary() {
  const { data, error } = await getAppClient().rpc("get_nursing_medication_dashboard");
  if (error) throw new Error(error.message);
  return data as NursingMedicationDashboard;
}

function Metric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return <Card><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p></div><div className={`rounded-2xl p-3 ${tone}`}><Icon className="h-5 w-5" /></div></div></CardContent></Card>;
}

export function HospitalOverview() {
  const { facilityId, facilityName, loading, role } = useAuth();
  const overviewQuery = useQuery({ queryKey: ["hospital", "overview"], queryFn: fetchHospitalOverview, enabled: Boolean(facilityId) });
  const nursingSummaryQuery = useQuery({ queryKey: ["hospital", "nursing-medications"], queryFn: fetchNursingSummary, enabled: Boolean(facilityId && ["Admin", "Nurse"].includes(role ?? "")), refetchInterval: 60_000 });
  if (loading || overviewQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading...</CardContent></Card>;
  if (!facilityId) return <Card><CardHeader><CardTitle>Access unavailable</CardTitle></CardHeader></Card>;
  const data = overviewQuery.data;
  const openEncounters = data?.encounters.filter((item) => item.status === "Open" || item.status === "Admitted") ?? [];
  const lowStock = data?.medications.filter((item) => Number(item.quantity_on_hand) <= Number(item.reorder_level)) ?? [];
  const outstanding = data?.charges.reduce((sum, charge) => sum + Math.max(Number(charge.total_amount) - Number(charge.amount_paid), 0), 0) ?? 0;
  const nursingDuePatients = new Set((nursingSummaryQuery.data?.doses ?? []).filter((dose) => dose.status === "Scheduled" && new Date(dose.scheduled_at).getTime() <= Date.now() + 30 * 60 * 1000).map((dose) => dose.patient_id)).size;
  const operationalAlerts: Array<[LucideIcon, string, number, Route]> = [
    [Pill, "Prescriptions awaiting dispense", data?.prescriptions.length ?? 0, "/pharmacy"],
    [Store, "Low medication stock", lowStock.length, "/pharmacy"],
    [ReceiptText, "Outstanding patient charges", data?.charges.length ?? 0, "/billing"]
  ];
  if (["Admin", "Nurse"].includes(role ?? "")) operationalAlerts.unshift([Syringe, "Patients needing medication", nursingDuePatients, "/nursing"]);
  const careModules: Array<[string, Route, LucideIcon]> = [
    ["Wards", "/wards", BedDouble],
    ["Pharmacy", "/pharmacy", Pill],
    ["Radiology", "/radiology", ScanSearch],
    ["Billing", "/billing", ReceiptText],
    ["Laboratory", "/dashboard", HeartPulse],
    ["Store", "/inventory", Store]
  ].filter(([label]) => {
    if (label === "Store") return role === "Admin" || role === "Storekeeper";
    if (label === "Laboratory") return role !== "Receptionist";
    return true;
  }) as Array<[string, Route, LucideIcon]>;
  if (["Admin", "Nurse"].includes(role ?? "")) careModules.unshift(["Nursing", "/nursing", Syringe]);
  return <div className="space-y-6">
    <Card className="overflow-hidden border-sky-100 bg-gradient-to-r from-teal-800 to-teal-600 text-white"><CardContent className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><h2 className="text-2xl font-semibold">{facilityName || "St Gianna Specialist Hospital"}</h2><p className="mt-1 text-sm text-teal-50">Transekulu, Enugu</p></div><div className="grid grid-cols-2 gap-3 sm:flex"><Button asChild className="bg-white text-teal-800 hover:bg-teal-50"><Link href="/clinical"><ClipboardPlus className="h-4 w-4" />New encounter</Link></Button><Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Link href="/patients"><UserRound className="h-4 w-4" />Find patient</Link></Button></div></CardContent></Card>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={UsersRound} label="Registered patients" value={String(data?.patients.length ?? 0)} tone="bg-sky-100 text-sky-700" /><Metric icon={HeartPulse} label="Active encounters" value={String(openEncounters.length)} tone="bg-teal-100 text-teal-700" /><Metric icon={BedDouble} label="Inpatients" value={String(data?.admissions.length ?? 0)} tone="bg-indigo-100 text-indigo-700" /><Metric icon={ReceiptText} label="Outstanding" value={money(outstanding)} tone="bg-amber-100 text-amber-700" /></section>
    <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Card><CardHeader><div className="flex items-start justify-between"><div><CardTitle>Live patient flow</CardTitle></div><Button asChild variant="outline" size="sm"><Link href="/clinical">Clinical<ArrowRight className="h-4 w-4" /></Link></Button></div></CardHeader><CardContent className="space-y-3">{openEncounters.slice(0, 8).map((encounter) => <div key={encounter.id} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><p className="font-semibold">{encounter.patients?.name}</p><p className="text-xs font-medium text-teal-700">{encounter.patients?.hospital_id ?? encounter.patients?.lab_id}</p></div><div><p className="line-clamp-1 text-sm text-slate-600">{encounter.encounter_type}</p><p className="text-xs text-slate-500">{encounter.encounter_number} · {formatDate(encounter.started_at)}</p></div><Badge>{encounter.status}</Badge></div>)}{!openEncounters.length ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No active encounters.</div> : null}</CardContent></Card>
      <div className="space-y-6"><Card><CardHeader><CardTitle>Operational alerts</CardTitle></CardHeader><CardContent className="space-y-3">{operationalAlerts.map(([AlertIcon, label, value, href]) => <Link key={label} href={href} className="flex items-center justify-between rounded-xl border p-4 transition hover:bg-slate-50"><div className="flex items-center gap-3"><div className="rounded-xl bg-slate-100 p-2"><AlertIcon className="h-4 w-4 text-slate-700" /></div><span className="text-sm font-medium">{label}</span></div><Badge variant={value > 0 ? "default" : "secondary"} className={value > 0 ? "bg-rose-600 text-white" : undefined}>{value}</Badge></Link>)}</CardContent></Card><Card><CardHeader><CardTitle>Care modules</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3">{careModules.map(([label, href, ModuleIcon]) => <Button key={label} asChild variant="outline" className="h-auto justify-start py-4"><Link href={href}><ModuleIcon className="h-4 w-4" />{label}</Link></Button>)}</CardContent></Card></div>
    </section>
    {role === "Receptionist" ? <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Patient bills</CardTitle><Button asChild variant="outline" size="sm"><Link href="/billing">Patient Billing<ArrowRight className="h-4 w-4" /></Link></Button></div></CardHeader><CardContent className="space-y-2">{(data?.charges ?? []).slice(0, 10).map((charge) => <div key={charge.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-semibold">{charge.patients?.name ?? "Patient"} · {charge.patients?.hospital_id ?? charge.patients?.lab_id}</p><p className="truncate text-xs text-slate-500">{charge.description} · Balance {money(Math.max(Number(charge.total_amount) - Number(charge.amount_paid), 0))}</p></div><div className="flex shrink-0 gap-2"><Button type="button" variant="outline" size="sm" onClick={() => printHtmlDocument(buildChargeDocument(charge))}><Printer className="h-4 w-4" />Print</Button><Button type="button" variant="outline" size="sm" onClick={() => downloadHtmlDocument(buildChargeDocument(charge), billFilename(charge))}><Download className="h-4 w-4" />Download</Button></div></div>)}{!data?.charges.length ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No outstanding bills.</div> : null}</CardContent></Card> : null}
  </div>;
}
