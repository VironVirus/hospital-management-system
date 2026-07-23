"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CircleDollarSign, FileCheck2, Loader2, Plus, ScanSearch, Search, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { canAccessRadiologyRole, canManageRadiologyRole, canRequestRadiologyRole } from "@/lib/guards";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import { generateId } from "@/lib/online-core";
import type { Encounter, PatientOption, RadiologyRequest, RadiologyService } from "@/types/hospital";

type WorkspaceData = {
  patients: PatientOption[];
  encounters: Encounter[];
  services: RadiologyService[];
  requests: RadiologyRequest[];
};

const requestInitial = { patient_id: "", encounter_id: "", service_id: "", clinical_indication: "", priority: "Routine" as RadiologyRequest["priority"] };
const serviceInitial = { name: "", modality: "X-Ray" as RadiologyService["modality"], body_part: "", preparation_instructions: "", unit_price: "" };
const reportInitial = { findings: "", impression: "", recommendation: "", pacs_reference: "" };

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value));
}

async function fetchWorkspace(): Promise<WorkspaceData> {
  const hospital = getHospitalClient();
  const [patients, encounters, services, requests] = await Promise.all([
    hospital.from("patients").select("id, name, hospital_id, lab_id, phone").order("name", { ascending: true }).limit(1000),
    hospital.from("clinical_encounters").select("id, facility_id, patient_id, encounter_number, encounter_type, status, presenting_complaint, attending_clinician, started_at, ended_at, patients(id, name, hospital_id, lab_id, phone)").in("status", ["Open", "Admitted"]).order("started_at", { ascending: false }).limit(500),
    hospital.from("radiology_services").select("*").order("name", { ascending: true }),
    hospital.from("radiology_requests").select("id, facility_id, request_number, patient_id, encounter_id, service_id, clinical_indication, priority, status, scheduled_at, requested_at, completed_at, patients(id, name, hospital_id, lab_id, phone), clinical_encounters(id, encounter_number), radiology_services(id, name, modality, unit_price), radiology_reports(*)").order("requested_at", { ascending: false }).limit(500)
  ]);
  [patients, encounters, services, requests].forEach((response) => throwIfHospitalError(response.error));
  return {
    patients: (patients.data ?? []) as PatientOption[],
    encounters: (encounters.data ?? []) as Encounter[],
    services: (services.data ?? []) as RadiologyService[],
    requests: (requests.data ?? []) as RadiologyRequest[]
  };
}

export function RadiologyWorkspace() {
  const { facilityId, loading, role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canAccess = canAccessRadiologyRole(role);
  const canRequest = canRequestRadiologyRole(role);
  const canManage = canManageRadiologyRole(role);
  const [requestForm, setRequestForm] = useState(requestInitial);
  const [serviceForm, setServiceForm] = useState(serviceInitial);
  const [reportForm, setReportForm] = useState(reportInitial);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const workspace = useQuery({ queryKey: ["hospital", "radiology"], queryFn: fetchWorkspace, enabled: Boolean(facilityId && canAccess) });
  const requests = useMemo(() => workspace.data?.requests ?? [], [workspace.data]);
  const selected = requests.find((request) => request.id === selectedId) ?? requests[0] ?? null;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return requests;
    return requests.filter((request) => [request.request_number, request.patients?.name, request.patients?.hospital_id, request.radiology_services?.name, request.status].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [requests, search]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hospital", "radiology"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "billing"] })
    ]);
  };

  const createRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !requestForm.patient_id || !requestForm.service_id || !requestForm.clinical_indication.trim()) return;
    try {
      setSaving(true);
      const id = generateId();
      const { error } = await getHospitalClient().from("radiology_requests").insert({
        id, facility_id: facilityId, patient_id: requestForm.patient_id,
        encounter_id: requestForm.encounter_id || null, service_id: requestForm.service_id,
        clinical_indication: requestForm.clinical_indication.trim(), priority: requestForm.priority,
        requested_by: user?.id ?? null
      });
      throwIfHospitalError(error);
      setRequestForm(requestInitial);
      setSelectedId(id);
      await refresh();
      toast({ title: "Imaging requested", description: "The request and patient charge were created together.", variant: "success" });
    } catch (error) {
      toast({ title: "Request not created", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  const createService = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !serviceForm.name.trim()) return;
    try {
      setSaving(true);
      const { error } = await getHospitalClient().from("radiology_services").insert({
        id: generateId(), facility_id: facilityId, name: serviceForm.name.trim(), modality: serviceForm.modality,
        body_part: serviceForm.body_part.trim() || null, preparation_instructions: serviceForm.preparation_instructions.trim() || null,
        unit_price: Number(serviceForm.unit_price || 0), created_by: user?.id ?? null
      });
      throwIfHospitalError(error);
      setServiceForm(serviceInitial);
      await refresh();
      toast({ title: "Imaging service added", description: "It is ready for requesting and billing.", variant: "success" });
    } catch (error) {
      toast({ title: "Service not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  const updateStatus = async (status: RadiologyRequest["status"]) => {
    if (!selected) return;
    try {
      setSaving(true);
      const payload: Record<string, unknown> = { status, assigned_to: user?.id ?? null };
      if (status === "Scheduled") payload.scheduled_at = new Date().toISOString();
      if (status === "Completed") payload.completed_at = new Date().toISOString();
      const { error } = await getHospitalClient().from("radiology_requests").update(payload).eq("id", selected.id);
      throwIfHospitalError(error);
      await refresh();
    } catch (error) {
      toast({ title: "Status not updated", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  const saveReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !selected || !reportForm.findings.trim() || !reportForm.impression.trim()) return;
    try {
      setSaving(true);
      const existing = selected.radiology_reports?.[0];
      const payload = {
        facility_id: facilityId, request_id: selected.id, findings: reportForm.findings.trim(), impression: reportForm.impression.trim(),
        recommendation: reportForm.recommendation.trim() || null, pacs_reference: reportForm.pacs_reference.trim() || null,
        reported_by: user?.id ?? null, reported_at: new Date().toISOString()
      };
      const response = existing
        ? await getHospitalClient().from("radiology_reports").update(payload).eq("id", existing.id)
        : await getHospitalClient().from("radiology_reports").insert({ id: generateId(), ...payload });
      throwIfHospitalError(response.error);
      const statusResponse = await getHospitalClient().from("radiology_requests").update({ status: "Completed", completed_at: new Date().toISOString(), assigned_to: user?.id ?? null }).eq("id", selected.id);
      throwIfHospitalError(statusResponse.error);
      setReportForm(reportInitial);
      await refresh();
      toast({ title: "Radiology report completed", description: "The findings are now part of the patient record.", variant: "success" });
    } catch (error) {
      toast({ title: "Report not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally { setSaving(false); }
  };

  if (loading || workspace.isLoading) return <Card><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading radiology...</CardContent></Card>;
  if (!canAccess || !facilityId) return <Card><CardHeader><CardTitle>Radiology access unavailable</CardTitle><CardDescription>Your staff role does not include radiology access.</CardDescription></CardHeader></Card>;

  return <div className="space-y-6">
    <Card className="overflow-hidden border-violet-100 bg-gradient-to-br from-violet-800 via-indigo-700 to-sky-600 text-white"><CardContent className="grid gap-5 p-6 lg:grid-cols-[1.4fr_repeat(3,0.5fr)] lg:items-center"><div><h2 className="text-2xl font-semibold">Radiology</h2></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase">Waiting</p><p className="mt-2 text-3xl font-semibold">{requests.filter((item) => item.status === "Requested").length}</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase">In progress</p><p className="mt-2 text-3xl font-semibold">{requests.filter((item) => item.status === "In Progress").length}</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase">Completed</p><p className="mt-2 text-3xl font-semibold">{requests.filter((item) => item.status === "Completed").length}</p></div></CardContent></Card>

    <div className="grid gap-6 xl:grid-cols-2">
      {canRequest ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-violet-700" />Request imaging</CardTitle><CardDescription>The configured service price is sent automatically to patient billing.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={createRequest}><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={requestForm.patient_id} onChange={(event) => setRequestForm((current) => ({ ...current, patient_id: event.target.value, encounter_id: "" }))} required><option value="">Patient / Hospital ID</option>{(workspace.data?.patients ?? []).map((patient) => <option key={patient.id} value={patient.id}>{patient.name} — {patient.hospital_id ?? patient.lab_id}</option>)}</select><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={requestForm.encounter_id} onChange={(event) => setRequestForm((current) => ({ ...current, encounter_id: event.target.value }))}><option value="">No encounter selected</option>{(workspace.data?.encounters ?? []).filter((encounter) => encounter.patient_id === requestForm.patient_id).map((encounter) => <option key={encounter.id} value={encounter.id}>{encounter.encounter_number}</option>)}</select><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={requestForm.service_id} onChange={(event) => setRequestForm((current) => ({ ...current, service_id: event.target.value }))} required><option value="">Select imaging service</option>{(workspace.data?.services ?? []).filter((service) => service.is_active).map((service) => <option key={service.id} value={service.id}>{service.name} · {service.modality} · {money(service.unit_price)}</option>)}</select><div className="grid gap-3 sm:grid-cols-[1fr_160px]"><Textarea value={requestForm.clinical_indication} onChange={(event) => setRequestForm((current) => ({ ...current, clinical_indication: event.target.value }))} placeholder="Clinical indication and relevant history" required /><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={requestForm.priority} onChange={(event) => setRequestForm((current) => ({ ...current, priority: event.target.value as RadiologyRequest["priority"] }))}>{["Routine", "Urgent", "Emergency"].map((item) => <option key={item}>{item}</option>)}</select></div><Button disabled={saving}><ScanSearch className="h-4 w-4" />Create request</Button></form></CardContent></Card> : null}
      {canManage ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-violet-700" />Imaging service catalogue</CardTitle><CardDescription>Add examinations with modality, preparation, body region, and price.</CardDescription></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2" onSubmit={createService}><Input value={serviceForm.name} onChange={(event) => setServiceForm((current) => ({ ...current, name: event.target.value }))} placeholder="Service name" required /><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={serviceForm.modality} onChange={(event) => setServiceForm((current) => ({ ...current, modality: event.target.value as RadiologyService["modality"] }))}>{["X-Ray", "Ultrasound", "CT", "MRI", "Mammography", "Fluoroscopy", "Other"].map((item) => <option key={item}>{item}</option>)}</select><Input value={serviceForm.body_part} onChange={(event) => setServiceForm((current) => ({ ...current, body_part: event.target.value }))} placeholder="Body part / region" /><Input type="number" min="0" value={serviceForm.unit_price} onChange={(event) => setServiceForm((current) => ({ ...current, unit_price: event.target.value }))} placeholder="Price (NGN)" /><Textarea className="sm:col-span-2" value={serviceForm.preparation_instructions} onChange={(event) => setServiceForm((current) => ({ ...current, preparation_instructions: event.target.value }))} placeholder="Patient preparation instructions" /><Button className="sm:col-span-2" disabled={saving}>Add imaging service</Button></form></CardContent></Card> : null}
    </div>

    <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-violet-700" />Imaging worklist</CardTitle><CardDescription>All requested, scheduled, active, and completed studies.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient, ID, request, or service" /></div><div className="max-h-[720px] space-y-2 overflow-y-auto">{filtered.map((request) => <button key={request.id} type="button" onClick={() => setSelectedId(request.id)} className={`w-full rounded-2xl border p-4 text-left ${selected?.id === request.id ? "border-violet-300 bg-violet-50" : "hover:bg-slate-50"}`}><div className="flex justify-between gap-3"><div><p className="font-semibold">{request.patients?.name}</p><p className="text-xs font-medium text-violet-700">{request.patients?.hospital_id ?? request.patients?.lab_id}</p></div><Badge variant={request.priority === "Emergency" ? "destructive" : "outline"}>{request.priority}</Badge></div><p className="mt-3 text-sm">{request.radiology_services?.name} · {request.radiology_services?.modality}</p><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{request.request_number}</span><span>{request.status}</span></div></button>)}{!filtered.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No radiology requests.</p> : null}</div></CardContent></Card>

    <Card>{selected ? <><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-violet-700" />{selected.patients?.name}</CardTitle><CardDescription>{selected.patients?.hospital_id ?? selected.patients?.lab_id} · {selected.request_number} · {formatDate(selected.requested_at)}</CardDescription></div><Badge>{selected.status}</Badge></div></CardHeader><CardContent className="space-y-5"><div className="rounded-2xl border bg-slate-50 p-4"><p className="font-semibold">{selected.radiology_services?.name} · {selected.radiology_services?.modality}</p><p className="mt-2 text-sm text-slate-700"><strong>Indication:</strong> {selected.clinical_indication}</p><p className="mt-2 text-xs text-slate-500">Encounter: {selected.clinical_encounters?.encounter_number ?? "Not linked"} · Scheduled: {formatDate(selected.scheduled_at)}</p></div>{canManage ? <div className="flex flex-wrap gap-2">{(["Scheduled", "In Progress", "Completed", "Cancelled"] as RadiologyRequest["status"][]).map((status) => <Button key={status} type="button" size="sm" variant={selected.status === status ? "default" : "outline"} disabled={saving} onClick={() => updateStatus(status)}>{status}</Button>)}</div> : null}{selected.radiology_reports?.[0] ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2 font-semibold text-emerald-950"><FileCheck2 className="h-5 w-5" />Completed report</div><p className="mt-4 text-sm"><strong>Findings:</strong> {selected.radiology_reports[0].findings}</p><p className="mt-3 text-sm"><strong>Impression:</strong> {selected.radiology_reports[0].impression}</p>{selected.radiology_reports[0].recommendation ? <p className="mt-3 text-sm"><strong>Recommendation:</strong> {selected.radiology_reports[0].recommendation}</p> : null}</div> : null}{canManage ? <form className="space-y-3 rounded-2xl border p-4" onSubmit={saveReport}><Label>Radiology report</Label><Textarea value={reportForm.findings} onChange={(event) => setReportForm((current) => ({ ...current, findings: event.target.value }))} placeholder="Detailed findings" required /><Textarea value={reportForm.impression} onChange={(event) => setReportForm((current) => ({ ...current, impression: event.target.value }))} placeholder="Impression / conclusion" required /><Textarea value={reportForm.recommendation} onChange={(event) => setReportForm((current) => ({ ...current, recommendation: event.target.value }))} placeholder="Recommendation (optional)" /><Input value={reportForm.pacs_reference} onChange={(event) => setReportForm((current) => ({ ...current, pacs_reference: event.target.value }))} placeholder="PACS accession or study reference (optional)" /><Button disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}Save and complete report</Button></form> : null}</CardContent></> : <CardContent className="p-12 text-center text-sm text-slate-500">Select an imaging request.</CardContent>}</Card></div>
  </div>;
}
