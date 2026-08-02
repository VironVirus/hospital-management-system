"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarRange,
  ClipboardPlus,
  Download,
  FileText,
  Loader2,
  PencilLine,
  Printer,
  ShieldAlert,
  ShieldCheck,
  TestTube2,
  Trash2
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
import {
  initialPatientFormState,
  patientFormSchema,
  sexOptions,
  type PatientFormValues
} from "@/features/patients/schema";
import {
  formatPatientAge,
  formatPatientDate
} from "@/features/patients/patient-utils";
import { PatientClinicalRecord } from "@/features/patients/patient-clinical-record";
import { NigeriaLocationFields } from "@/features/patients/nigeria-location-fields";
import { fetchLabBrandingSettings } from "@/features/admin/lab-branding-settings";
import {
  buildPrintHtml,
  buildReportBranding,
  buildResultRows,
  isReportableOrder,
  type ReportOrderRow
} from "@/features/reports/report-utils";
import { useToast } from "@/hooks/use-toast";
import {
  canAccessPatientsRole,
  canManagePatientsRole
} from "@/lib/guards";
import { commitOnlineMutation, resolveOnlineQuery } from "@/lib/online-core";
import { getAppClient } from "@/lib/app-client";
import { printHtmlDocument } from "@/lib/print";
import type { Tables, TablesUpdate } from "@/types/database";

type PatientRow = Tables<"patients">;

type FormErrors = Partial<Record<keyof PatientFormValues | "form", string>>;

function formatDateTime(value: string | null | undefined) {
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

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildPatientFormState(patient: PatientRow): PatientFormValues {
  return {
    address: patient.address ?? "",
    dob: patient.dob ?? "",
    email: patient.email ?? "",
    emergency_contact: patient.emergency_contact ?? "",
    lab_id: patient.hospital_id ?? patient.lab_id,
    lga: patient.lga ?? "",
    name: patient.name,
    national_id: patient.national_id ?? "",
    ndpr_consent: patient.ndpr_consent,
    notes: patient.notes ?? "",
    phone: patient.phone ?? "",
    sex: (patient.sex ?? "") as PatientFormValues["sex"],
    state: patient.state ?? ""
  };
}

async function fetchPatient(patientId: string) {
  const database = getAppClient();
  return resolveOnlineQuery<PatientRow | null>({
    online: async () => {
      if (!database) {
        throw new Error("Service unavailable.");
      }

      const { data, error } = await database
        .from("patients")
        .select("*")
        .eq("id", patientId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return (data as PatientRow | null) ?? null;
    }
  });
}

async function fetchPatientOrders(patientId: string) {
  const database = getAppClient();
  return resolveOnlineQuery<ReportOrderRow[]>({
    online: async () => {
      if (!database) {
        throw new Error("Service unavailable.");
      }

      const { data, error } = await database
        .from("orders")
        .select(
          "id, facility_id, patient_id, order_number, priority, status, notes, reported_at, ordered_at, ordered_by, created_at, updated_at, facilities(id, name, code), patients(id, hospital_id, lab_id, name, phone, dob, sex, address), order_tests(id, order_id, test_id, sample_code, specimen_label, barcode_value, qr_value, status, collected_at, collected_by, in_progress_at, results_entered_at, verified_at, reported_at, created_at, updated_at, tests(*), order_test_results(*))"
        )
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as ReportOrderRow[];
    }
  });
}

export function PatientHistory({ patientId }: { patientId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { facilityId, loading, role } = useAuth();
  const { toast } = useToast();
  const [formState, setFormState] = useState<PatientFormValues>(initialPatientFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isEditing, setIsEditing] = useState(searchParams.get("mode") === "edit");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testsOpen, setTestsOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState<string | null>(null);

  const canViewPatients = canAccessPatientsRole(role);
  const canManagePatients = canManagePatientsRole(role);

  const patientQuery = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => fetchPatient(patientId),
    enabled: canViewPatients && Boolean(facilityId)
  });

  const ordersQuery = useQuery({
    queryKey: ["patient-orders", patientId],
    queryFn: () => fetchPatientOrders(patientId),
    enabled: canViewPatients && Boolean(facilityId)
  });

  const brandingQuery = useQuery({
    queryKey: ["lab-branding", facilityId],
    queryFn: () => fetchLabBrandingSettings(facilityId as string),
    enabled: canViewPatients && Boolean(facilityId)
  });

  useEffect(() => {
    setIsEditing(searchParams.get("mode") === "edit");
  }, [searchParams]);

  useEffect(() => {
    if (!patientQuery.data) {
      return;
    }

    setFormState(buildPatientFormState(patientQuery.data));
  }, [patientQuery.data]);

  const patient = patientQuery.data;
  const orders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const allResultsDownloadKey = `${patient?.hospital_id ?? patient?.lab_id ?? "patient"}-all-lab-results.pdf`;
  const totalTests = useMemo(
    () => orders.reduce((sum, order) => sum + (order.order_tests?.length ?? 0), 0),
    [orders]
  );
  const reportableOrders = useMemo(() => orders.filter(isReportableOrder), [orders]);
  const branding = useMemo(
    () =>
      buildReportBranding(
        orders[0]?.facilities?.name ?? "St Gianna Specialist Hospital",
        brandingQuery.data
      ),
    [brandingQuery.data, orders]
  );

  const formatTestStatus = (status: string) => status.replaceAll("_", " ");

  const printLabResults = (targetOrders: ReportOrderRow[]) => {
    if (targetOrders.length === 0) {
      toast({ title: "No verified results to print", variant: "error" });
      return;
    }

    printHtmlDocument(buildPrintHtml(targetOrders, branding));
  };

  const downloadLabResults = async (targetOrders: ReportOrderRow[], filename: string) => {
    if (targetOrders.length === 0) {
      toast({ title: "No verified results to download", variant: "error" });
      return;
    }

    try {
      setReportBusy(filename);
      const [{ pdf }, { LaboratoryReportDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/features/reports/report-pdf")
      ]);
      const blob = await pdf(
        <LaboratoryReportDocument branding={branding} orders={targetOrders} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Lab results downloaded", variant: "success" });
    } catch (error) {
      toast({
        title: "Lab results not downloaded",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setReportBusy(null);
    }
  };

  const handleFieldChange = <K extends keyof PatientFormValues>(
    field: K,
    value: PatientFormValues[K]
  ) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!patient || !facilityId) {
      return;
    }

    setErrors({});
    const parsed = patientFormSchema.safeParse(formState);
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      parsed.error.issues.forEach((issue) => {
        const key = (issue.path[0] || "form") as keyof PatientFormValues | "form";
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      });
      setErrors(nextErrors);
      return;
    }

    const updatePayload: TablesUpdate<"patients"> = {
      address: toNullable(parsed.data.address),
      dob: parsed.data.dob || null,
      email: toNullable(parsed.data.email),
      emergency_contact: toNullable(parsed.data.emergency_contact),
      lab_id: parsed.data.lab_id.trim(),
      hospital_id: toNullable(parsed.data.lab_id),
      lga: toNullable(parsed.data.lga),
      name: parsed.data.name.trim(),
      national_id: toNullable(parsed.data.national_id),
      ndpr_consent: parsed.data.ndpr_consent,
      ndpr_consent_at:
        parsed.data.ndpr_consent && !patient.ndpr_consent
          ? new Date().toISOString()
          : patient.ndpr_consent_at,
      notes: toNullable(parsed.data.notes),
      phone: toNullable(parsed.data.phone),
      sex: parsed.data.sex || null,
      state: toNullable(parsed.data.state),
      updated_at: new Date().toISOString()
    };

    try {
      setSaving(true);
      await commitOnlineMutation({
        action: "update",
        entity: "patients",
        payload: updatePayload,
        recordId: patient.id
      });

      toast({
        title: "Patient updated",

        variant: "success"
      });

      setIsEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["patient", patientId] }),
        queryClient.invalidateQueries({ queryKey: ["patients"] }),
        queryClient.invalidateQueries({ queryKey: ["order-patients"] })
      ]);
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unable to update patient.",
        variant: "error"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!patient || !facilityId) {
      return;
    }

    if (orders.length > 0) {
      toast({
        title: "Delete blocked",
        description:
          "This patient already has test history. Keep the record and edit it instead.",
        variant: "error"
      });
      return;
    }

    if (!window.confirm(`Delete patient "${patient.name}" from the hospital register?`)) {
      return;
    }

    try {
      setDeleting(true);
      await commitOnlineMutation({
        action: "delete",
        entity: "patients",
        payload: { id: patient.id },
        recordId: patient.id
      });

      toast({
        title: "Patient deleted",

        variant: "success"
      });

      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      router.push("/patients");
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unable to delete patient.",
        variant: "error"
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading patient profile...
        </CardContent>
      </Card>
    );
  }

  if (!canViewPatients || !facilityId) {
    return (
      <Card className="border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="h-5 w-5" />
            Access unavailable
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (patientQuery.isLoading || ordersQuery.isLoading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading patient profile...
        </CardContent>
      </Card>
    );
  }

  if (patientQuery.isError) {
    return (
      <Card className="border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="text-red-900">Unable to load patient</CardTitle>
          <CardDescription className="text-red-800">Please try again.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (ordersQuery.isError) {
    return (
      <Card className="border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="text-red-900">Unable to load test history</CardTitle>
          <CardDescription className="text-red-800">Please try again.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!patient) {
    return (
      <Card className="border-amber-200 bg-amber-50/80">
        <CardHeader>
          <CardTitle className="text-amber-950">Patient not found</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Button asChild variant="ghost" className="mb-2 px-0 text-blue-700 hover:text-blue-800">
            <Link href="/patients">
              <ArrowLeft className="h-4 w-4" />
              Back to patients
            </Link>
          </Button>
          <h1 className="text-3xl font-semibold text-slate-950">{patient.name}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {patient.hospital_id ?? patient.lab_id} • {formatPatientAge(patient.dob)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link
              href={{
                pathname: "/orders",
                query: { patient: patient.hospital_id ?? patient.lab_id, patientId: patient.id }
              }}
            >
              <ClipboardPlus className="h-4 w-4" />
              Open tests
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={{ pathname: "/billing", query: { patientId: patient.id } }}>
              <FileText className="h-4 w-4" />
              Open bill / print
            </Link>
          </Button>
          {canManagePatients ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditing((current) => !current)}
            >
              <PencilLine className="h-4 w-4" />
              {isEditing ? "Close editor" : "Edit patient"}
            </Button>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr_0.8fr]">
        <Card className="overflow-hidden border-blue-100 bg-[linear-gradient(135deg,rgba(8,47,73,0.98),rgba(14,116,144,0.96),rgba(56,189,248,0.95))] text-white shadow-soft">
          <CardContent className="flex h-full flex-col justify-between gap-6 p-6">
            <div className="space-y-3">
              <Badge className="w-fit border-white/20 bg-white/10 text-white">
                Patient profile
              </Badge>
              <div>
                <p className="text-2xl font-semibold">{patient.name}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.2em] text-blue-50">Estimated age</p>
                <p className="mt-2 text-xl font-semibold">{formatPatientAge(patient.dob)}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.2em] text-blue-50">Tests on file</p>
                <p className="mt-2 text-xl font-semibold">{totalTests}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.2em] text-blue-50">Consent</p>
                <p className="mt-2 text-xl font-semibold">
                  {patient.ndpr_consent ? "Consented" : "Pending"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Date of birth</CardDescription>
            <CardTitle className="text-lg text-slate-950">
              {formatPatientDate(patient.dob)}
            </CardTitle>
            <p className="text-xs text-slate-500">Estimated age: {formatPatientAge(patient.dob)}</p>
          </CardHeader>
        </Card>

        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Profile status</CardDescription>
            <CardTitle className="text-lg text-slate-950">
              {orders.length > 0 ? "Active history" : "New patient"}
            </CardTitle>
            <p className="text-xs text-slate-500">
              Registered {formatDateTime(patient.created_at)}
            </p>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="border-blue-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-blue-700" />
                Patient details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Phone</p>
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {patient.phone || "Not recorded"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Email</p>
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {patient.email || "Not recorded"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Address</p>
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {patient.address || "Not recorded"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Location</p>
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {[patient.lga, patient.state].filter(Boolean).join(", ") || "Not recorded"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Sex</p>
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {patient.sex || "Not recorded"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Emergency contact
                </p>
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {patient.emergency_contact || "Not recorded"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">National ID</p>
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {patient.national_id || "Not recorded"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Consent</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-950">
                  <ShieldCheck className="h-4 w-4 text-blue-700" />
                  {patient.ndpr_consent ? "Consented" : "Not captured"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {patient.ndpr_consent_at
                    ? `Captured ${formatDateTime(patient.ndpr_consent_at)}`
                    : "Consent timestamp unavailable"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube2 className="h-5 w-5 text-blue-700" />
                Clinical signs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                {patient.notes || "No clinical signs were recorded for this patient yet."}
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-100">
            <CardHeader>
              <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setTestsOpen((current) => !current)}>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-blue-700" />Tests</CardTitle>
                <Badge variant="outline">{totalTests} test{totalTests === 1 ? "" : "s"} · {testsOpen ? "Hide" : "Open"}</Badge>
              </button>
            </CardHeader>
            {testsOpen ? <CardContent className="space-y-4">
              {orders.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">All lab results</p>
                    <p className="text-sm text-slate-600">
                      {reportableOrders.length} request{reportableOrders.length === 1 ? "" : "s"} with verified results
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reportableOrders.length === 0}
                      onClick={() => printLabResults(reportableOrders)}
                    >
                      <Printer className="h-4 w-4" />
                      Print all test results
                    </Button>
                    <Button
                      size="sm"
                      disabled={reportableOrders.length === 0 || reportBusy === allResultsDownloadKey}
                      onClick={() =>
                        void downloadLabResults(
                          reportableOrders,
                          allResultsDownloadKey
                        )
                      }
                    >
                      {reportBusy === allResultsDownloadKey ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Download all
                    </Button>
                  </div>
                </div>
              ) : null}

              {orders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-5 py-8 text-center text-sm text-slate-600">
                  No previous tests found for this patient yet.
                </div>
              ) : null}

              {orders.map((order) => {
                const reportRows = buildResultRows(order);
                const reportReady = reportRows.length > 0;
                const downloadKey = `${order.order_number}-lab-results.pdf`;

                return (
                <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">Request {order.order_number}</p>
                        <Badge variant="secondary">{formatTestStatus(order.status)}</Badge>
                        <Badge variant="outline">{order.priority}</Badge>
                      </div>
                      <p className="text-sm text-slate-600">
                        Requested on {formatDateTime(order.created_at)}
                      </p>
                      {order.notes ? (
                        <p className="text-sm text-slate-600">{order.notes}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={{
                            pathname: "/orders",
                            query: {
                              editOrderId: order.id,
                              patient: patient.hospital_id ?? patient.lab_id,
                              patientId: patient.id
                            }
                          }}
                        >
                          Edit tests
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={{ pathname: "/results", query: { orderId: order.id } }}>
                          Edit results
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!reportReady}
                        onClick={() => printLabResults([order])}
                      >
                        <Printer className="h-4 w-4" />
                        Print results
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!reportReady || reportBusy === downloadKey}
                        onClick={() => void downloadLabResults([order], downloadKey)}
                      >
                        {reportBusy === downloadKey ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Download
                      </Button>
                      <Button asChild size="sm">
                        <Link
                          href={{
                            pathname: "/billing",
                            query: { patientId: patient.id, orderId: order.id }
                          }}
                        >
                          Print bill
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-3">
                    {order.order_tests && order.order_tests.length > 0 ? (
                      order.order_tests.map((result) => (
                        <div
                          key={result.id}
                          className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                        >
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-2">
                              <TestTube2 className="h-4 w-4 text-blue-700" />
                              <p className="font-medium text-slate-900">
                                {result.tests?.name || "Unknown test"}
                              </p>
                            </div>
                            <Badge variant="outline">
                              {result.tests?.result_type || "result"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">
                            Lab test no. {order.order_number} · {formatTestStatus(result.status)}
                          </p>
                          {reportRows.find((row) => row.orderTestId === result.id) ? (
                            <div className="mt-2 grid gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm sm:grid-cols-2">
                              <p><span className="text-slate-500">Result:</span> {reportRows.find((row) => row.orderTestId === result.id)?.result}</p>
                              <p><span className="text-slate-500">Reference:</span> {reportRows.find((row) => row.orderTestId === result.id)?.referenceRange}</p>
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button asChild size="sm" variant="ghost">
                              <Link href={{ pathname: "/results", query: { sampleId: result.id } }}>
                                Edit result
                              </Link>
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-600">
                        No samples found.
                      </p>
                    )}
                  </div>
                </div>
                );
              })}
            </CardContent> : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-blue-100">
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full justify-between">
                <Link
                  href={{
                    pathname: "/orders",
                    query: { patient: patient.hospital_id ?? patient.lab_id, patientId: patient.id }
                  }}
                >
                  Start a new test request
                  <ClipboardPlus className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href={{ pathname: "/billing", query: { patientId: patient.id } }}>
                  Open billing and print
                  <FileText className="h-4 w-4" />
                </Link>
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild size="sm" variant="outline"><Link href={{ pathname: "/clinical", query: { patientId: patient.id } }}>Clinical</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href={{ pathname: "/wards", query: { patientId: patient.id } }}>Ward</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href={{ pathname: "/pharmacy", query: { patientId: patient.id } }}>Pharmacy</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href={{ pathname: "/radiology", query: { patientId: patient.id } }}>Radiology</Link></Button>
              </div>
            </CardContent>
          </Card>

          {canManagePatients ? (
            <Card className="border-blue-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PencilLine className="h-5 w-5 text-blue-700" />
                  Admin patient controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isEditing ? (
                  <div className="space-y-3">
                    <Button type="button" className="w-full" onClick={() => setIsEditing(true)}>
                      Edit patient record
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                      disabled={deleting}
                      onClick={() => void handleDelete()}
                    >
                      Delete patient
                      {deleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                    {orders.length > 0 ? (
                      <p className="text-xs text-slate-500">
                        Delete is locked once a patient already has test history.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={(event) => void handleSave(event)}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="patient-lab-id">Hospital ID</Label>
                        <Input
                          id="patient-lab-id"
                          value={formState.lab_id}
                          onChange={(event) => handleFieldChange("lab_id", event.target.value)}
                        />
                        {errors.lab_id ? (
                          <p className="text-xs text-red-700">{errors.lab_id}</p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="patient-name">Full name</Label>
                        <Input
                          id="patient-name"
                          value={formState.name}
                          onChange={(event) => handleFieldChange("name", event.target.value)}
                        />
                        {errors.name ? (
                          <p className="text-xs text-red-700">{errors.name}</p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="patient-phone">Phone number</Label>
                        <Input
                          id="patient-phone"
                          value={formState.phone}
                          onChange={(event) => handleFieldChange("phone", event.target.value)}
                        />
                        {errors.phone ? (
                          <p className="text-xs text-red-700">{errors.phone}</p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="patient-dob">Date of birth</Label>
                        <Input
                          id="patient-dob"
                          type="date"
                          value={formState.dob}
                          onChange={(event) => handleFieldChange("dob", event.target.value)}
                        />
                        {errors.dob ? (
                          <p className="text-xs text-red-700">{errors.dob}</p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="patient-sex">Sex</Label>
                        <select
                          id="patient-sex"
                          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                          value={formState.sex}
                          onChange={(event) =>
                            handleFieldChange(
                              "sex",
                              event.target.value as PatientFormValues["sex"]
                            )
                          }
                        >
                          <option value="">Select sex</option>
                          {sexOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="patient-email">Email</Label>
                        <Input
                          id="patient-email"
                          value={formState.email}
                          onChange={(event) => handleFieldChange("email", event.target.value)}
                        />
                        {errors.email ? (
                          <p className="text-xs text-red-700">{errors.email}</p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="patient-emergency-contact">Emergency contact</Label>
                        <Input
                          id="patient-emergency-contact"
                          value={formState.emergency_contact}
                          onChange={(event) =>
                            handleFieldChange("emergency_contact", event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="patient-national-id">National ID</Label>
                        <Input
                          id="patient-national-id"
                          value={formState.national_id}
                          onChange={(event) =>
                            handleFieldChange("national_id", event.target.value)
                          }
                        />
                      </div>
                      <NigeriaLocationFields
                        idPrefix="patient-edit"
                        state={formState.state}
                        stateError={errors.state}
                        lga={formState.lga}
                        lgaError={errors.lga}
                        onChange={(location) =>
                          setFormState((current) => ({ ...current, ...location }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="patient-address">Address</Label>
                      <Textarea
                        id="patient-address"
                        value={formState.address}
                        onChange={(event) => handleFieldChange("address", event.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="patient-notes">Clinical signs / notes</Label>
                      <Textarea
                        id="patient-notes"
                        value={formState.notes}
                        onChange={(event) => handleFieldChange("notes", event.target.value)}
                        rows={4}
                      />
                    </div>

                    <label className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                        checked={formState.ndpr_consent}
                        onChange={(event) =>
                          handleFieldChange("ndpr_consent", event.target.checked)
                        }
                      />
                      <span>Patient consent confirmed.</span>
                    </label>
                    {errors.ndpr_consent ? (
                      <p className="text-xs text-red-700">{errors.ndpr_consent}</p>
                    ) : null}

                    <div className="flex gap-3">
                      <Button type="submit" disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {saving ? "Saving..." : "Save changes"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setFormState(buildPatientFormState(patient));
                          setErrors({});
                          setIsEditing(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>
      <PatientClinicalRecord
        patient={{
          hospitalId: patient.hospital_id ?? patient.lab_id,
          name: patient.name,
          phone: patient.phone
        }}
        patientId={patient.id}
      />
    </div>
  );
}
