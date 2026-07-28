"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  ClipboardList,
  Download,
  FilePlus2,
  FlaskConical,
  HeartPulse,
  Loader2,
  Pill,
  Plus,
  Printer,
  Search,
  Send,
  Stethoscope,
  Trash2,
  UserRound
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildClinicalReportHtml, type ClinicalReportPayload } from "@/features/clinical/clinical-report";
import { useToast } from "@/hooks/use-toast";
import {
  canAccessClinicalRole,
  canManageClinicalRole,
  canOpenEncountersRole,
  canPrescribeRole
} from "@/lib/guards";
import { getAppClient } from "@/lib/app-client";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import { generateId } from "@/lib/online-core";
import { printHtmlDocument } from "@/lib/print";
import type { Tables } from "@/types/database";
import type {
  Admission,
  ClinicalNote,
  Diagnosis,
  Encounter,
  Medication,
  PatientOption,
  Prescription,
  VitalSign
} from "@/types/hospital";

type ClinicalPanel = "vitals" | "presentation" | "diagnosis" | "lab" | "treatment" | "report";
type ClinicalTest = Pick<Tables<"tests">, "id" | "test_code" | "name" | "category" | "price">;
type ReportScope = ClinicalReportPayload["scope"];
type TreatmentItem = {
  client_id: string;
  medication_id: string;
  medication_name: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string;
  quantity: string;
  instructions: string;
};

const initialVitals = {
  temperature_c: "",
  pulse_bpm: "",
  respiratory_rate: "",
  systolic_bp: "",
  diastolic_bp: "",
  oxygen_saturation: "",
  weight_kg: "",
  height_cm: "",
  blood_glucose_mmol: "",
  pain_score: "",
  notes: ""
};

const initialNote = {
  chief_complaint: "",
  history_of_presenting_illness: "",
  examination: "",
  assessment: "",
  plan: "",
  report_title: ""
};

const initialTreatmentItem = {
  medication_id: "",
  dose: "",
  frequency: "",
  duration: "",
  route: "",
  quantity: "1",
  instructions: ""
};

const vitalFields = [
  { key: "temperature_c", label: "Temperature °C", placeholder: "36.5–37.3", step: "0.1" },
  { key: "pulse_bpm", label: "Pulse bpm", placeholder: "60–100", step: "1" },
  { key: "respiratory_rate", label: "Respiration /min", placeholder: "12–18", step: "1" },
  { key: "systolic_bp", label: "Systolic mmHg", placeholder: "90–120", step: "1" },
  { key: "diastolic_bp", label: "Diastolic mmHg", placeholder: "60–80", step: "1" },
  { key: "oxygen_saturation", label: "SpO₂ %", placeholder: "95–100", step: "0.1" },
  { key: "weight_kg", label: "Weight kg", placeholder: "e.g. 70", step: "0.1" },
  { key: "height_cm", label: "Height cm", placeholder: "e.g. 170", step: "0.1" },
  { key: "blood_glucose_mmol", label: "Glucose mmol/L", placeholder: "4.0–5.6 fasting", step: "0.1" },
  { key: "pain_score", label: "Pain score", placeholder: "0–10", step: "1" }
] as const;

const panelDetails: Array<{ key: ClinicalPanel; label: string; icon: typeof Activity }> = [
  { key: "vitals", label: "Vitals", icon: HeartPulse },
  { key: "presentation", label: "Clinical notes", icon: Activity },
  { key: "diagnosis", label: "Diagnosis", icon: Stethoscope },
  { key: "lab", label: "Send to lab", icon: FlaskConical },
  { key: "treatment", label: "Treatment", icon: Pill },
  { key: "report", label: "Report", icon: FilePlus2 }
];

const selectClassName =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-base sm:h-10 sm:text-sm";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function optionalNumber(value: string) {
  const normalized = value.trim();
  return normalized ? Number(normalized) : null;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function fetchClinicalWorkspace() {
  const database = getAppClient();
  const hospital = getHospitalClient();
  const [patientsResponse, encountersResponse, testsResponse, medicationsResponse, admissionsResponse] = await Promise.all([
    database.from("patients").select("id, facility_id, name, hospital_id, lab_id, phone, created_at").order("created_at", { ascending: false }).limit(500),
    hospital.from("clinical_encounters").select("id, facility_id, patient_id, encounter_number, encounter_type, status, attending_clinician, started_at, ended_at, patients(id, facility_id, name, hospital_id, lab_id, phone, created_at)").order("started_at", { ascending: false }).limit(500),
    database.from("tests").select("id, test_code, name, category, price").eq("is_active", true).order("name", { ascending: true }).limit(500),
    hospital.from("medications").select("*").eq("is_active", true).order("generic_name", { ascending: true }).limit(500),
    hospital.from("admissions").select("id, patient_id, encounter_id, ward_id, bed_id, status, admission_reason, admitted_at, discharged_at, wards(id, name, code), beds(id, bed_number)").eq("status", "Admitted").order("admitted_at", { ascending: false }).limit(300)
  ]);
  if (patientsResponse.error) throw new Error(patientsResponse.error.message);
  if (testsResponse.error) throw new Error(testsResponse.error.message);
  [encountersResponse, medicationsResponse, admissionsResponse].forEach((response) => throwIfHospitalError(response.error));
  return {
    patients: (patientsResponse.data ?? []) as PatientOption[],
    encounters: (encountersResponse.data ?? []) as Encounter[],
    tests: (testsResponse.data ?? []) as ClinicalTest[],
    medications: (medicationsResponse.data ?? []) as Medication[],
    admissions: (admissionsResponse.data ?? []) as Admission[]
  };
}

async function fetchEncounterChart(encounterId: string) {
  const hospital = getHospitalClient();
  const [vitalsResponse, notesResponse, diagnosesResponse, prescriptionsResponse] = await Promise.all([
    hospital.from("vital_signs").select("*").eq("encounter_id", encounterId).order("measured_at", { ascending: false }),
    hospital.from("clinical_notes").select("*").eq("encounter_id", encounterId).order("authored_at", { ascending: false }),
    hospital.from("diagnoses").select("*").eq("encounter_id", encounterId).order("diagnosed_at", { ascending: false }),
    hospital.from("prescriptions").select("id, patient_id, encounter_id, status, notes, prescribed_at, dispensed_at, prescription_items(id, medication_id, medication_name, dose, frequency, duration, route, quantity, dispensed_quantity, instructions, unit_price)").eq("encounter_id", encounterId).order("prescribed_at", { ascending: false })
  ]);
  [vitalsResponse, notesResponse, diagnosesResponse, prescriptionsResponse].forEach((response) => throwIfHospitalError(response.error));
  return {
    vitals: (vitalsResponse.data ?? []) as VitalSign[],
    notes: (notesResponse.data ?? []) as ClinicalNote[],
    diagnoses: (diagnosesResponse.data ?? []) as Diagnosis[],
    prescriptions: (prescriptionsResponse.data ?? []) as Prescription[]
  };
}

export function ClinicalWorkspace() {
  const { facilityId, facilityName, loading, role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedEncounterId, setSelectedEncounterId] = useState("");
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<ClinicalPanel>("vitals");
  const [encounterType, setEncounterType] = useState<Encounter["encounter_type"]>("Outpatient");
  const [vitals, setVitals] = useState(initialVitals);
  const [note, setNote] = useState(initialNote);
  const [diagnosis, setDiagnosis] = useState({ diagnosis_name: "", icd10_code: "", diagnosis_type: "Working", notes: "" });
  const [testSearch, setTestSearch] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [labPriority, setLabPriority] = useState("routine");
  const [labNotes, setLabNotes] = useState("");
  const [treatmentItem, setTreatmentItem] = useState(initialTreatmentItem);
  const [treatmentItems, setTreatmentItems] = useState<TreatmentItem[]>([]);
  const [treatmentNotes, setTreatmentNotes] = useState("");
  const [reportScope, setReportScope] = useState<ReportScope>("full");
  const [saving, setSaving] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  const canAccess = canAccessClinicalRole(role);
  const canManage = canManageClinicalRole(role);
  const canOpenEncounter = canOpenEncountersRole(role);
  const canSendToLab = canOpenEncounter;
  const canPrescribe = canPrescribeRole(role);
  const workspaceQuery = useQuery({
    queryKey: ["hospital", "clinical-workspace"],
    queryFn: fetchClinicalWorkspace,
    enabled: Boolean(facilityId && canAccess)
  });

  const patients = useMemo(() => workspaceQuery.data?.patients ?? [], [workspaceQuery.data]);
  const encounters = useMemo(() => workspaceQuery.data?.encounters ?? [], [workspaceQuery.data]);
  const selectedPatient = patients.find((item) => item.id === selectedPatientId) ?? patients[0] ?? null;
  const patientEncounters = useMemo(
    () => encounters.filter((encounter) => encounter.patient_id === selectedPatient?.id),
    [encounters, selectedPatient?.id]
  );
  const selectedEncounter = patientEncounters.find((item) => item.id === selectedEncounterId) ?? patientEncounters[0] ?? null;
  const selectedAdmission = (workspaceQuery.data?.admissions ?? []).find((item) => item.patient_id === selectedPatient?.id) ?? null;
  const effectiveEncounterId = selectedEncounter?.id ?? "";
  const chartQuery = useQuery({
    queryKey: ["hospital", "encounter-chart", effectiveEncounterId],
    queryFn: () => fetchEncounterChart(effectiveEncounterId),
    enabled: Boolean(effectiveEncounterId && canAccess)
  });
  const chart = chartQuery.data;

  const filteredPatients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((patient) =>
      [patient.name, patient.hospital_id, patient.lab_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [patients, search]);

  const filteredTests = useMemo(() => {
    const term = testSearch.trim().toLowerCase();
    return (workspaceQuery.data?.tests ?? []).filter((test) =>
      !term || [test.name, test.test_code, test.category].filter(Boolean).join(" ").toLowerCase().includes(term)
    );
  }, [testSearch, workspaceQuery.data?.tests]);

  const refreshChart = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hospital", "clinical-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "encounter-chart", effectiveEncounterId] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "overview"] })
    ]);
  };

  const selectPatient = (patient: PatientOption) => {
    setSelectedPatientId(patient.id);
    setSelectedEncounterId(encounters.find((encounter) => encounter.patient_id === patient.id)?.id ?? "");
    setPanel("vitals");
  };

  const createEncounter = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !selectedPatient) return;
    const id = generateId();
    try {
      setSaving(true);
      const { error } = await getHospitalClient().from("clinical_encounters").insert({
        id,
        facility_id: facilityId,
        patient_id: selectedPatient.id,
        encounter_type: encounterType,
        attending_clinician: role === "Doctor" ? user?.id ?? null : null,
        created_by: user?.id ?? null
      });
      throwIfHospitalError(error);
      setSelectedEncounterId(id);
      await refreshChart();
      toast({ title: "Visit started", variant: "success" });
    } catch (error) {
      toast({ title: "Visit not started", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const saveVitals = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !selectedEncounter) return;
    const height = optionalNumber(vitals.height_cm);
    const weight = optionalNumber(vitals.weight_kg);
    const bmi = height && weight ? Number((weight / ((height / 100) ** 2)).toFixed(2)) : null;
    try {
      setSaving(true);
      const { error } = await getHospitalClient().from("vital_signs").insert({
        id: generateId(),
        facility_id: facilityId,
        patient_id: selectedEncounter.patient_id,
        encounter_id: selectedEncounter.id,
        measured_by: user?.id ?? null,
        bmi,
        ...Object.fromEntries(Object.entries(vitals).map(([key, value]) => [key, key === "notes" ? value.trim() || null : optionalNumber(value)]))
      });
      throwIfHospitalError(error);
      setVitals(initialVitals);
      await refreshChart();
      toast({ title: "Vitals recorded", variant: "success" });
    } catch (error) {
      toast({ title: "Vitals not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !selectedEncounter) return;
    const noteType = panel === "report" ? "Clinical Report" : "Clinical Presentation";
    try {
      setSaving(true);
      const { error } = await getHospitalClient().from("clinical_notes").insert({
        id: generateId(),
        facility_id: facilityId,
        patient_id: selectedEncounter.patient_id,
        encounter_id: selectedEncounter.id,
        note_type: noteType,
        authored_by: user?.id ?? null,
        ...Object.fromEntries(Object.entries(note).map(([key, value]) => [key, value.trim() || null]))
      });
      throwIfHospitalError(error);
      setNote(initialNote);
      await refreshChart();
      toast({ title: noteType === "Clinical Report" ? "Report note saved" : "Clinical note saved", variant: "success" });
    } catch (error) {
      toast({ title: "Note not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const saveDiagnosis = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !selectedEncounter || !diagnosis.diagnosis_name.trim()) return;
    try {
      setSaving(true);
      const { error } = await getHospitalClient().from("diagnoses").insert({
        id: generateId(),
        facility_id: facilityId,
        patient_id: selectedEncounter.patient_id,
        encounter_id: selectedEncounter.id,
        diagnosed_by: user?.id ?? null,
        diagnosis_name: diagnosis.diagnosis_name.trim(),
        icd10_code: diagnosis.icd10_code.trim() || null,
        diagnosis_type: diagnosis.diagnosis_type,
        notes: diagnosis.notes.trim() || null
      });
      throwIfHospitalError(error);
      setDiagnosis({ diagnosis_name: "", icd10_code: "", diagnosis_type: "Working", notes: "" });
      await refreshChart();
      toast({ title: "Diagnosis recorded", variant: "success" });
    } catch (error) {
      toast({ title: "Diagnosis not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const sendToLab = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPatient || !selectedEncounter || !selectedTestIds.length) return;
    try {
      setSaving(true);
      const { data, error } = await getAppClient().rpc("create_clinical_lab_order", {
        patient_id: selectedPatient.id,
        encounter_id: selectedEncounter.id,
        test_ids: selectedTestIds,
        priority: labPriority,
        notes: labNotes.trim() || null
      });
      if (error) throw new Error(error.message);
      const result = data as { order_number?: string } | null;
      setSelectedTestIds([]);
      setLabNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["billing"] }),
        queryClient.invalidateQueries({ queryKey: ["hospital", "overview"] })
      ]);
      toast({ title: `Sent to laboratory${result?.order_number ? ` · ${result.order_number}` : ""}`, variant: "success" });
    } catch (error) {
      toast({ title: "Laboratory request not sent", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const addTreatmentItem = () => {
    const medication = (workspaceQuery.data?.medications ?? []).find((item) => item.id === treatmentItem.medication_id);
    if (!medication || !treatmentItem.dose.trim() || !treatmentItem.frequency.trim() || !treatmentItem.duration.trim()) {
      toast({ title: "Complete the drug, dose, frequency, and duration", variant: "error" });
      return;
    }
    setTreatmentItems((current) => [...current, {
      client_id: generateId(),
      ...treatmentItem,
      medication_name: [medication.generic_name, medication.brand_name, medication.strength].filter(Boolean).join(" · ")
    }]);
    setTreatmentItem(initialTreatmentItem);
  };

  const saveTreatment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPatient || !selectedEncounter || !treatmentItems.length) return;
    try {
      setSaving(true);
      const { error } = await getAppClient().rpc("create_clinical_prescription", {
        patient_id: selectedPatient.id,
        encounter_id: selectedEncounter.id,
        notes: treatmentNotes.trim() || null,
        items: treatmentItems.map((item) => ({
          medication_id: item.medication_id,
          dose: item.dose,
          frequency: item.frequency,
          duration: item.duration,
          route: item.route,
          quantity: item.quantity,
          instructions: item.instructions
        }))
      });
      if (error) throw new Error(error.message);
      setTreatmentItems([]);
      setTreatmentNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hospital", "encounter-chart", effectiveEncounterId] }),
        queryClient.invalidateQueries({ queryKey: ["hospital", "pharmacy"] }),
        queryClient.invalidateQueries({ queryKey: ["hospital", "billing"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts-workspace"] })
      ]);
      toast({ title: "Treatment plan sent to pharmacy", variant: "success" });
    } catch (error) {
      toast({ title: "Treatment plan not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const reportPayload = (): ClinicalReportPayload | null => {
    if (!selectedPatient || !selectedEncounter) return null;
    return {
      patient: selectedPatient,
      encounter: selectedEncounter,
      hospitalName: facilityName || "St Gianna Specialist Hospital",
      generatedAt: new Date().toISOString(),
      scope: reportScope,
      vitals: chart?.vitals ?? [],
      notes: chart?.notes ?? [],
      diagnoses: chart?.diagnoses ?? [],
      prescriptions: chart?.prescriptions ?? []
    };
  };

  const printReport = () => {
    const report = reportPayload();
    if (report) printHtmlDocument(buildClinicalReportHtml(report));
  };

  const downloadReport = async () => {
    const report = reportPayload();
    if (!report) return;
    try {
      setReportBusy(true);
      const [{ pdf }, { ClinicalReportDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/features/clinical/clinical-report-pdf")
      ]);
      const blob = await pdf(<ClinicalReportDocument report={report} />).toBlob();
      const id = (selectedPatient?.hospital_id || selectedPatient?.lab_id || "patient").toLowerCase();
      triggerDownload(blob, `${id}-${reportScope === "medications" ? "prescription" : "clinical-report"}.pdf`);
      toast({ title: "PDF downloaded", variant: "success" });
    } catch (error) {
      toast({ title: "PDF not created", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setReportBusy(false);
    }
  };

  if (loading || workspaceQuery.isLoading) {
    return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading...</CardContent></Card>;
  }
  if (!canAccess || !facilityId) {
    return <Card><CardHeader><CardTitle>Clinical access unavailable</CardTitle></CardHeader></Card>;
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-teal-100 bg-gradient-to-br from-teal-700 via-teal-600 to-cyan-500 text-white">
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:p-6 lg:grid-cols-[1.35fr_repeat(3,0.45fr)] lg:items-center">
          <div className="col-span-2 lg:col-span-1"><h2 className="text-2xl font-semibold">Clinical</h2></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-teal-50">Open visits</p><p className="mt-2 text-3xl font-semibold">{encounters.filter((item) => item.status === "Open").length}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-teal-50">Today</p><p className="mt-2 text-3xl font-semibold">{encounters.filter((item) => new Date(item.started_at).toDateString() === new Date().toDateString()).length}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-teal-50">Patients</p><p className="mt-2 text-3xl font-semibold">{patients.length}</p></div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.68fr_1.32fr]">
        <Card className="xl:sticky xl:top-20 xl:self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-teal-700" />Recent patients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400 sm:top-3" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or Hospital ID" /></div>
            <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
              {filteredPatients.map((patient) => {
                const active = selectedPatient?.id === patient.id;
                const latestEncounter = encounters.find((encounter) => encounter.patient_id === patient.id);
                return (
                  <button key={patient.id} type="button" onClick={() => selectPatient(patient)} className={`w-full rounded-2xl border p-4 text-left transition ${active ? "border-teal-400 bg-teal-50 shadow-sm" : "hover:border-slate-300 hover:bg-slate-50"}`}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-950">{patient.name}</p><p className="mt-1 text-xs font-medium text-teal-700">{patient.hospital_id ?? patient.lab_id}</p></div>{latestEncounter ? <Badge variant={latestEncounter.status === "Open" ? "default" : "secondary"}>{latestEncounter.status}</Badge> : <Badge variant="outline">New</Badge>}</div>
                    <div className="mt-3 flex justify-between gap-3 text-xs text-slate-500"><span>Registered {formatDateTime(patient.created_at)}</span>{latestEncounter ? <span>{latestEncounter.encounter_number}</span> : null}</div>
                  </button>
                );
              })}
              {!filteredPatients.length ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No patient found.</div> : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {selectedPatient ? (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-teal-700" />{selectedPatient.name}</CardTitle><CardDescription>{selectedPatient.hospital_id ?? selectedPatient.lab_id}{selectedAdmission ? ` · ${selectedAdmission.wards?.name ?? "Ward"} · Bed ${selectedAdmission.beds?.bed_number ?? "unassigned"}` : ""}</CardDescription></div>
                  <Button asChild variant="outline" size="sm"><Link href={`/patients/${selectedPatient.id}` as Route}>Patient record<ArrowRight className="h-4 w-4" /></Link></Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                  <div><Label>Visit</Label><select className={`mt-1 ${selectClassName}`} value={selectedEncounter?.id ?? ""} onChange={(event) => setSelectedEncounterId(event.target.value)}><option value="">No visit selected</option>{patientEncounters.map((encounter) => <option key={encounter.id} value={encounter.id}>{encounter.encounter_number} · {formatDateTime(encounter.started_at)} · {encounter.status}</option>)}</select></div>
                  <div><Label>New visit type</Label><select className={`mt-1 ${selectClassName}`} value={encounterType} onChange={(event) => setEncounterType(event.target.value as Encounter["encounter_type"])}>{["Outpatient", "Emergency", "Inpatient", "Telemedicine"].map((item) => <option key={item}>{item}</option>)}</select></div>
                  {canOpenEncounter ? <form onSubmit={createEncounter}><Button className="w-full" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Start new visit</Button></form> : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {selectedEncounter && selectedPatient ? (
            <Card>
              <CardHeader><CardTitle>{selectedEncounter.encounter_number}</CardTitle><CardDescription>{selectedEncounter.encounter_type} · {formatDateTime(selectedEncounter.started_at)}</CardDescription></CardHeader>
              <CardContent className="space-y-5">
                <div className="flex gap-2 overflow-x-auto pb-1">{panelDetails.map((item) => { const Icon = item.icon; return <Button key={item.key} type="button" size="sm" className="shrink-0" variant={panel === item.key ? "default" : "outline"} onClick={() => setPanel(item.key)}><Icon className="h-4 w-4" />{item.label}</Button>; })}</div>

                {panel === "vitals" ? (
                  <div className="space-y-5">
                    {canManage ? <form className="space-y-4 rounded-2xl border bg-slate-50 p-4" onSubmit={saveVitals}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{vitalFields.map((field) => <div key={field.key}><Label htmlFor={`vital-${field.key}`}>{field.label}</Label><Input id={`vital-${field.key}`} className="mt-1" type="number" step={field.step} placeholder={field.placeholder} value={vitals[field.key]} onChange={(event) => setVitals((current) => ({ ...current, [field.key]: event.target.value }))} /></div>)}</div><Textarea value={vitals.notes} onChange={(event) => setVitals((current) => ({ ...current, notes: event.target.value }))} placeholder="Observation notes" /><Button disabled={saving}>Record vital signs</Button></form> : null}
                    <div className="space-y-2">{(chart?.vitals ?? []).map((item) => <div key={item.id} className="rounded-xl border p-4"><div className="flex flex-wrap gap-2 text-sm"><Badge variant="outline">BP {item.systolic_bp ?? "-"}/{item.diastolic_bp ?? "-"}</Badge><Badge variant="outline">Temp {item.temperature_c ?? "-"}°C</Badge><Badge variant="outline">Pulse {item.pulse_bpm ?? "-"}</Badge><Badge variant="outline">SpO₂ {item.oxygen_saturation ?? "-"}%</Badge><Badge variant="outline">Pain {item.pain_score ?? "-"}/10</Badge></div><p className="mt-2 text-xs text-slate-500">{formatDateTime(item.measured_at)}</p></div>)}{!chart?.vitals.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No vital signs recorded.</p> : null}</div>
                  </div>
                ) : null}

                {panel === "presentation" ? (
                  <div className="space-y-5">{canManage ? <form className="space-y-3 rounded-2xl border bg-slate-50 p-4" onSubmit={saveNote}><Textarea value={note.chief_complaint} onChange={(event) => setNote((current) => ({ ...current, chief_complaint: event.target.value }))} placeholder="Clinical summary" required /><Textarea value={note.history_of_presenting_illness} onChange={(event) => setNote((current) => ({ ...current, history_of_presenting_illness: event.target.value }))} placeholder="Relevant history" /><Textarea value={note.examination} onChange={(event) => setNote((current) => ({ ...current, examination: event.target.value }))} placeholder="Examination and findings" /><div className="grid gap-3 sm:grid-cols-2"><Textarea value={note.assessment} onChange={(event) => setNote((current) => ({ ...current, assessment: event.target.value }))} placeholder="Assessment" /><Textarea value={note.plan} onChange={(event) => setNote((current) => ({ ...current, plan: event.target.value }))} placeholder="Plan and follow-up" /></div><Button disabled={saving}>Save clinical note</Button></form> : null}<div className="space-y-2">{(chart?.notes ?? []).filter((item) => item.note_type !== "Clinical Report").map((item) => <div key={item.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><p className="font-semibold">{item.note_type}</p><span className="text-xs text-slate-500">{formatDateTime(item.authored_at)}</span></div><p className="mt-2 text-sm text-slate-700">{item.chief_complaint}</p>{item.assessment ? <p className="mt-2 text-sm"><strong>Assessment:</strong> {item.assessment}</p> : null}{item.plan ? <p className="mt-1 text-sm"><strong>Plan:</strong> {item.plan}</p> : null}</div>)}</div></div>
                ) : null}

                {panel === "diagnosis" ? (
                  <div className="space-y-5">{canManage ? <form className="grid gap-3 rounded-2xl border bg-slate-50 p-4 sm:grid-cols-2" onSubmit={saveDiagnosis}><Input value={diagnosis.diagnosis_name} onChange={(event) => setDiagnosis((current) => ({ ...current, diagnosis_name: event.target.value }))} placeholder="Diagnosis" required /><Input value={diagnosis.icd10_code} onChange={(event) => setDiagnosis((current) => ({ ...current, icd10_code: event.target.value }))} placeholder="ICD-10 code" /><select className={selectClassName} value={diagnosis.diagnosis_type} onChange={(event) => setDiagnosis((current) => ({ ...current, diagnosis_type: event.target.value }))}>{["Working", "Differential", "Confirmed", "Final"].map((item) => <option key={item}>{item}</option>)}</select><Input value={diagnosis.notes} onChange={(event) => setDiagnosis((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" /><Button className="sm:col-span-2" disabled={saving}>Add diagnosis</Button></form> : null}<div className="space-y-2">{(chart?.diagnoses ?? []).map((item) => <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl border p-4"><div><p className="font-semibold">{item.diagnosis_name}</p><p className="mt-1 text-sm text-slate-600">{item.icd10_code || "No ICD-10 code"} · {item.diagnosis_type}</p></div><Badge variant={item.status === "Active" ? "default" : "secondary"}>{item.status}</Badge></div>)}</div></div>
                ) : null}

                {panel === "lab" ? (
                  canSendToLab ? <form className="space-y-4" onSubmit={sendToLab}>
                    <div className="grid gap-3 sm:grid-cols-[1fr_160px]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400 sm:top-3" /><Input className="pl-9" value={testSearch} onChange={(event) => setTestSearch(event.target.value)} placeholder="Search laboratory tests" /></div><select className={selectClassName} value={labPriority} onChange={(event) => setLabPriority(event.target.value)}><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="stat">STAT</option></select></div>
                    <div className="max-h-80 divide-y overflow-y-auto rounded-2xl border">{filteredTests.map((test) => <label key={test.id} className="flex cursor-pointer items-center justify-between gap-3 p-3 hover:bg-slate-50"><span className="flex items-center gap-3"><input type="checkbox" className="h-4 w-4" checked={selectedTestIds.includes(test.id)} onChange={(event) => setSelectedTestIds((current) => event.target.checked ? [...current, test.id] : current.filter((id) => id !== test.id))} /><span><span className="block text-sm font-medium">{test.name}</span><span className="text-xs text-slate-500">{test.test_code} · {test.category || "Laboratory"}</span></span></span><span className="text-sm font-medium">N{Number(test.price).toLocaleString()}</span></label>)}</div>
                    <Textarea value={labNotes} onChange={(event) => setLabNotes(event.target.value)} placeholder="Laboratory notes" />
                    <Button disabled={saving || !selectedTestIds.length}><Send className="h-4 w-4" />Send {selectedTestIds.length || ""} test{selectedTestIds.length === 1 ? "" : "s"} to laboratory</Button>
                  </form> : null
                ) : null}

                {panel === "treatment" ? (
                  <div className="space-y-5">
                    {selectedAdmission ? <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900"><strong>Inpatient:</strong> {selectedAdmission.wards?.name ?? "Ward"} · Bed {selectedAdmission.beds?.bed_number ?? "unassigned"}</div> : null}
                    {canPrescribe ? <form className="space-y-4" onSubmit={saveTreatment}><div className="grid gap-3 rounded-2xl border bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3"><div className="sm:col-span-2 lg:col-span-3"><Label>Drug</Label><select className={`mt-1 ${selectClassName}`} value={treatmentItem.medication_id} onChange={(event) => { const medication = (workspaceQuery.data?.medications ?? []).find((item) => item.id === event.target.value); setTreatmentItem((current) => ({ ...current, medication_id: event.target.value, route: medication?.route ?? current.route })); }}><option value="">Select medication</option>{(workspaceQuery.data?.medications ?? []).map((medication) => <option key={medication.id} value={medication.id}>{medication.generic_name}{medication.brand_name ? ` · ${medication.brand_name}` : ""} · {medication.strength} · Stock {medication.quantity_on_hand}</option>)}</select></div><div><Label>Dose</Label><Input className="mt-1" value={treatmentItem.dose} onChange={(event) => setTreatmentItem((current) => ({ ...current, dose: event.target.value }))} placeholder="e.g. 500 mg" /></div><div><Label>Frequency</Label><Input className="mt-1" value={treatmentItem.frequency} onChange={(event) => setTreatmentItem((current) => ({ ...current, frequency: event.target.value }))} placeholder="e.g. Twice daily" /></div><div><Label>Duration</Label><Input className="mt-1" value={treatmentItem.duration} onChange={(event) => setTreatmentItem((current) => ({ ...current, duration: event.target.value }))} placeholder="e.g. 5 days" /></div><div><Label>Route</Label><Input className="mt-1" value={treatmentItem.route} onChange={(event) => setTreatmentItem((current) => ({ ...current, route: event.target.value }))} placeholder="Oral / IV / IM" /></div><div><Label>Quantity</Label><Input className="mt-1" type="number" min="1" step="1" value={treatmentItem.quantity} onChange={(event) => setTreatmentItem((current) => ({ ...current, quantity: event.target.value }))} /></div><div><Label>Administration instructions</Label><Input className="mt-1" value={treatmentItem.instructions} onChange={(event) => setTreatmentItem((current) => ({ ...current, instructions: event.target.value }))} placeholder={selectedAdmission ? "Ward administration instructions" : "Before/after food, time, etc."} /></div><Button type="button" variant="outline" className="sm:col-span-2 lg:col-span-3" onClick={addTreatmentItem}><Plus className="h-4 w-4" />Add drug</Button></div>
                      {treatmentItems.length ? <div className="space-y-2">{treatmentItems.map((item) => <div key={item.client_id} className="flex items-start justify-between gap-3 rounded-xl border p-3"><div><p className="font-semibold">{item.medication_name}</p><p className="mt-1 text-sm text-slate-600">{item.dose} · {item.frequency} · {item.duration} · {item.route || "Route not set"}</p>{item.instructions ? <p className="mt-1 text-xs text-slate-500">{item.instructions}</p> : null}</div><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${item.medication_name}`} onClick={() => setTreatmentItems((current) => current.filter((row) => row.client_id !== item.client_id))}><Trash2 className="h-4 w-4" /></Button></div>)}</div> : null}
                      <Textarea value={treatmentNotes} onChange={(event) => setTreatmentNotes(event.target.value)} placeholder="Treatment plan and nursing instructions" />
                      <Button disabled={saving || !treatmentItems.length}><Pill className="h-4 w-4" />Save treatment and send to pharmacy</Button>
                    </form> : null}
                    <div className="space-y-3">{(chart?.prescriptions ?? []).map((prescription) => <div key={prescription.id} className="rounded-2xl border p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">Prescription · {formatDateTime(prescription.prescribed_at)}</p><Badge>{prescription.status}</Badge></div><div className="mt-3 space-y-2">{(prescription.prescription_items ?? []).map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3"><p className="font-medium">{item.medication_name}</p><p className="mt-1 text-sm text-slate-600">{item.dose} · {item.frequency} · {item.duration} · {item.route || "-"}</p>{item.instructions ? <p className="mt-1 text-xs text-slate-500">{item.instructions}</p> : null}</div>)}</div></div>)}{!chart?.prescriptions.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No treatment plan recorded.</p> : null}</div>
                  </div>
                ) : null}

                {panel === "report" ? (
                  <div className="space-y-5">
                    {canManage ? <form className="space-y-3 rounded-2xl border bg-slate-50 p-4" onSubmit={saveNote}><Input value={note.report_title} onChange={(event) => setNote((current) => ({ ...current, report_title: event.target.value }))} placeholder="Report title" required /><Textarea value={note.chief_complaint} onChange={(event) => setNote((current) => ({ ...current, chief_complaint: event.target.value }))} placeholder="Report summary" required /><div className="grid gap-3 sm:grid-cols-2"><Textarea value={note.assessment} onChange={(event) => setNote((current) => ({ ...current, assessment: event.target.value }))} placeholder="Assessment" /><Textarea value={note.plan} onChange={(event) => setNote((current) => ({ ...current, plan: event.target.value }))} placeholder="Plan and follow-up" /></div><Button disabled={saving}>Save report note</Button></form> : null}
                    <div className="rounded-2xl border p-4"><div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"><div><Label>Report content</Label><select className={`mt-1 ${selectClassName}`} value={reportScope} onChange={(event) => setReportScope(event.target.value as ReportScope)}><option value="full">Full clinical report</option><option value="medications">Medication list only</option></select></div><Button variant="outline" onClick={printReport}><Printer className="h-4 w-4" />Print</Button><Button onClick={() => void downloadReport()} disabled={reportBusy}>{reportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download PDF</Button></div></div>
                    <div className="space-y-2">{(chart?.notes ?? []).filter((item) => item.note_type === "Clinical Report").map((item) => <div key={item.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><p className="font-semibold">{item.report_title || "Clinical report"}</p><span className="text-xs text-slate-500">{formatDateTime(item.authored_at)}</span></div><p className="mt-2 text-sm text-slate-700">{item.chief_complaint}</p></div>)}</div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : selectedPatient ? <Card><CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center"><UserRound className="h-10 w-10 text-slate-300" /><p className="font-medium">No visit for {selectedPatient.name}</p></CardContent></Card> : <Card><CardContent className="flex min-h-64 items-center justify-center p-8 text-sm text-slate-500">No patients.</CardContent></Card>}
        </div>
      </div>
    </div>
  );
}
