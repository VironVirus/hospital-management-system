"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Loader2,
  PencilLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  TestTube2,
  UserPlus
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
import { useToast } from "@/hooks/use-toast";
import {
  canAccessPatientsRole,
  canManagePatientsRole,
  canRegisterPatientsRole
} from "@/lib/guards";
import { commitLocalMutation, generateLocalId, resolveOfflineQuery } from "@/lib/offline-core";
import { cachePatients, searchPatientsLocal } from "@/lib/offline-data";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Database, TablesInsert } from "@/types/supabase";

type SearchPatientRow =
  Database["public"]["Functions"]["search_patients"]["Returns"][number];
type FormErrors = Partial<Record<keyof PatientFormValues | "form", string>>;
type ConsentFilter = "all" | "consented" | "pending";
type HistoryFilter = "all" | "with_orders" | "new";

const PAGE_SIZE = 10;

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function fetchPatients(searchTerm: string, page: number) {
  const supabase = getSupabaseBrowserClient();
  return resolveOfflineQuery({
    cacheKey: `patients:${searchTerm}:${page}`,
    offline: () => searchPatientsLocal(searchTerm, page, PAGE_SIZE),
    online: async () => {
      if (!supabase) {
        return searchPatientsLocal(searchTerm, page, PAGE_SIZE);
      }

      const { data, error } = await supabase.rpc("search_patients", {
        search_term: searchTerm.trim() || null,
        page_number: page,
        page_size: PAGE_SIZE
      });

      if (error) {
        throw new Error(error.message);
      }

      const rows = (data ?? []) as SearchPatientRow[];
      await cachePatients(rows);

      const totalCount = rows[0]?.total_count ?? 0;

      return {
        rows,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
      };
    }
  });
}

export function PatientManagement() {
  const queryClient = useQueryClient();
  const { role, loading, facilityId, profile } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [sexFilter, setSexFilter] = useState<PatientFormValues["sex"] | "all">("all");
  const [consentFilter, setConsentFilter] = useState<ConsentFilter>("all");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [formState, setFormState] = useState<PatientFormValues>(
    initialPatientFormState
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const canViewPatients = canAccessPatientsRole(role);
  const canManagePatients = canManagePatientsRole(role);
  const canRegisterPatients = canRegisterPatientsRole(role);

  const patientsQuery = useQuery({
    queryKey: ["patients", deferredSearchTerm, page],
    queryFn: () => fetchPatients(deferredSearchTerm, page),
    enabled: canViewPatients && Boolean(facilityId)
  });

  useEffect(() => {
    startTransition(() => setPage(1));
  }, [deferredSearchTerm]);

  useEffect(() => {
    if (!submitSuccess) {
      return;
    }

    const timer = window.setTimeout(() => setSubmitSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [submitSuccess]);

  useEffect(() => {
    if (!patientsQuery.isError) {
      return;
    }

    toast({
      title: "Patient search failed",
      description:
        patientsQuery.error instanceof Error
          ? patientsQuery.error.message
          : "Unable to load patients right now.",
      variant: "error"
    });
  }, [patientsQuery.error, patientsQuery.isError, toast]);

  const filteredPatients = useMemo(() => {
    return (patientsQuery.data?.rows ?? []).filter((patient) => {
      if (sexFilter !== "all" && patient.sex !== sexFilter) {
        return false;
      }

      if (consentFilter === "consented" && !patient.ndpr_consent) {
        return false;
      }

      if (consentFilter === "pending" && patient.ndpr_consent) {
        return false;
      }

      if (historyFilter === "with_orders" && patient.order_count === 0) {
        return false;
      }

      if (historyFilter === "new" && patient.order_count > 0) {
        return false;
      }

      return true;
    });
  }, [consentFilter, historyFilter, patientsQuery.data?.rows, sexFilter]);

  const summary = useMemo(() => {
    const rows = patientsQuery.data?.rows ?? [];

    return {
      consented: rows.filter((patient: SearchPatientRow) => patient.ndpr_consent).length,
      totalPatients: filteredPatients.length,
      pagePatients: filteredPatients.length,
      withOrders: rows.filter((patient: SearchPatientRow) => patient.order_count > 0)
        .length
    };
  }, [filteredPatients.length, patientsQuery.data]);

  const suggestedPatients = useMemo(() => {
    if (!searchFocused || !searchTerm.trim()) {
      return [];
    }

    return (patientsQuery.data?.rows ?? [])
      .filter((patient) =>
        [patient.name, patient.lab_id, patient.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(searchTerm.trim().toLowerCase())
      )
      .slice(0, 6);
  }, [patientsQuery.data?.rows, searchFocused, searchTerm]);

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading patient workspace...
        </CardContent>
      </Card>
    );
  }

  if (!canViewPatients) {
    return (
      <Card className="border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="h-5 w-5" />
            Patient access is restricted
          </CardTitle>
          <CardDescription className="text-red-800">
            Your current role does not include patient registration or history access.
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
            Assign a facility to <span className="font-medium">{profile?.display_name || "this user"}</span>
            {" "}in the <code>profiles</code> table before using patient records.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleFieldChange = <K extends keyof PatientFormValues>(
    field: K,
    value: PatientFormValues[K]
  ) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setSubmitError(null);
    setSubmitSuccess(null);

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

    const now = new Date().toISOString();
    const payload: TablesInsert<"patients"> = {
      lab_id: parsed.data.lab_id.trim(),
      name: parsed.data.name.trim(),
      phone: toNullable(parsed.data.phone),
      dob: parsed.data.dob || null,
      sex: parsed.data.sex || null,
      address: toNullable(parsed.data.address),
      email: toNullable(parsed.data.email),
      emergency_contact: toNullable(parsed.data.emergency_contact),
      facility_id: facilityId,
      id: generateLocalId("patient"),
      national_id: toNullable(parsed.data.national_id),
      lga: toNullable(parsed.data.lga),
      state: toNullable(parsed.data.state),
      ndpr_consent: parsed.data.ndpr_consent,
      ndpr_consent_at: parsed.data.ndpr_consent ? now : null,
      notes: toNullable(parsed.data.notes),
      created_at: now,
      updated_at: now
    };

    try {
      setSaving(true);
      await commitLocalMutation({
        action: "insert",
        entity: "patients",
        facilityId,
        payload,
        recordId: payload.id as string
      });

      setFormState(initialPatientFormState);
      setSubmitSuccess("Patient registered successfully.");
      toast({
        title: "Patient registered",
        description: `${parsed.data.name.trim()} has been added to the facility register.`,
        variant: "success"
      });
      startTransition(() => setPage(1));
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to register patient.";
      setSubmitError(message);
      toast({
        title: "Registration failed",
        description: message,
        variant: "error"
      });
    } finally {
      setSaving(false);
    }
  };

  const patients = filteredPatients;
  const totalPages = patientsQuery.data?.totalPages ?? 1;
  const rangeStart = summary.totalPatients === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, summary.totalPatients);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.3fr_repeat(3,minmax(0,0.6fr))]">
        <Card className="overflow-hidden border-blue-100 bg-[linear-gradient(135deg,rgba(10,92,163,0.98),rgba(56,189,248,0.92))] text-white shadow-soft">
          <CardContent className="flex h-full flex-col justify-between gap-6 p-6">
            <div className="space-y-3">
              <Badge className="w-fit border-white/20 bg-white/10 text-white">
                Patient directory
              </Badge>
              <div>
                <h2 className="text-2xl font-semibold">Clean, privacy-safe patient lookup</h2>
                <p className="mt-2 max-w-2xl text-sm text-blue-50">
                  The directory now keeps sensitive details out of the list view, surfaces
                  age clearly, and opens a fuller patient profile only when you need it.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.22em] text-blue-50">Patients</p>
                <p className="mt-2 text-2xl font-semibold">{summary.totalPatients}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.22em] text-blue-50">Test history</p>
                <p className="mt-2 text-2xl font-semibold">{summary.withOrders}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.22em] text-blue-50">NDPR ready</p>
                <p className="mt-2 text-2xl font-semibold">{summary.consented}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Visible on this page</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {summary.pagePatients}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Patients with tests</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {summary.withOrders}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>NDPR consent captured</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {summary.consented}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-blue-100">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileSearch className="h-5 w-5 text-blue-700" />
                  Patient directory
                </CardTitle>
                <CardDescription>
                  Search by patient name, phone number, or lab ID. The list keeps contact
                  details private until a profile is opened.
                </CardDescription>
              </div>
              <Badge variant="outline">Facility scoped</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_170px_170px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  value={searchTerm}
                  onBlur={() => {
                    window.setTimeout(() => setSearchFocused(false), 120);
                  }}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="Start typing a patient name, phone, or lab ID"
                />
                {suggestedPatients.length > 0 ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border border-blue-100 bg-white p-2 shadow-2xl">
                    <p className="px-3 pb-2 pt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                      Suggestions
                    </p>
                    <div className="space-y-1">
                      {suggestedPatients.map((patient) => (
                        <Link
                          key={patient.id}
                          className="flex items-center justify-between rounded-xl px-3 py-3 transition hover:bg-blue-50"
                          href={`/patients/${patient.id}` as Route}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">
                              {patient.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {patient.lab_id} • {formatPatientAge(patient.dob)}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-blue-700" />
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <select
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                value={sexFilter}
                onChange={(event) =>
                  setSexFilter(event.target.value as PatientFormValues["sex"] | "all")
                }
              >
                <option value="all">All sexes</option>
                {sexOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                value={historyFilter}
                onChange={(event) => setHistoryFilter(event.target.value as HistoryFilter)}
              >
                <option value="all">All test history</option>
                <option value="with_orders">With tests</option>
                <option value="new">New patients</option>
              </select>
              <select
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                value={consentFilter}
                onChange={(event) => setConsentFilter(event.target.value as ConsentFilter)}
              >
                <option value="all">All consent</option>
                <option value="consented">Consented</option>
                <option value="pending">Pending consent</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-600">
              <p>
                Showing {rangeStart}-{rangeEnd} of {summary.totalPatients}
              </p>
              <p>Page {page} of {totalPages}</p>
            </div>

            <Separator />

            {patientsQuery.isLoading ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                Loading patients...
              </div>
            ) : null}

            {patientsQuery.isError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {(patientsQuery.error as Error).message}
              </div>
            ) : null}

            {!patientsQuery.isLoading && !patientsQuery.isError && patients.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-5 py-8 text-center text-sm text-slate-600">
                No patients matched this search yet.
              </div>
            ) : null}

            <div className="space-y-3">
              {patients.map((patient: SearchPatientRow) => (
                <div
                  key={patient.id}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{patient.lab_id}</Badge>
                      {patient.sex ? <Badge variant="outline">{patient.sex}</Badge> : null}
                      <Badge variant={patient.ndpr_consent ? "default" : "secondary"}>
                        {patient.ndpr_consent ? "NDPR consented" : "Consent pending"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-4">
                      <div>
                        <p className="text-lg font-semibold text-slate-950">{patient.name}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          Sensitive contact details stay inside the patient profile.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            Estimated age
                          </p>
                          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <CalendarRange className="h-4 w-4 text-blue-700" />
                            {formatPatientAge(patient.dob)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            Test history
                          </p>
                          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <TestTube2 className="h-4 w-4 text-blue-700" />
                            {patient.order_count} recorded
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            Registered
                          </p>
                          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <ShieldCheck className="h-4 w-4 text-blue-700" />
                            {formatPatientDate(patient.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                      <Button asChild>
                        <Link href={`/patients/${patient.id}` as Route}>
                          Open profile
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                      {canManagePatients ? (
                        <Button asChild variant="outline">
                          <Link
                            href={{
                              pathname: `/patients/${patient.id}` as Route,
                              query: { mode: "edit" }
                            }}
                          >
                            <PencilLine className="h-4 w-4" />
                            Edit details
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => startTransition(() => setPage((current) => current - 1))}
                disabled={page <= 1 || patientsQuery.isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => startTransition(() => setPage((current) => current + 1))}
                disabled={page >= totalPages || patientsQuery.isLoading}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-blue-700" />
                  Register patient
                </CardTitle>
                <CardDescription>
                  Capture a new patient into the current facility register.
                </CardDescription>
              </div>
              <Badge variant="outline">
                {canRegisterPatients ? "Reception/Admin" : "View only"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {!canRegisterPatients ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                Your role can search and review patients, but registration is limited to
                reception and admin users.
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lab_id">Lab ID</Label>
                    <Input
                      id="lab_id"
                      value={formState.lab_id}
                      onChange={(event) =>
                        handleFieldChange("lab_id", event.target.value)
                      }
                      placeholder="Optional auto-generated ID"
                    />
                    {errors.lab_id ? (
                      <p className="text-xs text-red-700">{errors.lab_id}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      value={formState.name}
                      onChange={(event) =>
                        handleFieldChange("name", event.target.value)
                      }
                      placeholder="Amina Bello"
                    />
                    {errors.name ? (
                      <p className="text-xs text-red-700">{errors.name}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone number</Label>
                    <Input
                      id="phone"
                      value={formState.phone}
                      onChange={(event) =>
                        handleFieldChange("phone", event.target.value)
                      }
                      placeholder="+234 801 234 5678"
                    />
                    {errors.phone ? (
                      <p className="text-xs text-red-700">{errors.phone}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dob">Date of birth</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={formState.dob}
                      onChange={(event) =>
                        handleFieldChange("dob", event.target.value)
                      }
                    />
                    {errors.dob ? (
                      <p className="text-xs text-red-700">{errors.dob}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sex">Sex</Label>
                    <select
                      id="sex"
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
                    {errors.sex ? (
                      <p className="text-xs text-red-700">{errors.sex}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formState.email}
                      onChange={(event) =>
                        handleFieldChange("email", event.target.value)
                      }
                      placeholder="patient@example.com"
                    />
                    {errors.email ? (
                      <p className="text-xs text-red-700">{errors.email}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emergency_contact">Emergency contact</Label>
                    <Input
                      id="emergency_contact"
                      value={formState.emergency_contact}
                      onChange={(event) =>
                        handleFieldChange("emergency_contact", event.target.value)
                      }
                      placeholder="Next of kin or alternate number"
                    />
                    {errors.emergency_contact ? (
                      <p className="text-xs text-red-700">
                        {errors.emergency_contact}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="national_id">National ID</Label>
                    <Input
                      id="national_id"
                      value={formState.national_id}
                      onChange={(event) =>
                        handleFieldChange("national_id", event.target.value)
                      }
                      placeholder="NIN or hospital identifier"
                    />
                    {errors.national_id ? (
                      <p className="text-xs text-red-700">{errors.national_id}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lga">LGA</Label>
                    <Input
                      id="lga"
                      value={formState.lga}
                      onChange={(event) =>
                        handleFieldChange("lga", event.target.value)
                      }
                      placeholder="Eti-Osa"
                    />
                    {errors.lga ? (
                      <p className="text-xs text-red-700">{errors.lga}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={formState.state}
                      onChange={(event) =>
                        handleFieldChange("state", event.target.value)
                      }
                      placeholder="Lagos"
                    />
                    {errors.state ? (
                      <p className="text-xs text-red-700">{errors.state}</p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={formState.address}
                    onChange={(event) =>
                      handleFieldChange("address", event.target.value)
                    }
                    placeholder="Residential address"
                  />
                  {errors.address ? (
                    <p className="text-xs text-red-700">{errors.address}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Clinical signs / notes</Label>
                  <Textarea
                    id="notes"
                    value={formState.notes}
                    onChange={(event) =>
                      handleFieldChange("notes", event.target.value)
                    }
                    placeholder="Symptoms, clinical signs, or extra context for the lab team"
                  />
                  {errors.notes ? (
                    <p className="text-xs text-red-700">{errors.notes}</p>
                  ) : null}
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
                  <span>
                    I confirm the patient has given consent for their personal health data to
                    be stored and processed under the Nigeria Data Protection Regulation
                    (NDPR).
                  </span>
                </label>
                {errors.ndpr_consent ? (
                  <p className="text-xs text-red-700">{errors.ndpr_consent}</p>
                ) : null}

                {submitError ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {submitError}
                  </p>
                ) : null}

                {submitSuccess ? (
                  <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    {submitSuccess}
                  </p>
                ) : null}

                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? "Registering patient..." : "Register patient"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
