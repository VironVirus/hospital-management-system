"use client";

import Link from "next/link";
import { Activity, Settings, TestTube2, Users } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LabBrandingSettingsPanel } from "@/features/admin/lab-branding-settings";
import { UserManagementPanel } from "@/features/admin/user-management";
import { canAccessAdministrationRole } from "@/lib/guards";

export default function AdminPage() {
  const { facilityName, loading, role } = useAuth();
  if (loading) return <Card><CardContent className="p-6 text-sm text-slate-600">Loading administration...</CardContent></Card>;
  if (!canAccessAdministrationRole(role)) return <Card><CardHeader><CardTitle>Admin access required</CardTitle><CardDescription>Only the hospital Admin can change staff and system settings.</CardDescription></CardHeader></Card>;

  return <div className="space-y-6">
    <Card className="border-blue-100 bg-gradient-to-br from-blue-700 to-sky-500 text-white"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="rounded-2xl bg-white/15 p-3"><Settings className="h-6 w-6" /></div><div><p className="text-sm text-blue-100">Single-facility administration</p><h2 className="text-2xl font-semibold">{facilityName || "Hospital settings"}</h2><p className="mt-1 text-sm text-blue-50">Manage one hospital, its staff, laboratory catalogue, audit trail, and report identity.</p></div></div></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-blue-700" />Staff & roles</CardTitle><CardDescription>All staff belong automatically to this hospital.</CardDescription></CardHeader><CardContent className="text-sm text-slate-600">Create and manage staff accounts below. There are no branches or facility assignments.</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><TestTube2 className="h-5 w-5 text-blue-700" />Test catalogue</CardTitle><CardDescription>Laboratory tests, pricing, units, and reference ranges.</CardDescription></CardHeader><CardContent><Button asChild><Link href="/admin/tests">Open catalogue</Link></Button></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-700" />Audit trail</CardTitle><CardDescription>Trace important clinical and administrative changes.</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link href="/admin/audit">Open audit logs</Link></Button></CardContent></Card>
    </div>
    <UserManagementPanel />
    <LabBrandingSettingsPanel facilityName={facilityName} />
  </div>;
}
