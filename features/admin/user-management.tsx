"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Search,
  ShieldCheck,
  UserCog,
  UserPlus,
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
import { useToast } from "@/hooks/use-toast";
import {
  formatApprovalStatus
} from "@/lib/access-control";
import {
  appRoles,
  formatAppRole,
  type AppRole,
  type ApprovalStatus
} from "@/lib/auth-types";
import { canAccessAdministrationRole, isSuperAdminRole } from "@/lib/guards";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Tables, TablesUpdate } from "@/types/supabase";

type StaffProfile = Tables<"profiles"> & {
  facilities: Pick<Tables<"facilities">, "id" | "name" | "code"> | null;
};

type StaffDraft = {
  display_name: string;
  facility_id: string;
  role: AppRole;
};

type StaffCreationForm = {
  display_name: string;
  email: string;
  facility_id: string;
  password: string;
  role: AppRole;
};

type CreatedStaffAccount = {
  approval_status: ApprovalStatus;
  display_name: string;
  email: string;
  facility_code: string;
  facility_name: string;
  password_was_generated: boolean;
  role: AppRole;
  temporary_password: string | null;
};

const roleDescriptions: Record<AppRole, string> = {
  SuperAdmin: "Multi-branch owner access, facility creation, branch oversight, and high-level administration.",
  Admin: "Full system access, user management, catalogue setup, and reports.",
  Receptionist: "Patient registration, test creation, billing support, and reception workflows.",
  LabScientist: "Sample handling, test worklists, result entry, inventory visibility.",
  Verifier: "HOD of Lab / Chief Scientist: result review, verification, sample tracking, and report access.",
  Accountant: "Billing, accounts, revenue summaries, expenses, and inventory cost visibility."
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function UserManagementPanel() {
  const { facilityId, loading, refreshProfile, role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalStatus | "all">("all");
  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");
  const [facilityFilter, setFacilityFilter] = useState<string>("all");
  const [drafts, setDrafts] = useState<Record<string, StaffDraft>>({});
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [createdStaffAccount, setCreatedStaffAccount] = useState<CreatedStaffAccount | null>(null);
  const [staffCreationForm, setStaffCreationForm] = useState<StaffCreationForm>({
    display_name: "",
    email: "",
    facility_id: "",
    password: "",
    role: "Receptionist"
  });

  const canAccessAdministration = canAccessAdministrationRole(role);
  const isSuperAdmin = isSuperAdminRole(role);

  const facilitiesQuery = useQuery({
    queryKey: ["admin", "facilities"],
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { data, error } = await supabase
        .from("facilities")
        .select("id, name, code")
        .order("name", { ascending: true });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
    enabled: canAccessAdministration
  });

  const staffQuery = useQuery({
    queryKey: ["admin", "staff-profiles"],
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, display_name, email, avatar_url, facility_id, role, approval_status, approval_note, approved_at, approved_by, created_at, updated_at, facilities(id, name, code)"
        )
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as StaffProfile[];
    },
    enabled: canAccessAdministration
  });

  const visibleFacilities = useMemo(
    () => facilitiesQuery.data ?? [],
    [facilitiesQuery.data]
  );

  useEffect(() => {
    const defaultFacilityId = facilityId ?? visibleFacilities[0]?.id ?? "";
    if (!defaultFacilityId) {
      return;
    }

    setStaffCreationForm((current) =>
      current.facility_id
        ? current
        : {
            ...current,
            facility_id: defaultFacilityId
          }
    );
  }, [facilityId, visibleFacilities]);

  useEffect(() => {
    if (isSuperAdmin) {
      return;
    }

    setStaffCreationForm((current) =>
      current.role === "Admin" || current.role === "SuperAdmin"
        ? {
            ...current,
            role: "Receptionist"
          }
        : current
    );
  }, [isSuperAdmin]);

  const assignableRoles = useMemo(
    () =>
      isSuperAdmin
        ? appRoles
        : appRoles.filter((appRole) => !["SuperAdmin", "Admin"].includes(appRole)),
    [isSuperAdmin]
  );

  const creatableRoles = useMemo(
    () =>
      isSuperAdmin
        ? appRoles.filter((appRole) => appRole !== "SuperAdmin")
        : appRoles.filter((appRole) => !["SuperAdmin", "Admin"].includes(appRole)),
    [isSuperAdmin]
  );

  const filteredStaff = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return (staffQuery.data ?? []).filter((profile) => {
      const matchesApproval =
        approvalFilter === "all" || profile.approval_status === approvalFilter;
      const matchesRole = roleFilter === "all" || profile.role === roleFilter;
      const matchesFacility =
        facilityFilter === "all" || profile.facility_id === facilityFilter;
      const haystack = [
        profile.display_name,
        profile.email,
        profile.facilities?.name,
        profile.facilities?.code,
        profile.role
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        matchesApproval &&
        matchesRole &&
        matchesFacility &&
        (!normalizedSearch || haystack.includes(normalizedSearch))
      );
    });
  }, [approvalFilter, facilityFilter, roleFilter, searchTerm, staffQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async ({
      draft,
      profile
    }: {
      draft: StaffDraft;
      profile: StaffProfile;
    }) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const payload: TablesUpdate<"profiles"> = {
        display_name: draft.display_name.trim() || profile.display_name,
        facility_id: draft.facility_id || null,
        role: draft.role
      };

      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profile.id);

      if (error) {
        throw error;
      }
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff-profiles"] });
      if (variables.profile.id === user?.id) {
        await refreshProfile();
      }
      toast({
        title: "Staff role updated",
        description: `${variables.draft.display_name || variables.profile.email || "Staff member"} was updated successfully.`,
        variant: "success"
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to update staff",
        description: error instanceof Error ? error.message : "The staff profile was not updated.",
        variant: "error"
      });
    }
  });

  const reviewMutation = useMutation({
    mutationFn: async ({
      profile,
      status
    }: {
      profile: StaffProfile;
      status: ApprovalStatus;
    }) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const payload: TablesUpdate<"profiles"> = {
        approval_note: status === "Rejected" ? "Rejected by Super Admin" : null,
        approval_status: status,
        approved_at: status === "Approved" ? new Date().toISOString() : null,
        approved_by: status === "Approved" || status === "Rejected" ? (user?.id ?? null) : null
      };

      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profile.id);

      if (error) {
        throw error;
      }
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff-profiles"] });
      toast({
        title: "Account review saved",
        description: `${variables.profile.display_name || variables.profile.email || "This account"} is now ${formatApprovalStatus(variables.status)}.`,
        variant: "success"
      });
    },
    onError: (error) => {
      toast({
        title: "Account review not saved",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    }
  });

  const getDraft = (profile: StaffProfile): StaffDraft =>
    drafts[profile.id] ?? {
      display_name: profile.display_name ?? "",
      facility_id: profile.facility_id ?? facilityId ?? "",
      role: profile.role
    };

  const setDraftField = <Key extends keyof StaffDraft>(
    profile: StaffProfile,
    key: Key,
    value: StaffDraft[Key]
  ) => {
    setDrafts((current) => ({
      ...current,
      [profile.id]: {
        ...getDraft(profile),
        [key]: value
      }
    }));
  };

  const setCreationField = <Key extends keyof StaffCreationForm>(
    key: Key,
    value: StaffCreationForm[Key]
  ) => {
    setStaffCreationForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleCreateStaff = async () => {
    const targetFacilityId = isSuperAdmin
      ? staffCreationForm.facility_id
      : (facilityId ?? staffCreationForm.facility_id);

    if (!targetFacilityId) {
      toast({
        title: "Choose a facility first",
        description: "Assign the new staff member to a branch before creating the account.",
        variant: "error"
      });
      return;
    }

    try {
      setCreatingStaff(true);
      setCreatedStaffAccount(null);

      const response = await fetch("/api/admin/staff", {
        body: JSON.stringify({
          display_name: staffCreationForm.display_name,
          email: staffCreationForm.email,
          facility_id: targetFacilityId,
          password: staffCreationForm.password,
          role: staffCreationForm.role
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            temporary_password?: string | null;
            user?: Omit<CreatedStaffAccount, "temporary_password">;
          }
        | null;

      if (!response.ok || !payload?.user) {
        throw new Error(payload?.error || "The staff account could not be created.");
      }

      setCreatedStaffAccount({
        ...payload.user,
        temporary_password: payload.temporary_password ?? null
      });
      setStaffCreationForm({
        display_name: "",
        email: "",
        facility_id: isSuperAdmin ? targetFacilityId : (facilityId ?? targetFacilityId),
        password: "",
        role: isSuperAdmin ? "Admin" : "Receptionist"
      });

      await queryClient.invalidateQueries({ queryKey: ["admin", "staff-profiles"] });
      toast({
        title: "Staff account created",
        description:
          payload.user.approval_status === "Approved"
            ? `${payload.user.display_name} can now sign in with ${payload.user.email}.`
            : `${payload.user.display_name} was created and is now waiting for Super Admin approval.`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Staff account not created",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setCreatingStaff(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 px-5 py-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading administrator permissions...
        </CardContent>
      </Card>
    );
  }

  if (!canAccessAdministration) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-950">
            <ShieldCheck className="h-5 w-5" />
            Admin access required
          </CardTitle>
          <CardDescription className="text-amber-900">
            Only Admin and Super Admin users can review staff and assign roles.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-blue-100">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-blue-700" />
              User management
            </CardTitle>
            <CardDescription>
              Staff register with email/password first. Admins can manage only the staff in
              their own facility. Super Admins can manage branch staff across their network.
            </CardDescription>
          </div>
          <Badge variant="outline">{filteredStaff.length} staff shown</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-slate-700">
          New staff members appear here after registration. Assign them to the correct
          facility, choose the right role, and save. Every new account stays pending until
          the Super Admin approves it. Only the Super Admin can create or assign{" "}
          <strong>Admin</strong> and <strong>Super Admin</strong> accounts.
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <UserPlus className="h-4 w-4 text-blue-700" />
                Create staff account
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {isSuperAdmin
                  ? "Create branch Admins and staff directly from this dashboard."
                  : "Create staff accounts inside your own facility without leaving the admin page."}
              </p>
            </div>
            <Badge variant="outline">
              {isSuperAdmin ? "Super Admin branch setup" : "Branch staff onboarding"}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_220px_220px]">
            <div className="space-y-2">
              <Label htmlFor="staff-create-name" className="text-xs">
                Staff name
              </Label>
              <Input
                id="staff-create-name"
                value={staffCreationForm.display_name}
                onChange={(event) => setCreationField("display_name", event.target.value)}
                placeholder="Grace Okafor"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-create-email" className="text-xs">
                Email address
              </Label>
              <Input
                id="staff-create-email"
                type="email"
                value={staffCreationForm.email}
                onChange={(event) => setCreationField("email", event.target.value)}
                placeholder="staff@branch.tapxora.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-create-role" className="text-xs">
                Starting role
              </Label>
              <select
                id="staff-create-role"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                value={staffCreationForm.role}
                onChange={(event) => setCreationField("role", event.target.value as AppRole)}
              >
                {creatableRoles.map((appRole) => (
                  <option key={appRole} value={appRole}>
                    {formatAppRole(appRole)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-create-facility" className="text-xs">
                Facility
              </Label>
              <select
                id="staff-create-facility"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                value={isSuperAdmin ? staffCreationForm.facility_id : (facilityId ?? staffCreationForm.facility_id)}
                onChange={(event) => setCreationField("facility_id", event.target.value)}
                disabled={!isSuperAdmin}
              >
                {visibleFacilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name} ({facility.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label htmlFor="staff-create-password" className="text-xs">
                Temporary password
              </Label>
              <Input
                id="staff-create-password"
                value={staffCreationForm.password}
                onChange={(event) => setCreationField("password", event.target.value)}
                placeholder="Leave blank to auto-generate a secure temporary password"
              />
            </div>
            <div className="flex items-end">
              <Button type="button" className="w-full xl:w-auto" disabled={creatingStaff} onClick={handleCreateStaff}>
                {creatingStaff ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Create staff account
              </Button>
            </div>
          </div>

          {createdStaffAccount ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
              <p className="font-semibold">
                {createdStaffAccount.display_name} was added to {createdStaffAccount.facility_name} (
                {createdStaffAccount.facility_code}) as {formatAppRole(createdStaffAccount.role)}.
              </p>
              <p className="mt-1 text-xs text-emerald-900">
                Approval status: <strong>{formatApprovalStatus(createdStaffAccount.approval_status)}</strong>
              </p>
              <p className="mt-1 text-xs text-emerald-900">
                Login email: <strong>{createdStaffAccount.email}</strong>
              </p>
              {createdStaffAccount.temporary_password ? (
                <p className="mt-2 text-xs text-emerald-900">
                  Temporary password:{" "}
                  <span className="rounded-md bg-white px-2 py-1 font-mono text-[11px] text-slate-950">
                    {createdStaffAccount.temporary_password}
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-xs text-emerald-900">
                  The account used the password you supplied above.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div
          className={
            isSuperAdmin
              ? "grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_220px_220px]"
              : "grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_220px]"
          }
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search staff by name, email, role, or facility"
            />
          </div>
          <select
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            value={approvalFilter}
            onChange={(event) => setApprovalFilter(event.target.value as ApprovalStatus | "all")}
          >
            <option value="all">All approvals</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <select
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as AppRole | "all")}
          >
            <option value="all">All roles</option>
            {appRoles.map((appRole) => (
              <option key={appRole} value={appRole}>
                {formatAppRole(appRole)}
              </option>
            ))}
          </select>
          {isSuperAdmin ? (
            <select
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
              value={facilityFilter}
              onChange={(event) => setFacilityFilter(event.target.value)}
            >
              <option value="all">All facilities</option>
              {visibleFacilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name} ({facility.code})
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {appRoles.map((appRole) => (
            <div key={appRole} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-950">
                {formatAppRole(appRole)}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{roleDescriptions[appRole]}</p>
            </div>
          ))}
        </div>

        {staffQuery.isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
            Loading staff accounts...
          </div>
        ) : null}

        {staffQuery.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(staffQuery.error as Error).message}
          </div>
        ) : null}

        {!staffQuery.isLoading && !staffQuery.isError && filteredStaff.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-5 py-8 text-center text-sm text-slate-600">
            No staff profiles match this search.
          </div>
        ) : null}

        <div className="space-y-3">
          {filteredStaff.map((profile) => {
            const draft = getDraft(profile);
            const isCurrentUser = profile.id === user?.id;
            const isProtectedOwnRole =
              isCurrentUser &&
              (profile.role === "Admin" || profile.role === "SuperAdmin");
            const isBranchAdminLockedProfile =
              !isSuperAdmin &&
              (profile.role === "Admin" || profile.role === "SuperAdmin");
            const isLockedProfile = isProtectedOwnRole || isBranchAdminLockedProfile;
            const roleOptions: AppRole[] = isSuperAdmin
              ? assignableRoles
              : profile.role === "SuperAdmin"
                ? ["SuperAdmin", ...assignableRoles]
                : profile.role === "Admin"
                  ? ["Admin", ...assignableRoles]
                  : assignableRoles;
            const isSaving = saveMutation.isPending;
            const hasChanges =
              draft.display_name !== (profile.display_name ?? "") ||
              draft.facility_id !== (profile.facility_id ?? "") ||
              draft.role !== profile.role;

            return (
              <div
                key={profile.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {profile.display_name || profile.email || "Unnamed staff"}
                      </p>
                      <Badge
                        variant={
                          profile.role === "Admin" || profile.role === "SuperAdmin"
                            ? "default"
                            : "outline"
                        }
                      >
                        {formatAppRole(profile.role)}
                      </Badge>
                      <Badge variant="outline">
                        {formatApprovalStatus(profile.approval_status)}
                      </Badge>
                      {isCurrentUser ? <Badge variant="secondary">You</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {profile.email || "Email will appear after the schema update runs"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Joined {formatDateTime(profile.created_at)}
                    </p>
                    {profile.approval_note ? (
                      <p className="mt-1 text-xs text-amber-700">{profile.approval_note}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-3 lg:min-w-[620px] lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
                    <div className="space-y-2">
                      <Label className="text-xs">Display name</Label>
                      <Input
                        value={draft.display_name}
                        onChange={(event) =>
                          setDraftField(profile, "display_name", event.target.value)
                        }
                        placeholder="Staff full name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Role</Label>
                      <select
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                        value={draft.role}
                        onChange={(event) =>
                          setDraftField(profile, "role", event.target.value as AppRole)
                        }
                        disabled={isLockedProfile}
                      >
                        {roleOptions.map((appRole) => (
                          <option key={appRole} value={appRole}>
                            {formatAppRole(appRole)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Facility</Label>
                      <select
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                        value={draft.facility_id}
                        onChange={(event) =>
                          setDraftField(profile, "facility_id", event.target.value)
                        }
                        disabled={isLockedProfile}
                      >
                        {visibleFacilities.map((facility) => (
                          <option key={facility.id} value={facility.id}>
                            {facility.name} ({facility.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <div className="flex w-full flex-col gap-2">
                        <Button
                          type="button"
                          className="w-full"
                          disabled={!hasChanges || isSaving || isLockedProfile}
                          onClick={() => saveMutation.mutate({ draft, profile })}
                        >
                          {saveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserCog className="h-4 w-4" />
                          )}
                          Save changes
                        </Button>
                        {isSuperAdmin ? (
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={
                                reviewMutation.isPending ||
                                profile.approval_status === "Approved"
                              }
                              onClick={() =>
                                reviewMutation.mutate({
                                  profile,
                                  status: "Approved"
                                })
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={
                                reviewMutation.isPending ||
                                profile.approval_status === "Rejected"
                              }
                              onClick={() =>
                                reviewMutation.mutate({
                                  profile,
                                  status: "Rejected"
                                })
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                {isProtectedOwnRole ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Your own protected role is locked in the UI to avoid accidentally
                    removing your access. Another Super Admin can change it if needed.
                  </p>
                ) : isBranchAdminLockedProfile ? (
                  <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                    Only the Super Admin can change Admin or Super Admin accounts. Branch
                    Admins can manage the rest of the staff in this facility.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
