"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, BedDouble, FileText, HeartPulse, Loader2, Pill, ReceiptText, ScanSearch, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import type { Admission, ClinicalNote, Diagnosis, Encounter, EncounterCharge, Prescription, RadiologyRequest, VitalSign } from "@/types/hospital";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

async function fetchPatientClinicalRecord(patientId: string) {
  const hospital = getHospitalClient();
  const [encountersResponse, admissionsResponse, vitalsResponse, notesResponse, diagnosesResponse, prescriptionsResponse, chargesResponse, radiologyResponse] = await Promise.all([
    hospital.from("clinical_encounters").select("*").eq("patient_id", patientId).order("started_at", { ascending: false }),
    hospital.from("admissions").select("id, patient_id, encounter_id, ward_id, bed_id, status, admission_reason, admitted_at, discharged_at, wards(id, name, code), beds(id, bed_number), clinical_encounters(id, encounter_number)").eq("patient_id", patientId).order("admitted_at", { ascending: false }),
    hospital.from("vital_signs").select("*").eq("patient_id", patientId).order("measured_at", { ascending: false }).limit(20),
    hospital.from("clinical_notes").select("*").eq("patient_id", patientId).order("authored_at", { ascending: false }).limit(40),
    hospital.from("diagnoses").select("*").eq("patient_id", patientId).order("diagnosed_at", { ascending: false }).limit(40),
    hospital.from("prescriptions").select("id, patient_id, encounter_id, status, notes, prescribed_at, dispensed_at, clinical_encounters(id, encounter_number), prescription_items(id, medication_id, medication_name, dose, frequency, duration, route, quantity, dispensed_quantity, instructions, unit_price)").eq("patient_id", patientId).order("prescribed_at", { ascending: false }).limit(40),
    hospital.from("encounter_charges").select("id, patient_id, encounter_id, description, category, quantity, unit_price, total_amount, amount_paid, payment_status, charged_at, clinical_encounters(id, encounter_number)").eq("patient_id", patientId).order("charged_at", { ascending: false }).limit(80),
    hospital.from("radiology_requests").select("id, facility_id, request_number, patient_id, encounter_id, service_id, clinical_indication, priority, status, scheduled_at, requested_at, completed_at, clinical_encounters(id, encounter_number), radiology_services(id, name, modality, unit_price), radiology_reports(*)").eq("patient_id", patientId).order("requested_at", { ascending: false }).limit(40)
  ]);
  [encountersResponse, admissionsResponse, vitalsResponse, notesResponse, diagnosesResponse, prescriptionsResponse, chargesResponse, radiologyResponse].forEach((response) => throwIfHospitalError(response.error));
  return {
    encounters: (encountersResponse.data ?? []) as Encounter[], admissions: (admissionsResponse.data ?? []) as Admission[],
    vitals: (vitalsResponse.data ?? []) as VitalSign[], notes: (notesResponse.data ?? []) as ClinicalNote[], diagnoses: (diagnosesResponse.data ?? []) as Diagnosis[],
    prescriptions: (prescriptionsResponse.data ?? []) as Prescription[], charges: (chargesResponse.data ?? []) as EncounterCharge[],
    radiology: (radiologyResponse.data ?? []) as RadiologyRequest[]
  };
}

export function PatientClinicalRecord({ patientId }: { patientId: string }) {
  const recordQuery = useQuery({ queryKey: ["hospital", "patient-record", patientId], queryFn: () => fetchPatientClinicalRecord(patientId) });
  if (recordQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading longitudinal clinical record...</CardContent></Card>;
  if (recordQuery.isError) return <Card><CardHeader><CardTitle>Clinical record unavailable</CardTitle><CardDescription>{recordQuery.error instanceof Error ? recordQuery.error.message : "Unable to load the hospital record."}</CardDescription></CardHeader></Card>;
  const data = recordQuery.data;
  const activeAdmission = data?.admissions.find((item) => item.status === "Admitted");
  const latestVitals = data?.vitals[0];
  const outstanding = data?.charges.reduce((sum, charge) => sum + Math.max(Number(charge.total_amount) - Number(charge.amount_paid), 0), 0) ?? 0;

  return <section className="space-y-6">
    <div className="flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold text-slate-950">Hospital clinical record</h2><p className="mt-1 text-sm text-slate-600">Encounters, ward stays, vitals, presentations, diagnoses, medication, reports, and account history.</p></div><Badge variant="outline">Longitudinal record</Badge></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      [Activity, "Encounters", data?.encounters.length ?? 0, "All visits"],
      [BedDouble, "Current ward", activeAdmission?.wards?.name ?? "Not admitted", activeAdmission ? `Since ${formatDate(activeAdmission.admitted_at)}` : "Outpatient"],
      [HeartPulse, "Latest BP", latestVitals ? `${latestVitals.systolic_bp ?? "-"}/${latestVitals.diastolic_bp ?? "-"}` : "Not recorded", latestVitals ? formatDate(latestVitals.measured_at) : "No observations"],
      [ReceiptText, "Balance", money(outstanding), "Clinical services"]
    ].map(([Icon, label, value, hint]) => { const MetricIcon = Icon as typeof Activity; return <Card key={String(label)}><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-wider text-slate-500">{String(label)}</p><p className="mt-2 text-xl font-semibold">{String(value)}</p><p className="mt-1 text-xs text-slate-500">{String(hint)}</p></div><MetricIcon className="h-5 w-5 text-teal-700" /></div></CardContent></Card>; })}</div>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-teal-700" />Diagnoses & clinical documentation</CardTitle><CardDescription>Working, confirmed, and final diagnoses with clinical reports.</CardDescription></CardHeader><CardContent className="space-y-3">{(data?.diagnoses ?? []).map((diagnosis) => <div key={diagnosis.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{diagnosis.diagnosis_name}</p><p className="text-xs text-slate-500">{diagnosis.icd10_code || "No ICD-10"} · {diagnosis.diagnosis_type} · {formatDate(diagnosis.diagnosed_at)}</p></div><Badge>{diagnosis.status}</Badge></div></div>)}{(data?.notes ?? []).map((note) => <div key={note.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><p className="font-semibold">{note.report_title || note.note_type}</p><FileText className="h-4 w-4 text-slate-400" /></div><p className="mt-2 text-sm text-slate-700">{note.chief_complaint || note.assessment || "Clinical document"}</p><p className="mt-2 text-xs text-slate-500">{formatDate(note.authored_at)}</p></div>)}{!data?.diagnoses.length && !data?.notes.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No clinical documentation yet.</p> : null}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Pill className="h-5 w-5 text-emerald-700" />Medication & admission history</CardTitle><CardDescription>Prescriptions, dispensing status, wards, beds, and dates.</CardDescription></CardHeader><CardContent className="space-y-3">{(data?.prescriptions ?? []).map((prescription) => <div key={prescription.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><p className="font-semibold">Prescription · {prescription.clinical_encounters?.encounter_number}</p><Badge variant={prescription.status === "Dispensed" ? "secondary" : "default"}>{prescription.status}</Badge></div>{(prescription.prescription_items ?? []).map((item) => <p key={item.id} className="mt-2 text-sm text-slate-700">{item.medication_name} · {item.dose} · {item.frequency} · {item.duration}</p>)}<p className="mt-2 text-xs text-slate-500">{formatDate(prescription.prescribed_at)}</p></div>)}{(data?.admissions ?? []).map((admission) => <div key={admission.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><p className="font-semibold">{admission.wards?.name} · Bed {admission.beds?.bed_number ?? "unassigned"}</p><Badge variant="outline">{admission.status}</Badge></div><p className="mt-2 text-sm text-slate-600">{admission.admission_reason || "No admission reason recorded"}</p><p className="mt-2 text-xs text-slate-500">Admitted {formatDate(admission.admitted_at)}{admission.discharged_at ? ` · Discharged ${formatDate(admission.discharged_at)}` : ""}</p></div>)}{!data?.prescriptions.length && !data?.admissions.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No medication or admission history yet.</p> : null}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ScanSearch className="h-5 w-5 text-violet-700" />Radiology & imaging</CardTitle><CardDescription>Requests, clinical indications, workflow status, findings, and impressions.</CardDescription></CardHeader><CardContent className="space-y-3">{(data?.radiology ?? []).map((request) => <div key={request.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{request.radiology_services?.name} · {request.radiology_services?.modality}</p><p className="mt-1 text-xs text-slate-500">{request.request_number} · {formatDate(request.requested_at)}</p></div><Badge>{request.status}</Badge></div><p className="mt-3 text-sm"><strong>Indication:</strong> {request.clinical_indication}</p>{request.radiology_reports?.[0] ? <div className="mt-3 rounded-lg bg-violet-50 p-3 text-sm"><p><strong>Findings:</strong> {request.radiology_reports[0].findings}</p><p className="mt-2"><strong>Impression:</strong> {request.radiology_reports[0].impression}</p></div> : null}</div>)}{!data?.radiology.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No radiology history yet.</p> : null}</CardContent></Card>
    </div>
  </section>;
}
