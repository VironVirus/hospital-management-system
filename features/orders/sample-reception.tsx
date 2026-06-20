"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Keyboard,
  Loader2,
  ScanLine,
  ShieldAlert,
  TestTube2,
  Waypoints
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
import { Separator } from "@/components/ui/separator";
import {
  canTransitionToStatus,
  formatSampleStatus,
  getNextSampleStatus,
  sampleStatuses,
  type SampleStatus
} from "@/features/orders/constants";
import { useFrontDeskMode } from "@/hooks/use-front-desk-mode";
import { useToast } from "@/hooks/use-toast";
import { canAccessSampleReceptionRole } from "@/lib/guards";
import { resolveOnlineQuery } from "@/lib/online-core";
import { updateSampleStatus } from "@/lib/online-mutations";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type SampleLookupRow = {
  barcode_value: string;
  created_at: string;
  id: string;
  order_id: string;
  orders: {
    id: string;
    order_number: string;
    patients: {
      id: string;
      lab_id: string;
      name: string;
      phone: string | null;
    } | null;
    priority: string;
    status: SampleStatus;
  } | null;
  qr_value: string;
  sample_code: string;
  specimen_label: string | null;
  status: SampleStatus;
  tests: {
    id: string;
    name: string;
  } | null;
  updated_at: string;
};
type CustodyLogRow = {
  action: string;
  actor_id: string | null;
  created_at: string;
  from_status: SampleStatus | null;
  id: string;
  notes: string | null;
  to_status: SampleStatus | null;
};
type QueueRow = {
  id: string;
  orders: {
    order_number: string;
    patients: {
      lab_id: string;
      name: string;
    } | null;
  } | null;
  sample_code: string;
  status: SampleStatus;
  tests: {
    name: string;
  } | null;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

async function fetchSampleByCode(code: string) {
  const supabase = getSupabaseBrowserClient();
  return resolveOnlineQuery<SampleLookupRow | null>({
    online: async () => {
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const query = async (column: "sample_code" | "barcode_value") =>
        supabase
          .from("order_tests")
          .select(
            "id, order_id, test_id, sample_code, barcode_value, qr_value, specimen_label, status, created_at, updated_at, collected_at, collected_by, in_progress_at, results_entered_at, verified_at, reported_at, tests(id, name), orders(id, facility_id, patient_id, order_number, priority, status, ordered_at, ordered_by, reported_at, created_at, updated_at, patients(id, name, lab_id, phone))"
          )
          .eq(column, code)
          .maybeSingle();

      let response = await query("sample_code");
      if (!response.data && !response.error) {
        response = await query("barcode_value");
      }

      if (response.error) {
        throw new Error(response.error.message);
      }

      return (response.data as SampleLookupRow | null) ?? null;
    }
  });
}

async function fetchCustodyLogs(orderTestId: string) {
  const supabase = getSupabaseBrowserClient();
  return resolveOnlineQuery<CustodyLogRow[]>({
    online: async () => {
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { data, error } = await supabase
        .from("sample_custody_logs")
        .select("id, order_test_id, action, actor_id, created_at, from_status, to_status, notes")
        .eq("order_test_id", orderTestId)
        .order("created_at", { ascending: false })
        .limit(15);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as CustodyLogRow[];
    }
  });
}

async function fetchReceptionQueue() {
  const supabase = getSupabaseBrowserClient();
  return resolveOnlineQuery<QueueRow[]>({
    online: async () => {
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { data, error } = await supabase
        .from("order_tests")
        .select(
          "id, order_id, test_id, sample_code, status, created_at, updated_at, tests(name), orders(id, order_number, patient_id, patients(name, lab_id))"
        )
        .neq("status", "Reported")
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as QueueRow[];
    }
  });
}

export function SampleReception() {
  const queryClient = useQueryClient();
  const { role, loading, facilityId, user } = useAuth();
  const { toast } = useToast();
  const { frontDeskMode, toggleFrontDeskMode } = useFrontDeskMode();
  const [scanValue, setScanValue] = useState("");
  const [lookupValue, setLookupValue] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<SampleStatus | null>(null);

  const canAccessReception = canAccessSampleReceptionRole(role);

  const sampleQuery = useQuery({
    queryKey: ["sample-lookup", lookupValue],
    queryFn: () => fetchSampleByCode(lookupValue),
    enabled: canAccessReception && Boolean(facilityId) && lookupValue.length > 0
  });

  const logsQuery = useQuery({
    queryKey: ["sample-custody", sampleQuery.data?.id],
    queryFn: () => fetchCustodyLogs(sampleQuery.data!.id),
    enabled: canAccessReception && Boolean(sampleQuery.data?.id)
  });

  const queueQuery = useQuery({
    queryKey: ["sample-reception-queue"],
    queryFn: fetchReceptionQueue,
    enabled: canAccessReception && Boolean(facilityId)
  });

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading sample reception...
        </CardContent>
      </Card>
    );
  }

  if (!canAccessReception) {
    return (
      <Card className="border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="h-5 w-5" />
            Sample reception is restricted
          </CardTitle>
          <CardDescription className="text-red-800">
            Your current role does not include sample scanning or receipt updates.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!facilityId) {
    return (
      <Card className="border-amber-200 bg-amber-50/80">
        <CardHeader>
          <CardTitle className="text-amber-950">Facility assignment required</CardTitle>
          <CardDescription className="text-amber-900">
            Assign a facility to this user before scanning or updating samples.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const activeFacilityId = facilityId as string;
  const handleLookup = () => {
    setStatusError(null);
    setStatusSuccess(null);
    setLookupValue(scanValue.trim());
  };

  const handleStatusUpdate = async (nextStatus: SampleStatus) => {
    if (!sampleQuery.data) {
      return;
    }

    if (!canTransitionToStatus(sampleQuery.data.status, nextStatus)) {
      setStatusError("Status changes must move forward through the workflow.");
      toast({
        title: "Invalid status change",
        description: "Sample workflow updates must move forward only.",
        variant: "error"
      });
      return;
    }

    try {
      setUpdatingStatus(nextStatus);
      setStatusError(null);
      setStatusSuccess(null);
      await updateSampleStatus({
        facilityId: activeFacilityId,
        nextStatus,
        sample: sampleQuery.data,
        actorId: user?.id ?? null
      });

      setStatusSuccess(`Sample moved to ${formatSampleStatus(nextStatus)}.`);
      toast({
        title: "Sample updated",
        description: `${sampleQuery.data.sample_code} moved to ${formatSampleStatus(nextStatus)}.`,
        variant: "success"
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sample-lookup", lookupValue] }),
        queryClient.invalidateQueries({ queryKey: ["sample-custody", sampleQuery.data.id] }),
        queryClient.invalidateQueries({ queryKey: ["sample-reception-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["recent-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["patient-orders"] })
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update sample status.";
      setStatusError(message);
      toast({
        title: "Sample update failed",
        description: message,
        variant: "error"
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const foundSample = sampleQuery.data;
  const nextStatus = foundSample ? getNextSampleStatus(foundSample.status) : null;

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-blue-100">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ScanLine className="h-5 w-5 text-blue-700" />
                  Sample reception
                </CardTitle>
                {!frontDeskMode ? (
                  <CardDescription>
                    Scan or enter a barcode to retrieve a sample and update its workflow
                    status.
                  </CardDescription>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant={frontDeskMode ? "default" : "outline"}
                onClick={toggleFrontDeskMode}
              >
                <Keyboard className="h-4 w-4" />
                {frontDeskMode ? "Front desk mode on" : "Front desk mode"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scanValue">Barcode or sample code</Label>
              <div className="flex gap-3">
                <Input
                  id="scanValue"
                  className={cn(frontDeskMode && "h-11 text-base")}
                  value={scanValue}
                  onChange={(event) => setScanValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleLookup();
                    }
                  }}
                  placeholder="Scan SMP-000123 or barcode value"
                />
                <Button
                  type="button"
                  className={cn(frontDeskMode && "h-11 px-5 text-base")}
                  onClick={handleLookup}
                >
                  Find sample
                </Button>
              </div>
            </div>

            {sampleQuery.isLoading ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                Looking up sample...
              </div>
            ) : null}

            {sampleQuery.isError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {(sampleQuery.error as Error).message}
              </div>
            ) : null}

            {!sampleQuery.isLoading && lookupValue && !foundSample && !sampleQuery.isError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                No sample matched that code in your facility.
              </div>
            ) : null}

            {foundSample ? (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-slate-950">
                    {foundSample.sample_code}
                  </p>
                  <Badge variant="secondary">
                    {formatSampleStatus(foundSample.status)}
                  </Badge>
                  <Badge variant="outline">
                    {foundSample.orders?.order_number || "Unknown order"}
                  </Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Patient
                    </p>
                    <p className="mt-1 font-medium text-slate-950">
                      {foundSample.orders?.patients?.name || "Unknown patient"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {foundSample.orders?.patients?.lab_id || "No lab ID"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Test
                    </p>
                    <p className="mt-1 font-medium text-slate-950">
                      {foundSample.tests?.name || foundSample.specimen_label || "Unknown test"}
                    </p>
                    <p className="text-sm text-slate-600">
                      Priority {foundSample.orders?.priority || "routine"}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Current workflow status
                      </p>
                      <p className="text-lg font-semibold text-blue-700">
                        {formatSampleStatus(foundSample.status)}
                      </p>
                    </div>
                    {nextStatus ? (
                      <Button
                        type="button"
                        onClick={() => handleStatusUpdate(nextStatus)}
                        disabled={updatingStatus !== null}
                      >
                        {updatingStatus === nextStatus ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Move to {formatSampleStatus(nextStatus)}
                      </Button>
                    ) : (
                      <Badge variant="outline">Workflow completed</Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-900">Set status directly</p>
                  <div className="flex flex-wrap gap-2">
                    {sampleStatuses
                      .filter((status) =>
                        canTransitionToStatus(foundSample.status, status)
                      )
                      .map((status) => (
                        <Button
                          key={status}
                          type="button"
                          variant="outline"
                          onClick={() => handleStatusUpdate(status)}
                          disabled={updatingStatus !== null}
                        >
                          {formatSampleStatus(status)}
                        </Button>
                      ))}
                  </div>
                </div>

                {statusError ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {statusError}
                  </p>
                ) : null}

                {statusSuccess ? (
                  <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    {statusSuccess}
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Waypoints className="h-5 w-5 text-blue-700" />
              Chain of custody
            </CardTitle>
            {!frontDeskMode ? (
              <CardDescription>
                Automatic status log for the selected sample, plus the current open queue.
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {foundSample ? (
              <div className="space-y-3">
                {(logsQuery.data ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/60 px-4 py-6 text-sm text-slate-600">
                    No custody events recorded yet.
                  </div>
                ) : (
                  (logsQuery.data ?? []).map((log: CustodyLogRow) => (
                    <div
                      key={log.id}
                      className={cn(
                        "rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm",
                        frontDeskMode && "px-3 py-2.5"
                      )}
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-slate-950">{log.action}</p>
                          <p className="text-sm text-slate-600">
                            {log.from_status ? formatSampleStatus(log.from_status) : "New"}{" "}
                            to{" "}
                            {log.to_status ? formatSampleStatus(log.to_status) : "Unknown"}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(log.created_at)}
                        </p>
                      </div>
                      {log.notes ? (
                        <p className="mt-2 text-sm text-slate-600">{log.notes}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {foundSample ? <Separator /> : null}

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-900">Open sample queue</p>
              {queueQuery.isLoading ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                  Loading sample queue...
                </div>
              ) : null}

              {queueQuery.isError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {(queueQuery.error as Error).message}
                </div>
              ) : null}

              {(queueQuery.data ?? []).map((queueItem: QueueRow) => (
                <button
                  key={queueItem.id}
                  type="button"
                  onClick={() => {
                    setScanValue(queueItem.sample_code);
                    setLookupValue(queueItem.sample_code);
                  }}
                  className={cn(
                    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/50",
                    frontDeskMode && "px-3 py-3"
                  )}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <TestTube2 className="mt-0.5 h-4 w-4 text-blue-700" />
                      <div>
                        <p className="font-medium text-slate-950">
                          {queueItem.tests?.name || "Unknown test"}
                        </p>
                        <p className="text-sm text-slate-600">
                          {queueItem.sample_code} • {queueItem.orders?.patients?.name || "Unknown patient"}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">
                      {formatSampleStatus(queueItem.status)}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
