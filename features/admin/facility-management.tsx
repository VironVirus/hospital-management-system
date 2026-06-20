"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, PencilLine, Plus, Save, ShieldCheck, UsersRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  canCreateFacilitiesRole,
  canManageFacilitiesRole,
  isSuperAdminRole
} from "@/lib/guards";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/supabase";

type FacilityRow = Tables<"facilities">;
type FacilityStaffRow = Pick<Tables<"profiles">, "facility_id" | "id" | "role">;
type FacilityFormState = {
  code: string;
  name: string;
};

const initialFormState: FacilityFormState = {
  code: "",
  name: ""
};

function normalizeFacilityCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

async function fetchFacilities() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("facilities")
    .select("id, name, code, parent_facility_id, created_at, updated_at")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as FacilityRow[];
}

async function fetchFacilityStaff() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, facility_id, role")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as FacilityStaffRow[];
}

export function FacilityManagementPanel() {
  const { facilityId, loading, role } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingFacilityId, setEditingFacilityId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FacilityFormState>(initialFormState);
  const [saving, setSaving] = useState(false);
  const canManageFacilities = canManageFacilitiesRole(role);
  const canCreateFacilities = canCreateFacilitiesRole(role);
  const isSuperAdmin = isSuperAdminRole(role);

  const facilitiesQuery = useQuery({
    queryKey: ["admin", "facilities", "scoped"],
    queryFn: fetchFacilities,
    enabled: canManageFacilities
  });

  const staffQuery = useQuery({
    queryKey: ["admin", "facility-staff", "scoped"],
    queryFn: fetchFacilityStaff,
    enabled: canManageFacilities
  });

  const facilities = useMemo(() => facilitiesQuery.data ?? [], [facilitiesQuery.data]);
  const staff = useMemo(() => staffQuery.data ?? [], [staffQuery.data]);

  const facilityMap = useMemo(
    () => new Map(facilities.map((facility) => [facility.id, facility])),
    [facilities]
  );

  const facilityStats = useMemo(() => {
    const staffCounts = new Map<string, number>();

    staff.forEach((profile) => {
      if (!profile.facility_id) {
        return;
      }

      staffCounts.set(
        profile.facility_id,
        (staffCounts.get(profile.facility_id) ?? 0) + 1
      );
    });

    const directBranches = facilities.filter(
      (facility) => facility.parent_facility_id === facilityId
    ).length;

    return {
      directBranches,
      staffCounts,
      totalFacilities: facilities.length,
      totalStaff: staff.length
    };
  }, [facilities, facilityId, staff]);

  const selectedFacility = useMemo(
    () => facilities.find((facility) => facility.id === editingFacilityId) ?? null,
    [editingFacilityId, facilities]
  );

  const activeFacility = useMemo(
    () => facilities.find((facility) => facility.id === facilityId) ?? null,
    [facilities, facilityId]
  );

  const resetForm = () => {
    setEditingFacilityId(null);
    setFormState(initialFormState);
  };

  const loadForEdit = (facility: FacilityRow) => {
    setEditingFacilityId(facility.id);
    setFormState({
      code: facility.code,
      name: facility.name
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = formState.name.trim();
    const normalizedCode = normalizeFacilityCode(formState.code);

    if (!trimmedName || !normalizedCode) {
      toast({
        title: "Facility name and code are required",
        description: "Enter both values before saving this facility.",
        variant: "error"
      });
      return;
    }

    if (!facilityId) {
      toast({
        title: "Facility assignment required",
        description: "Assign this account to a facility before managing branches.",
        variant: "error"
      });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      toast({
        title: "Supabase is not configured",
        description: "Set your public Supabase environment variables first.",
        variant: "error"
      });
      return;
    }

    try {
      setSaving(true);

      if (editingFacilityId) {
        const payload: TablesUpdate<"facilities"> = {
          code: normalizedCode,
          name: trimmedName
        };

        const { error } = await supabase
          .from("facilities")
          .update(payload)
          .eq("id", editingFacilityId);

        if (error) {
          throw error;
        }

        toast({
          title: "Facility updated",
          description: `${trimmedName} was saved successfully.`,
          variant: "success"
        });
      } else {
        if (!canCreateFacilities) {
          toast({
            title: "Super Admin required",
            description: "Only Super Admin users can create new branch facilities.",
            variant: "error"
          });
          return;
        }

        const payload: TablesInsert<"facilities"> = {
          code: normalizedCode,
          name: trimmedName,
          parent_facility_id: facilityId
        };

        const { error } = await supabase.from("facilities").insert(payload);

        if (error) {
          throw error;
        }

        toast({
          title: "Branch facility created",
          description: `${trimmedName} was added under ${activeFacility?.name || "your current facility"}.`,
          variant: "success"
        });
      }

      resetForm();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "facilities"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "facilities", "scoped"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "staff-profiles"] })
      ]);
    } catch (error) {
      toast({
        title: "Facility could not be saved",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading facility administration...
        </CardContent>
      </Card>
    );
  }

  if (!canManageFacilities) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-950">
            <ShieldCheck className="h-5 w-5" />
            Admin access required
          </CardTitle>
          <CardDescription className="text-amber-900">
            Only Admin and Super Admin users can manage facilities.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Visible facilities</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {facilityStats.totalFacilities}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Staff in scope</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {facilityStats.totalStaff}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Direct branches</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {facilityStats.directBranches}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-blue-100 shadow-soft">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-700" />
                  Facility directory
                </CardTitle>
                <CardDescription>
                  Admins can edit only their own facility. Super Admins can also manage
                  child branches under their assigned parent facility.
                </CardDescription>
              </div>
              <Badge variant="outline">
                {isSuperAdmin ? "Multi-branch scope" : "Single facility scope"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {facilitiesQuery.isLoading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                Loading facilities...
              </div>
            ) : null}

            {facilitiesQuery.isError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                {facilitiesQuery.error instanceof Error
                  ? facilitiesQuery.error.message
                  : "Unable to load facilities."}
              </div>
            ) : null}

            {!facilitiesQuery.isLoading && !facilitiesQuery.isError && facilities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-5 py-8 text-center text-sm text-slate-600">
                No facilities are visible in your current scope.
              </div>
            ) : null}

            {facilities.map((facility) => {
              const staffCount = facilityStats.staffCounts.get(facility.id) ?? 0;
              const isCurrentFacility = facility.id === facilityId;
              const parentFacility = facility.parent_facility_id
                ? facilityMap.get(facility.parent_facility_id) ?? null
                : null;

              return (
                <div
                  key={facility.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {facility.name}
                        </p>
                        <Badge variant="secondary">{facility.code}</Badge>
                        {isCurrentFacility ? <Badge variant="outline">Your facility</Badge> : null}
                        {facility.parent_facility_id ? (
                          <Badge variant="outline">Child branch</Badge>
                        ) : (
                          <Badge variant="outline">Primary facility</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {parentFacility
                          ? `Parent facility: ${parentFacility.name}`
                          : "No parent facility assigned"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Updated {formatDateTime(facility.updated_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        <UsersRound className="mr-1 h-3.5 w-3.5" />
                        {staffCount} staff
                      </Badge>
                      <Button type="button" variant="outline" onClick={() => loadForEdit(facility)}>
                        <PencilLine className="h-4 w-4" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-blue-100 shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {editingFacilityId ? (
                <PencilLine className="h-5 w-5 text-blue-700" />
              ) : (
                <Plus className="h-5 w-5 text-blue-700" />
              )}
              {editingFacilityId ? "Edit facility" : "Create branch facility"}
            </CardTitle>
            <CardDescription>
              {editingFacilityId
                ? "Update the visible facility record without exposing other branches."
                : isSuperAdmin
                  ? "Create a new branch under your assigned parent facility."
                  : "Only Super Admin users can create new branch facilities."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="facility-name">Facility name</Label>
                <Input
                  id="facility-name"
                  value={formState.name}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Tapxora Enugu"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="facility-code">Facility code</Label>
                <Input
                  id="facility-code"
                  value={formState.code}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      code: normalizeFacilityCode(event.target.value)
                    }))
                  }
                  placeholder="TAP-ENU"
                />
                <p className="text-xs text-slate-500">
                  Use a short uppercase code so staff can identify the branch easily.
                </p>
              </div>

              {!editingFacilityId ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
                  Parent facility: <strong>{activeFacility?.name || "Current assigned facility"}</strong>
                </div>
              ) : selectedFacility?.parent_facility_id ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Parent facility:{" "}
                  <strong>
                    {facilityMap.get(selectedFacility.parent_facility_id)?.name || "Unknown"}
                  </strong>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  This facility is currently a primary facility.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={saving || (!editingFacilityId && !canCreateFacilities)}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingFacilityId ? "Save facility" : "Create branch"}
                </Button>
                {editingFacilityId ? (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
