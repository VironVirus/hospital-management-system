"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BedDouble,
  Building2,
  Loader2,
  Plus,
  Save,
  Trash2
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getHospitalClient, throwIfHospitalError } from "@/lib/hospital-client";
import { generateId } from "@/lib/online-core";
import type { Bed, Ward } from "@/types/hospital";

type WardDraft = {
  code: string;
  gender_restriction: Ward["gender_restriction"];
  is_active: boolean;
  location: string;
  name: string;
  ward_type: string;
};

type BedDraft = {
  bed_number: string;
  notes: string;
  status: Bed["status"];
};

const initialWard = {
  name: "",
  code: "",
  ward_type: "General",
  gender_restriction: "Any" as Ward["gender_restriction"],
  location: "",
  initial_beds: "0"
};

const selectClassName =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-base sm:h-10 sm:text-sm";

function wardDraft(ward: Ward): WardDraft {
  return {
    code: ward.code,
    gender_restriction: ward.gender_restriction,
    is_active: ward.is_active,
    location: ward.location ?? "",
    name: ward.name,
    ward_type: ward.ward_type
  };
}

function bedDraft(bed: Bed): BedDraft {
  return {
    bed_number: bed.bed_number,
    notes: bed.notes ?? "",
    status: bed.status
  };
}

async function fetchWards() {
  const { data, error } = await getHospitalClient()
    .from("wards")
    .select("id, facility_id, name, code, ward_type, capacity, location, gender_restriction, is_active, beds(id, facility_id, ward_id, bed_number, status, notes)")
    .order("name", { ascending: true });
  throwIfHospitalError(error);
  return (data ?? []) as Ward[];
}

export function WardManagementPanel() {
  const { facilityId, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(initialWard);
  const [wardDrafts, setWardDrafts] = useState<Record<string, WardDraft>>({});
  const [bedDrafts, setBedDrafts] = useState<Record<string, BedDraft>>({});
  const [newBeds, setNewBeds] = useState<Record<string, string>>({});
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null);

  const wardsQuery = useQuery({
    queryKey: ["admin", "wards"],
    queryFn: fetchWards,
    enabled: Boolean(facilityId)
  });

  const wards = useMemo(() => wardsQuery.data ?? [], [wardsQuery.data]);
  const wardGroups = useMemo(() => {
    const groups = new Map<string, Ward[]>();
    wards.forEach((ward) => groups.set(ward.ward_type || "General", [...(groups.get(ward.ward_type || "General") ?? []), ward]));
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [wards]);
  const selectedWard = wards.find((ward) => ward.id === selectedWardId) ?? wards[0] ?? null;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "wards"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "wards"] }),
      queryClient.invalidateQueries({ queryKey: ["hospital", "overview"] })
    ]);
  };

  const createWard = async (event: FormEvent) => {
    event.preventDefault();
    if (!facilityId || !createForm.name.trim() || !createForm.code.trim()) return;
    const wardId = generateId();
    const initialBeds = Math.min(Math.max(Number(createForm.initial_beds) || 0, 0), 200);

    try {
      setCreating(true);
      const hospital = getHospitalClient();
      const wardResponse = await hospital.from("wards").insert({
        id: wardId,
        facility_id: facilityId,
        name: createForm.name.trim(),
        code: createForm.code.trim().toUpperCase(),
        ward_type: createForm.ward_type.trim() || "General",
        capacity: 0,
        location: createForm.location.trim() || null,
        gender_restriction: createForm.gender_restriction,
        created_by: user?.id ?? null
      });
      throwIfHospitalError(wardResponse.error);

      if (initialBeds > 0) {
        const bedResponse = await hospital.from("beds").insert(
          Array.from({ length: initialBeds }, (_, index) => ({
            id: generateId(),
            facility_id: facilityId,
            ward_id: wardId,
            bed_number: String(index + 1).padStart(2, "0")
          }))
        );
        throwIfHospitalError(bedResponse.error);
      }

      setCreateForm(initialWard);
      await refresh();
      setSelectedWardId(wardId);
      toast({ title: "Ward created", variant: "success" });
    } catch (error) {
      toast({
        title: "Ward not created",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setCreating(false);
    }
  };

  const saveWard = async (ward: Ward) => {
    const draft = wardDrafts[ward.id] ?? wardDraft(ward);
    try {
      setSavingKey(`ward-${ward.id}`);
      const { error } = await getHospitalClient()
        .from("wards")
        .update({
          name: draft.name.trim(),
          code: draft.code.trim().toUpperCase(),
          ward_type: draft.ward_type.trim() || "General",
          location: draft.location.trim() || null,
          gender_restriction: draft.gender_restriction,
          is_active: draft.is_active
        })
        .eq("id", ward.id);
      throwIfHospitalError(error);
      await refresh();
      toast({ title: "Ward updated", variant: "success" });
    } catch (error) {
      toast({ title: "Ward not updated", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setSavingKey(null);
    }
  };

  const addBed = async (ward: Ward) => {
    const number = (newBeds[ward.id] ?? "").trim();
    if (!facilityId || !number) return;
    try {
      setSavingKey(`new-bed-${ward.id}`);
      const { error } = await getHospitalClient().from("beds").insert({
        id: generateId(),
        facility_id: facilityId,
        ward_id: ward.id,
        bed_number: number
      });
      throwIfHospitalError(error);
      setNewBeds((current) => ({ ...current, [ward.id]: "" }));
      await refresh();
      toast({ title: "Bed added", variant: "success" });
    } catch (error) {
      toast({ title: "Bed not added", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setSavingKey(null);
    }
  };

  const saveBed = async (bed: Bed) => {
    const draft = bedDrafts[bed.id] ?? bedDraft(bed);
    try {
      setSavingKey(`bed-${bed.id}`);
      const { error } = await getHospitalClient()
        .from("beds")
        .update({
          bed_number: draft.bed_number.trim(),
          notes: draft.notes.trim() || null,
          status: draft.status
        })
        .eq("id", bed.id);
      throwIfHospitalError(error);
      await refresh();
      toast({ title: "Bed updated", variant: "success" });
    } catch (error) {
      toast({ title: "Bed not updated", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setSavingKey(null);
    }
  };

  const removeBed = async (bed: Bed) => {
    if (!window.confirm(`Remove bed ${bed.bed_number}?`)) return;
    try {
      setSavingKey(`bed-${bed.id}`);
      const { error } = await getHospitalClient().from("beds").delete().eq("id", bed.id);
      throwIfHospitalError(error);
      await refresh();
      toast({ title: "Bed removed", variant: "success" });
    } catch (error) {
      toast({ title: "Bed not removed", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-700" />
            Create ward
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={createWard}>
            <div><Label>Ward name</Label><Input className="mt-1" value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} required /></div>
            <div><Label>Code</Label><Input className="mt-1" value={createForm.code} onChange={(event) => setCreateForm((current) => ({ ...current, code: event.target.value }))} placeholder="MW-A" required /></div>
            <div><Label>Ward type</Label><Input className="mt-1" value={createForm.ward_type} onChange={(event) => setCreateForm((current) => ({ ...current, ward_type: event.target.value }))} /></div>
            <div><Label>Initial beds</Label><Input className="mt-1" type="number" min="0" max="200" value={createForm.initial_beds} onChange={(event) => setCreateForm((current) => ({ ...current, initial_beds: event.target.value }))} /></div>
            <div><Label>Patient group</Label><select className={`mt-1 ${selectClassName}`} value={createForm.gender_restriction} onChange={(event) => setCreateForm((current) => ({ ...current, gender_restriction: event.target.value as Ward["gender_restriction"] }))}>{["Any", "Female", "Male", "Paediatric"].map((item) => <option key={item}>{item}</option>)}</select></div>
            <div><Label>Location</Label><Input className="mt-1" value={createForm.location} onChange={(event) => setCreateForm((current) => ({ ...current, location: event.target.value }))} /></div>
            <Button className="sm:col-span-2" disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create ward</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BedDouble className="h-5 w-5 text-indigo-700" />
            Wards and beds
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {wardsQuery.isLoading ? <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div> : null}
          {!wardsQuery.isLoading && wards.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No wards.</div> : null}
          <div className="space-y-4">
            {wardGroups.map(([type, group]) => (
              <section key={type} className="space-y-2">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">{type}</p><Badge variant="outline">{group.length} ward{group.length === 1 ? "" : "s"}</Badge></div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.map((ward) => (
                    <button key={ward.id} type="button" onClick={() => setSelectedWardId(ward.id)} className={`rounded-xl border p-3 text-left transition ${selectedWard?.id === ward.id ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200" : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"}`}>
                      <span className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-950">{ward.name}</strong><Badge variant={ward.is_active ? "default" : "secondary"}>{ward.is_active ? "Active" : "Inactive"}</Badge></span>
                      <span className="mt-1 block text-xs text-slate-500">{ward.code} · {ward.beds?.length ?? 0} beds</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {selectedWard ? (() => {
            const ward = selectedWard;
            const draft = wardDrafts[ward.id] ?? wardDraft(ward);
            return (
              <section className="space-y-4 rounded-2xl border border-indigo-100 bg-slate-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><p className="font-semibold">{ward.name}</p><p className="text-xs text-slate-500">{ward.code} · {ward.beds?.length ?? 0} beds</p></div>
                  <Badge variant={ward.is_active ? "default" : "secondary"}>{ward.is_active ? "Active" : "Inactive"}</Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div><Label>Name</Label><Input className="mt-1" value={draft.name} onChange={(event) => setWardDrafts((current) => ({ ...current, [ward.id]: { ...draft, name: event.target.value } }))} /></div>
                  <div><Label>Code</Label><Input className="mt-1" value={draft.code} onChange={(event) => setWardDrafts((current) => ({ ...current, [ward.id]: { ...draft, code: event.target.value } }))} /></div>
                  <div><Label>Type</Label><Input className="mt-1" value={draft.ward_type} onChange={(event) => setWardDrafts((current) => ({ ...current, [ward.id]: { ...draft, ward_type: event.target.value } }))} /></div>
                  <div><Label>Location</Label><Input className="mt-1" value={draft.location} onChange={(event) => setWardDrafts((current) => ({ ...current, [ward.id]: { ...draft, location: event.target.value } }))} /></div>
                  <div><Label>Patient group</Label><select className={`mt-1 ${selectClassName}`} value={draft.gender_restriction} onChange={(event) => setWardDrafts((current) => ({ ...current, [ward.id]: { ...draft, gender_restriction: event.target.value as Ward["gender_restriction"] } }))}>{["Any", "Female", "Male", "Paediatric"].map((item) => <option key={item}>{item}</option>)}</select></div>
                  <div><Label>Status</Label><select className={`mt-1 ${selectClassName}`} value={draft.is_active ? "active" : "inactive"} onChange={(event) => setWardDrafts((current) => ({ ...current, [ward.id]: { ...draft, is_active: event.target.value === "active" } }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
                </div>
                <Button size="sm" onClick={() => void saveWard(ward)} disabled={savingKey === `ward-${ward.id}`}><Save className="h-4 w-4" />Save ward</Button>

                <div className="border-t pt-4">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={newBeds[ward.id] ?? ""} onChange={(event) => setNewBeds((current) => ({ ...current, [ward.id]: event.target.value }))} placeholder="New bed number" />
                    <Button type="button" variant="outline" onClick={() => void addBed(ward)} disabled={!newBeds[ward.id]?.trim() || savingKey === `new-bed-${ward.id}`}><Plus className="h-4 w-4" />Add bed</Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {(ward.beds ?? []).map((bed) => {
                    const currentBed = bedDrafts[bed.id] ?? bedDraft(bed);
                    const occupied = bed.status === "Occupied";
                    return (
                      <div key={bed.id} className="grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-[120px_160px_1fr_auto] md:items-end">
                        <div><Label>Bed</Label><Input className="mt-1" value={currentBed.bed_number} disabled={occupied} onChange={(event) => setBedDrafts((current) => ({ ...current, [bed.id]: { ...currentBed, bed_number: event.target.value } }))} /></div>
                        <div><Label>Status</Label><select className={`mt-1 ${selectClassName}`} value={currentBed.status} disabled={occupied} onChange={(event) => setBedDrafts((current) => ({ ...current, [bed.id]: { ...currentBed, status: event.target.value as Bed["status"] } }))}>{["Available", "Reserved", "Maintenance", ...(occupied ? ["Occupied"] : [])].map((item) => <option key={item}>{item}</option>)}</select></div>
                        <div><Label>Notes</Label><Input className="mt-1" value={currentBed.notes} onChange={(event) => setBedDrafts((current) => ({ ...current, [bed.id]: { ...currentBed, notes: event.target.value } }))} /></div>
                        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void saveBed(bed)} disabled={savingKey === `bed-${bed.id}`}><Save className="h-4 w-4" />Save</Button><Button size="icon" variant="destructive" aria-label={`Remove bed ${bed.bed_number}`} onClick={() => void removeBed(bed)} disabled={occupied || savingKey === `bed-${bed.id}`}><Trash2 className="h-4 w-4" /></Button></div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })() : null}
        </CardContent>
      </Card>
    </div>
  );
}
