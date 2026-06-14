"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardPlus,
  FileText,
  FlaskConical,
  Loader2,
  PencilLine,
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
import {
  formatSampleStatus,
  priorityOptions,
  sampleStatuses,
  type SampleStatus
} from "@/features/orders/constants";
import {
  initialOrderFormState,
  orderFormSchema,
  type OrderFormValues
} from "@/features/orders/schema";
import {
  getTestCategoryLabel,
  normalizeTestCategory,
  testCategories,
  type TestCategory
} from "@/features/tests/categories";
import { useToast } from "@/hooks/use-toast";
import { SampleLabelSheet } from "@/features/orders/sample-label-sheet";
import { canAccessOrdersRole, canCreateOrdersRole } from "@/lib/guards";
import {
  addOfflineTestsToOrder,
  createOfflineOrderBundle
} from "@/lib/offline-mutations";
import {
  cacheOrdersWithRelations,
  cachePatients,
  cacheTests,
  getActiveTestsLocal,
  getOrderWithTestsLocal,
  getRecentOrdersLocal,
  searchPatientsLocal
} from "@/lib/offline-data";
import { resolveOfflineQuery } from "@/lib/offline-core";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Database, Tables } from "@/types/supabase";

type PatientSearchRow =
  Database["public"]["Functions"]["search_patients"]["Returns"][number];
type TestRow = Tables<"tests">;
type RecentOrderRow = {
  created_at: string;
  id: string;
  notes: string | null;
  order_number: string;
  patient_id: string;
  patients: {
    id: string;
    lab_id: string;
    name: string;
    phone: string | null;
  } | null;
  priority: string;
  status: SampleStatus;
  order_tests:
    | Array<{
        id: string;
        sample_code: string;
        status: SampleStatus;
        tests: {
          id: string;
          name: string;
        } | null;
      }>
    | null;
};
type FormErrors = Partial<Record<keyof OrderFormValues | "form", string>>;
type RecentOrderFilter = "all" | SampleStatus;
type TestCategoryOption = TestCategory | "Uncategorized";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

async function fetchPatients(searchTerm: string) {
  const supabase = getSupabaseBrowserClient();
  return resolveOfflineQuery<PatientSearchRow[]>({
    cacheKey: `order-patients:${searchTerm}`,
    offline: async () => (await searchPatientsLocal(searchTerm, 1, 12)).rows,
    online: async () => {
      if (!supabase) {
        return (await searchPatientsLocal(searchTerm, 1, 12)).rows;
      }

      const { data, error } = await supabase.rpc("search_patients", {
        search_term: searchTerm.trim() || null,
        page_number: 1,
        page_size: 12
      });

      if (error) {
        throw new Error(error.message);
      }

      const rows = (data ?? []) as PatientSearchRow[];
      await cachePatients(rows);
      return rows;
    }
  });
}

async function fetchActiveTests() {
  const supabase = getSupabaseBrowserClient();
  return resolveOfflineQuery<TestRow[]>({
    cacheKey: "active-tests",
    offline: () => getActiveTestsLocal(),
    online: async () => {
      if (!supabase) {
        return getActiveTestsLocal();
      }

      const { data, error } = await supabase
        .from("tests")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      await cacheTests((data ?? []) as TestRow[]);
      return (data ?? []) as TestRow[];
    }
  });
}

async function fetchRecentOrders() {
  const supabase = getSupabaseBrowserClient();
  return resolveOfflineQuery<RecentOrderRow[]>({
    cacheKey: "recent-orders",
    offline: () => getRecentOrdersLocal(5),
    online: async () => {
      if (!supabase) {
        return getRecentOrdersLocal(5);
      }

      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, priority, notes, created_at, patient_id, facility_id, ordered_at, ordered_by, reported_at, updated_at, patients(id, name, lab_id, phone), order_tests(id, order_id, test_id, sample_code, status, specimen_label, barcode_value, qr_value, created_at, updated_at, collected_at, collected_by, in_progress_at, results_entered_at, verified_at, reported_at, tests(id, name))"
        )
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        throw new Error(error.message);
      }

      await cacheOrdersWithRelations((data ?? []) as Record<string, unknown>[]);
      return (data ?? []) as RecentOrderRow[];
    }
  });
}

async function fetchOrderForEdit(orderId: string) {
  const supabase = getSupabaseBrowserClient();
  return resolveOfflineQuery<RecentOrderRow | null>({
    cacheKey: `order-edit:${orderId}`,
    offline: () => getOrderWithTestsLocal(orderId),
    online: async () => {
      if (!supabase) {
        return getOrderWithTestsLocal(orderId);
      }

      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, priority, notes, created_at, patient_id, facility_id, ordered_at, ordered_by, reported_at, updated_at, patients(id, name, lab_id, phone), order_tests(id, order_id, test_id, sample_code, status, specimen_label, barcode_value, qr_value, created_at, updated_at, collected_at, collected_by, in_progress_at, results_entered_at, verified_at, reported_at, tests(id, name))"
        )
        .eq("id", orderId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (data) {
        await cacheOrdersWithRelations([data as Record<string, unknown>]);
      }

      return (data as RecentOrderRow | null) ?? null;
    }
  });
}

export function OrdersManagement() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { role, loading, facilityId, user } = useAuth();
  const { toast } = useToast();
  const patientIdFromQuery = searchParams.get("patientId");
  const editOrderIdFromQuery = searchParams.get("editOrderId");
  const patientSearchFromQuery = searchParams.get("patient") ?? "";
  const [patientSearch, setPatientSearch] = useState(patientSearchFromQuery);
  const deferredPatientSearch = useDeferredValue(patientSearch);
  const [recentSearch, setRecentSearch] = useState("");
  const deferredRecentSearch = useDeferredValue(recentSearch);
  const [recentStatusFilter, setRecentStatusFilter] =
    useState<RecentOrderFilter>("all");
  const [recentPriorityFilter, setRecentPriorityFilter] =
    useState<(typeof priorityOptions)[number] | "all">("all");
  const [selectedCategory, setSelectedCategory] = useState<TestCategoryOption | "">("");
  const [selectedCatalogueTestId, setSelectedCatalogueTestId] = useState("");
  const [formState, setFormState] = useState<OrderFormValues>(initialOrderFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<{
    orderId: string;
    orderNumber: string;
    patientName: string;
    patientId: string;
    samples: Array<{
      barcode_value: string;
      order_number: string;
      order_test_id: string;
      patient_name: string;
      qr_value: string;
      sample_code: string;
      sample_status: SampleStatus;
      test_name: string;
    }>;
  } | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(
    editOrderIdFromQuery
  );

  const canAccessOrders = canAccessOrdersRole(role);
  const canCreateOrders = canCreateOrdersRole(role);

  const patientsQuery = useQuery({
    queryKey: ["order-patients", deferredPatientSearch],
    queryFn: () => fetchPatients(deferredPatientSearch),
    enabled: canAccessOrders && Boolean(facilityId)
  });

  const testsQuery = useQuery({
    queryKey: ["active-tests"],
    queryFn: fetchActiveTests,
    enabled: canAccessOrders
  });

  const recentOrdersQuery = useQuery({
    queryKey: ["recent-orders"],
    queryFn: fetchRecentOrders,
    enabled: canAccessOrders && Boolean(facilityId)
  });

  const editOrderQuery = useQuery({
    queryKey: ["order-edit", editingOrderId],
    queryFn: () => fetchOrderForEdit(editingOrderId as string),
    enabled: canAccessOrders && Boolean(facilityId) && Boolean(editingOrderId)
  });

  const selectedPatient = useMemo(
    () =>
      (patientsQuery.data ?? []).find((patient) => patient.id === formState.patient_id) ??
      null,
    [formState.patient_id, patientsQuery.data]
  );

  const editingOrder = useMemo(
    () =>
      (recentOrdersQuery.data ?? []).find((order) => order.id === editingOrderId) ??
      editOrderQuery.data ??
      null,
    [editOrderQuery.data, editingOrderId, recentOrdersQuery.data]
  );

  useEffect(() => {
    if (!patientSearchFromQuery) {
      return;
    }

    setPatientSearch(patientSearchFromQuery);
  }, [patientSearchFromQuery]);

  useEffect(() => {
    setEditingOrderId(editOrderIdFromQuery);
  }, [editOrderIdFromQuery]);

  useEffect(() => {
    if (!patientIdFromQuery || !patientsQuery.data?.length) {
      return;
    }

    const patient = patientsQuery.data.find((row) => row.id === patientIdFromQuery);
    if (!patient) {
      return;
    }

    setFormState((current) =>
      current.patient_id === patientIdFromQuery
        ? current
        : {
            ...current,
            patient_id: patientIdFromQuery
          }
    );
  }, [patientIdFromQuery, patientsQuery.data]);

  useEffect(() => {
    if (!editingOrder) {
      return;
    }

    setPatientSearch(editingOrder.patients?.lab_id ?? editingOrder.patients?.name ?? "");
    setFormState((current) => ({
      ...current,
      patient_id: editingOrder.patient_id,
      priority: editingOrder.priority as OrderFormValues["priority"],
      notes: editingOrder.notes ?? "",
      selected_test_ids: (editingOrder.order_tests ?? [])
        .map((sample) => sample.tests?.id)
        .filter((testId): testId is string => Boolean(testId))
    }));
  }, [editingOrder]);

  const filteredRecentOrders = useMemo(() => {
    const needle = deferredRecentSearch.trim().toLowerCase();

    return (recentOrdersQuery.data ?? []).filter((order) => {
      if (recentStatusFilter !== "all" && order.status !== recentStatusFilter) {
        return false;
      }

      if (recentPriorityFilter !== "all" && order.priority !== recentPriorityFilter) {
        return false;
      }

      if (!needle) {
        return true;
      }

      return [
        order.order_number,
        order.patients?.name,
        order.patients?.lab_id,
        order.order_tests?.map((sample) => sample.sample_code).join(" ")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [deferredRecentSearch, recentOrdersQuery.data, recentPriorityFilter, recentStatusFilter]);

  const testsById = useMemo(
    () => new Map((testsQuery.data ?? []).map((test) => [test.id, test])),
    [testsQuery.data]
  );

  const groupedTests = useMemo(() => {
    const groups = new Map<TestCategoryOption, TestRow[]>();

    (testsQuery.data ?? []).forEach((test) => {
      const category = normalizeTestCategory(test.category) ?? "Uncategorized";
      const current = groups.get(category) ?? [];
      current.push(test);
      groups.set(category, current);
    });

    groups.forEach((tests) => tests.sort((left, right) => left.name.localeCompare(right.name)));
    return groups;
  }, [testsQuery.data]);

  const availableCategories = useMemo(() => {
    const orderedCategories = testCategories.filter((category) => groupedTests.has(category));
    return groupedTests.has("Uncategorized")
      ? [...orderedCategories, "Uncategorized" as const]
      : orderedCategories;
  }, [groupedTests]);

  const testsInSelectedCategory = useMemo(
    () => (selectedCategory ? groupedTests.get(selectedCategory) ?? [] : []),
    [groupedTests, selectedCategory]
  );

  const selectedTests = useMemo(
    () =>
      formState.selected_test_ids
        .map((testId) => testsById.get(testId) ?? null)
        .filter((test): test is TestRow => Boolean(test)),
    [formState.selected_test_ids, testsById]
  );

  useEffect(() => {
    if (availableCategories.length === 0) {
      if (selectedCategory) {
        setSelectedCategory("");
      }
      return;
    }

    if (!selectedCategory || !availableCategories.includes(selectedCategory)) {
      setSelectedCategory(availableCategories[0]);
    }
  }, [availableCategories, selectedCategory]);

  useEffect(() => {
    if (testsInSelectedCategory.length === 0) {
      if (selectedCatalogueTestId) {
        setSelectedCatalogueTestId("");
      }
      return;
    }

    if (!testsInSelectedCategory.some((test) => test.id === selectedCatalogueTestId)) {
      setSelectedCatalogueTestId(testsInSelectedCategory[0].id);
    }
  }, [selectedCatalogueTestId, testsInSelectedCategory]);

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading tests workspace...
        </CardContent>
      </Card>
    );
  }

  if (!canAccessOrders) {
    return (
      <Card className="border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="h-5 w-5" />
            Test access is restricted
          </CardTitle>
          <CardDescription className="text-red-800">
            Your current role does not include test entry or specimen tracking.
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
            Assign a facility to this user before creating or viewing tests.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const toggleTestSelection = (testId: string) => {
    setFormState((current) => ({
      ...current,
      selected_test_ids: current.selected_test_ids.includes(testId)
        ? current.selected_test_ids.filter((value) => value !== testId)
        : [...current.selected_test_ids, testId]
    }));
  };

  const handleAddSelectedTest = () => {
    if (!selectedCatalogueTestId) {
      return;
    }

    setFormState((current) => {
      if (current.selected_test_ids.includes(selectedCatalogueTestId)) {
        return current;
      }

      return {
        ...current,
        selected_test_ids: [...current.selected_test_ids, selectedCatalogueTestId]
      };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setSubmitError(null);
    setSubmitSuccess(null);
    setCreatedOrder(null);

    const parsed = orderFormSchema.safeParse(formState);
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      parsed.error.issues.forEach((issue) => {
        const key = (issue.path[0] || "form") as keyof OrderFormValues | "form";
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      });
      setErrors(nextErrors);
      return;
    }

    try {
      setCreating(true);
      const selectedTests = (testsQuery.data ?? []).filter((test) =>
        parsed.data.selected_test_ids.includes(test.id)
      );
      if (selectedTests.length === 0) {
        setSubmitError("No samples were generated for this test request.");
        return;
      }

      const patientName = selectedPatient?.name || "Selected patient";
      if (editingOrder) {
        const created = await addOfflineTestsToOrder({
          facilityId,
          order: {
            id: editingOrder.id,
            order_number: editingOrder.order_number,
            patient_id: editingOrder.patient_id
          },
          patientName,
          tests: selectedTests.map((test) => ({
            id: test.id,
            name: test.name,
            price: test.price
          })),
          userId: user?.id ?? null
        });

        if (created.samples.length === 0) {
          setSubmitError("No new tests were added. Select at least one extra test.");
          return;
        }

        setCreatedOrder({
          orderId: created.orderId,
          orderNumber: created.orderNumber,
          patientName,
          patientId: parsed.data.patient_id,
          samples: created.samples
        });
        setSubmitSuccess(
          `${created.samples.length} extra test${created.samples.length > 1 ? "s" : ""} added to ${created.orderNumber}.`
        );
        toast({
          title: "Test order updated",
          description: `${created.orderNumber} now includes ${created.samples.length} extra test(s).`,
          variant: "success"
        });
        setEditingOrderId(null);
        setFormState(initialOrderFormState);
        setPatientSearch("");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["recent-orders"] }),
          queryClient.invalidateQueries({ queryKey: ["patient-orders"] }),
          queryClient.invalidateQueries({ queryKey: ["billing-invoices"] }),
          queryClient.invalidateQueries({ queryKey: ["patients"] })
        ]);
        return;
      }

      const created = await createOfflineOrderBundle({
        facilityId,
        notes: parsed.data.notes.trim() || null,
        patient: {
          id: parsed.data.patient_id,
          name: patientName
        },
        priority: parsed.data.priority,
        tests: selectedTests.map((test) => ({
          id: test.id,
          name: test.name,
          price: test.price
        })),
        userId: user?.id ?? null
      });
      setCreatedOrder({
        orderId: created.orderId,
        orderNumber: created.orderNumber,
        patientName,
        patientId: parsed.data.patient_id,
        samples: created.samples
      });
      setSubmitSuccess(
        `${created.samples.length} sample label${created.samples.length > 1 ? "s" : ""} generated for ${created.orderNumber}.`
      );
      toast({
        title: "Test request created",
        description: `${created.orderNumber} has been queued with ${created.samples.length} sample label(s).`,
        variant: "success"
      });
      setFormState(initialOrderFormState);
      setPatientSearch("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recent-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["patient-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["billing-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["patients"] })
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create the test request.";
      setSubmitError(message);
      toast({
        title: "Test creation failed",
        description: message,
        variant: "error"
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Available patients</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {patientsQuery.data?.length ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Active tests</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {testsQuery.data?.length ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Recent tests</CardDescription>
            <CardTitle className="text-3xl text-slate-950">
              {recentOrdersQuery.data?.length ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="border-blue-100 print-hidden">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardPlus className="h-5 w-5 text-blue-700" />
                  {editingOrder ? `Edit test order ${editingOrder.order_number}` : "Create lab test"}
                </CardTitle>
                <CardDescription>
                  {editingOrder
                    ? "Add extra tests to this existing order number and update the bill automatically."
                    : "Select a patient, add multiple tests, and generate sample labels in one step."}
                </CardDescription>
              </div>
              <Badge variant="outline">
                {canCreateOrders ? "Reception/Admin" : "View only"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {!canCreateOrders ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                Your role can view tests, but only reception and admin users can create new
                test requests.
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                {editingOrder ? (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                    You are editing order <strong>{editingOrder.order_number}</strong>. New
                    tests added here will keep this same order/sample number.
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-2 text-blue-800"
                      onClick={() => {
                        setEditingOrderId(null);
                        setFormState(initialOrderFormState);
                      }}
                    >
                      Cancel edit
                    </Button>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="patient-search">Find patient</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="patient-search"
                      className="pl-9"
                      value={patientSearch}
                      onChange={(event) => setPatientSearch(event.target.value)}
                      placeholder="Search patient name, phone, or lab ID"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="patient_id">Patient</Label>
                  <select
                    id="patient_id"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    value={formState.patient_id}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        patient_id: event.target.value
                      }))
                    }
                  >
                    <option value="">Select patient</option>
                    {(patientsQuery.data ?? []).map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name} - {patient.lab_id}
                      </option>
                    ))}
                  </select>
                  {errors.patient_id ? (
                    <p className="text-xs text-red-700">{errors.patient_id}</p>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <Label>Tests</Label>
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
                      <div className="space-y-2">
                        <Label htmlFor="test-category-select">Category</Label>
                        <select
                          id="test-category-select"
                          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                          value={selectedCategory}
                          onChange={(event) =>
                            setSelectedCategory(event.target.value as TestCategoryOption | "")
                          }
                        >
                          {availableCategories.length === 0 ? (
                            <option value="">No categories available</option>
                          ) : null}
                          {availableCategories.map((category) => (
                            <option key={category} value={category}>
                              {category} ({groupedTests.get(category)?.length ?? 0})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="test-name-select">Available tests</Label>
                        <select
                          id="test-name-select"
                          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                          value={selectedCatalogueTestId}
                          onChange={(event) => setSelectedCatalogueTestId(event.target.value)}
                        >
                          {testsInSelectedCategory.length === 0 ? (
                            <option value="">No tests in this category</option>
                          ) : null}
                          {testsInSelectedCategory.map((test) => (
                            <option key={test.id} value={test.id}>
                              {test.test_code} - {test.name} -{" "}
                              {getTestCategoryLabel(test.category)} - N
                              {Number(test.price).toLocaleString("en-NG")}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!selectedCatalogueTestId}
                          onClick={handleAddSelectedTest}
                        >
                          Add test
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white bg-white p-3">
                      {selectedTests.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          Add one or more tests to build this request.
                        </p>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                          {selectedTests.map((test) => (
                            <div
                              key={test.id}
                              className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
                            >
                              <div className="min-w-0">
                                <p className="font-medium text-slate-950">
                                  {test.test_code} - {test.name}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {getTestCategoryLabel(test.category)}
                                  {test.unit ? ` • ${test.unit}` : ""}
                                </p>
                                <p className="text-sm text-slate-600">
                                  N{Number(test.price).toLocaleString("en-NG")}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleTestSelection(test.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {errors.selected_test_ids ? (
                    <p className="text-xs text-red-700">{errors.selected_test_ids}</p>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <select
                      id="priority"
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                      value={formState.priority}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          priority: event.target.value as OrderFormValues["priority"]
                        }))
                      }
                    >
                      {priorityOptions.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Selected tests</Label>
                    <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                      {selectedTests.length} selected
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Test notes</Label>
                  <Textarea
                    id="notes"
                    value={formState.notes}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        notes: event.target.value
                      }))
                    }
                    placeholder="Clinical note, payment note, or collection instruction"
                  />
                  {errors.notes ? (
                    <p className="text-xs text-red-700">{errors.notes}</p>
                  ) : null}
                </div>

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

                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {creating
                    ? editingOrder
                      ? "Updating test order..."
                      : "Creating test..."
                    : editingOrder
                      ? "Add selected tests to existing order"
                      : "Create test request and generate labels"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="border-blue-100 print-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-blue-700" />
              Recent tests
            </CardTitle>
            <CardDescription>
              Latest test requests and specimen codes created for this facility.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  value={recentSearch}
                  onChange={(event) => setRecentSearch(event.target.value)}
                  placeholder="Search test request, patient, lab ID, or sample"
                />
              </div>
              <select
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                value={recentStatusFilter}
                onChange={(event) =>
                  setRecentStatusFilter(event.target.value as RecentOrderFilter)
                }
              >
                <option value="all">All statuses</option>
                {sampleStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatSampleStatus(status)}
                  </option>
                ))}
              </select>
              <select
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                value={recentPriorityFilter}
                onChange={(event) =>
                  setRecentPriorityFilter(
                    event.target.value as (typeof priorityOptions)[number] | "all"
                  )
                }
              >
                <option value="all">All priorities</option>
                {priorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </div>

            {recentOrdersQuery.isLoading ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                Loading recent tests...
              </div>
            ) : null}

            {recentOrdersQuery.isError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {(recentOrdersQuery.error as Error).message}
              </div>
            ) : null}

            {!recentOrdersQuery.isLoading &&
            !recentOrdersQuery.isError &&
            (recentOrdersQuery.data ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-5 py-8 text-center text-sm text-slate-600">
                No tests created yet in this facility.
              </div>
            ) : null}

            {filteredRecentOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950">{order.order_number}</p>
                      <Badge variant="secondary">
                        {formatSampleStatus(order.status)}
                      </Badge>
                      <Badge variant="outline">{order.priority}</Badge>
                    </div>
                    <p className="text-sm text-slate-600">
                      {order.patients?.name || "Unknown patient"} •{" "}
                      {order.patients?.lab_id || "No lab ID"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatDateTime(order.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingOrderId(order.id)}
                    >
                      <PencilLine className="h-4 w-4" />
                      Edit tests
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/billing?patientId=${order.patient_id}&orderId=${order.id}`}>
                        <FileText className="h-4 w-4" />
                        Bill
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/results?orderId=${order.id}`}>Results</Link>
                    </Button>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="grid gap-3 md:grid-cols-2">
                  {(order.order_tests ?? []).map((sample) => (
                    <div
                      key={sample.id}
                      className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
                    >
                      <p className="font-medium text-slate-900">
                        {sample.tests?.name || "Unknown test"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{sample.sample_code}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{formatSampleStatus(sample.status)}</Badge>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/results?sampleId=${sample.id}`}>Edit result</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {createdOrder ? (
        <div className="space-y-4">
          <Card className="border-blue-100 print-hidden">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-950">
                  Bill ready for {createdOrder.orderNumber}
                </p>
                <p className="text-sm text-slate-600">
                  The invoice is linked to this test order and can be printed immediately.
                </p>
              </div>
              <Button asChild>
                <Link
                  href={`/billing?patientId=${createdOrder.patientId}&orderId=${createdOrder.orderId}`}
                >
                  <FileText className="h-4 w-4" />
                  Print bill
                </Link>
              </Button>
            </CardContent>
          </Card>
          <SampleLabelSheet
            orderNumber={createdOrder.orderNumber}
            patientName={createdOrder.patientName}
            samples={createdOrder.samples}
          />
        </div>
      ) : null}
    </div>
  );
}
