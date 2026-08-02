"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BedDouble, CalendarDays, DoorOpen, Loader2, UserRoundCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { canAccessClinicalRole, canManageWardsRole } from "@/lib/guards";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import { generateId } from "@/lib/online-core";
import { getAppClient } from "@/lib/app-client";
import type { Admission, Encounter, PatientOption, Ward } from "@/types/hospital";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function fetchWardsWorkspace() {
  const database = getAppClient();
  if (!database) throw new Error("Service unavailable.");
  const hospital = getHospitalClient();
  const [patientsResponse, encountersResponse, wardsResponse, admissionsResponse] = await Promise.all([
    database.from("patients").select("id, name, hospital_id, lab_id, phone").order("name", { ascending: true }).limit(500),
    hospital.from("clinical_encounters").select("id, patient_id, encounter_number, encounter_type, status, started_at").in("status", ["Open", "Admitted"]).order("started_at", { ascending: false }),
    hospital.from("wards").select("id, facility_id, name, code, ward_type, capacity, location, gender_restriction, is_active, beds(id, facility_id, ward_id, bed_number, status, notes)").eq("is_active", true).order("name", { ascending: true }),
    hospital.from("admissions").select("id, patient_id, encounter_id, ward_id, bed_id, status, admission_reason, admitted_at, discharged_at, patients(id, name, hospital_id, lab_id, phone), wards(id, name, code), beds(id, bed_number), clinical_encounters(id, encounter_number)").order("admitted_at", { ascending: false }).limit(160)
  ]);
  if (patientsResponse.error) throw new Error(patientsResponse.error.message);
  [encountersResponse, wardsResponse, admissionsResponse].forEach((response) => throwIfHospitalError(response.error));
  return {
    patients: (patientsResponse.data ?? []) as PatientOption[],
    encounters: (encountersResponse.data ?? []) as Encounter[],
    wards: (wardsResponse.data ?? []) as Ward[],
    admissions: (admissionsResponse.data ?? []) as Admission[]
  };
}

export function WardsWorkspace() {
  const { facilityId, loading, role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canAccess = canAccessClinicalRole(role);
  const canManage = canManageWardsRole(role);
  const [saving, setSaving] = useState(false);
  const [selectedWardId, setSelectedWardId] = useState("");
  const [admissionForm, setAdmissionForm] = useState({ patient_id: "", encounter_id: "", ward_id: "", bed_id: "", admission_reason: "" });

  const workspaceQuery = useQuery({ queryKey: ["hospital", "wards"], queryFn: fetchWardsWorkspace, enabled: Boolean(facilityId && canAccess) });
  const data = workspaceQuery.data;
  const activeAdmissions = useMemo(() => (data?.admissions ?? []).filter((item) => item.status === "Admitted"), [data]);
  const availableBeds = useMemo(() => data?.wards.find((ward) => ward.id === admissionForm.ward_id)?.beds?.filter((bed) => bed.status === "Available") ?? [], [admissionForm.ward_id, data]);
  const patientEncounters = useMemo(() => (data?.encounters ?? []).filter((encounter) => encounter.patient_id === admissionForm.patient_id), [admissionForm.patient_id, data]);
  const totalBeds = (data?.wards ?? []).reduce((sum, ward) => sum + (ward.beds?.length ?? 0), 0);
  const selectedWard = (data?.wards ?? []).find((ward) => ward.id === selectedWardId) ?? data?.wards[0] ?? null;
  const selectedWardAdmissions = activeAdmissions.filter((admission) => admission.ward_id === selectedWard?.id);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hospital", "wards"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "clinical-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "overview"] }),
      queryClient.invalidateQueries({ queryKey: ["patients"] })
    ]);
  };

  const admitPatient = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !admissionForm.patient_id || !admissionForm.encounter_id || !admissionForm.ward_id) return;
    try {
      setSaving(true);
      const { error } = await getHospitalClient().from("admissions").insert({
        id: generateId(), facility_id: facilityId, patient_id: admissionForm.patient_id,
        encounter_id: admissionForm.encounter_id, ward_id: admissionForm.ward_id,
        bed_id: admissionForm.bed_id || null, admission_reason: admissionForm.admission_reason.trim() || null,
        admitted_by: user?.id ?? null
      });
      throwIfHospitalError(error);
      setAdmissionForm({ patient_id: "", encounter_id: "", ward_id: "", bed_id: "", admission_reason: "" });
      await refresh();
      toast({ title: "Patient admitted", variant: "success" });
    } catch (error) {
      toast({ title: "Admission failed", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  const dischargePatient = async (admission: Admission) => {
    const summary = window.prompt("Enter a brief discharge summary:");
    if (summary === null) return;
    try {
      const { error } = await getHospitalClient().from("admissions").update({ status: "Discharged", discharged_at: new Date().toISOString(), discharge_summary: summary.trim() || null, discharged_by: user?.id ?? null }).eq("id", admission.id);
      throwIfHospitalError(error);
      await refresh();
      toast({ title: "Patient discharged", variant: "success" });
    } catch (error) {
      toast({ title: "Discharge failed", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    }
  };

  if (loading || workspaceQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading...</CardContent></Card>;
  if (!canAccess || !facilityId) return <Card><CardHeader><CardTitle>Ward access unavailable</CardTitle></CardHeader></Card>;

  return <div className="space-y-6">
    <Card className="overflow-hidden border-indigo-100 bg-gradient-to-br from-indigo-800 via-indigo-700 to-blue-500 text-white"><CardContent className="grid grid-cols-2 gap-3 p-4 sm:p-6 lg:grid-cols-[1.4fr_repeat(3,0.45fr)]"><div className="col-span-2 lg:col-span-1"><h2 className="text-2xl font-semibold">Wards and admissions</h2></div>{[["Wards", data?.wards.length ?? 0], ["Beds", totalBeds], ["Admitted", activeAdmissions.length]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-indigo-100">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}</CardContent></Card>

    {canManage ? <div>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRoundCheck className="h-5 w-5 text-indigo-700" />Admit patient</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={admitPatient}><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={admissionForm.patient_id} onChange={(event) => setAdmissionForm((current) => ({ ...current, patient_id: event.target.value, encounter_id: "" }))} required><option value="">Patient / Hospital ID</option>{(data?.patients ?? []).map((patient) => <option key={patient.id} value={patient.id}>{patient.name} — {patient.hospital_id ?? patient.lab_id}</option>)}</select><div className="grid gap-3 sm:grid-cols-3"><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={admissionForm.encounter_id} onChange={(event) => setAdmissionForm((current) => ({ ...current, encounter_id: event.target.value }))} required><option value="">Encounter</option>{patientEncounters.map((encounter) => <option key={encounter.id} value={encounter.id}>{encounter.encounter_number}</option>)}</select><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={admissionForm.ward_id} onChange={(event) => setAdmissionForm((current) => ({ ...current, ward_id: event.target.value, bed_id: "" }))} required><option value="">Ward</option>{(data?.wards ?? []).map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</select><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={admissionForm.bed_id} onChange={(event) => setAdmissionForm((current) => ({ ...current, bed_id: event.target.value }))}><option value="">No bed assigned</option>{availableBeds.map((bed) => <option key={bed.id} value={bed.id}>Bed {bed.bed_number}</option>)}</select></div><Textarea value={admissionForm.admission_reason} onChange={(event) => setAdmissionForm((current) => ({ ...current, admission_reason: event.target.value }))} placeholder="Admission reason" /><Button className="w-full" disabled={saving}>Admit patient</Button></form></CardContent></Card>
    </div> : null}

    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><BedDouble className="h-5 w-5 text-indigo-700" />Bed board</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 sm:grid-cols-2">{(data?.wards ?? []).map((ward) => { const occupied = ward.beds?.filter((bed) => bed.status === "Occupied").length ?? 0; return <button key={ward.id} type="button" onClick={() => setSelectedWardId(ward.id)} className={`rounded-xl border p-3 text-left ${selectedWard?.id === ward.id ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}`}><span className="block font-semibold">{ward.name}</span><span className="text-xs text-slate-500">{occupied}/{ward.beds?.length ?? ward.capacity} occupied</span></button>})}</div>{selectedWard ? <div className="rounded-2xl border p-4"><div className="flex items-center justify-between"><div><p className="font-semibold">{selectedWard.name}</p><p className="text-xs text-slate-500">{selectedWard.code} · {selectedWard.location || "Location not set"}</p></div></div><div className="mt-3 flex flex-wrap gap-2">{(selectedWard.beds ?? []).map((bed) => <span key={bed.id} className={`rounded-lg px-2 py-1 text-xs font-medium ${bed.status === "Occupied" ? "bg-rose-100 text-rose-700" : bed.status === "Available" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{bed.bed_number}</span>)}</div></div> : null}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-indigo-700" />{selectedWard?.name || "Ward"} admissions</CardTitle></CardHeader><CardContent><div className="space-y-3">{selectedWardAdmissions.map((admission) => <div key={admission.id} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><p className="font-semibold">{admission.patients?.name}</p><p className="mt-1 text-xs font-medium text-indigo-700">{admission.patients?.hospital_id ?? admission.patients?.lab_id}</p></div><div className="text-sm"><p>{admission.wards?.name} · Bed {admission.beds?.bed_number ?? "unassigned"}</p><p className="mt-1 text-xs text-slate-500">Admitted {formatDate(admission.admitted_at)}</p></div>{canManage ? <Button variant="outline" size="sm" onClick={() => dischargePatient(admission)}><DoorOpen className="h-4 w-4" />Discharge</Button> : null}</div>)}{!selectedWardAdmissions.length ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No patients in this ward.</div> : null}</div></CardContent></Card>
    </div>
  </div>;
}
