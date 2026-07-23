"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { appRoles, formatAppRole, type AppRole } from "@/lib/auth-types";
import { canAccessAdministrationRole } from "@/lib/guards";
import { getAppClient } from "@/lib/app-client";
import type { UserProfile } from "@/lib/auth-types";

type StaffProfile = UserProfile & { is_active?: boolean };
type CreatedStaff = {
  display_name: string;
  email: string;
  role: AppRole;
  temporary_password: string | null;
};

export function UserManagementPanel() {
  const { facilityId, loading, role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = canAccessAdministrationRole(role);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdStaff, setCreatedStaff] = useState<CreatedStaff | null>(null);
  const [createForm, setCreateForm] = useState({ display_name: "", email: "", password: "", role: "Receptionist" as AppRole });
  const [drafts, setDrafts] = useState<Record<string, { display_name: string; role: AppRole }>>({});

  const staffQuery = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: async () => {
      const database = getAppClient();
      const { data, error } = await database.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as StaffProfile[];
    },
    enabled: Boolean(canManage && facilityId)
  });

  const visibleStaff = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (staffQuery.data ?? []).filter((profile) => {
      if (!term) return true;
      return [profile.display_name, profile.email, profile.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [search, staffQuery.data]);

  const createStaff = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setCreating(true);
      setCreatedStaff(null);
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createForm)
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; temporary_password?: string | null; user?: Omit<CreatedStaff, "temporary_password"> } | null;
      if (!response.ok || !payload?.user) throw new Error(payload?.error || "Staff account could not be created.");
      setCreatedStaff({ ...payload.user, temporary_password: payload.temporary_password ?? null });
      setCreateForm({ display_name: "", email: "", password: "", role: "Receptionist" });
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
      toast({ title: "Staff account created", description: "The user can now sign in to this hospital.", variant: "success" });
    } catch (error) {
      toast({ title: "Account not created", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setCreating(false);
    }
  };

  const saveStaff = async (profile: StaffProfile) => {
    const database = getAppClient();
    const draft = drafts[profile.id] ?? { display_name: profile.display_name ?? "", role: profile.role };
    try {
      setSavingId(profile.id);
      const { error } = await database.from("profiles").update({ display_name: draft.display_name.trim() || null, role: draft.role, updated_at: new Date().toISOString() }).eq("id", profile.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
      toast({ title: "Staff updated", description: `${draft.display_name || profile.email || "Staff member"} was saved.`, variant: "success" });
    } catch (error) {
      toast({ title: "Update failed", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setSavingId(null);
    }
  };

  if (loading || staffQuery.isLoading) return <Card><CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading hospital staff...</CardContent></Card>;
  if (!canManage) return null;

  return <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-blue-700" />Create staff account</CardTitle></CardHeader><CardContent className="space-y-4"><form className="space-y-3" onSubmit={createStaff}><div><Label>Full name</Label><Input className="mt-1" value={createForm.display_name} onChange={(event) => setCreateForm((current) => ({ ...current, display_name: event.target.value }))} required /></div><div><Label>Email</Label><Input className="mt-1" type="email" value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} required /></div><div><Label>Role</Label><select className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" value={createForm.role} onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value as AppRole }))}>{appRoles.map((item) => <option key={item} value={item}>{formatAppRole(item)}</option>)}</select></div><div><Label>Temporary password</Label><Input className="mt-1" type="password" value={createForm.password} onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))} placeholder="Leave blank to generate" minLength={12} /></div><Button className="w-full" disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Create account</Button></form>{createdStaff ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><p className="font-semibold">Account ready: {createdStaff.display_name}</p><p className="mt-1">{createdStaff.email} · {formatAppRole(createdStaff.role)}</p>{createdStaff.temporary_password ? <p className="mt-2 rounded-lg bg-white px-3 py-2 font-mono">Temporary password: {createdStaff.temporary_password}</p> : null}</div> : null}</CardContent></Card>
    <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-blue-700" />Hospital staff</CardTitle><CardDescription>{visibleStaff.length} account(s) in the single hospital workspace.</CardDescription></div><Badge variant="outline"><ShieldCheck className="h-3 w-3" />Admin managed</Badge></div></CardHeader><CardContent className="space-y-3"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff" /></div>{visibleStaff.map((profile) => { const draft = drafts[profile.id] ?? { display_name: profile.display_name ?? "", role: profile.role }; return <div key={profile.id} className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[1fr_190px_auto] md:items-end"><div><Label>Name</Label><Input className="mt-1" value={draft.display_name} onChange={(event) => setDrafts((current) => ({ ...current, [profile.id]: { ...draft, display_name: event.target.value } }))} /><p className="mt-1 text-xs text-slate-500">{profile.email || "No email"}{profile.id === user?.id ? " · You" : ""}</p></div><div><Label>Role</Label><select className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" value={draft.role} onChange={(event) => setDrafts((current) => ({ ...current, [profile.id]: { ...draft, role: event.target.value as AppRole } }))}>{appRoles.map((item) => <option key={item} value={item}>{formatAppRole(item)}</option>)}</select></div><Button onClick={() => saveStaff(profile)} disabled={savingId === profile.id}>{savingId === profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save</Button></div>; })}</CardContent></Card>
  </div>;
}
