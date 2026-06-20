import Link from "next/link";
import { Activity, TestTube2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserManagementPanel } from "@/features/admin/user-management";

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
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
              <Users className="h-5 w-5 text-blue-700" />
              User management
            </CardTitle>
            <CardDescription>
              Role assignment and administrative settings can live here next.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Review staff accounts below, then assign their facility and role after registration.
          </CardContent>
        </Card>
      </div>

      <UserManagementPanel />
    </div>
  );
}
