"use client";

import Link from "next/link";
import { Activity, Building2, TestTube2, Users } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FacilityManagementPanel } from "@/features/admin/facility-management";
import { LabBrandingSettingsPanel } from "@/features/admin/lab-branding-settings";
import { PlatformBackupPanel } from "@/features/admin/platform-backup-panel";
import { UserManagementPanel } from "@/features/admin/user-management";
import { canAccessAdministrationRole } from "@/lib/guards";

export default function AdminPage() {
  const { loading, role } = useAuth();
  const canAccessAdministration = canAccessAdministrationRole(role);

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          Loading administration workspace...
        </CardContent>
      </Card>
    );
  }

  if (!canAccessAdministration) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle>Admin access required</CardTitle>
          <CardDescription>
            Only Admin and Super Admin users can access administration settings.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="border-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube2 className="h-5 w-5 text-blue-700" />
              Test catalogue
            </CardTitle>
            <CardDescription>
              Maintain the master list of laboratory tests, pricing, and reference
              ranges.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <p>
              Create, edit, filter, activate, and retire tests from the admin-only
              catalogue screen.
            </p>
            <Button asChild>
              <Link href="/admin/tests">Open test catalogue</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-700" />
              Audit logs
            </CardTitle>
            <CardDescription>
              Review facility-scoped activity across registration, results, stock, and billing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <p>
              Search actions, inspect payloads, and trace who changed what from the dedicated
              audit workspace.
            </p>
            <Button asChild variant="outline">
              <Link href="/admin/audit">Open audit viewer</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-700" />
              Facilities
            </CardTitle>
            <CardDescription>
              Manage your branch record, or create child facilities when using Super Admin
              multi-branch ownership.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <p>
              Keep branch names and codes clean, and create new child facilities from the
              dedicated facility workspace.
            </p>
            <Button asChild variant="outline">
              <Link href="/admin/facilities">Open facility management</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-700" />
              User management
            </CardTitle>
            <CardDescription>
              Assign staff to the correct facility and keep branch access properly scoped.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Review staff accounts below, then assign their facility and role after registration.
          </CardContent>
        </Card>
      </div>

      <FacilityManagementPanel />

      <UserManagementPanel />

      <PlatformBackupPanel />

      <LabBrandingSettingsPanel />
    </div>
  );
}
