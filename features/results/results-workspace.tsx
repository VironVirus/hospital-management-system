"use client";

import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Loader2,
  PlayCircle,
  Search,
  ShieldAlert
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
import { Textarea } from "@/components/ui/textarea";
import { DynamicResultInput } from "@/features/results/dynamic-result-input";
import {
  evaluateResult,
  formatExistingResult,
  getResultFlagCode,
  getReferenceRange,
  type ResultFormValues
} from "@/features/results/result-utils";
import { useToast } from "@/hooks/use-toast";
import {
  canEnterResultsRole,
  canVerifyResultsRole
} from "@/lib/guards";
import { resolveOnlineQuery } from "@/lib/online-core";
import {
  recordAuditLog,
  saveResult,
  updateSampleStatus,
  verifyResult
} from "@/lib/online-mutations";
import { getAppClient } from "@/lib/app-client";
import type { Json, Tables } from "@/types/database";

type ResultStatus = Tables<"order_tests">["status"];

type ResultQueueRow = {
  created_at: string;
  id: string;
  order_id: string;
  order_test_results: Tables<"order_test_results"> | null;
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
  } | null;
  sample_code: string;
  specimen_label: string | null;
  status: ResultStatus;
  tests: Tables<"tests"> | null;
  updated_at: string;
};

type AuditLogRow = Tables<"audit_logs">;
type QueueFilter = "all" | "pending_entry" | "pending_verification" | "abnormal";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatStatus(status: ResultStatus) {
  return status.replaceAll("_", " ");
}

async function fetchResultsQueue() {
  const database = getAppClient();
  return resolveOnlineQuery<ResultQueueRow[]>({
    online: async () => {
      if (!database) {
        throw new Error("Service unavailable.");
      }

      const { data, error } = await database
        .from("order_tests")
        .select(
          "id, order_id, test_id, sample_code, specimen_label, status, created_at, updated_at, collected_at, collected_by, in_progress_at, results_entered_at, verified_at, reported_at, tests(*), orders(id, facility_id, patient_id, order_number, priority, ordered_at, ordered_by, status, created_at, updated_at, patients(id, name, lab_id, phone)), order_test_results(*)"
        )
        .in("status", ["Registered", "Collected", "In_Progress", "Results_Entered", "Verified", "Reported"])
        .order("updated_at", { ascending: false })
        .limit(40);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as ResultQueueRow[];
    }
  });
}

async function fetchAuditLogs(resultId: string | null) {
  if (!resultId) {
    return [];
  }

  const database = getAppClient();
  return resolveOnlineQuery<AuditLogRow[]>({
    online: async () => {
      if (!database) {
        throw new Error("Service unavailable.");
      }

      const { data, error } = await database
        .from("audit_logs")
        .select("*")
        .eq("entity_table", "order_test_results")
        .eq("entity_id", resultId)
        .order("created_at", { ascending: false })
        .limit(15);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as AuditLogRow[];
    }
  });
}

export function ResultsWorkspace() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { facilityId, loading, role, user } = useAuth();
  const { toast } = useToast();
  const sampleIdFromQuery = searchParams.get("sampleId");
  const orderIdFromQuery = searchParams.get("orderId");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<ResultFormValues>({
    rawValue: "",
    interpretation: ""
  });
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [markingInProgress, setMarkingInProgress] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const canEnterResults = canEnterResultsRole(role);
  const canVerifyResults = canVerifyResultsRole(role);

  const queueQuery = useQuery({
    queryKey: ["results-queue"],
    queryFn: fetchResultsQueue,
    enabled: Boolean(facilityId)
  });

  const selectedSample = useMemo(
    () =>
      (queueQuery.data ?? []).find((sample) => sample.id === selectedId) ??
      (queueQuery.data ?? [])[0] ??
      null,
    [queueQuery.data, selectedId]
  );

  const auditQuery = useQuery({
    queryKey: ["result-audit", selectedSample?.order_test_results?.id ?? null],
    queryFn: () => fetchAuditLogs(selectedSample?.order_test_results?.id ?? null),
    enabled: Boolean(selectedSample?.order_test_results?.id)
  });

  useEffect(() => {
    const queue = queueQuery.data ?? [];
    if (queue.length === 0) {
      return;
    }

    if (sampleIdFromQuery) {
      const matchedSample = queue.find((sample) => sample.id === sampleIdFromQuery);
      if (matchedSample && matchedSample.id !== selectedId) {
        setSelectedId(matchedSample.id);
      }
      return;
    }

    if (orderIdFromQuery) {
      const matchedOrderSample = queue.find((sample) => sample.order_id === orderIdFromQuery);
      if (matchedOrderSample && matchedOrderSample.id !== selectedId) {
        setSelectedId(matchedOrderSample.id);
      }
      return;
    }

    if (!selectedId) {
      setSelectedId(queue[0]?.id ?? null);
    }
  }, [orderIdFromQuery, queueQuery.data, sampleIdFromQuery, selectedId]);

  useEffect(() => {
    if (!selectedSample) {
      setFormValues({ rawValue: "", interpretation: "" });
      return;
    }

    setFormValues({
      rawValue: formatExistingResult(selectedSample.order_test_results),
      interpretation: selectedSample.order_test_results?.interpretation ?? ""
    });
  }, [selectedSample?.id, selectedSample]);

  const filteredQueue = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    const hasFocusedSelection = Boolean(sampleIdFromQuery || orderIdFromQuery);

    return (queueQuery.data ?? []).filter((sample) => {
      if (!hasFocusedSelection && queueFilter === "all" && sample.status === "Reported") {
        return false;
      }

      if (
        queueFilter === "pending_entry" &&
        !["Registered", "Collected", "In_Progress"].includes(sample.status)
      ) {
        return false;
      }

      if (queueFilter === "pending_verification" && sample.status !== "Results_Entered") {
        return false;
      }

      if (queueFilter === "abnormal" && !sample.order_test_results?.abnormal_flag) {
        return false;
      }

      if (!needle) {
        return true;
      }

      const haystack = [
        sample.sample_code,
        sample.orders?.order_number,
        sample.orders?.patients?.name,
        sample.orders?.patients?.lab_id,
        sample.tests?.name
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [deferredSearch, orderIdFromQuery, queueFilter, queueQuery.data, sampleIdFromQuery]);

  const stats = useMemo(() => {
    const queue = queueQuery.data ?? [];
    return {
      pendingEntry: queue.filter((sample) =>
        ["Registered", "Collected", "In_Progress"].includes(sample.status)
      ).length,
      pendingVerification: queue.filter(
        (sample) => sample.status === "Results_Entered"
      ).length,
      abnormal: queue.filter(
        (sample) => sample.order_test_results?.abnormal_flag
      ).length
    };
  }, [queueQuery.data]);

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading results workspace...
        </CardContent>
      </Card>
    );
  }

  if (!facilityId) {
    return (
      <Card className="border-amber-200 bg-amber-50/80">
        <CardHeader>
          <CardTitle className="text-amber-950">Access unavailable</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (!canEnterResults && !canVerifyResults) {
    return (
      <Card className="border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="h-5 w-5" />
            Results access is restricted
          </CardTitle>
          <CardDescription className="text-red-800">
            Your role does not include result entry or verification.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const activeFacilityId = facilityId as string;
  const selectedTest = selectedSample?.tests ?? null;
  const selectedResult = selectedSample?.order_test_results ?? null;
  const referenceRange = selectedTest
    ? getReferenceRange(selectedTest.reference_range as Json)
    : null;

  const logAction = async (action: string, payload: Json) => {
    if (!selectedSample) {
      return;
    }

    await recordAuditLog({
      action,
      actorId: user?.id ?? null,
      entityId: selectedResult?.id ?? selectedSample.id,
      entityTable: selectedResult ? "order_test_results" : "order_tests",
      facilityId: activeFacilityId,
      payload
    });
  };

  const refreshAfterChange = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["results-queue"] }),
      queryClient.invalidateQueries({
        queryKey: ["result-audit", selectedSample?.order_test_results?.id ?? null]
      }),
      queryClient.invalidateQueries({ queryKey: ["recent-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["sample-reception-queue"] }),
      queryClient.invalidateQueries({ queryKey: ["patient-orders"] })
    ]);
  };

  const handleMarkInProgress = async () => {
    if (!selectedSample) {
      return;
    }

    try {
      setMarkingInProgress(true);
      setActionError(null);
      setActionSuccess(null);
      await updateSampleStatus({
        actorId: user?.id ?? null,
        facilityId: activeFacilityId,
        nextStatus: "In_Progress",
        sample: selectedSample
      });

      await logAction("result_in_progress", {
        sample_code: selectedSample.sample_code
      });
      setActionSuccess("Sample moved to In Progress.");
      toast({
        title: "Sample updated",
        description: `${selectedSample.sample_code} moved to In Progress.`,
        variant: "success"
      });
      await refreshAfterChange();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update sample status.";
      setActionError(message);
      toast({
        title: "Sample update failed",
        description: message,
        variant: "error"
      });
    } finally {
      setMarkingInProgress(false);
    }
  };

  const handleSaveResult = async () => {
    if (!selectedSample || !selectedTest) {
      return;
    }

    const trimmedValue = formValues.rawValue.trim();
    if (!trimmedValue) {
      setActionError("Enter a result value before saving.");
      return;
    }

    try {
      setSaving(true);
      setActionError(null);
      setActionSuccess(null);
      const evaluation = evaluateResult(selectedTest, formValues);
      await saveResult({
        abnormalFlag: evaluation.payload.abnormal_flag ?? false,
        abnormalReason: evaluation.payload.abnormal_reason ?? null,
        actorId: user?.id ?? null,
        displayValue: evaluation.displayValue,
        facilityId: activeFacilityId,
        orderTest: selectedSample,
        payload: evaluation.payload
      });

      setActionSuccess(
        evaluation.payload.abnormal_flag
          ? `Result saved with out-of-range flag: ${evaluation.payload.abnormal_reason}`
          : "Result saved and sent for verification."
      );
      toast({
        title: evaluation.payload.abnormal_flag ? "Out-of-range result saved" : "Result saved",
        description: evaluation.payload.abnormal_flag
          ? evaluation.payload.abnormal_reason ?? "This result was marked for HOD/chief scientist review."
          : `${selectedSample.sample_code} is ready for verification.`,
        variant: evaluation.payload.abnormal_flag ? "info" : "success"
      });
      await refreshAfterChange();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save result.";
      setActionError(message);
      toast({
        title: "Result save failed",
        description: message,
        variant: "error"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    if (!selectedSample?.order_test_results) {
      return;
    }

    try {
      setVerifying(true);
      setActionError(null);
      setActionSuccess(null);
      await verifyResult({
        actorId: user?.id ?? null,
        facilityId: activeFacilityId,
        orderTest: selectedSample,
        result: selectedSample.order_test_results
      });

      setActionSuccess("Result verified successfully.");
      toast({
        title: "Result verified",
        description: `${selectedSample.sample_code} has been approved for reporting.`,
        variant: "success"
      });
      await refreshAfterChange();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to verify result.";
      setActionError(message);
      toast({
        title: "Verification failed",
        description: message,
        variant: "error"
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Pending entry</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{stats.pendingEntry}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Pending verification</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {stats.pendingVerification}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Out of range</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{stats.abnormal}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="border-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-blue-700" />
              Results queue
            </CardTitle>
            <CardDescription>
              Search active samples for technician entry and HOD/chief scientist approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search sample code, order number, patient, or test"
                />
              </div>
              <select
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                value={queueFilter}
                onChange={(event) => setQueueFilter(event.target.value as QueueFilter)}
              >
                <option value="all">All queue states</option>
                <option value="pending_entry">Pending entry</option>
                <option value="pending_verification">Pending verification</option>
                <option value="abnormal">Out of range only</option>
              </select>
            </div>

            {queueQuery.isLoading ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                Loading results queue...
              </div>
            ) : null}

            {queueQuery.isError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {(queueQuery.error as Error).message}
              </div>
            ) : null}

            <div className="space-y-3">
              {filteredQueue.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(sample.id);
                    setActionError(null);
                    setActionSuccess(null);
                  }}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                    sample.id === selectedSample?.id
                      ? "border-blue-200 bg-blue-50/70"
                      : "border-slate-200 bg-white hover:border-blue-100 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{sample.sample_code}</p>
                      <p className="text-sm text-slate-600">
                        {sample.tests?.name || sample.specimen_label || "Unknown test"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {sample.orders?.patients?.name || "Unknown patient"} •{" "}
                        {sample.orders?.order_number || "Unknown order"}
                      </p>
                    </div>
                    <Badge
                      variant={
                        sample.order_test_results?.abnormal_flag ? "secondary" : "outline"
                      }
                    >
                      {formatStatus(sample.status)}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100">
          <CardHeader>
            <CardTitle>Result entry and verification</CardTitle>
            <CardDescription>
              Technician entry, abnormal flagging, and HOD/chief scientist approval for the selected sample.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!selectedSample || !selectedTest ? (
              <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-5 py-8 text-center text-sm text-slate-600">
                Select a sample from the queue to enter or verify results.
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Sample
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {selectedSample.sample_code}
                    </p>
                    <p className="text-sm text-slate-600">
                      {selectedTest.name} {selectedTest.unit ? `• ${selectedTest.unit}` : ""}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Patient
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {selectedSample.orders?.patients?.name || "Unknown patient"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {selectedSample.orders?.patients?.lab_id || "No lab ID"} •{" "}
                      {selectedSample.orders?.order_number || "Unknown order"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{formatStatus(selectedSample.status)}</Badge>
                  <Badge variant="outline">
                    {selectedSample.orders?.priority || "routine"}
                  </Badge>
                  {selectedResult?.abnormal_flag ? (
                    <Badge className="border-transparent bg-red-100 text-red-700" variant="secondary">
                      {getResultFlagCode(selectedResult, selectedTest) ?? "Review"}
                    </Badge>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-sm font-medium text-slate-900">Reference guidance</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {referenceRange?.mode === "numeric"
                      ? `${referenceRange.min ?? "-∞"} to ${referenceRange.max ?? "+∞"}`
                      : referenceRange?.mode === "text"
                        ? referenceRange.text
                        : referenceRange?.mode === "select"
                          ? `Dropdown options: ${referenceRange.options.join(", ")}`
                          : referenceRange?.mode === "boolean"
                            ? `${referenceRange.positive_label} / ${referenceRange.negative_label}`
                            : "No reference guidance configured"}
                  </p>
                </div>

                {selectedResult?.abnormal_flag ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4" />
                      <div>
                        <p className="font-medium">
                          Out-of-range flag {getResultFlagCode(selectedResult, selectedTest) ?? ""}
                        </p>
                        <p>{selectedResult.abnormal_reason || "Review recommended."}</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
                  {["Verified", "Reported"].includes(selectedSample.status) ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                      Updating this result will reopen it for verification before it can be
                      reported again.
                    </div>
                  ) : null}

                  <DynamicResultInput
                    disabled={!canEnterResults}
                    formValues={formValues}
                    onChange={setFormValues}
                    test={selectedTest}
                  />

                  <div className="space-y-2">
                    <Label htmlFor="interpretation">Interpretation / comment</Label>
                    <Textarea
                      id="interpretation"
                      disabled={!canEnterResults}
                      value={formValues.interpretation}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          interpretation: event.target.value
                        }))
                      }
                      placeholder="Optional interpretation, methodology note, or comment"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {canEnterResults &&
                    ["Registered", "Collected"].includes(selectedSample.status) ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleMarkInProgress}
                        disabled={markingInProgress}
                      >
                        {markingInProgress ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                        Mark in progress
                      </Button>
                    ) : null}

                    {canEnterResults ? (
                      <Button
                        type="button"
                        onClick={handleSaveResult}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {["Verified", "Reported"].includes(selectedSample.status)
                          ? "Save revised result"
                          : "Save result"}
                      </Button>
                    ) : null}

                    {canVerifyResults &&
                    selectedSample.status === "Results_Entered" &&
                    selectedResult ? (
                      <Button type="button" variant="outline" onClick={handleVerify} disabled={verifying}>
                        {verifying ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ClipboardCheck className="h-4 w-4" />
                        )}
                        Verify result
                      </Button>
                    ) : null}
                  </div>

                  {actionError ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {actionError}
                    </p>
                  ) : null}

                  {actionSuccess ? (
                    <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                      {actionSuccess}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-sm font-medium text-slate-900">Entered</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDateTime(selectedResult?.entered_at ?? null)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-sm font-medium text-slate-900">Verified</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDateTime(selectedResult?.verified_at ?? null)}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-700" />
                    <p className="text-sm font-medium text-slate-900">Audit trail</p>
                  </div>
                  {(auditQuery.data ?? []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/60 px-4 py-6 text-sm text-slate-600">
                      No audit entries yet for this result.
                    </div>
                  ) : (
                    (auditQuery.data ?? []).map((log) => (
                      <div
                        key={log.id}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">{log.action}</p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(log.created_at)}
                          </p>
                        </div>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-slate-600">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
