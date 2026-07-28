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
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  FlaskConical,
  Loader2,
  PencilLine,
  Pill,
  Plus,
  ScanSearch,
  Search,
  ShieldAlert,
  UserPlus,
  X
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { formatPatientAge } from "@/features/patients/patient-utils";
import { NigeriaLocationFields } from "@/features/patients/nigeria-location-fields";
import { useToast } from "@/hooks/use-toast";
import {
  canAccessPatientsRole,
  canManagePatientsRole,
  canRegisterPatientsRole
} from "@/lib/guards";
import { resolveOnlineQuery } from "@/lib/online-core";
import { getAppClient } from "@/lib/app-client";
import type { Database } from "@/types/database";

type SearchPatientRow =
  Database["public"]["Functions"]["search_patients"]["Returns"][number];
type FormErrors = Partial<Record<keyof PatientFormValues | "form", string>>;
type ConsentFilter = "all" | "consented" | "pending";
type HistoryFilter = "all" | "with_orders" | "new";
type RegistrationTestOption = { id: string; name: string; test_code: string; category: string | null; price: number };
type RegistrationMedicationOption = { id: string; generic_name: string; brand_name: string | null; strength: string; route: string | null; unit_price: number; quantity_on_hand: number };
type RegistrationRadiologyOption = { id: string; name: string; modality: string; unit_price: number };
type MedicationRequest = {
  medication_id: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string;
  quantity: string;
  instructions: string;
};

const initialMedicationRequest: MedicationRequest = {
  medication_id: "",
  dose: "",
  frequency: "",
  duration: "",
  route: "",
  quantity: "1",
  instructions: ""
};

const initialRegistrationServices = {
  billRegistration: false,
  registrationFee: "",
  bookConsultation: false,
  consultationFee: "",
  sendToLab: false,
  labTestIds: [] as string[],
  sendToPharmacy: false,
  medicationRequests: [] as MedicationRequest[],
  sendToRadiology: false,
  radiologyServiceId: "",
  radiologyIndication: ""
};

const PAGE_SIZE = 20;

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function fetchPatients(searchTerm: string, page: number) {
  const database = getAppClient();
  return resolveOnlineQuery({
    online: async () => {
      if (!database) {
        throw new Error("Service unavailable.");
      }

      const { data, error } = await database.rpc("search_patients", {
        search_term: searchTerm.trim() || null,
        page_number: page,
        page_size: PAGE_SIZE
      });

      if (error) {
        throw new Error(error.message);
      }

      const rows = (data ?? []) as SearchPatientRow[];

      const totalCount = rows[0]?.total_count ?? 0;

      return {
        rows,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
      };
    }
  });
}

async function fetchRegistrationOptions() {
  const database = getAppClient();
  const [tests, medications, radiology] = await Promise.all([
    database.from("tests").select("id, name, test_code, category, price").eq("is_active", true).order("name", { ascending: true }),
    database.from("medications").select("id, generic_name, brand_name, strength, route, unit_price, quantity_on_hand").eq("is_active", true).order("generic_name", { ascending: true }),
    database.from("radiology_services").select("id, name, modality, unit_price").eq("is_active", true).order("name", { ascending: true })
  ]);
  if (tests.error) throw new Error(tests.error.message);
  if (medications.error) throw new Error(medications.error.message);
  if (radiology.error) throw new Error(radiology.error.message);
  return {
    tests: (tests.data ?? []) as RegistrationTestOption[],
    medications: (medications.data ?? []) as RegistrationMedicationOption[],
    radiology: (radiology.data ?? []) as RegistrationRadiologyOption[]
  };
}

function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value));
}

export function PatientManagement() {
  const queryClient = useQueryClient();
  const { role, loading, facilityId } = useAuth();
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
  const [registrationServices, setRegistrationServices] = useState(initialRegistrationServices);
  const [medicationRequest, setMedicationRequest] = useState<MedicationRequest>(initialMedicationRequest);

  const canViewPatients = canAccessPatientsRole(role);
  const canManagePatients = canManagePatientsRole(role);
  const canRegisterPatients = canRegisterPatientsRole(role);

  const patientsQuery = useQuery({
    queryKey: ["patients", deferredSearchTerm, page],
    queryFn: () => fetchPatients(deferredSearchTerm, page),
    enabled: canViewPatients && Boolean(facilityId)
  });
  const registrationOptionsQuery = useQuery({
    queryKey: ["patient-registration-options", facilityId],
    queryFn: fetchRegistrationOptions,
    enabled: canRegisterPatients && Boolean(facilityId),
    staleTime: 60_000
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
        [patient.name, patient.hospital_id, patient.lab_id, patient.phone]
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
          Loading...
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
        </CardHeader>
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

    if (registrationServices.billRegistration && Number(registrationServices.registrationFee) <= 0) {
      setSubmitError("Enter the registration fee.");
      return;
    }
    if (registrationServices.bookConsultation && Number(registrationServices.consultationFee) <= 0) {
      setSubmitError("Enter the consultation fee.");
      return;
    }
    if (registrationServices.sendToLab && registrationServices.labTestIds.length === 0) {
      setSubmitError("Select at least one laboratory test.");
      return;
    }
    if (registrationServices.sendToPharmacy && registrationServices.medicationRequests.length === 0) {
      setSubmitError("Add at least one medication request.");
      return;
    }
    if (registrationServices.sendToRadiology && !registrationServices.radiologyServiceId) {
      setSubmitError("Select a radiology service.");
      return;
    }

    try {
      setSaving(true);
      const { data, error } = await getAppClient().rpc("register_patient_with_services", {
        patient: {
          ...parsed.data,
          lab_id: parsed.data.lab_id.trim(),
          phone: toNullable(parsed.data.phone),
          dob: parsed.data.dob || null,
          sex: parsed.data.sex || null,
          address: toNullable(parsed.data.address),
          email: toNullable(parsed.data.email),
          emergency_contact: toNullable(parsed.data.emergency_contact),
          national_id: toNullable(parsed.data.national_id),
          lga: toNullable(parsed.data.lga),
          state: toNullable(parsed.data.state),
          notes: toNullable(parsed.data.notes)
        },
        bill_registration: registrationServices.billRegistration,
        registration_fee: Number(registrationServices.registrationFee || 0),
        book_consultation: registrationServices.bookConsultation,
        consultation_fee: Number(registrationServices.consultationFee || 0),
        lab_test_ids: registrationServices.sendToLab ? registrationServices.labTestIds : [],
        medication_requests: registrationServices.sendToPharmacy ? registrationServices.medicationRequests.map((item) => ({ ...item, quantity: Number(item.quantity) })) : [],
        radiology_service_id: registrationServices.sendToRadiology ? registrationServices.radiologyServiceId : null,
        radiology_indication: registrationServices.radiologyIndication.trim() || null
      });
      if (error) throw new Error(error.message);
      const result = data as { hospital_id?: string; order_number?: string; radiology_request_number?: string } | null;

      setFormState(initialPatientFormState);
      setRegistrationServices(initialRegistrationServices);
      setMedicationRequest(initialMedicationRequest);
      setSubmitSuccess(`Patient registered${result?.hospital_id ? ` · ${result.hospital_id}` : ""}.`);
      toast({
        title: `Patient registered${result?.hospital_id ? ` · ${result.hospital_id}` : ""}`,
        description: [result?.order_number ? `Lab ${result.order_number}` : null, result?.radiology_request_number ? `Radiology ${result.radiology_request_number}` : null].filter(Boolean).join(" · ") || undefined,
        variant: "success"
      });
      startTransition(() => setPage(1));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["patients"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["billing-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["hospital", "billing"] }),
        queryClient.invalidateQueries({ queryKey: ["hospital", "pharmacy"] }),
        queryClient.invalidateQueries({ queryKey: ["hospital", "radiology"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts-workspace"] })
      ]);
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

  const addMedicationRequest = () => {
    if (!medicationRequest.medication_id || !medicationRequest.dose.trim() || !medicationRequest.frequency.trim() || !medicationRequest.duration.trim()) {
      setSubmitError("Complete the medication, dose, frequency, and duration.");
      return;
    }
    setRegistrationServices((current) => ({
      ...current,
      medicationRequests: [
        ...current.medicationRequests.filter((item) => item.medication_id !== medicationRequest.medication_id),
        medicationRequest
      ]
    }));
    setMedicationRequest(initialMedicationRequest);
    setSubmitError(null);
  };

  const patients = filteredPatients;
  const totalPages = patientsQuery.data?.totalPages ?? 1;
  const rangeStart = summary.totalPatients === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, summary.totalPatients);

  return (
    <div className="space-y-6">
      <section>
        <Card className="overflow-hidden border-blue-100 bg-[linear-gradient(135deg,rgba(10,92,163,0.98),rgba(56,189,248,0.92))] text-white shadow-soft">
          <CardContent className="grid grid-cols-2 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(120px,0.34fr))] md:items-center">
            <div className="col-span-2 space-y-2 md:col-span-1">
              <Badge className="w-fit border-white/20 bg-white/10 text-white">
                Patient directory
              </Badge>
              <h2 className="text-xl font-semibold">Patient lookup</h2>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-blue-50">Patients</p>
              <p className="mt-1 text-2xl font-semibold">{summary.totalPatients}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-blue-50">With tests</p>
              <p className="mt-1 text-2xl font-semibold">{summary.withOrders}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-blue-50">Consent</p>
              <p className="mt-1 text-2xl font-semibold">{summary.consented}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-blue-700" />
              Patient directory
            </CardTitle>
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
                  placeholder="Name, phone or Hospital ID"
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
                              {patient.hospital_id || patient.lab_id} • {formatPatientAge(patient.dob)}
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

            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {patients.map((patient: SearchPatientRow) => (
                <div
                  key={patient.id}
                  className="grid gap-2 px-3 py-2.5 transition hover:bg-blue-50/50 lg:grid-cols-[minmax(260px,1.5fr)_minmax(220px,0.75fr)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <p className="min-w-0 break-words text-sm font-semibold leading-5 text-slate-950">
                        {patient.name}
                      </p>
                      <Badge variant="secondary" className="w-fit shrink-0">
                        {patient.hospital_id || patient.lab_id}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-xs text-slate-600">
                    <span className="rounded-lg bg-slate-50 px-2 py-1">
                      Age: <strong className="text-slate-900">{formatPatientAge(patient.dob)}</strong>
                    </span>
                    <span className="rounded-lg bg-slate-50 px-2 py-1">
                      Sex: <strong className="text-slate-900">{patient.sex || "-"}</strong>
                    </span>
                    <span className="rounded-lg bg-slate-50 px-2 py-1">
                      Tests: <strong className="text-slate-900">{patient.order_count}</strong>
                    </span>
                    {patient.current_ward ? (
                      <span className="col-span-3 rounded-lg bg-indigo-50 px-2 py-1 text-indigo-800">
                        Ward: <strong>{patient.current_ward}</strong>
                        {patient.admission_date
                          ? ` • Admitted ${new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(patient.admission_date))}`
                          : ""}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 lg:justify-end">
                    <Button asChild size="sm" className="h-8 px-2 text-xs">
                      <Link href={`/patients/${patient.id}` as Route}>
                        Open
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    {canManagePatients ? (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs"
                      >
                        <Link
                          href={{
                            pathname: `/patients/${patient.id}` as Route,
                            query: { mode: "edit" }
                          }}
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                          Edit
                        </Link>
                      </Button>
                    ) : null}
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
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-700" />
              Register patient
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!canRegisterPatients ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">View only</div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lab_id">Hospital ID</Label>
                    <Input
                      id="lab_id"
                      value={formState.lab_id}
                      onChange={(event) =>
                        handleFieldChange("lab_id", event.target.value)
                      }
                      placeholder="Auto-generated"
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
                      placeholder="Emergency contact"
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

                  <NigeriaLocationFields
                    idPrefix="patient-registration"
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
                    placeholder="Notes"
                  />
                  {errors.notes ? (
                    <p className="text-xs text-red-700">{errors.notes}</p>
                  ) : null}
                </div>

                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-950">Billing and services</p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="rounded-xl border border-slate-200 bg-white p-3">
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        <input
                          type="checkbox"
                          checked={registrationServices.billRegistration}
                          onChange={(event) => setRegistrationServices((current) => ({ ...current, billRegistration: event.target.checked }))}
                        />
                        Bill registration
                      </span>
                      {registrationServices.billRegistration ? (
                        <Input
                          className="mt-3"
                          type="number"
                          min="0"
                          step="0.01"
                          value={registrationServices.registrationFee}
                          onChange={(event) => setRegistrationServices((current) => ({ ...current, registrationFee: event.target.value }))}
                          placeholder="Registration fee (₦)"
                          required
                        />
                      ) : null}
                    </label>

                    <label className="rounded-xl border border-slate-200 bg-white p-3">
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        <input
                          type="checkbox"
                          checked={registrationServices.bookConsultation}
                          onChange={(event) => setRegistrationServices((current) => ({ ...current, bookConsultation: event.target.checked }))}
                        />
                        <CalendarPlus className="h-4 w-4 text-blue-700" />
                        Book consultation
                      </span>
                      {registrationServices.bookConsultation ? (
                        <Input
                          className="mt-3"
                          type="number"
                          min="0"
                          step="0.01"
                          value={registrationServices.consultationFee}
                          onChange={(event) => setRegistrationServices((current) => ({ ...current, consultationFee: event.target.value }))}
                          placeholder="Consultation fee (₦)"
                          required
                        />
                      ) : null}
                    </label>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <input
                        type="checkbox"
                        checked={registrationServices.sendToLab}
                        onChange={(event) => setRegistrationServices((current) => ({ ...current, sendToLab: event.target.checked }))}
                      />
                      <FlaskConical className="h-4 w-4 text-blue-700" />
                      Send to laboratory
                    </label>
                    {registrationServices.sendToLab ? (
                      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2">
                        {(registrationOptionsQuery.data?.tests ?? []).map((test) => {
                          const checked = registrationServices.labTestIds.includes(test.id);
                          return (
                            <label key={test.id} className="flex items-start justify-between gap-3 rounded-lg bg-white p-2 text-sm">
                              <span className="flex min-w-0 items-start gap-2">
                                <input
                                  className="mt-1"
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setRegistrationServices((current) => ({
                                    ...current,
                                    labTestIds: checked ? current.labTestIds.filter((id) => id !== test.id) : [...current.labTestIds, test.id]
                                  }))}
                                />
                                <span className="min-w-0">
                                  <span className="block font-medium text-slate-900">{test.name}</span>
                                  <span className="block text-xs text-slate-500">{test.test_code} · {test.category || "Uncategorized"}</span>
                                </span>
                              </span>
                              <span className="shrink-0 text-xs font-semibold text-slate-700">{formatNaira(test.price)}</span>
                            </label>
                          );
                        })}
                        {!registrationOptionsQuery.data?.tests.length ? <p className="p-3 text-sm text-slate-500">No active tests.</p> : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <input
                        type="checkbox"
                        checked={registrationServices.sendToPharmacy}
                        onChange={(event) => setRegistrationServices((current) => ({ ...current, sendToPharmacy: event.target.checked }))}
                      />
                      <Pill className="h-4 w-4 text-emerald-700" />
                      Send to pharmacy
                    </label>
                    {registrationServices.sendToPharmacy ? (
                      <div className="mt-3 space-y-3">
                        <select
                          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                          value={medicationRequest.medication_id}
                          onChange={(event) => {
                            const medication = registrationOptionsQuery.data?.medications.find((item) => item.id === event.target.value);
                            setMedicationRequest((current) => ({ ...current, medication_id: event.target.value, route: medication?.route ?? "" }));
                          }}
                        >
                          <option value="">Select medication</option>
                          {(registrationOptionsQuery.data?.medications ?? []).map((medication) => (
                            <option key={medication.id} value={medication.id}>
                              {medication.generic_name} {medication.strength} · {formatNaira(medication.unit_price)} · {medication.quantity_on_hand} available
                            </option>
                          ))}
                        </select>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input value={medicationRequest.dose} onChange={(event) => setMedicationRequest((current) => ({ ...current, dose: event.target.value }))} placeholder="Dose, e.g. 500 mg" />
                          <Input value={medicationRequest.frequency} onChange={(event) => setMedicationRequest((current) => ({ ...current, frequency: event.target.value }))} placeholder="Frequency, e.g. twice daily" />
                          <Input value={medicationRequest.duration} onChange={(event) => setMedicationRequest((current) => ({ ...current, duration: event.target.value }))} placeholder="Duration, e.g. 5 days" />
                          <Input type="number" min="1" value={medicationRequest.quantity} onChange={(event) => setMedicationRequest((current) => ({ ...current, quantity: event.target.value }))} placeholder="Quantity" />
                          <Input value={medicationRequest.route} onChange={(event) => setMedicationRequest((current) => ({ ...current, route: event.target.value }))} placeholder="Route" />
                          <Input value={medicationRequest.instructions} onChange={(event) => setMedicationRequest((current) => ({ ...current, instructions: event.target.value }))} placeholder="Instructions" />
                        </div>
                        <Button type="button" variant="outline" className="w-full" onClick={addMedicationRequest}>
                          <Plus className="h-4 w-4" />
                          Add medication
                        </Button>
                        <div className="space-y-2">
                          {registrationServices.medicationRequests.map((request) => {
                            const medication = registrationOptionsQuery.data?.medications.find((item) => item.id === request.medication_id);
                            return (
                              <div key={request.medication_id} className="flex items-start justify-between gap-3 rounded-lg bg-emerald-50 p-3 text-sm">
                                <div>
                                  <p className="font-medium text-slate-950">{medication ? `${medication.generic_name} ${medication.strength}` : "Medication"}</p>
                                  <p className="mt-1 text-xs text-slate-600">{request.dose} · {request.frequency} · {request.duration} · Qty {request.quantity}</p>
                                </div>
                                <Button type="button" size="sm" variant="ghost" onClick={() => setRegistrationServices((current) => ({ ...current, medicationRequests: current.medicationRequests.filter((item) => item.medication_id !== request.medication_id) }))}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <input
                        type="checkbox"
                        checked={registrationServices.sendToRadiology}
                        onChange={(event) => setRegistrationServices((current) => ({ ...current, sendToRadiology: event.target.checked }))}
                      />
                      <ScanSearch className="h-4 w-4 text-violet-700" />
                      Send to radiology
                    </label>
                    {registrationServices.sendToRadiology ? (
                      <div className="mt-3 space-y-2">
                        <select
                          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                          value={registrationServices.radiologyServiceId}
                          onChange={(event) => setRegistrationServices((current) => ({ ...current, radiologyServiceId: event.target.value }))}
                        >
                          <option value="">Select radiology service</option>
                          {(registrationOptionsQuery.data?.radiology ?? []).map((service) => (
                            <option key={service.id} value={service.id}>{service.name} · {service.modality} · {formatNaira(service.unit_price)}</option>
                          ))}
                        </select>
                        <Textarea
                          value={registrationServices.radiologyIndication}
                          onChange={(event) => setRegistrationServices((current) => ({ ...current, radiologyIndication: event.target.value }))}
                          placeholder="Reason"
                        />
                      </div>
                    ) : null}
                  </div>

                  {registrationOptionsQuery.isLoading ? (
                    <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading services...</p>
                  ) : null}
                  {registrationOptionsQuery.isError ? (
                    <p className="text-xs text-red-700">Unable to load service catalogues.</p>
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
                  <span>Patient consent confirmed.</span>
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
