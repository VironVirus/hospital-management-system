"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BedDouble, Download, FileText, HeartPulse, Loader2, Pill, Printer, ReceiptText, ScanSearch, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildBillingDocumentHtml, type BillingDocumentRecord } from "@/features/billing/billing-document";
import { buildRadiologyReportHtml } from "@/features/radiology/radiology-report-document";
import { buildPatientCareLabTests, buildPatientCareReportHtml, type PatientCareReportPayload } from "@/features/patients/patient-care-report";
import type { ReportOrderRow } from "@/features/reports/report-utils";
import { useToast } from "@/hooks/use-toast";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import { downloadHtmlDocument, printHtmlDocument } from "@/lib/print";
import type { Tables } from "@/types/database";
import type { Admission, ClinicalNote, Diagnosis, Encounter, EncounterCharge, Prescription, RadiologyRequest, VitalSign } from "@/types/hospital";

type PatientIdentity = {
  address?: string | null;
  allergies?: string | null;
  bloodGroup?: string | null;
  dateOfBirth?: string | null;
  email?: string | null;
  emergencyContact?: string | null;
  genotype?: string | null;
  hospitalId: string;
  insuranceNumber?: string | null;
  insuranceProvider?: string | null;
  lga?: string | null;
  medicalRecordNumber?: string | null;
  name: string;
  nationalId?: string | null;
  phone: string | null;
  sex?: string | null;
  state?: string | null;
};
type PatientInvoice = Tables<"invoices"> & {
  invoice_items: Tables<"invoice_items">[] | null;
  invoice_payments: Tables<"invoice_payments">[] | null;
};
type HospitalPayment = {
  amount: number;
  charge_id: string;
  id: string;
  payment_method: string;
  received_at: string;
  reference_number: string | null;
};
type PatientRecordData = Awaited<ReturnType<typeof fetchPatientClinicalRecord>>;

const VitalsHistoryChart = dynamic(
  () => import("@/features/patients/vitals-history-chart").then((module) => module.VitalsHistoryChart),
  { ssr: false, loading: () => <Card><CardContent className="h-[380px] animate-pulse bg-slate-50" /></Card> }
);

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

async function fetchPatientClinicalRecord(patientId: string) {
  const hospital = getHospitalClient();
  const [encountersResponse, admissionsResponse, vitalsResponse, notesResponse, diagnosesResponse, prescriptionsResponse, chargesResponse, radiologyResponse, ordersResponse, hospitalPaymentsResponse] = await Promise.all([
    hospital.from("clinical_encounters").select("*").eq("patient_id", patientId).order("started_at", { ascending: false }),
    hospital.from("admissions").select("id, patient_id, encounter_id, ward_id, bed_id, status, admission_reason, admitted_at, discharged_at, wards(id, name, code), beds(id, bed_number), clinical_encounters(id, encounter_number)").eq("patient_id", patientId).order("admitted_at", { ascending: false }),
    hospital.from("vital_signs").select("*").eq("patient_id", patientId).order("measured_at", { ascending: false }),
    hospital.from("clinical_notes").select("*").eq("patient_id", patientId).order("authored_at", { ascending: false }),
    hospital.from("diagnoses").select("*").eq("patient_id", patientId).order("diagnosed_at", { ascending: false }),
    hospital.from("prescriptions").select("id, patient_id, encounter_id, status, notes, prescribed_at, dispensed_at, clinical_encounters(id, encounter_number), prescription_items(id, medication_id, medication_name, dose, frequency, duration, route, quantity, dispensed_quantity, instructions, unit_price)").eq("patient_id", patientId).order("prescribed_at", { ascending: false }),
    hospital.from("encounter_charges").select("id, patient_id, encounter_id, description, category, quantity, unit_price, total_amount, amount_paid, payment_status, charged_at, clinical_encounters(id, encounter_number)").eq("patient_id", patientId).order("charged_at", { ascending: false }),
    hospital.from("radiology_requests").select("id, facility_id, request_number, patient_id, encounter_id, service_id, clinical_indication, priority, status, scheduled_at, requested_at, completed_at, clinical_encounters(id, encounter_number), radiology_services(id, name, modality, unit_price), radiology_reports(*)").eq("patient_id", patientId).order("requested_at", { ascending: false }),
    hospital.from("orders").select("id").eq("patient_id", patientId),
    hospital.from("hospital_payments").select("*").eq("patient_id", patientId).order("received_at", { ascending: false })
  ]);
  [encountersResponse, admissionsResponse, vitalsResponse, notesResponse, diagnosesResponse, prescriptionsResponse, chargesResponse, radiologyResponse, ordersResponse, hospitalPaymentsResponse].forEach((response) => throwIfHospitalError(response.error));
  const orderIds = ((ordersResponse.data ?? []) as Array<{ id: string }>).map((order) => order.id);
  const invoicesResponse = orderIds.length
    ? await hospital.from("invoices").select("*, invoice_items(*), invoice_payments(*)").in("order_id", orderIds).order("issued_at", { ascending: false })
    : { data: [], error: null };
  throwIfHospitalError(invoicesResponse.error);
  return {
    encounters: (encountersResponse.data ?? []) as Encounter[], admissions: (admissionsResponse.data ?? []) as Admission[],
    vitals: (vitalsResponse.data ?? []) as VitalSign[], notes: (notesResponse.data ?? []) as ClinicalNote[], diagnoses: (diagnosesResponse.data ?? []) as Diagnosis[],
    prescriptions: (prescriptionsResponse.data ?? []) as Prescription[], charges: (chargesResponse.data ?? []) as EncounterCharge[],
    radiology: (radiologyResponse.data ?? []) as RadiologyRequest[], invoices: (invoicesResponse.data ?? []) as PatientInvoice[],
    hospitalPayments: (hospitalPaymentsResponse.data ?? []) as HospitalPayment[]
  };
}

function billingRecords(data: PatientRecordData, patient: PatientIdentity): BillingDocumentRecord[] {
  return [
    ...data.invoices.map((invoice) => ({
      amountPaid: Number(invoice.amount_paid), date: invoice.issued_at,
      items: (invoice.invoice_items ?? []).map((item) => ({ description: item.test_name, quantity: Number(item.quantity), unitPrice: Number(item.unit_price), total: Number(item.line_total) })),
      payments: (invoice.invoice_payments ?? []).map((payment) => ({ amount: Number(payment.amount), date: payment.received_at, method: payment.payment_method, reference: payment.reference_number })),
      patientHospitalId: patient.hospitalId, patientName: patient.name, patientPhone: patient.phone,
      reference: invoice.invoice_number, status: invoice.payment_status, total: Number(invoice.total_amount)
    })),
    ...data.charges.map((charge) => ({
      amountPaid: Number(charge.amount_paid), date: charge.charged_at,
      items: [{ description: charge.description, quantity: Number(charge.quantity), unitPrice: Number(charge.unit_price), total: Number(charge.total_amount) }],
      payments: data.hospitalPayments.filter((payment) => payment.charge_id === charge.id).map((payment) => ({ amount: Number(payment.amount), date: payment.received_at, method: payment.payment_method, reference: payment.reference_number })),
      patientHospitalId: patient.hospitalId, patientName: patient.name, patientPhone: patient.phone,
      reference: charge.clinical_encounters?.encounter_number || `Charge ${charge.id.slice(0, 8)}`, status: charge.payment_status, total: Number(charge.total_amount)
    }))
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

export function PatientClinicalRecord({ labOrders, patient, patientId }: { labOrders: ReportOrderRow[]; patient: PatientIdentity; patientId: string }) {
  const { facilityName } = useAuth();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"clinical" | "medication" | "radiology" | "billing">("clinical");
  const [patientReportBusy, setPatientReportBusy] = useState(false);
  const recordQuery = useQuery({ queryKey: ["hospital", "patient-record", patientId], queryFn: () => fetchPatientClinicalRecord(patientId) });
  if (recordQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading record...</CardContent></Card>;
  if (recordQuery.isError || !recordQuery.data) return <Card><CardHeader><CardTitle>Record unavailable</CardTitle></CardHeader></Card>;
  const data = recordQuery.data;
  const activeAdmission = data.admissions.find((item) => item.status === "Admitted");
  const openEncounter = data.encounters.find((item) => item.status === "Open");
  const latestVitals = data.vitals[0];
  const bills = billingRecords(data, patient);
  const outstanding = bills.reduce((sum, bill) => sum + Math.max(bill.total - bill.amountPaid, 0), 0);
  const patientStatus = activeAdmission ? `Admitted · ${activeAdmission.wards?.name}` : openEncounter ? "In consultation" : "Outpatient";
  const statementHtml = buildBillingDocumentHtml({ records: bills, title: "Patient billing statement" });
  const patientCareReport = (): PatientCareReportPayload => ({
    admissions: data.admissions,
    bills,
    diagnoses: data.diagnoses,
    encounters: data.encounters,
    generatedAt: new Date().toISOString(),
    hospitalName: facilityName || "St Gianna Specialist Hospital",
    labTests: buildPatientCareLabTests(labOrders),
    notes: data.notes,
    patient,
    prescriptions: data.prescriptions,
    radiology: data.radiology,
    vitals: data.vitals
  });
  const printPatientReport = () => printHtmlDocument(buildPatientCareReportHtml(patientCareReport()));
  const downloadPatientReport = async () => {
    try {
      setPatientReportBusy(true);
      const [{ pdf }, { PatientCareReportDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/features/patients/patient-care-report-pdf")
      ]);
      const blob = await pdf(<PatientCareReportDocument report={patientCareReport()} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${patient.hospitalId}-patient-care-report.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Patient report downloaded", variant: "success" });
    } catch (error) {
      toast({ title: "Patient report unavailable", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setPatientReportBusy(false);
    }
  };
  const downloadRadiologyReport = async (request: RadiologyRequest) => {
    const [{ pdf }, { RadiologyReportDocument }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("@/features/radiology/radiology-report-pdf")
    ]);
    const blob = await pdf(<RadiologyReportDocument request={request} />).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${request.request_number}-radiology-report.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-xl font-semibold text-slate-950">Patient record</h2><div className="flex gap-2"><Button type="button" variant="outline" onClick={printPatientReport}><Printer className="h-4 w-4" />Print patient report</Button><Button type="button" variant="outline" disabled={patientReportBusy} onClick={() => void downloadPatientReport()}>{patientReportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download PDF</Button></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      [Activity, "Status", patientStatus, openEncounter?.encounter_number || "Current status"],
      [BedDouble, "Current ward", activeAdmission?.wards?.name ?? "Not admitted", activeAdmission ? `Since ${formatDate(activeAdmission.admitted_at)}` : "Outpatient"],
      [HeartPulse, "Latest BP", latestVitals ? `${latestVitals.systolic_bp ?? "-"}/${latestVitals.diastolic_bp ?? "-"}` : "Not recorded", latestVitals ? formatDate(latestVitals.measured_at) : "No observations"],
      [ReceiptText, "Balance", money(outstanding), `${bills.length} bill${bills.length === 1 ? "" : "s"}`]
    ].map(([Icon, label, value, hint]) => { const MetricIcon = Icon as typeof Activity; return <Card key={String(label)}><CardContent className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-wider text-slate-500">{String(label)}</p><p className="mt-2 text-xl font-semibold">{String(value)}</p><p className="mt-1 text-xs text-slate-500">{String(hint)}</p></div><MetricIcon className="h-5 w-5 text-teal-700" /></div></CardContent></Card>; })}</div>
    <VitalsHistoryChart vitals={data.vitals} />
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[
      ["clinical", "Clinical", data.diagnoses.length + data.notes.length],
      ["medication", "Medication & ward", data.prescriptions.length + data.admissions.length],
      ["radiology", "Radiology", data.radiology.length],
      ["billing", "Billing", bills.length]
    ].map(([key, label, count]) => <button key={String(key)} type="button" onClick={() => setActiveSection(key as typeof activeSection)} className={`rounded-xl border p-3 text-left ${activeSection === key ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white"}`}><span className="block text-sm font-medium text-slate-900">{String(label)}</span><span className="text-xs text-slate-500">{String(count)} record{Number(count) === 1 ? "" : "s"}</span></button>)}</div>
    <div>
      {activeSection === "clinical" ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-teal-700" />Diagnoses and reports</CardTitle></CardHeader><CardContent className="space-y-3">{data.diagnoses.map((diagnosis) => <div key={diagnosis.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{diagnosis.diagnosis_name}</p><p className="text-xs text-slate-500">{diagnosis.icd10_code || "No ICD-10"} · {diagnosis.diagnosis_type} · {formatDate(diagnosis.diagnosed_at)}</p></div><Badge>{diagnosis.status}</Badge></div></div>)}{data.notes.map((note) => <div key={note.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><p className="font-semibold">{note.report_title || note.note_type}</p><FileText className="h-4 w-4 text-slate-400" /></div><p className="mt-2 text-sm text-slate-700">{note.assessment || note.plan || "Clinical report"}</p><p className="mt-2 text-xs text-slate-500">{formatDate(note.authored_at)}</p></div>)}{!data.diagnoses.length && !data.notes.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No clinical reports.</p> : null}</CardContent></Card> : null}
      {activeSection === "medication" ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Pill className="h-5 w-5 text-emerald-700" />Prescriptions and ward history</CardTitle></CardHeader><CardContent className="space-y-3">{data.prescriptions.map((prescription) => <div key={prescription.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><p className="font-semibold">{prescription.clinical_encounters?.encounter_number || "Prescription"}</p><Badge variant={prescription.status === "Dispensed" ? "secondary" : "default"}>{prescription.status}</Badge></div>{(prescription.prescription_items ?? []).map((item) => <p key={item.id} className="mt-2 text-sm text-slate-700">{item.medication_name} · {item.dose} · {item.frequency} · {item.duration} · Qty {item.quantity}</p>)}<p className="mt-2 text-xs text-slate-500">{formatDate(prescription.prescribed_at)}</p></div>)}{data.admissions.map((admission) => <div key={admission.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><p className="font-semibold">{admission.wards?.name} · Bed {admission.beds?.bed_number ?? "unassigned"}</p><Badge variant="outline">{admission.status}</Badge></div><p className="mt-2 text-sm text-slate-600">{admission.admission_reason || "No admission reason recorded"}</p><p className="mt-2 text-xs text-slate-500">Admitted {formatDate(admission.admitted_at)}{admission.discharged_at ? ` · Discharged ${formatDate(admission.discharged_at)}` : ""}</p></div>)}{!data.prescriptions.length && !data.admissions.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No prescriptions or ward history.</p> : null}</CardContent></Card> : null}
      {activeSection === "radiology" ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><ScanSearch className="h-5 w-5 text-violet-700" />Radiology requests and reports</CardTitle></CardHeader><CardContent className="space-y-3">{data.radiology.map((request) => <div key={request.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{request.radiology_services?.name} · {request.radiology_services?.modality}</p><p className="mt-1 text-xs text-slate-500">{request.request_number} · {formatDate(request.requested_at)}</p></div><Badge>{request.status}</Badge></div><p className="mt-3 text-sm"><strong>Indication:</strong> {request.clinical_indication}</p>{request.radiology_reports?.[0] ? <div className="mt-3 rounded-lg bg-violet-50 p-3 text-sm"><p><strong>Findings:</strong> {request.radiology_reports[0].findings}</p><p className="mt-2"><strong>Impression:</strong> {request.radiology_reports[0].impression}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => printHtmlDocument(buildRadiologyReportHtml(request))}><Printer className="h-4 w-4" />Print report</Button><Button size="sm" variant="outline" onClick={() => void downloadRadiologyReport(request)}><Download className="h-4 w-4" />Download PDF</Button></div></div> : null}</div>)}{!data.radiology.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No radiology requests.</p> : null}</CardContent></Card> : null}
      {activeSection === "billing" ? <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-blue-700" />Bills and payments</CardTitle><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!bills.length} onClick={() => printHtmlDocument(statementHtml)}><Printer className="h-4 w-4" />Print</Button><Button size="sm" variant="outline" disabled={!bills.length} onClick={() => downloadHtmlDocument(statementHtml, `${patient.hospitalId}-billing-statement.html`)}><Download className="h-4 w-4" />Download</Button></div></div></CardHeader><CardContent className="space-y-3">{bills.map((bill) => <div key={`${bill.reference}-${bill.date}`} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{bill.reference}</p><p className="mt-1 text-xs text-slate-500">{bill.items.map((item) => item.description).join(", ")} · {formatDate(bill.date)}</p></div><Badge variant="outline">{bill.status}</Badge></div><div className="mt-3 flex flex-wrap gap-4 text-sm"><span>Total {money(bill.total)}</span><span>Paid {money(bill.amountPaid)}</span><strong>Due {money(Math.max(bill.total - bill.amountPaid, 0))}</strong></div></div>)}{!bills.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No bills.</p> : null}</CardContent></Card> : null}
    </div>
  </section>;
}
