"use client";

import Link from "next/link";
import type { Route } from "next";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BedDouble, ClipboardPlus, HeartPulse, Loader2, Pill, ReceiptText, ScanSearch, Store, UserRound, UsersRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import { getAppClient } from "@/lib/app-client";
import type { Admission, Encounter, EncounterCharge, Medication, PatientOption, Prescription } from "@/types/hospital";

function money(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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

function Metric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return <Card><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p></div><div className={`rounded-2xl p-3 ${tone}`}><Icon className="h-5 w-5" /></div></div></CardContent></Card>;
}

export function HospitalOverview() {
  const { facilityId, facilityName, loading } = useAuth();
  const overviewQuery = useQuery({ queryKey: ["hospital", "overview"], queryFn: fetchHospitalOverview, enabled: Boolean(facilityId) });
  if (loading || overviewQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading...</CardContent></Card>;
  if (!facilityId) return <Card><CardHeader><CardTitle>Access unavailable</CardTitle></CardHeader></Card>;
  const data = overviewQuery.data;
  const openEncounters = data?.encounters.filter((item) => item.status === "Open" || item.status === "Admitted") ?? [];
  const lowStock = data?.medications.filter((item) => Number(item.quantity_on_hand) <= Number(item.reorder_level)) ?? [];
  const outstanding = data?.charges.reduce((sum, charge) => sum + Math.max(Number(charge.total_amount) - Number(charge.amount_paid), 0), 0) ?? 0;
  return <div className="space-y-6">
    <Card className="overflow-hidden border-sky-100 bg-gradient-to-r from-teal-800 to-teal-600 text-white"><CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-semibold">{facilityName || "St Gianna Specialist Hospital"}</h2><p className="mt-1 text-sm text-teal-50">Transekulu, Enugu</p></div><div className="flex gap-3"><Button asChild className="bg-white text-teal-800 hover:bg-teal-50"><Link href="/clinical"><ClipboardPlus className="h-4 w-4" />New encounter</Link></Button><Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Link href="/patients"><UserRound className="h-4 w-4" />Find patient</Link></Button></div></CardContent></Card>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={UsersRound} label="Registered patients" value={String(data?.patients.length ?? 0)} tone="bg-sky-100 text-sky-700" /><Metric icon={HeartPulse} label="Active encounters" value={String(openEncounters.length)} tone="bg-teal-100 text-teal-700" /><Metric icon={BedDouble} label="Inpatients" value={String(data?.admissions.length ?? 0)} tone="bg-indigo-100 text-indigo-700" /><Metric icon={ReceiptText} label="Outstanding" value={money(outstanding)} tone="bg-amber-100 text-amber-700" /></section>
    <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Card><CardHeader><div className="flex items-start justify-between"><div><CardTitle>Live patient flow</CardTitle><CardDescription>Recent active encounters across the hospital.</CardDescription></div><Button asChild variant="outline" size="sm"><Link href="/clinical">Clinical workspace<ArrowRight className="h-4 w-4" /></Link></Button></div></CardHeader><CardContent className="space-y-3">{openEncounters.slice(0, 8).map((encounter) => <div key={encounter.id} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><p className="font-semibold">{encounter.patients?.name}</p><p className="text-xs font-medium text-teal-700">{encounter.patients?.hospital_id ?? encounter.patients?.lab_id}</p></div><div><p className="line-clamp-1 text-sm text-slate-600">{encounter.presenting_complaint || "No complaint recorded"}</p><p className="text-xs text-slate-500">{encounter.encounter_number} · {formatDate(encounter.started_at)}</p></div><Badge>{encounter.status}</Badge></div>)}{!openEncounters.length ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No active encounters.</div> : null}</CardContent></Card>
      <div className="space-y-6"><Card><CardHeader><CardTitle>Operational alerts</CardTitle><CardDescription>Items that need attention now.</CardDescription></CardHeader><CardContent className="space-y-3">{[[Pill, "Prescriptions awaiting dispense", data?.prescriptions.length ?? 0, "/pharmacy"], [Store, "Low medication stock", lowStock.length, "/pharmacy"], [ReceiptText, "Outstanding patient charges", data?.charges.length ?? 0, "/hospital-billing"]].map(([Icon, label, value, href]) => { const AlertIcon = Icon as LucideIcon; return <Link key={String(label)} href={String(href) as Route} className="flex items-center justify-between rounded-xl border p-4 transition hover:bg-slate-50"><div className="flex items-center gap-3"><div className="rounded-xl bg-slate-100 p-2"><AlertIcon className="h-4 w-4 text-slate-700" /></div><span className="text-sm font-medium">{String(label)}</span></div><Badge variant={Number(value) > 0 ? "default" : "secondary"} className={Number(value) > 0 ? "bg-rose-600 text-white" : undefined}>{String(value)}</Badge></Link>; })}</CardContent></Card><Card><CardHeader><CardTitle>Care modules</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3">{[["Wards", "/wards", BedDouble], ["Pharmacy", "/pharmacy", Pill], ["Radiology", "/radiology", ScanSearch], ["Billing", "/hospital-billing", ReceiptText], ["Laboratory", "/dashboard", HeartPulse], ["Store", "/inventory", Store]].map(([label, href, Icon]) => { const ModuleIcon = Icon as LucideIcon; return <Button key={String(label)} asChild variant="outline" className="h-auto justify-start py-4"><Link href={String(href) as Route}><ModuleIcon className="h-4 w-4" />{String(label)}</Link></Button>; })}</CardContent></Card></div>
    </section>
  </div>;
}
