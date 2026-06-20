"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Search,
  ShieldCheck,
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
import { useToast } from "@/hooks/use-toast";
import { appRoles, formatAppRole, type AppRole } from "@/lib/auth-types";
import { isAdminRole } from "@/lib/guards";
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

const roleDescriptions: Record<AppRole, string> = {
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
  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");
  const [drafts, setDrafts] = useState<Record<string, StaffDraft>>({});

  const isAdmin = isAdminRole(role);

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
    enabled: isAdmin
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
          "id, display_name, email, avatar_url, facility_id, role, created_at, updated_at, facilities(id, name, code)"
        )
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as StaffProfile[];
    },
    enabled: isAdmin
  });

  const filteredStaff = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return (staffQuery.data ?? []).filter((profile) => {
      const matchesRole = roleFilter === "all" || profile.role === roleFilter;
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

      return matchesRole && (!normalizedSearch || haystack.includes(normalizedSearch));
    });
  }, [roleFilter, searchTerm, staffQuery.data]);

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

  if (!isAdmin) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-950">
            <ShieldCheck className="h-5 w-5" />
            Admin access required
          </CardTitle>
          <CardDescription className="text-amber-900">
            Only Admin users can review staff and assign roles.
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
              Staff register with email/password first. Admins then assign facility access and
              the correct role here.
            </CardDescription>
          </div>
          <Badge variant="outline">{filteredStaff.length} staff shown</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-slate-700">
          To make a newly registered staff member an Admin, find their row below, change
          Role to <strong>Admin</strong>, then click <strong>Save changes</strong>. If this is
          the very first Admin account, use the SQL shown in the setup notes because the app
          needs at least one existing Admin to open this screen.
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
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
                      <Badge variant={profile.role === "Admin" ? "default" : "outline"}>
                        {formatAppRole(profile.role)}
                      </Badge>
                      {isCurrentUser ? <Badge variant="secondary">You</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {profile.email || "Email will appear after the schema update runs"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Joined {formatDateTime(profile.created_at)}
                    </p>
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
                        disabled={isCurrentUser && profile.role === "Admin"}
                      >
                        {appRoles.map((appRole) => (
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
                      >
                        <option value="">No facility</option>
                        {(facilitiesQuery.data ?? []).map((facility) => (
                          <option key={facility.id} value={facility.id}>
                            {facility.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <Button
                        type="button"
                        className="w-full"
                        disabled={!hasChanges || isSaving}
                        onClick={() => saveMutation.mutate({ draft, profile })}
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserCog className="h-4 w-4" />
                        )}
                        Save changes
                      </Button>
                    </div>
                  </div>
                </div>

                {isCurrentUser && profile.role === "Admin" ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Your own Admin role is locked in the UI to avoid accidentally removing
                    your access. Another Admin can change it if needed.
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
