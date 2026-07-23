"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  ClipboardList,
  FilePlus2,
  HeartPulse,
  Loader2,
  Plus,
  Search,
  Stethoscope,
  UserRound
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { canAccessClinicalRole, canManageClinicalRole, canOpenEncountersRole } from "@/lib/guards";
import { generateId } from "@/lib/online-core";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import { getAppClient } from "@/lib/app-client";
import type { ClinicalNote, Diagnosis, Encounter, PatientOption, VitalSign } from "@/types/hospital";

type ClinicalPanel = "vitals" | "presentation" | "diagnosis" | "report";

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

async function fetchClinicalWorkspace() {
  const database = getAppClient();
  if (!database) throw new Error("Service unavailable.");
  const hospital = getHospitalClient();

  const [patientsResponse, encountersResponse] = await Promise.all([
    database
      .from("patients")
      .select("id, name, hospital_id, lab_id, phone")
      .order("name", { ascending: true })
      .limit(500),
    hospital
      .from("clinical_encounters")
      .select("id, facility_id, patient_id, encounter_number, encounter_type, status, presenting_complaint, attending_clinician, started_at, ended_at, patients(id, name, hospital_id, lab_id, phone)")
      .order("started_at", { ascending: false })
      .limit(120)
  ]);

  if (patientsResponse.error) throw new Error(patientsResponse.error.message);
  throwIfHospitalError(encountersResponse.error);

  return {
    patients: (patientsResponse.data ?? []) as PatientOption[],
    encounters: (encountersResponse.data ?? []) as Encounter[]
  };
}

async function fetchEncounterChart(encounterId: string) {
  const hospital = getHospitalClient();
  const [vitalsResponse, notesResponse, diagnosesResponse] = await Promise.all([
    hospital.from("vital_signs").select("*").eq("encounter_id", encounterId).order("measured_at", { ascending: false }),
    hospital.from("clinical_notes").select("*").eq("encounter_id", encounterId).order("authored_at", { ascending: false }),
    hospital.from("diagnoses").select("*").eq("encounter_id", encounterId).order("diagnosed_at", { ascending: false })
  ]);

  throwIfHospitalError(vitalsResponse.error);
  throwIfHospitalError(notesResponse.error);
  throwIfHospitalError(diagnosesResponse.error);

  return {
    vitals: (vitalsResponse.data ?? []) as VitalSign[],
    notes: (notesResponse.data ?? []) as ClinicalNote[],
    diagnoses: (diagnosesResponse.data ?? []) as Diagnosis[]
  };
}

export function ClinicalWorkspace() {
  const { facilityId, loading, role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEncounterId, setSelectedEncounterId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<ClinicalPanel>("vitals");
  const [patientId, setPatientId] = useState("");
  const [encounterType, setEncounterType] = useState<Encounter["encounter_type"]>("Outpatient");
  const [complaint, setComplaint] = useState("");
  const [vitals, setVitals] = useState(initialVitals);
  const [note, setNote] = useState(initialNote);
  const [diagnosis, setDiagnosis] = useState({ diagnosis_name: "", icd10_code: "", diagnosis_type: "Working", notes: "" });
  const [saving, setSaving] = useState(false);

  const canAccess = canAccessClinicalRole(role);
  const canManage = canManageClinicalRole(role);
  const canOpenEncounter = canOpenEncountersRole(role);
  const workspaceQuery = useQuery({
    queryKey: ["hospital", "clinical-workspace"],
    queryFn: fetchClinicalWorkspace,
    enabled: Boolean(facilityId && canAccess)
  });

  const encounters = useMemo(() => workspaceQuery.data?.encounters ?? [], [workspaceQuery.data]);
  const selectedEncounter = encounters.find((item) => item.id === selectedEncounterId) ?? encounters[0] ?? null;
  const effectiveEncounterId = selectedEncounter?.id ?? "";
  const chartQuery = useQuery({
    queryKey: ["hospital", "encounter-chart", effectiveEncounterId],
    queryFn: () => fetchEncounterChart(effectiveEncounterId),
    enabled: Boolean(effectiveEncounterId && canAccess)
  });

  const filteredEncounters = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return encounters;
    return encounters.filter((encounter) =>
      [
        encounter.encounter_number,
        encounter.patients?.name,
        encounter.patients?.hospital_id,
        encounter.presenting_complaint
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [encounters, search]);

  const refreshChart = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hospital", "clinical-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "encounter-chart", effectiveEncounterId] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "overview"] })
    ]);
  };

  const createEncounter = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !patientId || !complaint.trim()) return;
    const id = generateId();

    try {
      setSaving(true);
      const { error } = await getHospitalClient().from("clinical_encounters").insert({
        id,
        facility_id: facilityId,
        patient_id: patientId,
        encounter_type: encounterType,
        presenting_complaint: complaint.trim(),
        attending_clinician: role === "Doctor" ? user?.id ?? null : null,
        created_by: user?.id ?? null
      });
      throwIfHospitalError(error);
      setComplaint("");
      setPatientId("");
      setSelectedEncounterId(id);
      await refreshChart();
      toast({ title: "Encounter opened", description: "The patient is ready for clinical documentation.", variant: "success" });
    } catch (error) {
      toast({ title: "Could not open encounter", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
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
        id: generateId(), facility_id: facilityId, patient_id: selectedEncounter.patient_id,
        encounter_id: selectedEncounter.id, measured_by: user?.id ?? null, bmi,
        ...Object.fromEntries(Object.entries(vitals).map(([key, value]) => [key, key === "notes" ? value.trim() || null : optionalNumber(value)]))
      });
      throwIfHospitalError(error);
      setVitals(initialVitals);
      await refreshChart();
      toast({ title: "Vitals recorded", description: "The observation is now in the patient timeline.", variant: "success" });
    } catch (error) {
      toast({ title: "Vitals not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  const saveNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !selectedEncounter) return;
    const noteType = panel === "report" ? "Clinical Report" : "Clinical Presentation";

    try {
      setSaving(true);
      const { error } = await getHospitalClient().from("clinical_notes").insert({
        id: generateId(), facility_id: facilityId, patient_id: selectedEncounter.patient_id,
        encounter_id: selectedEncounter.id, note_type: noteType, authored_by: user?.id ?? null,
        ...Object.fromEntries(Object.entries(note).map(([key, value]) => [key, value.trim() || null]))
      });
      throwIfHospitalError(error);
      setNote(initialNote);
      await refreshChart();
      toast({ title: noteType === "Clinical Report" ? "Report saved" : "Clinical presentation saved", description: "The document was added to the longitudinal record.", variant: "success" });
    } catch (error) {
      toast({ title: "Clinical note not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  const saveDiagnosis = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !selectedEncounter || !diagnosis.diagnosis_name.trim()) return;
    try {
      setSaving(true);
      const { error } = await getHospitalClient().from("diagnoses").insert({
        id: generateId(), facility_id: facilityId, patient_id: selectedEncounter.patient_id,
        encounter_id: selectedEncounter.id, diagnosed_by: user?.id ?? null,
        diagnosis_name: diagnosis.diagnosis_name.trim(), icd10_code: diagnosis.icd10_code.trim() || null,
        diagnosis_type: diagnosis.diagnosis_type, notes: diagnosis.notes.trim() || null
      });
      throwIfHospitalError(error);
      setDiagnosis({ diagnosis_name: "", icd10_code: "", diagnosis_type: "Working", notes: "" });
      await refreshChart();
      toast({ title: "Diagnosis recorded", description: "The diagnosis is now linked to this encounter.", variant: "success" });
    } catch (error) {
      toast({ title: "Diagnosis not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  if (loading || workspaceQuery.isLoading) {
    return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading clinical workspace...</CardContent></Card>;
  }

  if (!canAccess || !facilityId) {
    return <Card><CardHeader><CardTitle>Clinical access unavailable</CardTitle></CardHeader></Card>;
  }

  const chart = chartQuery.data;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-teal-100 bg-gradient-to-br from-teal-700 via-teal-600 to-cyan-500 text-white">
        <CardContent className="grid gap-5 p-6 lg:grid-cols-[1.35fr_repeat(3,0.45fr)] lg:items-center">
          <div><h2 className="text-2xl font-semibold">Clinical</h2></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-teal-50">Open encounters</p><p className="mt-2 text-3xl font-semibold">{encounters.filter((item) => item.status === "Open").length}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-teal-50">Today</p><p className="mt-2 text-3xl font-semibold">{encounters.filter((item) => new Date(item.started_at).toDateString() === new Date().toDateString()).length}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-teal-50">Patients</p><p className="mt-2 text-3xl font-semibold">{workspaceQuery.data?.patients.length ?? 0}</p></div>
        </CardContent>
      </Card>

      {canOpenEncounter ? (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-teal-700" />Open an encounter</CardTitle><CardDescription>Start an outpatient, emergency, inpatient, or telemedicine visit.</CardDescription></CardHeader>
          <CardContent>
            <form className="grid gap-3 lg:grid-cols-[1fr_180px_1.4fr_auto]" onSubmit={createEncounter}>
              <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={patientId} onChange={(event) => setPatientId(event.target.value)} required>
                <option value="">Select patient / Hospital ID</option>
                {(workspaceQuery.data?.patients ?? []).map((patient) => <option key={patient.id} value={patient.id}>{patient.name} — {patient.hospital_id ?? patient.lab_id}</option>)}
              </select>
              <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={encounterType} onChange={(event) => setEncounterType(event.target.value as Encounter["encounter_type"])}>{["Outpatient", "Emergency", "Inpatient", "Telemedicine"].map((item) => <option key={item}>{item}</option>)}</select>
              <Input value={complaint} onChange={(event) => setComplaint(event.target.value)} placeholder="Presenting complaint" required />
              <Button disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Open encounter</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-teal-700" />Encounter register</CardTitle><CardDescription>Search by patient, Hospital ID, or encounter number.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search encounters" /></div>
            <div className="max-h-[680px] space-y-2 overflow-y-auto pr-1">
              {filteredEncounters.map((encounter) => (
                <button key={encounter.id} type="button" onClick={() => setSelectedEncounterId(encounter.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedEncounter?.id === encounter.id ? "border-teal-300 bg-teal-50" : "hover:border-slate-300 hover:bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{encounter.patients?.name ?? "Unknown patient"}</p><p className="mt-1 text-xs font-medium text-teal-700">{encounter.patients?.hospital_id ?? encounter.patients?.lab_id}</p></div><Badge variant={encounter.status === "Open" ? "default" : "secondary"}>{encounter.status}</Badge></div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600">{encounter.presenting_complaint || "No complaint recorded"}</p>
                  <div className="mt-3 flex justify-between text-xs text-slate-500"><span>{encounter.encounter_number}</span><span>{formatDateTime(encounter.started_at)}</span></div>
                </button>
              ))}
              {!filteredEncounters.length ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No clinical encounters yet.</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          {selectedEncounter ? (
            <>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-teal-700" />{selectedEncounter.patients?.name}</CardTitle><CardDescription>{selectedEncounter.patients?.hospital_id ?? selectedEncounter.patients?.lab_id} · {selectedEncounter.encounter_number} · {formatDateTime(selectedEncounter.started_at)}</CardDescription></div><Button asChild variant="outline" size="sm"><Link href={`/patients/${selectedEncounter.patient_id}` as Route}>Full patient record<ArrowRight className="h-4 w-4" /></Link></Button></div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap gap-2">{(["vitals", "presentation", "diagnosis", "report"] as ClinicalPanel[]).map((item) => <Button key={item} type="button" size="sm" variant={panel === item ? "default" : "outline"} onClick={() => setPanel(item)}>{item === "vitals" ? <HeartPulse className="h-4 w-4" /> : item === "diagnosis" ? <Stethoscope className="h-4 w-4" /> : item === "report" ? <FilePlus2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}{item[0].toUpperCase() + item.slice(1)}</Button>)}</div>

                {panel === "vitals" ? <div className="space-y-5">{canManage ? <form className="space-y-4 rounded-2xl border bg-slate-50 p-4" onSubmit={saveVitals}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
                  ["temperature_c", "Temp °C"], ["pulse_bpm", "Pulse bpm"], ["respiratory_rate", "Resp/min"], ["systolic_bp", "Systolic"], ["diastolic_bp", "Diastolic"], ["oxygen_saturation", "SpO₂ %"], ["weight_kg", "Weight kg"], ["height_cm", "Height cm"], ["blood_glucose_mmol", "Glucose mmol/L"], ["pain_score", "Pain 0–10"]
                ].map(([key, label]) => <div key={key}><Label>{label}</Label><Input className="mt-1" type="number" step="0.1" value={vitals[key as keyof typeof vitals]} onChange={(event) => setVitals((current) => ({ ...current, [key]: event.target.value }))} /></div>)}</div><Textarea value={vitals.notes} onChange={(event) => setVitals((current) => ({ ...current, notes: event.target.value }))} placeholder="Observation notes" /><Button disabled={saving}>Record vital signs</Button></form> : null}<div className="space-y-2">{(chart?.vitals ?? []).map((item) => <div key={item.id} className="rounded-xl border p-4"><div className="flex flex-wrap gap-2 text-sm"><Badge variant="outline">BP {item.systolic_bp ?? "-"}/{item.diastolic_bp ?? "-"}</Badge><Badge variant="outline">Temp {item.temperature_c ?? "-"}°C</Badge><Badge variant="outline">Pulse {item.pulse_bpm ?? "-"}</Badge><Badge variant="outline">SpO₂ {item.oxygen_saturation ?? "-"}%</Badge><Badge variant="outline">Pain {item.pain_score ?? "-"}/10</Badge></div><p className="mt-2 text-xs text-slate-500">{formatDateTime(item.measured_at)}</p></div>)}{!chart?.vitals.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No vital signs recorded.</p> : null}</div></div> : null}

                {panel === "presentation" || panel === "report" ? <div className="space-y-5">{canManage ? <form className="space-y-3 rounded-2xl border bg-slate-50 p-4" onSubmit={saveNote}>{panel === "report" ? <Input value={note.report_title} onChange={(event) => setNote((current) => ({ ...current, report_title: event.target.value }))} placeholder="Report title" required /> : null}<Textarea value={note.chief_complaint} onChange={(event) => setNote((current) => ({ ...current, chief_complaint: event.target.value }))} placeholder="Chief complaint / report summary" required /><Textarea value={note.history_of_presenting_illness} onChange={(event) => setNote((current) => ({ ...current, history_of_presenting_illness: event.target.value }))} placeholder="History of presenting illness" /><Textarea value={note.examination} onChange={(event) => setNote((current) => ({ ...current, examination: event.target.value }))} placeholder="Examination / objective findings" /><div className="grid gap-3 sm:grid-cols-2"><Textarea value={note.assessment} onChange={(event) => setNote((current) => ({ ...current, assessment: event.target.value }))} placeholder="Assessment" /><Textarea value={note.plan} onChange={(event) => setNote((current) => ({ ...current, plan: event.target.value }))} placeholder="Plan and follow-up" /></div><Button disabled={saving}>{panel === "report" ? "Save clinical report" : "Save presentation"}</Button></form> : null}<div className="space-y-2">{(chart?.notes ?? []).filter((item) => panel === "report" ? item.note_type === "Clinical Report" : item.note_type !== "Clinical Report").map((item) => <div key={item.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><p className="font-semibold">{item.report_title || item.note_type}</p><span className="text-xs text-slate-500">{formatDateTime(item.authored_at)}</span></div><p className="mt-2 text-sm text-slate-700">{item.chief_complaint}</p>{item.assessment ? <p className="mt-2 text-sm"><strong>Assessment:</strong> {item.assessment}</p> : null}{item.plan ? <p className="mt-1 text-sm"><strong>Plan:</strong> {item.plan}</p> : null}</div>)}</div></div> : null}

                {panel === "diagnosis" ? <div className="space-y-5">{canManage ? <form className="grid gap-3 rounded-2xl border bg-slate-50 p-4 sm:grid-cols-2" onSubmit={saveDiagnosis}><Input value={diagnosis.diagnosis_name} onChange={(event) => setDiagnosis((current) => ({ ...current, diagnosis_name: event.target.value }))} placeholder="Diagnosis" required /><Input value={diagnosis.icd10_code} onChange={(event) => setDiagnosis((current) => ({ ...current, icd10_code: event.target.value }))} placeholder="ICD-10 code (optional)" /><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={diagnosis.diagnosis_type} onChange={(event) => setDiagnosis((current) => ({ ...current, diagnosis_type: event.target.value }))}>{["Working", "Differential", "Confirmed", "Final"].map((item) => <option key={item}>{item}</option>)}</select><Input value={diagnosis.notes} onChange={(event) => setDiagnosis((current) => ({ ...current, notes: event.target.value }))} placeholder="Clinical notes" /><Button className="sm:col-span-2" disabled={saving}>Add diagnosis</Button></form> : null}<div className="space-y-2">{(chart?.diagnoses ?? []).map((item) => <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl border p-4"><div><p className="font-semibold">{item.diagnosis_name}</p><p className="mt-1 text-sm text-slate-600">{item.icd10_code || "No ICD-10 code"} · {item.diagnosis_type}</p></div><Badge variant={item.status === "Active" ? "default" : "secondary"}>{item.status}</Badge></div>)}</div></div> : null}
              </CardContent>
            </>
          ) : <CardContent className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">Open a patient encounter to begin clinical documentation.</CardContent>}
        </Card>
      </div>
    </div>
  );
}
