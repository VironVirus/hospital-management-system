"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  formatAccessDate,
  formatApprovalStatus,
  formatFacilityAccessMode,
  isAccessStateActive
} from "@/lib/access-control";

export default function AccessStatusPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    accessMessage,
    accessSnapshot,
    accessState,
    approvalStatus,
    facilityAccessEndsAt,
    facilityAccessMode,
    facilityName,
    loading,
    session,
    signOut
  } = useAuth();

  useEffect(() => {
    if (!loading && session && isAccessStateActive(accessState)) {
      router.replace("/dashboard");
    }
  }, [accessState, loading, router, session]);

  const fallbackState = searchParams.get("state");
  const currentState = accessState ?? fallbackState ?? "profile_missing";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.12),_transparent_32%),linear-gradient(180deg,_rgba(248,251,255,1),_rgba(239,246,255,1))] px-4 py-10">
      <Card className="w-full max-w-2xl border-blue-100 bg-white/95 shadow-xl shadow-blue-100/60">
        <CardHeader className="space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <CardTitle className="text-2xl text-slate-950">
            {currentState === "active" ? "Access restored" : "Access review required"}
          </CardTitle>
          <CardDescription>
            {loading
              ? "Checking the status of this account and facility..."
              : accessMessage || "This account needs review before it can use the platform."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                Account approval
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {formatApprovalStatus(approvalStatus)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                Facility access
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {formatFacilityAccessMode(facilityAccessMode)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                Facility
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {facilityName || "Not assigned yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                Access window end
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {formatAccessDate(facilityAccessEndsAt)}
              </p>
            </div>
          </div>

          {accessSnapshot?.annual_fee ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              Annual reconnect fee: <strong>N{Number(accessSnapshot.annual_fee).toLocaleString("en-NG")}</strong>
            </div>
          ) : null}

          <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-4 text-sm text-slate-700">
            <p className="font-medium text-slate-950">What happens next</p>
            <p className="mt-2">
              Pending accounts and pending branches must be approved by the Super Admin.
              Expired demo or free-trial branches must be switched to a paid annual plan
              before access is restored.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {session ? (
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await signOut();
                  router.replace("/login");
                }}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            ) : (
              <Button asChild>
                <Link href="/login">Go to login</Link>
              </Button>
            )}

            {session ? (
              <Button asChild variant="outline">
                <Link href="/dashboard">
                  <ShieldCheck className="h-4 w-4" />
                  Retry access
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/register">Create another request</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
