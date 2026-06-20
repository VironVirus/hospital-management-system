"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Loader2,
  PencilLine,
  Plus,
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
import { formatAppRole } from "@/lib/auth-types";
import {
  canCreateFacilitiesRole,
  canManageFacilitiesRole,
  isSuperAdminRole
} from "@/lib/guards";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { TablesInsert, TablesUpdate } from "@/types/supabase";
import {
  cleanOptionalValue,
  fetchFacilities,
  fetchFacilityStaff,
  formatDateTime,
  getFacilitySearchText,
  normalizeFacilityCode,
  type FacilityAdminFilter,
  type FacilityMode,
  type FacilityRow,
  type FacilityStatusFilter,
  type FacilityStructureFilter
} from "@/features/admin/facility-data";

type FacilityFormState = {
  address: string;
  code: string;
  email: string;
  is_active: boolean;
  name: string;
  mode: FacilityMode;
  parent_facility_id: string;
  phone: string;
};

const initialFormState: FacilityFormState = {
  address: "",
  code: "",
  email: "",
  is_active: true,
  mode: "standalone",
  name: "",
  parent_facility_id: "",
  phone: ""
};

export function FacilityManagementPanel() {
  const { facilityId, loading, role } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingFacilityId, setEditingFacilityId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FacilityFormState>(initialFormState);
  const [assigningAdminFacilityId, setAssigningAdminFacilityId] = useState<string | null>(null);
  const [deletingFacilityId, setDeletingFacilityId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FacilityStatusFilter>("all");
  const [structureFilter, setStructureFilter] = useState<FacilityStructureFilter>("all");
  const [adminFilter, setAdminFilter] = useState<FacilityAdminFilter>("all");
  const [selectedAdminByFacility, setSelectedAdminByFacility] = useState<Record<string, string>>(
    {}
  );
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
    const adminCounts = new Map<string, number>();

    staff.forEach((profile) => {
      if (!profile.facility_id) {
        return;
      }

      staffCounts.set(profile.facility_id, (staffCounts.get(profile.facility_id) ?? 0) + 1);

      if (profile.role === "Admin") {
        adminCounts.set(profile.facility_id, (adminCounts.get(profile.facility_id) ?? 0) + 1);
      }
    });

    const directBranches = facilities.filter(
      (facility) => facility.parent_facility_id === facilityId
    ).length;

    return {
      adminCounts,
      directBranches,
      staffCounts,
      totalFacilities: facilities.length,
      totalStaff: staff.length
    };
  }, [facilities, facilityId, staff]);

  const activeFacility = useMemo(
    () => facilities.find((facility) => facility.id === facilityId) ?? null,
    [facilities, facilityId]
  );

  const parentFacilityOptions = useMemo(
    () => facilities.filter((facility) => facility.id !== editingFacilityId),
    [editingFacilityId, facilities]
  );

  const staffByFacility = useMemo(() => {
    const grouped = new Map<string, typeof staff>();

    staff.forEach((profile) => {
      if (!profile.facility_id) {
        return;
      }

      const current = grouped.get(profile.facility_id) ?? [];
      current.push(profile);
      grouped.set(profile.facility_id, current);
    });

    grouped.forEach((profiles) =>
      profiles.sort((left, right) =>
        (left.display_name || left.email || "").localeCompare(
          right.display_name || right.email || ""
        )
      )
    );

    return grouped;
  }, [staff]);

  const filteredFacilities = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return facilities.filter((facility) => {
      const adminCount = facilityStats.adminCounts.get(facility.id) ?? 0;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? facility.is_active : !facility.is_active);
      const matchesStructure =
        structureFilter === "all" ||
        (structureFilter === "child"
          ? Boolean(facility.parent_facility_id)
          : !facility.parent_facility_id);
      const matchesAdminState =
        adminFilter === "all" ||
        (adminFilter === "with-admin" ? adminCount > 0 : adminCount === 0);
      const parentName = facility.parent_facility_id
        ? facilityMap.get(facility.parent_facility_id)?.name ?? null
        : null;
      const matchesSearch =
        !normalizedSearch ||
        getFacilitySearchText(facility, parentName).includes(normalizedSearch);

      return matchesStatus && matchesStructure && matchesAdminState && matchesSearch;
    });
  }, [
    adminFilter,
    facilities,
    facilityMap,
    facilityStats.adminCounts,
    searchTerm,
    statusFilter,
    structureFilter
  ]);

  const resetForm = () => {
    setEditingFacilityId(null);
    setFormState({
      ...initialFormState,
      parent_facility_id: facilityId ?? ""
    });
  };

  const loadForEdit = (facility: FacilityRow) => {
    setEditingFacilityId(facility.id);
    setFormState({
      address: facility.address ?? "",
      code: facility.code,
      email: facility.email ?? "",
      is_active: facility.is_active,
      mode: facility.parent_facility_id ? "child" : "standalone",
      name: facility.name,
      parent_facility_id: facility.parent_facility_id ?? "",
      phone: facility.phone ?? ""
    });
  };

  const invalidateFacilityQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "facilities"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "facilities", "scoped"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "facility-staff", "scoped"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "staff-profiles"] }),
      queryClient.invalidateQueries({ queryKey: ["lab-branding"] })
    ]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = formState.name.trim();
    const normalizedCode = normalizeFacilityCode(formState.code);
    const resolvedParentFacilityId =
      formState.mode === "child" ? formState.parent_facility_id || facilityId || "" : "";

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
        description: "Choose the parent facility for this branch before saving.",
        variant: "error"
      });
      return;
    }

    if (!facilityId) {
      toast({
        title: "Facility assignment required",
        description: "Assign this account to a facility before managing facilities.",
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
            description: "Only Super Admin users can create new facilities.",
            variant: "error"
          });
          return;
        }

        const payload: TablesInsert<"facilities"> = {
          address: cleanOptionalValue(formState.address),
          code: normalizedCode,
          email: cleanOptionalValue(formState.email),
          is_active: formState.is_active,
          name: trimmedName,
          parent_facility_id: formState.mode === "child" ? resolvedParentFacilityId : null,
          phone: cleanOptionalValue(formState.phone)
        };

        const { error } = await supabase.from("facilities").insert(payload);

        if (error) {
          throw error;
        }

        toast({
          title: formState.mode === "child" ? "Branch facility created" : "Facility created",
          description:
            formState.mode === "child"
              ? `${trimmedName} was added under ${facilityMap.get(resolvedParentFacilityId)?.name || activeFacility?.name || "the selected parent facility"}.`
              : `${trimmedName} was added as a standalone facility.`,
          variant: "success"
        });
      }

      resetForm();
      await invalidateFacilityQueries();
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

  const handleDeleteFacility = async (facility: FacilityRow) => {
    if (!isSuperAdmin) {
      toast({
        title: "Super Admin required",
        description: "Only the Super Admin can delete facilities.",
        variant: "error"
      });
      return;
    }

    if (facility.id === facilityId) {
      toast({
        title: "Current facility cannot be deleted",
        description: "Move your Super Admin account to another facility before deleting this one.",
        variant: "error"
      });
      return;
    }

    const hasStaff = (staffByFacility.get(facility.id) ?? []).length > 0;
    const hasChildBranches = facilities.some(
      (candidate) => candidate.parent_facility_id === facility.id
    );

    if (hasStaff) {
      toast({
        title: "Move staff first",
        description:
          "Reassign or remove staff from this facility before deleting it, so no account becomes unassigned.",
        variant: "error"
      });
      return;
    }

    if (hasChildBranches) {
      toast({
        title: "Remove child branches first",
        description:
          "Detach or delete the child branches under this facility before deleting the parent facility.",
        variant: "error"
      });
      return;
    }

    const confirmed = window.confirm(
      `Delete ${facility.name}? This should be used only for an empty facility with no patients, tests, inventory, or results attached.`
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
      setDeletingFacilityId(facility.id);
      const { error } = await supabase.from("facilities").delete().eq("id", facility.id);

      if (error) {
        throw error;
      }

      if (editingFacilityId === facility.id) {
        resetForm();
      }

      await invalidateFacilityQueries();
      toast({
        title: "Facility deleted",
        description: `${facility.name} was removed successfully.`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Facility could not be deleted",
        description:
          error instanceof Error
            ? error.message
            : "Delete all dependent records first, then try again.",
        variant: "error"
      });
    } finally {
      setDeletingFacilityId(null);
    }
  };

  const handleAssignFacilityAdmin = async (facility: FacilityRow) => {
    if (!isSuperAdmin) {
      toast({
        title: "Super Admin required",
        description: "Only the Super Admin can assign branch admins from this screen.",
        variant: "error"
      });
      return;
    }

    const facilityStaff = staffByFacility.get(facility.id) ?? [];
    const selectedProfileId =
      selectedAdminByFacility[facility.id] ??
      facilityStaff.find((profile) => profile.role !== "SuperAdmin")?.id ??
      "";

    if (!selectedProfileId) {
      toast({
        title: "Choose a staff member first",
        description: "Select the staff account that should become the branch admin.",
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
      setAssigningAdminFacilityId(facility.id);

      const priorAdminIds = facilityStaff
        .filter((profile) => profile.role === "Admin" && profile.id !== selectedProfileId)
        .map((profile) => profile.id);

      if (priorAdminIds.length > 0) {
        const { error: demotionError } = await supabase
          .from("profiles")
          .update({ role: "Receptionist" })
          .in("id", priorAdminIds);

        if (demotionError) {
          throw demotionError;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          facility_id: facility.id,
          role: "Admin"
        })
        .eq("id", selectedProfileId);

      if (error) {
        throw error;
      }

      await invalidateFacilityQueries();
      toast({
        title: "Branch admin assigned",
        description:
          priorAdminIds.length > 0
            ? `${facility.name} now has one active branch admin. Previous branch admins were moved to Receptionist.`
            : `${facility.name} now has the selected staff member promoted to Admin.`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Branch admin could not be assigned",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setAssigningAdminFacilityId(null);
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
            <CardTitle className="text-3xl text-slate-950">{facilityStats.totalFacilities}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Staff in scope</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{facilityStats.totalStaff}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>{isSuperAdmin ? "Branches under your facility" : "Direct branches"}</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{facilityStats.directBranches}</CardTitle>
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
                  Search, filter, and open each branch for branding, contact details, and
                  admin reassignment.
                </CardDescription>
              </div>
              <Badge variant="outline">
                Showing {filteredFacilities.length} of {facilities.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,0.85fr))]">
              <div className="space-y-2">
                <Label htmlFor="facility-search">Search facilities</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="facility-search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by branch name, code, phone, email, or address"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="facility-status-filter">Status</Label>
                <select
                  id="facility-status-filter"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as FacilityStatusFilter)
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="facility-structure-filter">Structure</Label>
                <select
                  id="facility-structure-filter"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={structureFilter}
                  onChange={(event) =>
                    setStructureFilter(event.target.value as FacilityStructureFilter)
                  }
                >
                  <option value="all">All structures</option>
                  <option value="standalone">Standalone</option>
                  <option value="child">Child branch</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="facility-admin-filter">Admin coverage</Label>
                <select
                  id="facility-admin-filter"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={adminFilter}
                  onChange={(event) =>
                    setAdminFilter(event.target.value as FacilityAdminFilter)
                  }
                >
                  <option value="all">All branches</option>
                  <option value="with-admin">With admin</option>
                  <option value="without-admin">Without admin</option>
                </select>
              </div>
            </div>

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

            {staffQuery.isError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                {staffQuery.error instanceof Error
                  ? staffQuery.error.message
                  : "Unable to load facility staff."}
              </div>
            ) : null}

            {!facilitiesQuery.isLoading && !facilitiesQuery.isError && facilities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-5 py-8 text-center text-sm text-slate-600">
                No facilities are visible in your current scope.
              </div>
            ) : null}

            {!facilitiesQuery.isLoading &&
            !facilitiesQuery.isError &&
            facilities.length > 0 &&
            filteredFacilities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-600">
                No facilities matched the current search and filters.
              </div>
            ) : null}

            {filteredFacilities.map((facility) => {
              const staffCount = facilityStats.staffCounts.get(facility.id) ?? 0;
              const adminCount = facilityStats.adminCounts.get(facility.id) ?? 0;
              const isCurrentFacility = facility.id === facilityId;
              const parentFacility = facility.parent_facility_id
                ? facilityMap.get(facility.parent_facility_id) ?? null
                : null;
              const facilityStaff = staffByFacility.get(facility.id) ?? [];
              const adminProfiles = facilityStaff.filter((profile) => profile.role === "Admin");
              const adminCandidates = facilityStaff.filter((profile) => profile.role !== "SuperAdmin");
              const selectedAdminId =
                selectedAdminByFacility[facility.id] ??
                adminProfiles[0]?.id ??
                adminCandidates[0]?.id ??
                "";

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
                        <Badge variant={facility.is_active ? "default" : "secondary"}>
                          {facility.is_active ? "Active" : "Inactive"}
                        </Badge>
                        {isCurrentFacility ? <Badge variant="outline">Your facility</Badge> : null}
                        {facility.parent_facility_id ? (
                          <Badge variant="outline">Child branch</Badge>
                        ) : (
                          <Badge variant="outline">Standalone</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {parentFacility
                          ? `Parent facility: ${parentFacility.name}`
                          : "No parent facility assigned"}
                      </p>
                      {facility.phone || facility.email ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {[facility.phone, facility.email].filter(Boolean).join(" | ")}
                        </p>
                      ) : null}
                      {facility.address ? (
                        <p className="mt-1 text-xs text-slate-500">{facility.address}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-500">
                        Updated {formatDateTime(facility.updated_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        <UsersRound className="mr-1 h-3.5 w-3.5" />
                        {staffCount} staff
                      </Badge>
                      <Badge variant="outline">
                        <UserCog className="mr-1 h-3.5 w-3.5" />
                        {adminCount} admin{adminCount === 1 ? "" : "s"}
                      </Badge>
                      <Button type="button" variant="outline" onClick={() => loadForEdit(facility)}>
                        <PencilLine className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button asChild variant="outline">
                        <Link href={`/admin/facilities/${facility.id}`}>Open details</Link>
                      </Button>
                      {isSuperAdmin ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={deletingFacilityId === facility.id || isCurrentFacility}
                          onClick={() => handleDeleteFacility(facility)}
                        >
                          {deletingFacilityId === facility.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                        Current admins
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {adminProfiles.length === 0 ? (
                          <p className="text-sm text-slate-500">No branch admin assigned yet.</p>
                        ) : (
                          adminProfiles.map((profile) => (
                            <Badge key={profile.id} variant="outline">
                              {profile.display_name || profile.email || "Unnamed admin"} |{" "}
                              {formatAppRole(profile.role)}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                        Quick branch admin reassignment
                      </p>
                      <div className="mt-3 flex flex-col gap-3 md:flex-row">
                        <select
                          className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
                          value={selectedAdminId}
                          onChange={(event) =>
                            setSelectedAdminByFacility((current) => ({
                              ...current,
                              [facility.id]: event.target.value
                            }))
                          }
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
                        <Button
                          type="button"
                          disabled={
                            !isSuperAdmin ||
                            adminCandidates.length === 0 ||
                            assigningAdminFacilityId === facility.id
                          }
                          onClick={() => handleAssignFacilityAdmin(facility)}
                        >
                          {assigningAdminFacilityId === facility.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserCog className="h-4 w-4" />
                          )}
                          Set admin
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Quick assign sets the new branch admin and moves any older branch admins
                        in this facility back to Receptionist. Open details for custom demotion.
                      </p>
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
              {editingFacilityId ? "Edit facility" : "Create facility"}
            </CardTitle>
            <CardDescription>
              {editingFacilityId
                ? "Update the visible facility record, including its structure when allowed."
                : isSuperAdmin
                  ? "Create either a standalone facility or a child branch from this panel."
                  : "Only Super Admin users can create new facilities."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {isSuperAdmin ? (
                <div className="grid gap-4 md:grid-cols-2">
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
                      {parentFacilityOptions.map((facility) => (
                        <option key={facility.id} value={facility.id}>
                          {facility.name} ({facility.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}

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

              <div className="grid gap-4 md:grid-cols-2">
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
              </div>

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
                  value={formState.address}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      address: event.target.value
                    }))
                  }
                  placeholder="Plot, street, LGA, state"
                  rows={3}
                />
              </div>

              {!isSuperAdmin ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
                  You can update only your assigned facility:{" "}
                  <strong>{activeFacility?.name || "Current facility"}</strong>
                </div>
              ) : formState.mode === "child" ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Parent facility:{" "}
                  <strong>
                    {facilityMap.get(formState.parent_facility_id)?.name ||
                      activeFacility?.name ||
                      "Not selected"}
                  </strong>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  This facility will stand on its own without a parent facility.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving || (!editingFacilityId && !canCreateFacilities)}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingFacilityId
                    ? "Save facility"
                    : formState.mode === "child"
                      ? "Create branch"
                      : "Create facility"}
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
