"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Loader2,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatAppRole, type AppRole } from "@/lib/auth-types";
import { canManageFacilitiesRole, isSuperAdminRole } from "@/lib/guards";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { TablesUpdate } from "@/types/supabase";
import {
  cleanOptionalValue,
  fetchFacilities,
  fetchFacilityStaff,
  formatDateTime,
  normalizeFacilityCode,
  type FacilityMode,
  type FacilityStaffRow
} from "@/features/admin/facility-data";
import { LabBrandingSettingsPanel } from "@/features/admin/lab-branding-settings";

type FacilityDetailsPanelProps = {
  facilityRecordId: string;
};

type FacilityFormState = {
  address: string;
  code: string;
  email: string;
  is_active: boolean;
  mode: FacilityMode;
  name: string;
  parent_facility_id: string;
  phone: string;
};

const emptyForm: FacilityFormState = {
  address: "",
  code: "",
  email: "",
  is_active: true,
  mode: "standalone",
  name: "",
  parent_facility_id: "",
  phone: ""
};

const demotionRoles: AppRole[] = [
  "Receptionist",
  "LabScientist",
  "Verifier",
  "Accountant"
];

export function FacilityDetailsPanel({ facilityRecordId }: FacilityDetailsPanelProps) {
  const { facilityId, loading, role } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formState, setFormState] = useState<FacilityFormState>(emptyForm);
  const [profileSaving, setProfileSaving] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [demotingAdminId, setDemotingAdminId] = useState<string | null>(null);
  const [staffSearchTerm, setStaffSearchTerm] = useState("");
  const [replacementStaffId, setReplacementStaffId] = useState("");
  const [replacementFallbackRole, setReplacementFallbackRole] =
    useState<AppRole>("Receptionist");
  const [demotionRoleByAdmin, setDemotionRoleByAdmin] = useState<Record<string, AppRole>>({});
  const canManageFacilities = canManageFacilitiesRole(role);
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

  const viewedFacility = useMemo(
    () => facilities.find((facility) => facility.id === facilityRecordId) ?? null,
    [facilities, facilityRecordId]
  );

  const facilityStaff = useMemo(
    () =>
      staff
        .filter((profile) => profile.facility_id === facilityRecordId)
        .sort((left, right) =>
          (left.display_name || left.email || "").localeCompare(
            right.display_name || right.email || ""
          )
        ),
    [facilityRecordId, staff]
  );

  const currentAdmins = useMemo(
    () => facilityStaff.filter((profile) => profile.role === "Admin"),
    [facilityStaff]
  );

  const adminCandidates = useMemo(
    () => facilityStaff.filter((profile) => profile.role !== "SuperAdmin"),
    [facilityStaff]
  );

  const childBranches = useMemo(
    () => facilities.filter((facility) => facility.parent_facility_id === facilityRecordId),
    [facilities, facilityRecordId]
  );

  const filteredStaff = useMemo(() => {
    const normalizedSearch = staffSearchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return facilityStaff;
    }

    return facilityStaff.filter((profile) =>
      [profile.display_name, profile.email, profile.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [facilityStaff, staffSearchTerm]);

  useEffect(() => {
    if (!viewedFacility) {
      return;
    }

    setFormState({
      address: viewedFacility.address ?? "",
      code: viewedFacility.code,
      email: viewedFacility.email ?? "",
      is_active: viewedFacility.is_active,
      mode: viewedFacility.parent_facility_id ? "child" : "standalone",
      name: viewedFacility.name,
      parent_facility_id: viewedFacility.parent_facility_id ?? "",
      phone: viewedFacility.phone ?? ""
    });
  }, [viewedFacility]);

  useEffect(() => {
    if (!replacementStaffId) {
      setReplacementStaffId(currentAdmins[0]?.id ?? adminCandidates[0]?.id ?? "");
    }
  }, [adminCandidates, currentAdmins, replacementStaffId]);

  const invalidateFacilityQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "facilities"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "facilities", "scoped"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "facility-staff", "scoped"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "staff-profiles"] }),
      queryClient.invalidateQueries({ queryKey: ["lab-branding"] })
    ]);
  };

  const handleSaveProfile = async () => {
    if (!viewedFacility) {
      return;
    }

    const trimmedName = formState.name.trim();
    const normalizedCode = normalizeFacilityCode(formState.code);
    const resolvedParentFacilityId =
      formState.mode === "child" ? formState.parent_facility_id : "";

    if (!trimmedName || !normalizedCode) {
      toast({
        title: "Facility name and code are required",
        description: "Enter both values before saving this facility.",
        variant: "error"
      });
      return;
    }

    if (formState.mode === "child" && !resolvedParentFacilityId) {
      toast({
        title: "Parent facility required",
        description: "Choose the parent facility before saving this branch.",
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
      setProfileSaving(true);

      const payload: TablesUpdate<"facilities"> = {
        address: cleanOptionalValue(formState.address),
        code: normalizedCode,
        email: cleanOptionalValue(formState.email),
        is_active: formState.is_active,
        name: trimmedName,
        ...(isSuperAdmin
          ? {
              parent_facility_id:
                formState.mode === "child" ? resolvedParentFacilityId : null
            }
          : {}),
        phone: cleanOptionalValue(formState.phone)
      };

      const { error } = await supabase
        .from("facilities")
        .update(payload)
        .eq("id", viewedFacility.id);

      if (error) {
        throw error;
      }

      await invalidateFacilityQueries();
      toast({
        title: "Facility updated",
        description: `${trimmedName} was saved successfully.`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Facility could not be saved",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleDeleteFacility = async () => {
    if (!viewedFacility) {
      return;
    }

    if (!isSuperAdmin) {
      toast({
        title: "Super Admin required",
        description: "Only the Super Admin can delete facilities.",
        variant: "error"
      });
      return;
    }

    if (viewedFacility.id === facilityId) {
      toast({
        title: "Current facility cannot be deleted",
        description: "Move your Super Admin account first, then try again.",
        variant: "error"
      });
      return;
    }

    if (facilityStaff.length > 0) {
      toast({
        title: "Move staff first",
        description: "Reassign or remove all staff in this facility before deleting it.",
        variant: "error"
      });
      return;
    }

    if (childBranches.length > 0) {
      toast({
        title: "Remove child branches first",
        description: "Detach or delete the child branches under this facility first.",
        variant: "error"
      });
      return;
    }

    const confirmed = window.confirm(
      `Delete ${viewedFacility.name}? Use this only for an empty facility with no operational records attached.`
    );

    if (!confirmed) {
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
      setDeleteSaving(true);
      const { error } = await supabase
        .from("facilities")
        .delete()
        .eq("id", viewedFacility.id);

      if (error) {
        throw error;
      }

      await invalidateFacilityQueries();
      toast({
        title: "Facility deleted",
        description: `${viewedFacility.name} was removed successfully.`,
        variant: "success"
      });
      window.location.assign("/admin/facilities");
    } catch (error) {
      toast({
        title: "Facility could not be deleted",
        description:
          error instanceof Error
            ? error.message
            : "Delete dependent records first, then try again.",
        variant: "error"
      });
    } finally {
      setDeleteSaving(false);
    }
  };

  const handleReassignAdmin = async () => {
    if (!viewedFacility || !replacementStaffId) {
      toast({
        title: "Choose a replacement first",
        description: "Select the staff member who should become branch admin.",
        variant: "error"
      });
      return;
    }

    if (!isSuperAdmin) {
      toast({
        title: "Super Admin required",
        description: "Only the Super Admin can reassign branch admins from this screen.",
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
      setReassigning(true);
      const priorAdminIds = currentAdmins
        .filter((profile) => profile.id !== replacementStaffId)
        .map((profile) => profile.id);

      if (priorAdminIds.length > 0) {
        const { error: demotionError } = await supabase
          .from("profiles")
          .update({ role: replacementFallbackRole })
          .in("id", priorAdminIds);

        if (demotionError) {
          throw demotionError;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          facility_id: viewedFacility.id,
          role: "Admin"
        })
        .eq("id", replacementStaffId);

      if (error) {
        throw error;
      }

      await invalidateFacilityQueries();
      toast({
        title: "Branch admin reassigned",
        description:
          priorAdminIds.length > 0
            ? `Previous branch admins were moved to ${formatAppRole(replacementFallbackRole)}.`
            : "The selected staff member is now the branch admin.",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Branch admin could not be reassigned",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setReassigning(false);
    }
  };

  const handleDemoteAdmin = async (profile: FacilityStaffRow) => {
    if (!isSuperAdmin) {
      toast({
        title: "Super Admin required",
        description: "Only the Super Admin can demote a branch admin from this screen.",
        variant: "error"
      });
      return;
    }

    const nextRole = demotionRoleByAdmin[profile.id] ?? "Receptionist";
    const isLastAdmin = currentAdmins.length === 1 && currentAdmins[0]?.id === profile.id;
    const confirmed = window.confirm(
      isLastAdmin
        ? `Demote ${profile.display_name || profile.email || "this admin"} to ${formatAppRole(nextRole)}? This branch will have no Admin until you assign another one.`
        : `Demote ${profile.display_name || profile.email || "this admin"} to ${formatAppRole(nextRole)}?`
    );

    if (!confirmed) {
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
      setDemotingAdminId(profile.id);
      const { error } = await supabase
        .from("profiles")
        .update({ role: nextRole })
        .eq("id", profile.id);

      if (error) {
        throw error;
      }

      await invalidateFacilityQueries();
      toast({
        title: "Branch admin updated",
        description: `${profile.display_name || profile.email || "The selected admin"} is now ${formatAppRole(nextRole)}.`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Branch admin could not be updated",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setDemotingAdminId(null);
    }
  };

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading facility details...
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
            Only Admin and Super Admin users can manage facility records.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if ((facilitiesQuery.isLoading || staffQuery.isLoading) && !viewedFacility) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading facility workspace...
        </CardContent>
      </Card>
    );
  }

  if (!viewedFacility) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-900">Facility not found</CardTitle>
          <CardDescription className="text-red-800">
            This facility is not visible in your current access scope, or it no longer exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/facilities">Back to facilities</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const parentFacility = viewedFacility.parent_facility_id
    ? facilityMap.get(viewedFacility.parent_facility_id) ?? null
    : null;
  const otherFacilityOptions = facilities.filter((facility) => facility.id !== viewedFacility.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Button asChild variant="outline">
            <Link href="/admin/facilities">Back to facility directory</Link>
          </Button>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-950">{viewedFacility.name}</h1>
              <Badge variant="secondary">{viewedFacility.code}</Badge>
              <Badge variant={viewedFacility.is_active ? "default" : "secondary"}>
                {viewedFacility.is_active ? "Active" : "Inactive"}
              </Badge>
              {viewedFacility.id === facilityId ? <Badge variant="outline">Your facility</Badge> : null}
            </div>
            <p className="text-sm text-slate-600">
              {parentFacility
                ? `Branch under ${parentFacility.name}`
                : "Standalone facility or branch root"}
            </p>
          </div>
        </div>

        {isSuperAdmin ? (
          <Button
            type="button"
            variant="outline"
            disabled={deleteSaving || viewedFacility.id === facilityId}
            onClick={handleDeleteFacility}
          >
            {deleteSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete facility
          </Button>
        ) : null}
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Staff in branch</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{facilityStaff.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Current branch admins</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{currentAdmins.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Child branches</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{childBranches.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Last updated</CardDescription>
            <CardTitle className="text-base text-slate-950">
              {formatDateTime(viewedFacility.updated_at)}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-blue-100 shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-700" />
              Facility profile
            </CardTitle>
            <CardDescription>
              Update the branch identity, status, contact details, and hierarchy from one place.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
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
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="facility-status">Facility status</Label>
                <select
                  id="facility-status"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={formState.is_active ? "active" : "inactive"}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      is_active: event.target.value === "active"
                    }))
                  }
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {isSuperAdmin ? (
                <div className="space-y-2">
                  <Label htmlFor="facility-mode">Facility type</Label>
                  <select
                    id="facility-mode"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    value={formState.mode}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        mode: event.target.value as FacilityMode,
                        parent_facility_id:
                          event.target.value === "child"
                            ? current.parent_facility_id || facilityId || ""
                            : ""
                      }))
                    }
                  >
                    <option value="standalone">Standalone facility</option>
                    <option value="child">Child branch</option>
                  </select>
                </div>
              ) : null}
            </div>

            {isSuperAdmin ? (
              <div className="space-y-2">
                <Label htmlFor="parent-facility">Parent facility</Label>
                <select
                  id="parent-facility"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={formState.parent_facility_id}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      parent_facility_id: event.target.value
                    }))
                  }
                  disabled={formState.mode !== "child"}
                >
                  <option value="">
                    {formState.mode === "child"
                      ? "Select parent facility"
                      : "No parent for standalone facility"}
                  </option>
                  {otherFacilityOptions.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.name} ({facility.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="facility-phone">Phone</Label>
                <Input
                  id="facility-phone"
                  value={formState.phone}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      phone: event.target.value
                    }))
                  }
                  placeholder="0803 000 0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facility-email">Email</Label>
                <Input
                  id="facility-email"
                  type="email"
                  value={formState.email}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                  placeholder="branch@tapxora.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="facility-address">Address</Label>
              <Textarea
                id="facility-address"
                rows={3}
                value={formState.address}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    address: event.target.value
                  }))
                }
                placeholder="Plot, street, LGA, state"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {formState.mode === "child"
                ? `Parent facility: ${facilityMap.get(formState.parent_facility_id)?.name || "Not selected"}`
                : "This facility stands on its own without a parent facility."}
            </div>

            <Button type="button" onClick={handleSaveProfile} disabled={profileSaving}>
              {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save facility profile
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-blue-100 shadow-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-blue-700" />
                Branch admin management
              </CardTitle>
              <CardDescription>
                Reassign the branch admin, or demote an existing one without leaving the facility screen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                  Current admins
                </p>
                <div className="mt-3 space-y-3">
                  {currentAdmins.length === 0 ? (
                    <p className="text-sm text-slate-500">No branch admin is assigned yet.</p>
                  ) : (
                    currentAdmins.map((profile) => (
                      <div
                        key={profile.id}
                        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3"
                      >
                        <div className="flex flex-col gap-1">
                          <p className="text-sm font-medium text-slate-950">
                            {profile.display_name || profile.email || "Unnamed admin"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {profile.email || "No email recorded"} | {formatAppRole(profile.role)}
                          </p>
                        </div>
                        <div className="flex flex-col gap-3 md:flex-row">
                          <select
                            className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
                            value={demotionRoleByAdmin[profile.id] ?? "Receptionist"}
                            onChange={(event) =>
                              setDemotionRoleByAdmin((current) => ({
                                ...current,
                                [profile.id]: event.target.value as AppRole
                              }))
                            }
                            disabled={!isSuperAdmin}
                          >
                            {demotionRoles.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>
                                {formatAppRole(roleOption)}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!isSuperAdmin || demotingAdminId === profile.id}
                            onClick={() => handleDemoteAdmin(profile)}
                          >
                            {demotingAdminId === profile.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-4 w-4" />
                            )}
                            Demote admin
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                  Reassign branch admin
                </p>
                <div className="mt-3 grid gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="replacement-admin">Replacement staff</Label>
                    <select
                      id="replacement-admin"
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                      value={replacementStaffId}
                      onChange={(event) => setReplacementStaffId(event.target.value)}
                      disabled={!isSuperAdmin || adminCandidates.length === 0}
                    >
                      {adminCandidates.length === 0 ? (
                        <option value="">No staff available in this facility</option>
                      ) : null}
                      {adminCandidates.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {(profile.display_name || profile.email || "Unnamed staff") +
                            " | " +
                            formatAppRole(profile.role)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fallback-role">Previous admins become</Label>
                    <select
                      id="fallback-role"
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                      value={replacementFallbackRole}
                      onChange={(event) =>
                        setReplacementFallbackRole(event.target.value as AppRole)
                      }
                      disabled={!isSuperAdmin}
                    >
                      {demotionRoles.map((roleOption) => (
                        <option key={roleOption} value={roleOption}>
                          {formatAppRole(roleOption)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    type="button"
                    disabled={!isSuperAdmin || adminCandidates.length === 0 || reassigning}
                    onClick={handleReassignAdmin}
                  >
                    {reassigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
                    Reassign branch admin
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <LabBrandingSettingsPanel
            facilityIdOverride={viewedFacility.id}
            facilityName={viewedFacility.name}
            title="Branch branding"
            description="Control the report logo, support line, footer, and signatory used for this specific facility."
          />
        </div>
      </section>

      <Card className="border-blue-100 shadow-soft">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="h-5 w-5 text-blue-700" />
                Staff in this facility
              </CardTitle>
              <CardDescription>
                Review staff assigned to this branch before promoting or demoting any admin.
              </CardDescription>
            </div>
            <Badge variant="outline">{filteredStaff.length} shown</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xl space-y-2">
            <Label htmlFor="facility-staff-search">Search branch staff</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="facility-staff-search"
                value={staffSearchTerm}
                onChange={(event) => setStaffSearchTerm(event.target.value)}
                placeholder="Search by name, email, or role"
                className="pl-9"
              />
            </div>
          </div>

          {filteredStaff.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-600">
              No staff matched the current search.
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredStaff.map((profile) => (
                <div
                  key={profile.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950">
                      {profile.display_name || profile.email || "Unnamed staff"}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {profile.email || "No email recorded"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge variant="outline">{formatAppRole(profile.role)}</Badge>
                    <span>Joined {formatDateTime(profile.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
