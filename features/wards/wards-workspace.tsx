"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BedDouble, Building2, CalendarDays, DoorOpen, Loader2, Plus, UserRoundCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  if (!database) throw new Error("MySQL is not configured.");
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
  const [wardForm, setWardForm] = useState({ name: "", code: "", ward_type: "General", capacity: "10", location: "" });
  const [admissionForm, setAdmissionForm] = useState({ patient_id: "", encounter_id: "", ward_id: "", bed_id: "", admission_reason: "" });

  const workspaceQuery = useQuery({ queryKey: ["hospital", "wards"], queryFn: fetchWardsWorkspace, enabled: Boolean(facilityId && canAccess) });
  const data = workspaceQuery.data;
  const activeAdmissions = useMemo(() => (data?.admissions ?? []).filter((item) => item.status === "Admitted"), [data]);
  const availableBeds = useMemo(() => data?.wards.find((ward) => ward.id === admissionForm.ward_id)?.beds?.filter((bed) => bed.status === "Available") ?? [], [admissionForm.ward_id, data]);
  const patientEncounters = useMemo(() => (data?.encounters ?? []).filter((encounter) => encounter.patient_id === admissionForm.patient_id), [admissionForm.patient_id, data]);
  const totalBeds = (data?.wards ?? []).reduce((sum, ward) => sum + (ward.beds?.length ?? 0), 0);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hospital", "wards"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "clinical-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "overview"] }),
      queryClient.invalidateQueries({ queryKey: ["patients"] })
    ]);
  };

  const createWard = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !wardForm.name.trim() || !wardForm.code.trim()) return;
    const wardId = generateId();
    const capacity = Math.max(0, Number(wardForm.capacity));
    try {
      setSaving(true);
      const hospital = getHospitalClient();
      const wardResponse = await hospital.from("wards").insert({
        id: wardId, facility_id: facilityId, name: wardForm.name.trim(), code: wardForm.code.trim().toUpperCase(),
        ward_type: wardForm.ward_type, capacity, location: wardForm.location.trim() || null, created_by: user?.id ?? null
      });
      throwIfHospitalError(wardResponse.error);
      if (capacity > 0) {
        const bedResponse = await hospital.from("beds").insert(Array.from({ length: capacity }, (_, index) => ({ id: generateId(), facility_id: facilityId, ward_id: wardId, bed_number: String(index + 1).padStart(2, "0") })));
        throwIfHospitalError(bedResponse.error);
      }
      setWardForm({ name: "", code: "", ward_type: "General", capacity: "10", location: "" });
      await refresh();
      toast({ title: "Ward created", description: `${capacity} beds were prepared for admission.`, variant: "success" });
    } catch (error) {
      toast({ title: "Ward not created", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
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
      toast({ title: "Patient admitted", description: "Ward, bed, and admission date are now on the patient record.", variant: "success" });
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
      toast({ title: "Patient discharged", description: "The bed is available and the encounter has been closed.", variant: "success" });
    } catch (error) {
      toast({ title: "Discharge failed", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    }
  };

  if (loading || workspaceQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading wards and admissions...</CardContent></Card>;
  if (!canAccess || !facilityId) return <Card><CardHeader><CardTitle>Ward access unavailable</CardTitle><CardDescription>Your account needs clinical access and a completed hospital setup.</CardDescription></CardHeader></Card>;

  return <div className="space-y-6">
    <Card className="overflow-hidden border-indigo-100 bg-gradient-to-br from-indigo-800 via-indigo-700 to-blue-500 text-white"><CardContent className="grid gap-4 p-6 lg:grid-cols-[1.4fr_repeat(3,0.45fr)]"><div><Badge className="bg-white/15 text-white">Inpatient services</Badge><h2 className="mt-3 text-2xl font-semibold">Wards, beds & admissions</h2><p className="mt-2 text-sm text-indigo-50">See where every admitted patient is, when they arrived, and which bed they occupy.</p></div>{[["Wards", data?.wards.length ?? 0], ["Beds", totalBeds], ["Admitted", activeAdmissions.length]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-indigo-100">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}</CardContent></Card>

    {canManage ? <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-indigo-700" />Create ward</CardTitle><CardDescription>Capacity automatically creates numbered beds.</CardDescription></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2" onSubmit={createWard}><div><Label>Ward name</Label><Input className="mt-1" value={wardForm.name} onChange={(event) => setWardForm((current) => ({ ...current, name: event.target.value }))} required /></div><div><Label>Code</Label><Input className="mt-1" value={wardForm.code} onChange={(event) => setWardForm((current) => ({ ...current, code: event.target.value }))} placeholder="MW-A" required /></div><div><Label>Ward type</Label><Input className="mt-1" value={wardForm.ward_type} onChange={(event) => setWardForm((current) => ({ ...current, ward_type: event.target.value }))} /></div><div><Label>Capacity / beds</Label><Input className="mt-1" type="number" min="0" value={wardForm.capacity} onChange={(event) => setWardForm((current) => ({ ...current, capacity: event.target.value }))} /></div><div className="sm:col-span-2"><Label>Location</Label><Input className="mt-1" value={wardForm.location} onChange={(event) => setWardForm((current) => ({ ...current, location: event.target.value }))} /></div><Button className="sm:col-span-2" disabled={saving}><Plus className="h-4 w-4" />Create ward & beds</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRoundCheck className="h-5 w-5 text-indigo-700" />Admit patient</CardTitle><CardDescription>An open encounter is required before admission.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={admitPatient}><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={admissionForm.patient_id} onChange={(event) => setAdmissionForm((current) => ({ ...current, patient_id: event.target.value, encounter_id: "" }))} required><option value="">Patient / Hospital ID</option>{(data?.patients ?? []).map((patient) => <option key={patient.id} value={patient.id}>{patient.name} — {patient.hospital_id ?? patient.lab_id}</option>)}</select><div className="grid gap-3 sm:grid-cols-3"><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={admissionForm.encounter_id} onChange={(event) => setAdmissionForm((current) => ({ ...current, encounter_id: event.target.value }))} required><option value="">Encounter</option>{patientEncounters.map((encounter) => <option key={encounter.id} value={encounter.id}>{encounter.encounter_number}</option>)}</select><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={admissionForm.ward_id} onChange={(event) => setAdmissionForm((current) => ({ ...current, ward_id: event.target.value, bed_id: "" }))} required><option value="">Ward</option>{(data?.wards ?? []).map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</select><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={admissionForm.bed_id} onChange={(event) => setAdmissionForm((current) => ({ ...current, bed_id: event.target.value }))}><option value="">No bed assigned</option>{availableBeds.map((bed) => <option key={bed.id} value={bed.id}>Bed {bed.bed_number}</option>)}</select></div><Textarea value={admissionForm.admission_reason} onChange={(event) => setAdmissionForm((current) => ({ ...current, admission_reason: event.target.value }))} placeholder="Admission reason" /><Button className="w-full" disabled={saving}>Admit patient</Button></form></CardContent></Card>
    </div> : null}

    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><BedDouble className="h-5 w-5 text-indigo-700" />Bed board</CardTitle><CardDescription>Real-time availability by ward.</CardDescription></CardHeader><CardContent className="space-y-4">{(data?.wards ?? []).map((ward) => { const occupied = ward.beds?.filter((bed) => bed.status === "Occupied").length ?? 0; return <div key={ward.id} className="rounded-2xl border p-4"><div className="flex items-center justify-between"><div><p className="font-semibold">{ward.name}</p><p className="text-xs text-slate-500">{ward.code} · {ward.location || "Location not set"}</p></div><Badge variant="outline">{occupied}/{ward.beds?.length ?? ward.capacity} occupied</Badge></div><div className="mt-3 flex flex-wrap gap-2">{(ward.beds ?? []).map((bed) => <span key={bed.id} className={`rounded-lg px-2 py-1 text-xs font-medium ${bed.status === "Occupied" ? "bg-rose-100 text-rose-700" : bed.status === "Available" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{bed.bed_number}</span>)}</div></div>})}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-indigo-700" />Current admissions</CardTitle><CardDescription>Grouped by Hospital ID, admission date, ward, and bed.</CardDescription></CardHeader><CardContent><div className="space-y-3">{activeAdmissions.map((admission) => <div key={admission.id} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><p className="font-semibold">{admission.patients?.name}</p><p className="mt-1 text-xs font-medium text-indigo-700">{admission.patients?.hospital_id ?? admission.patients?.lab_id}</p></div><div className="text-sm"><p>{admission.wards?.name} · Bed {admission.beds?.bed_number ?? "unassigned"}</p><p className="mt-1 text-xs text-slate-500">Admitted {formatDate(admission.admitted_at)}</p></div>{canManage ? <Button variant="outline" size="sm" onClick={() => dischargePatient(admission)}><DoorOpen className="h-4 w-4" />Discharge</Button> : null}</div>)}{!activeAdmissions.length ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No patients are currently admitted.</div> : null}</div></CardContent></Card>
    </div>
  </div>;
}
