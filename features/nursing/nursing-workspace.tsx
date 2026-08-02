"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BedDouble, CheckCircle2, Clock3, Loader2, Pill, Search, Syringe } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getAppClient } from "@/lib/app-client";
import { canAccessNursingRole } from "@/lib/guards";
import type {
  MedicationAdministration,
  NursingMedicationDashboard,
  NursingMedicationPatient
} from "@/types/hospital";

const DUE_WINDOW_MS = 30 * 60 * 1000;

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function doseState(dose: MedicationAdministration, now: number) {
  if (dose.status === "Administered") return "administered" as const;
  const scheduledAt = new Date(dose.scheduled_at).getTime();
  if (scheduledAt < now - DUE_WINDOW_MS) return "overdue" as const;
  if (scheduledAt <= now + DUE_WINDOW_MS) return "due" as const;
  return "upcoming" as const;
}

async function fetchNursingDashboard() {
  const { data, error } = await getAppClient().rpc("get_nursing_medication_dashboard");
  if (error) throw new Error(error.message);
  return data as NursingMedicationDashboard;
}

function PatientRow({
  patient,
  dueCount,
  selected,
  onSelect
}: {
  patient: NursingMedicationPatient;
  dueCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return <button type="button" onClick={onSelect} className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-blue-500 bg-blue-50" : "bg-white hover:bg-slate-50"}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-950">{patient.name}</p><p className="mt-1 text-xs font-medium text-blue-700">{patient.hospital_id}</p></div>{dueCount > 0 ? <Badge className="bg-rose-600 text-white">{dueCount}</Badge> : <Badge variant="secondary">0</Badge>}</div>
    <p className="mt-2 text-xs text-slate-500">{patient.ward_name} · Bed {patient.bed_number || "unassigned"}</p>
  </button>;
}

export function NursingWorkspace() {
  const { facilityId, loading, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canAccess = canAccessNursingRole(role);
  const [clock, setClock] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const [wardGroup, setWardGroup] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedDoseIds, setSelectedDoseIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const dashboardQuery = useQuery({
    queryKey: ["hospital", "nursing-medications"],
    queryFn: fetchNursingDashboard,
    enabled: Boolean(facilityId && canAccess),
    refetchInterval: 60_000
  });

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const data = dashboardQuery.data;
  const activeDoses = useMemo(() => data?.doses ?? [], [data?.doses]);
  const patients = useMemo(() => data?.patients ?? [], [data?.patients]);
  const dueDoses = useMemo(() => activeDoses.filter((dose) => ["due", "overdue"].includes(doseState(dose, clock))), [activeDoses, clock]);
  const duePatientIds = useMemo(() => new Set(dueDoses.map((dose) => dose.patient_id)), [dueDoses]);
  const overdueCount = useMemo(() => activeDoses.filter((dose) => doseState(dose, clock) === "overdue").length, [activeDoses, clock]);
  const upcomingCount = useMemo(() => activeDoses.filter((dose) => {
    const scheduledAt = new Date(dose.scheduled_at).getTime();
    return dose.status === "Scheduled" && scheduledAt > clock + DUE_WINDOW_MS && scheduledAt <= clock + 60 * 60 * 1000;
  }).length, [activeDoses, clock]);
  const wardGroups = useMemo(() => {
    const counts = new Map<string, number>();
    patients.forEach((patient) => counts.set(patient.ward_name, (counts.get(patient.ward_name) ?? 0) + 1));
    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [patients]);
  const activeWardGroup = wardGroups.some(([ward]) => ward === wardGroup) ? wardGroup : wardGroups[0]?.[0] ?? "";

  const filteredPatients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return patients.filter((patient) => patient.ward_name === activeWardGroup && (!term || [patient.name, patient.hospital_id, patient.ward_name, patient.bed_number].filter(Boolean).join(" ").toLowerCase().includes(term))).sort((left, right) => {
      const leftDue = dueDoses.filter((dose) => dose.patient_id === left.patient_id).length;
      const rightDue = dueDoses.filter((dose) => dose.patient_id === right.patient_id).length;
      return rightDue - leftDue || left.name.localeCompare(right.name);
    });
  }, [activeWardGroup, dueDoses, patients, search]);

  const selectedPatient = filteredPatients.find((patient) => patient.patient_id === selectedPatientId)
    ?? patients.find((patient) => patient.patient_id === selectedPatientId)
    ?? filteredPatients[0]
    ?? null;
  const patientDoses = useMemo(() => activeDoses.filter((dose) => dose.patient_id === selectedPatient?.patient_id), [activeDoses, selectedPatient?.patient_id]);
  const selectableDoseIds = useMemo(() => new Set(patientDoses.filter((dose) => ["due", "overdue"].includes(doseState(dose, clock))).map((dose) => dose.id)), [clock, patientDoses]);

  useEffect(() => {
    setSelectedDoseIds((current) => current.filter((id) => selectableDoseIds.has(id)));
  }, [selectableDoseIds]);

  const recordAdministration = async () => {
    if (!selectedPatient || !selectedDoseIds.length) return;
    if (!window.confirm(`Record ${selectedDoseIds.length} dose${selectedDoseIds.length === 1 ? "" : "s"} as administered to ${selectedPatient.name}?`)) return;
    try {
      setSaving(true);
      const { data: result, error } = await getAppClient().rpc("record_medication_administrations", {
        administration_ids: selectedDoseIds,
        notes: notes.trim() || null
      });
      if (error) throw new Error(error.message);
      const count = Number((result as { administered_count?: number } | null)?.administered_count || selectedDoseIds.length);
      setSelectedDoseIds([]);
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["hospital", "nursing-medications"] });
      toast({ title: `${count} dose${count === 1 ? "" : "s"} recorded`, variant: "success" });
    } catch (error) {
      toast({ title: "Administration not recorded", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading || dashboardQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading...</CardContent></Card>;
  if (!canAccess || !facilityId) return <Card><CardHeader><CardTitle>Nursing access unavailable</CardTitle></CardHeader></Card>;
  if (dashboardQuery.isError) return <Card><CardHeader><CardTitle>Medication schedule unavailable</CardTitle></CardHeader><CardContent><Button onClick={() => void dashboardQuery.refetch()}>Try again</Button></CardContent></Card>;

  return <div className="space-y-6">
    <Card className="overflow-hidden border-cyan-100 bg-gradient-to-br from-cyan-800 via-cyan-700 to-blue-500 text-white"><CardContent className="grid grid-cols-2 gap-3 p-4 sm:p-6 lg:grid-cols-[1.4fr_repeat(3,0.45fr)]"><div className="col-span-2 lg:col-span-1"><h2 className="flex items-center gap-2 text-2xl font-semibold"><Syringe className="h-6 w-6" />Nursing</h2><p className="mt-2 text-sm text-cyan-50">Medication administration</p></div>{[[Pill, "Due now", dueDoses.length], [BedDouble, "Patients due", duePatientIds.size], [AlertTriangle, "Overdue", overdueCount]].map(([Icon, label, value]) => { const MetricIcon = Icon as typeof Pill; return <div key={String(label)} className="rounded-2xl bg-white/10 p-4"><MetricIcon className="h-4 w-4 text-cyan-100" /><p className="mt-2 text-xs uppercase tracking-wider text-cyan-100">{String(label)}</p><p className="mt-1 text-3xl font-semibold">{String(value)}</p></div>; })}</CardContent></Card>

    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card><CardHeader><CardTitle className="flex items-center justify-between">Patients <Badge variant="outline">Next hour {upcomingCount}</Badge></CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2">{wardGroups.map(([ward, count]) => <button key={ward} type="button" onClick={() => { setWardGroup(ward); setSelectedPatientId(""); }} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${activeWardGroup === ward ? "border-cyan-500 bg-cyan-50 text-cyan-800" : "border-slate-200"}`}>{ward} · {count}</button>)}</div><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, Hospital ID or bed" /></div><div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">{filteredPatients.map((patient) => <PatientRow key={patient.admission_id} patient={patient} dueCount={dueDoses.filter((dose) => dose.patient_id === patient.patient_id).length} selected={selectedPatient?.patient_id === patient.patient_id} onSelect={() => { setSelectedPatientId(patient.patient_id); setSelectedDoseIds([]); }} />)}{!filteredPatients.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No patients in this ward.</p> : null}</div></CardContent></Card>

      <Card><CardHeader>{selectedPatient ? <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>{selectedPatient.name}</CardTitle><p className="mt-1 text-sm font-medium text-blue-700">{selectedPatient.hospital_id}</p></div><Badge variant="outline">{selectedPatient.ward_name} · Bed {selectedPatient.bed_number || "unassigned"}</Badge></div> : <CardTitle>Select a patient</CardTitle>}</CardHeader><CardContent className="space-y-4">
        {selectedPatient ? <>
          <div className="space-y-3">{patientDoses.map((dose) => { const state = doseState(dose, clock); const selectable = selectableDoseIds.has(dose.id); const checked = selectedDoseIds.includes(dose.id); return <label key={dose.id} className={`block rounded-2xl border p-4 ${state === "overdue" ? "border-rose-300 bg-rose-50" : state === "due" ? "border-amber-300 bg-amber-50" : state === "administered" ? "border-emerald-200 bg-emerald-50" : "bg-white"} ${selectable ? "cursor-pointer" : ""}`}>
            <div className="flex items-start gap-3">{selectable ? <input type="checkbox" className="mt-1 h-5 w-5" checked={checked} onChange={(event) => setSelectedDoseIds((current) => event.target.checked ? [...current, dose.id] : current.filter((id) => id !== dose.id))} /> : state === "administered" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />}<div className="min-w-0 flex-1"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-slate-950">{dose.medication_name}</p><p className="mt-1 text-sm text-slate-600">{dose.dose} · {dose.route || "Route not set"} · {dose.frequency}</p></div><Badge variant={state === "administered" ? "secondary" : "outline"} className={state === "overdue" ? "border-rose-300 text-rose-700" : state === "due" ? "border-amber-300 text-amber-800" : undefined}>{state === "overdue" ? "Overdue" : state === "due" ? "Due now" : state === "administered" ? "Administered" : "Upcoming"}</Badge></div><p className="mt-2 text-xs font-medium text-slate-500">Scheduled {formatTime(dose.scheduled_at)}</p>{dose.instructions ? <p className="mt-2 text-sm text-slate-700">{dose.instructions}</p> : null}{state === "administered" ? <p className="mt-2 text-xs text-emerald-700">Given {dose.administered_at ? formatTime(dose.administered_at) : ""}{dose.administered_by_name ? ` · ${dose.administered_by_name}` : ""}</p> : null}</div></div>
          </label>; })}{!patientDoses.length ? <p className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No scheduled medication.</p> : null}</div>
          {selectableDoseIds.size ? <div className="rounded-2xl border bg-slate-50 p-4"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Administration note (optional)" /><Button className="mt-3 w-full" disabled={saving || !selectedDoseIds.length} onClick={() => void recordAdministration()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Syringe className="h-4 w-4" />}Record {selectedDoseIds.length || ""} administered</Button></div> : null}
        </> : <p className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">Select a patient.</p>}
      </CardContent></Card>
    </div>
  </div>;
}
