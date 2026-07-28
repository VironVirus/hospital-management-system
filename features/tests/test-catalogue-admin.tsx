"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, ShieldAlert, TestTube2, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { canAccessAdministrationRole } from "@/lib/guards";
import { commitOnlineMutation, generateId, resolveOnlineQuery } from "@/lib/online-core";
import { getAppClient } from "@/lib/app-client";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";
import {
  resultTypes,
  testFormSchema,
  type TestFormValues
} from "@/features/tests/schema";
import {
  getTestCategoryLabel,
  normalizeTestCategory,
  testCategories,
  type TestCategory
} from "@/features/tests/categories";
import {
  formatReferenceRange,
  isStoredReferenceRange,
  type SimpleReferenceRange,
  type StoredReferenceRange
} from "@/features/tests/reference-range";
import { useToast } from "@/hooks/use-toast";

type TestRow = Tables<"tests">;
type FacilityOption = Pick<Tables<"facilities">, "id" | "name" | "code">;
type CatalogueTestRow = TestRow & {
  facilities: FacilityOption | null;
};
type FilterStatus = "all" | "active" | "inactive";
type FilterResultType = "all" | TestRow["result_type"];
type FilterCategory = "all" | "uncategorized" | TestCategory;
type FormErrors = Partial<Record<string, string>>;

const initialFormState: TestFormValues = {
  test_code: "",
  name: "",
  category: null,
  price: 0,
  result_type: "numeric",
  unit: null,
  is_active: true,
  reference_range: {
    mode: "numeric",
    min: null,
    max: null,
    text: null,
    options: null,
    positive_label: null,
    negative_label: null
  }
};

function createPanelParameter(index: number) {
  return {
    id: `param-${Date.now()}-${index}`,
    name: "",
    result_type: "numeric" as const,
    unit: null,
    reference_range: createNumericRange()
  };
}

function createPanelRange(count = 1): StoredReferenceRange {
  return {
    mode: "panel",
    min: null,
    max: null,
    text: null,
    options: null,
    positive_label: null,
    negative_label: null,
    parameters: Array.from({ length: Math.max(1, count) }, (_, index) =>
      createPanelParameter(index)
    )
  };
}

function getTestCodePrefix(category: TestFormValues["category"]) {
  const normalized = normalizeTestCategory(category);
  if (normalized === "Haematology") {
    return "HE";
  }

  const letters = (normalized ?? "Test")
    .replace(/[^a-z]/gi, "")
    .toUpperCase();

  return (letters.slice(0, 2) || "TE").padEnd(2, "X");
}

function buildLocalTestCode(category: TestFormValues["category"], existingTests: TestRow[]) {
  const prefix = getTestCodePrefix(category);
  const nextSerial =
    existingTests
      .map((test) => test.test_code ?? "")
      .filter((code) => code.startsWith(prefix))
      .map((code) => Number(code.slice(prefix.length)))
      .filter(Number.isFinite)
      .reduce((max, value) => Math.max(max, value), 0) + 1;

  if (nextSerial <= 99999) {
    return `${prefix}${nextSerial.toString().padStart(5, "0")}`;
  }

  return `${prefix}${Date.now().toString().slice(-5)}`;
}

function resolveTestCode(
  enteredCode: string | undefined,
  category: TestFormValues["category"],
  currentTest: TestRow | null,
  existingTests: TestRow[]
) {
  const normalizedEnteredCode = enteredCode?.trim().toUpperCase() ?? "";
  const expectedPrefix = getTestCodePrefix(category);
  const isOldGenericCode = /^T\d{5}$/.test(normalizedEnteredCode);
  const isUntouchedMismatchedCode =
    currentTest?.test_code === normalizedEnteredCode &&
    !normalizedEnteredCode.startsWith(expectedPrefix);
  const hasWrongPrefix =
    Boolean(normalizedEnteredCode) && !normalizedEnteredCode.startsWith(expectedPrefix);

  if (
    !normalizedEnteredCode ||
    isOldGenericCode ||
    isUntouchedMismatchedCode ||
    hasWrongPrefix
  ) {
    return buildLocalTestCode(category, existingTests);
  }

  return normalizedEnteredCode;
}

function createNumericRange(
  min: number | null = null,
  max: number | null = null
): SimpleReferenceRange {
  return {
    mode: "numeric",
    min,
    max,
    text: null,
    options: null,
    positive_label: null,
    negative_label: null
  };
}

function createTextRange(text = ""): SimpleReferenceRange {
  return {
    mode: "text",
    min: null,
    max: null,
    text,
    options: null,
    positive_label: null,
    negative_label: null
  };
}

function createSelectRange(
  options: string[] = ["Positive", "Negative"],
  text: string | null = null
): SimpleReferenceRange {
  return {
    mode: "select",
    min: null,
    max: null,
    text,
    options,
    positive_label: null,
    negative_label: null
  };
}

function createBooleanRange(
  positiveLabel = "Positive",
  negativeLabel = "Negative",
  text: string | null = null
): SimpleReferenceRange {
  return {
    mode: "boolean",
    min: null,
    max: null,
    text,
    options: null,
    positive_label: positiveLabel,
    negative_label: negativeLabel
  };
}

async function fetchTests({
  query,
  category,
  status,
  resultType,
  facilityId
}: {
  query: string;
  category: FilterCategory;
  status: FilterStatus;
  resultType: FilterResultType;
  facilityId: string;
}) {
  const database = getAppClient();
  return resolveOnlineQuery<CatalogueTestRow[]>({
    online: async () => {
      if (!database) {
        throw new Error("Service unavailable.");
      }

      let request = database
        .from("tests")
        .select("*, facilities(id, name, code)")
        .eq("facility_id", facilityId)
        .order("name", { ascending: true });

      if (query.trim()) {
        const searchTerm = query.trim().replaceAll(",", " ");
        request = request.or(`name.ilike.%${searchTerm}%,test_code.ilike.%${searchTerm}%`);
      }

      if (status === "active") {
        request = request.eq("is_active", true);
      }

      if (status === "inactive") {
        request = request.eq("is_active", false);
      }

      if (resultType !== "all") {
        request = request.eq("result_type", resultType);
      }

      const { data, error } = await request;
      if (error) {
        throw new Error(error.message);
      }

      const rows = (data ?? []) as CatalogueTestRow[];
      return rows
        .filter((row) => {
          if (category === "all") {
            return true;
          }

          const normalizedCategory = normalizeTestCategory(row.category);
          if (category === "uncategorized") {
            return normalizedCategory === null;
          }

          return normalizedCategory === category;
        })
        .sort((left, right) => left.name.localeCompare(right.name));
    }
  });
}

export function TestCatalogueAdmin() {
  const { role, loading, facilityId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FilterStatus>("all");
  const [resultType, setResultType] = useState<FilterResultType>("all");
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>("all");
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [formState, setFormState] = useState<TestFormValues>(initialFormState);
  const [targetFacilityId, setTargetFacilityId] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canAccessAdministration = canAccessAdministrationRole(role);

  const facilitiesQuery = useQuery({
    queryKey: ["admin", "facilities", "catalogue-visible"],
    queryFn: async () => {
      const database = getAppClient();
      if (!database) {
        throw new Error("Service unavailable.");
      }

      const { data, error } = await database
        .from("facilities")
        .select("id, name, code")
        .order("name", { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as FacilityOption[];
    },
    enabled: canAccessAdministration
  });

  const testsQuery = useQuery({
    queryKey: ["tests", facilityId, query, status, resultType],
    queryFn: () =>
      fetchTests({
        category: "all",
        query,
        resultType,
        status,
        facilityId: facilityId as string
      }),
    enabled: canAccessAdministration && Boolean(facilityId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  });

  const totals = useMemo(() => {
    const tests = testsQuery.data ?? [];
    return {
      total: tests.length,
      active: tests.filter((test) => test.is_active).length,
      inactive: tests.filter((test) => !test.is_active).length
    };
  }, [testsQuery.data]);

  const visibleFacilities = useMemo(
    () => facilitiesQuery.data ?? [],
    [facilitiesQuery.data]
  );

  useEffect(() => {
    if (!submitSuccess) {
      return;
    }

    const timer = window.setTimeout(() => setSubmitSuccess(null), 2500);
    return () => window.clearTimeout(timer);
  }, [submitSuccess]);

  useEffect(() => {
    const defaultFacilityId = facilityId ?? visibleFacilities[0]?.id ?? "";
    if (!defaultFacilityId) {
      return;
    }

    setTargetFacilityId((current) => current || defaultFacilityId);
  }, [facilityId, visibleFacilities]);

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

  if (!canAccessAdministration) {
    return (
      <Card className="border-red-100 bg-red-50/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="h-5 w-5" />
            Access unavailable
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const setField = <K extends keyof TestFormValues>(
    field: K,
    value: TestFormValues[K]
  ) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const setReferenceRange = (
    updater: (current: TestFormValues["reference_range"]) => TestFormValues["reference_range"]
  ) => {
    setFormState((current) => ({
      ...current,
      reference_range: updater(current.reference_range)
    }));
  };

  const updatePanelParameter = (
    parameterId: string,
    updater: (
      parameter: Extract<StoredReferenceRange, { mode: "panel" }>["parameters"][number]
    ) => Extract<StoredReferenceRange, { mode: "panel" }>["parameters"][number]
  ) => {
    setReferenceRange((current) =>
      current.mode === "panel"
        ? {
            ...current,
            parameters: current.parameters.map((parameter) =>
              parameter.id === parameterId ? updater(parameter) : parameter
            )
          }
        : current
    );
  };

  const addPanelParameter = () => {
    setReferenceRange((current) =>
      current.mode === "panel"
        ? {
            ...current,
            parameters: [
              ...current.parameters,
              createPanelParameter(current.parameters.length)
            ]
          }
        : current
    );
  };

  const removePanelParameter = (parameterId: string) => {
    setReferenceRange((current) =>
      current.mode === "panel"
        ? {
            ...current,
            parameters:
              current.parameters.length > 1
                ? current.parameters.filter((parameter) => parameter.id !== parameterId)
                : current.parameters
          }
        : current
    );
  };

  const resetForm = () => {
    setEditingId(null);
    setFormState(initialFormState);
    setTargetFacilityId(facilityId ?? visibleFacilities[0]?.id ?? "");
    setErrors({});
    setSubmitError(null);
  };

  const loadForEdit = (test: CatalogueTestRow) => {
    setEditingId(test.id);
    setErrors({});
    setSubmitError(null);
    setSubmitSuccess(null);
    setTargetFacilityId(test.facility_id ?? facilityId ?? visibleFacilities[0]?.id ?? "");
    setFormState({
      id: test.id,
      test_code: test.test_code,
      name: test.name,
      category: normalizeTestCategory(test.category),
      price: test.price,
      result_type: test.result_type as TestFormValues["result_type"],
      unit: test.unit,
      is_active: test.is_active,
      reference_range:
        isStoredReferenceRange(test.reference_range)
          ? test.reference_range.mode === "numeric"
            ? createNumericRange(
                test.reference_range.min,
                test.reference_range.max
              )
            : test.reference_range.mode === "panel"
              ? test.reference_range
              : test.reference_range.mode === "text"
              ? createTextRange(test.reference_range.text)
              : test.reference_range.mode === "select"
                ? createSelectRange(
                    test.reference_range.options,
                    test.reference_range.text
                  )
                : createBooleanRange(
                    test.reference_range.positive_label,
                    test.reference_range.negative_label,
                    test.reference_range.text
                  )
          : initialFormState.reference_range
    });
    window.requestAnimationFrame(() => {
      document.getElementById("test-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openNewTestForm = () => {
    resetForm();
    window.requestAnimationFrame(() => {
      document.getElementById("test-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setErrors({});

    const parsed = testFormSchema.safeParse(formState);
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path.join(".") || "form";
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      });
      setErrors(nextErrors);
      return;
    }

    const now = new Date().toISOString();
    const currentTest = editingId
      ? tests.find((test) => test.id === editingId) ?? null
      : null;
    const resolvedFacilityId = targetFacilityId || facilityId || null;

    if (!resolvedFacilityId) {
      setSubmitError("Unable to save test.");
      return;
    }

    const scopedTests = tests.filter(
      (test) => (test.facility_id ?? null) === resolvedFacilityId
    );

    const insertPayload = {
      category: parsed.data.category,
      created_at: currentTest?.created_at ?? now,
      facility_id: resolvedFacilityId,
      id: currentTest?.id ?? generateId(),
      is_active: parsed.data.is_active,
      name: parsed.data.name,
      price: parsed.data.price,
      result_type: parsed.data.result_type,
      reference_range: parsed.data.reference_range,
      test_code: resolveTestCode(
        parsed.data.test_code,
        parsed.data.category,
        currentTest,
        scopedTests
      ),
      unit: parsed.data.unit?.trim() ? parsed.data.unit.trim() : null,
      updated_at: now
    } satisfies TablesInsert<"tests">;

    const updatePayload = {
      category: insertPayload.category,
      facility_id: insertPayload.facility_id,
      is_active: insertPayload.is_active,
      name: insertPayload.name,
      price: insertPayload.price,
      reference_range: insertPayload.reference_range,
      result_type: insertPayload.result_type,
      test_code: insertPayload.test_code,
      unit: insertPayload.unit,
      updated_at: insertPayload.updated_at
    } satisfies TablesUpdate<"tests">;

    try {
      setSaving(true);
      await commitOnlineMutation({
        action: editingId ? "update" : "insert",
        entity: "tests",
        payload: editingId ? updatePayload : insertPayload,
        recordId: insertPayload.id
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tests"] }),
        queryClient.invalidateQueries({ queryKey: ["active-tests"] }),
        queryClient.invalidateQueries({ queryKey: ["test-catalogue"] }),
        queryClient.invalidateQueries({ queryKey: ["order-tests"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] })
      ]);
      await testsQuery.refetch();
      setSubmitSuccess(editingId ? "Test updated successfully." : "Test added successfully.");
      toast({
        title: editingId ? "Test updated" : "Test created",

        variant: "success"
      });
      resetForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save the test catalogue item.";
      setSubmitError(message);
      toast({
        title: "Catalogue update failed",
        description: message,
        variant: "error"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const targetTest = testsQuery.data?.find((test) => test.id === id) ?? null;
    const canManageTarget = Boolean(
      targetTest?.facility_id && targetTest.facility_id === facilityId
    );

    if (!canManageTarget) {
      toast({
        title: "Hospital mismatch",
        description: "This catalogue entry is not assigned to the current hospital.",
        variant: "error"
      });
      return;
    }

    try {
      setDeletingId(id);
      setSubmitError(null);
      await commitOnlineMutation({
        action: "delete",
        entity: "tests",
        payload: { id },
        recordId: id
      });

      if (editingId === id) {
        resetForm();
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tests"] }),
        queryClient.invalidateQueries({ queryKey: ["active-tests"] }),
        queryClient.invalidateQueries({ queryKey: ["test-catalogue"] }),
        queryClient.invalidateQueries({ queryKey: ["order-tests"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] })
      ]);
      await testsQuery.refetch();
      toast({
        title: "Test removed",

        variant: "success"
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete the test.";
      setSubmitError(message);
      toast({
        title: "Delete failed",
        description: message,
        variant: "error"
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleReferenceModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const mode = event.target.value as TestFormValues["reference_range"]["mode"];
    if (mode === "text") {
      setReferenceRange(() => createTextRange(""));
      return;
    }

    if (mode === "select") {
      setReferenceRange(() => createSelectRange());
      return;
    }

    if (mode === "boolean") {
      setReferenceRange(() => createBooleanRange());
      return;
    }

    setReferenceRange(() => createNumericRange());
  };

  const tests = testsQuery.data ?? [];
  const categoryOptions = [
    { key: "all" as const, label: "All tests", count: tests.length },
    ...testCategories.map((category) => ({
      key: category as FilterCategory,
      label: category,
      count: tests.filter((test) => normalizeTestCategory(test.category) === category).length
    })),
    {
      key: "uncategorized" as const,
      label: "Uncategorized",
      count: tests.filter((test) => normalizeTestCategory(test.category) === null).length
    }
  ];
  const visibleTests = tests.filter((test) => {
    if (categoryFilter === "all") return true;
    const normalizedCategory = normalizeTestCategory(test.category);
    return categoryFilter === "uncategorized"
      ? normalizedCategory === null
      : normalizedCategory === categoryFilter;
  });
  const selectedTest =
    visibleTests.find((test) => test.id === selectedTestId) ?? visibleTests[0] ?? null;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Total tests</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{totals.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Active tests</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{totals.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Inactive tests</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{totals.inactive}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="space-y-6">
        <Card className="border-blue-100">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TestTube2 className="h-5 w-5 text-blue-700" />
                  Test catalogue
                </CardTitle>
              </div>
              <Button type="button" size="sm" onClick={openNewTestForm}>
                <Plus className="h-4 w-4" />
                Add test
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Search test name or ID"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              <select
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value as FilterStatus)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              <select
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                value={resultType}
                onChange={(event) =>
                  setResultType(event.target.value as FilterResultType)
                }
              >
                <option value="all">All result types</option>
                {resultTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {testsQuery.isLoading ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                Loading tests...
              </div>
            ) : null}

            {testsQuery.isError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                {testsQuery.error instanceof Error
                  ? testsQuery.error.message
                  : "Could not load the test catalogue."}
              </div>
            ) : null}

            {!testsQuery.isLoading && !testsQuery.isError ? (
              <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Categories
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
                    {categoryOptions.map((category) => (
                      <button
                        key={category.key}
                        type="button"
                        onClick={() => {
                          setCategoryFilter(category.key);
                          setSelectedTestId(null);
                        }}
                        className={`flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                          categoryFilter === category.key
                            ? "border-blue-300 bg-blue-600 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                        }`}
                      >
                        <span className="truncate font-medium">{category.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          categoryFilter === category.key ? "bg-white/20" : "bg-slate-100"
                        }`}>
                          {category.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <p className="font-semibold text-slate-950">
                      {categoryOptions.find((item) => item.key === categoryFilter)?.label}
                    </p>
                    <Badge variant="outline">{visibleTests.length}</Badge>
                  </div>
                  <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                    {visibleTests.map((test) => (
                      <button
                        key={test.id}
                        type="button"
                        onClick={() => setSelectedTestId(test.id)}
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          selectedTest?.id === test.id
                            ? "border-blue-300 bg-blue-50"
                            : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{test.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{test.test_code} · {test.result_type}</p>
                          </div>
                          <Badge variant={test.is_active ? "secondary" : "outline"}>
                            {test.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </button>
                    ))}
                    {!visibleTests.length ? (
                      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
                        No tests in this category.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  {selectedTest ? (
                    <div className="space-y-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{selectedTest.test_code}</p>
                          <h3 className="mt-1 break-words text-xl font-semibold text-slate-950">{selectedTest.name}</h3>
                          <p className="mt-1 text-sm text-slate-500">{getTestCategoryLabel(selectedTest.category)}</p>
                        </div>
                        <Badge variant={selectedTest.is_active ? "default" : "secondary"}>
                          {selectedTest.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Price</p>
                          <p className="mt-1 font-semibold text-slate-950">₦{Number(selectedTest.price).toLocaleString("en-NG")}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Result type</p>
                          <p className="mt-1 font-semibold capitalize text-slate-950">{selectedTest.result_type}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                          <p className="text-xs text-slate-500">Reference range</p>
                          <p className="mt-1 break-words font-medium text-slate-950">{formatReferenceRange(selectedTest.reference_range)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                          <p className="text-xs text-slate-500">Unit</p>
                          <p className="mt-1 font-medium text-slate-950">{selectedTest.unit || "Not set"}</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button type="button" className="sm:flex-1" disabled={selectedTest.facility_id !== facilityId} onClick={() => loadForEdit(selectedTest)}>
                          <Pencil className="h-4 w-4" />
                          Edit test
                        </Button>
                        <Button type="button" variant="outline" className="sm:flex-1" disabled={deletingId === selectedTest.id || selectedTest.facility_id !== facilityId} onClick={() => handleDelete(selectedTest.id)}>
                          {deletingId === selectedTest.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
                      Select a test.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card id="test-form" className="scroll-mt-24 border-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-700" />
              {editingId ? "Edit test" : "Add test"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="test-code">Test ID</Label>
                <Input
                  id="test-code"
                  value={formState.test_code ?? ""}
                  onChange={(event) => setField("test_code", event.target.value.toUpperCase())}
                  placeholder={`${getTestCodePrefix(formState.category)}00001`}
                />
                {errors.test_code ? (
                  <p className="text-sm text-red-700">{errors.test_code}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="test-name">Test name</Label>
                <Input
                  id="test-name"
                  value={formState.name}
                  onChange={(event) => setField("name", event.target.value)}
                  placeholder="Full blood count"
                />
                {errors.name ? (
                  <p className="text-sm text-red-700">{errors.name}</p>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="test-price">Price (N)</Label>
                  <Input
                    id="test-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formState.price}
                    onChange={(event) => setField("price", Number(event.target.value))}
                  />
                  {errors.price ? (
                    <p className="text-sm text-red-700">{errors.price}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="test-category">Category</Label>
                  <select
                    id="test-category"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    value={formState.category ?? ""}
                    onChange={(event) =>
                      setField(
                        "category",
                        (event.target.value || null) as TestFormValues["category"]
                      )
                    }
                  >
                    <option value="">Select category</option>
                    {testCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  {errors.category ? (
                    <p className="text-sm text-red-700">{errors.category}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="result-type">Result type</Label>
                  <select
                    id="result-type"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    value={formState.result_type}
                    onChange={(event) => {
                      const nextType =
                        event.target.value as TestFormValues["result_type"];
                      setField("result_type", nextType);

                      if (nextType === "numeric") {
                        setReferenceRange(() => createNumericRange());
                        return;
                      }

                      if (nextType === "boolean") {
                        setReferenceRange(() => createBooleanRange());
                        return;
                      }

                      if (nextType === "panel") {
                        setReferenceRange(() => createPanelRange(1));
                        return;
                      }

                      if (
                        formState.reference_range.mode !== "text" &&
                        formState.reference_range.mode !== "select"
                      ) {
                        setReferenceRange(() => createTextRange(""));
                      }
                    }}
                  >
                    {resultTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="test-unit">Unit</Label>
                <Input
                  id="test-unit"
                  value={formState.unit ?? ""}
                  onChange={(event) =>
                    setField("unit", event.target.value || null)
                  }
                  placeholder="g/dL"
                />
                {errors.unit ? (
                  <p className="text-sm text-red-700">{errors.unit}</p>
                ) : null}
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="space-y-2">
                  <Label htmlFor="reference-mode">Reference range format</Label>
                  <select
                    id="reference-mode"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    value={formState.reference_range.mode}
                    onChange={handleReferenceModeChange}
                  >
                    {formState.result_type === "numeric" ? (
                      <option value="numeric">Minimum / maximum values</option>
                    ) : null}
                    {formState.result_type === "text" ? (
                      <>
                        <option value="text">Text description</option>
                        <option value="select">Dropdown options</option>
                      </>
                    ) : null}
                    {formState.result_type === "boolean" ? (
                      <option value="boolean">Positive / negative labels</option>
                    ) : null}
                    {formState.result_type === "panel" ? (
                      <option value="panel">Multiple parameters</option>
                    ) : null}
                  </select>
                </div>

                {formState.reference_range.mode === "numeric" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="reference-min">Minimum value</Label>
                      <Input
                        id="reference-min"
                        type="number"
                        step="0.01"
                        value={formState.reference_range.min ?? ""}
                        onChange={(event) =>
                          setReferenceRange((current) =>
                            current.mode === "numeric"
                              ? createNumericRange(
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value),
                                  current.max
                                )
                              : current
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reference-max">Maximum value</Label>
                      <Input
                        id="reference-max"
                        type="number"
                        step="0.01"
                        value={formState.reference_range.max ?? ""}
                        onChange={(event) =>
                          setReferenceRange((current) =>
                            current.mode === "numeric"
                              ? createNumericRange(
                                  current.min,
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value)
                                )
                              : current
                          )
                        }
                      />
                    </div>
                  </div>
                ) : formState.reference_range.mode === "text" ? (
                  <div className="space-y-2">
                    <Label htmlFor="reference-text">Reference range text</Label>
                    <Textarea
                      id="reference-text"
                      value={formState.reference_range.text ?? ""}
                      onChange={(event) =>
                        setReferenceRange((current) =>
                          current.mode === "text"
                            ? createTextRange(event.target.value)
                            : current
                        )
                      }
                      placeholder="Adults: 4.5 - 11.0 x10^9/L"
                    />
                  </div>
                ) : formState.reference_range.mode === "select" ? (
                  <div className="space-y-2">
                    <Label htmlFor="reference-options">Dropdown options</Label>
                    <Textarea
                      id="reference-options"
                      value={formState.reference_range.options.join("\n")}
                      onChange={(event) =>
                        setReferenceRange((current) =>
                          current.mode === "select"
                            ? createSelectRange(
                                event.target.value
                                  .split("\n")
                                  .map((value) => value.trim())
                                  .filter(Boolean),
                                current.text
                              )
                            : current
                        )
                      }
                      placeholder={"Positive\nNegative"}
                    />
                    <p className="text-xs text-slate-500">One option per line</p>
                  </div>
                ) : formState.reference_range.mode === "panel" ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          Parameters in this test
                        </p>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <Label htmlFor="parameter-count" className="text-xs text-slate-600">
                          Number of parameters
                        </Label>
                        <Input
                          id="parameter-count"
                          type="number"
                          min="1"
                          className="h-10 w-28"
                          value={formState.reference_range.parameters.length}
                          onChange={(event) => {
                            const count = Math.max(1, Number(event.target.value) || 1);
                            setReferenceRange((current) =>
                              current.mode === "panel"
                                ? {
                                    ...current,
                                    parameters: Array.from({ length: count }, (_, index) =>
                                      current.parameters[index] ?? createPanelParameter(index)
                                    )
                                  }
                                : current
                            );
                          }}
                        />
                        <Button type="button" variant="outline" onClick={addPanelParameter}>
                          Add parameter
                        </Button>
                      </div>
                    </div>

                    {formState.reference_range.parameters.map((parameter, index) => (
                      <div
                        key={parameter.id}
                        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">
                            Parameter {index + 1}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removePanelParameter(parameter.id)}
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-[minmax(280px,1.5fr)_180px_160px]">
                          <div className="space-y-2">
                            <Label>Parameter name</Label>
                            <Input
                              className="h-11 text-base"
                              value={parameter.name}
                              onChange={(event) =>
                                updatePanelParameter(parameter.id, (current) => ({
                                  ...current,
                                  name: event.target.value
                                }))
                              }
                              placeholder="Packed cell volume"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Type</Label>
                            <select
                              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                              value={parameter.result_type}
                              onChange={(event) => {
                                const nextType = event.target.value as typeof parameter.result_type;
                                updatePanelParameter(parameter.id, (current) => ({
                                  ...current,
                                  result_type: nextType,
                                  reference_range:
                                    nextType === "numeric"
                                      ? createNumericRange()
                                      : nextType === "boolean"
                                        ? createBooleanRange()
                                        : nextType === "select"
                                          ? createSelectRange()
                                          : createTextRange("")
                                }));
                              }}
                            >
                              <option value="numeric">Number</option>
                              <option value="text">Text</option>
                              <option value="select">Dropdown</option>
                              <option value="boolean">Positive/Negative</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label>Unit</Label>
                            <Input
                              value={parameter.unit ?? ""}
                              onChange={(event) =>
                                updatePanelParameter(parameter.id, (current) => ({
                                  ...current,
                                  unit: event.target.value || null
                                }))
                              }
                              placeholder="g/dL"
                            />
                          </div>
                        </div>

                        {parameter.reference_range.mode === "numeric" ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Minimum reference</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={parameter.reference_range.min ?? ""}
                                onChange={(event) =>
                                  updatePanelParameter(parameter.id, (current) => ({
                                    ...current,
                                    reference_range:
                                      current.reference_range.mode === "numeric"
                                        ? createNumericRange(
                                            event.target.value === ""
                                              ? null
                                              : Number(event.target.value),
                                            current.reference_range.max
                                          )
                                        : current.reference_range
                                  }))
                                }
                                placeholder="e.g. 36"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Maximum reference</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={parameter.reference_range.max ?? ""}
                                onChange={(event) =>
                                  updatePanelParameter(parameter.id, (current) => ({
                                    ...current,
                                    reference_range:
                                      current.reference_range.mode === "numeric"
                                        ? createNumericRange(
                                            current.reference_range.min,
                                            event.target.value === ""
                                              ? null
                                              : Number(event.target.value)
                                          )
                                        : current.reference_range
                                  }))
                                }
                                placeholder="e.g. 54"
                              />
                            </div>
                          </div>
                        ) : parameter.reference_range.mode === "select" ? (
                          <Textarea
                            className="min-h-28"
                            value={parameter.reference_range.options.join("\n")}
                            onChange={(event) =>
                              updatePanelParameter(parameter.id, (current) => ({
                                ...current,
                                reference_range:
                                  current.reference_range.mode === "select"
                                    ? createSelectRange(
                                        event.target.value
                                          .split("\n")
                                          .map((value) => value.trim())
                                          .filter(Boolean),
                                        current.reference_range.text
                                      )
                                    : current.reference_range
                              }))
                            }
                            placeholder={"Positive\nNegative"}
                          />
                        ) : parameter.reference_range.mode === "boolean" ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <Input
                              value={parameter.reference_range.positive_label}
                              onChange={(event) =>
                                updatePanelParameter(parameter.id, (current) => ({
                                  ...current,
                                  reference_range:
                                    current.reference_range.mode === "boolean"
                                      ? createBooleanRange(
                                          event.target.value,
                                          current.reference_range.negative_label,
                                          current.reference_range.text
                                        )
                                      : current.reference_range
                                }))
                              }
                              placeholder="Positive"
                            />
                            <Input
                              value={parameter.reference_range.negative_label}
                              onChange={(event) =>
                                updatePanelParameter(parameter.id, (current) => ({
                                  ...current,
                                  reference_range:
                                    current.reference_range.mode === "boolean"
                                      ? createBooleanRange(
                                          current.reference_range.positive_label,
                                          event.target.value,
                                          current.reference_range.text
                                        )
                                      : current.reference_range
                                }))
                              }
                              placeholder="Negative"
                            />
                          </div>
                        ) : (
                          <Textarea
                            className="min-h-28"
                            value={parameter.reference_range.text ?? ""}
                            onChange={(event) =>
                              updatePanelParameter(parameter.id, (current) => ({
                                ...current,
                                reference_range:
                                  current.reference_range.mode === "text"
                                    ? createTextRange(event.target.value)
                                    : current.reference_range
                              }))
                            }
                            placeholder="Reference guidance"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="positive-label">Positive label</Label>
                      <Input
                        id="positive-label"
                        value={formState.reference_range.positive_label ?? ""}
                        onChange={(event) =>
                          setReferenceRange((current) =>
                            current.mode === "boolean"
                              ? createBooleanRange(
                                  event.target.value,
                                  current.negative_label,
                                  current.text
                                )
                              : current
                          )
                        }
                        placeholder="Positive"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="negative-label">Negative label</Label>
                      <Input
                        id="negative-label"
                        value={formState.reference_range.negative_label ?? ""}
                        onChange={(event) =>
                          setReferenceRange((current) =>
                            current.mode === "boolean"
                              ? createBooleanRange(
                                  current.positive_label,
                                  event.target.value,
                                  current.text
                                )
                              : current
                          )
                        }
                        placeholder="Negative"
                      />
                    </div>
                  </div>
                )}

                {errors["reference_range"] ? (
                  <p className="text-sm text-red-700">{errors["reference_range"]}</p>
                ) : null}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">Availability</p>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm font-medium text-slate-700"
                  onClick={() => setField("is_active", !formState.is_active)}
                >
                  {formState.is_active ? (
                    <ToggleRight className="h-7 w-7 text-blue-700" />
                  ) : (
                    <ToggleLeft className="h-7 w-7 text-slate-400" />
                  )}
                  {formState.is_active ? "Active" : "Inactive"}
                </button>
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

              <div className="flex gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editingId ? "Save changes" : "Create test"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Clear
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
