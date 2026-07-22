"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ClipboardPlus,
  FileText,
  FlaskConical,
  Keyboard,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  PencilLine,
  Save,
  Sparkles,
  Search,
  ShieldAlert,
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
import { useFrontDeskMode } from "@/hooks/use-front-desk-mode";
import { useToast } from "@/hooks/use-toast";
import {
  buildInvoicePrintHtml,
  type BillingInvoiceRow
} from "@/features/billing/billing-utils";
import { SampleLabelSheet } from "@/features/orders/sample-label-sheet";
import { canAccessOrdersRole, canCreateOrdersRole } from "@/lib/guards";
import {
  addTestsToOrder,
  createTestOrderBundle
} from "@/lib/online-mutations";
import { resolveOnlineQuery } from "@/lib/online-core";
import { printHtmlDocument } from "@/lib/print";
import { getAppClient } from "@/lib/app-client";
import { cn } from "@/lib/utils";
import type { Database, Tables } from "@/types/database";

type PatientSearchRow =
  Database["public"]["Functions"]["search_patients"]["Returns"][number];
type TestRow = Tables<"tests"> & {
  facilities: Pick<Tables<"facilities">, "id" | "name" | "code"> | null;
};
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
type QuickBundleDefinition = {
  id: string;
  label: string;
  matcherGroups: string[][];
};

type QuickBundleMatch = {
  id: string;
  label: string;
  matchedTests: TestRow[];
  missingCount: number;
};

type TestBundleRow = {
  created_at: string;
  description: string | null;
  facility_id: string;
  id: string;
  is_active: boolean;
  last_used_at: string | null;
  name: string;
  test_ids: string[];
  updated_at: string;
  usage_count: number;
};

const quickBundleDefinitions: QuickBundleDefinition[] = [
  {
    id: "fbc",
    label: "FBC",
    matcherGroups: [["fbc", "full blood count", "complete blood count", "cbc"]]
  },
  {
    id: "malaria-widal",
    label: "Malaria + Widal",
    matcherGroups: [
      ["malaria", "malaria parasite", "mp", "mps"],
      ["widal", "salmonella agglutination"]
    ]
  },
  {
    id: "rvs-hbsag",
    label: "RVS + HBsAg",
    matcherGroups: [
      ["rvs", "retroviral screening", "hiv"],
      ["hbsag", "hepatitis b", "hepatitis b surface antigen"]
    ]
  }
];

const invoicePrintSelect =
  "id, facility_id, order_id, invoice_number, subtotal, discount_amount, total_amount, amount_paid, payment_status, notes, issued_at, due_at, created_at, created_by, updated_at, orders(id, facility_id, patient_id, order_number, ordered_at, priority, status, reported_at, created_at, updated_at, facilities(id, name, code), patients(id, name, lab_id, phone)), invoice_items(id, invoice_id, order_test_id, test_name, quantity, unit_price, line_total, created_at), invoice_payments(id, facility_id, invoice_id, receipt_number, amount, payment_method, reference_number, notes, received_at, received_by, created_at)";

function normalizeLookupValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(value: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle) {
    return value;
  }

  const matcher = new RegExp(`(${escapeRegExp(needle)})`, "ig");
  return value.split(matcher).map((part, index) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark key={`${part}-${index}`} className="rounded bg-amber-200 px-0.5 text-slate-950">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    )
  );
}

function formatPatientOption(patient: PatientSearchRow) {
  return `${patient.name} / ${patient.lab_id}`;
}

function sortBundlesByUsage<T extends Pick<TestBundleRow, "last_used_at" | "name" | "usage_count">>(
  bundles: T[]
) {
  return [...bundles].sort((left, right) => {
    const usageDelta = (right.usage_count ?? 0) - (left.usage_count ?? 0);
    if (usageDelta !== 0) {
      return usageDelta;
    }

    const leftUsedAt = left.last_used_at ? new Date(left.last_used_at).getTime() : 0;
    const rightUsedAt = right.last_used_at ? new Date(right.last_used_at).getTime() : 0;
    if (rightUsedAt !== leftUsedAt) {
      return rightUsedAt - leftUsedAt;
    }

    return left.name.localeCompare(right.name);
  });
}

function findQuickBundleMatches(tests: TestRow[]): QuickBundleMatch[] {
  const pool = tests.map((test) => ({
    key: `${normalizeLookupValue(test.test_code)} ${normalizeLookupValue(test.name)}`,
    test
  }));

  return quickBundleDefinitions.map((definition) => {
    const usedIds = new Set<string>();
    const matchedTests = definition.matcherGroups
      .map((group) => {
        const match = pool.find(
          (candidate) =>
            !usedIds.has(candidate.test.id) &&
            group.some((term) => candidate.key.includes(term))
        );

        if (!match) {
          return null;
        }

        usedIds.add(match.test.id);
        return match.test;
      })
      .filter((test): test is TestRow => Boolean(test));

    return {
      id: definition.id,
      label: definition.label,
      matchedTests,
      missingCount: definition.matcherGroups.length - matchedTests.length
    };
  });
}

async function waitForInvoiceRetry(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchInvoiceForOrder(orderId: string) {
  const database = getAppClient();
  if (!database) {
    throw new Error("MySQL is not configured.");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await database
      .from("invoices")
      .select(invoicePrintSelect)
      .eq("order_id", orderId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data as BillingInvoiceRow;
    }

    await waitForInvoiceRetry(350);
  }

  throw new Error("The bill is still being prepared. Use the Print bill button below.");
}

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
  const database = getAppClient();
  return resolveOnlineQuery<PatientSearchRow[]>({
    online: async () => {
      if (!database) {
        throw new Error("MySQL is not configured.");
      }

      const { data, error } = await database.rpc("search_patients", {
        search_term: searchTerm.trim() || null,
        page_number: 1,
        page_size: 12
      });

      if (error) {
        throw new Error(error.message);
      }

      const rows = (data ?? []) as PatientSearchRow[];
      return rows;
    }
  });
}

async function fetchActiveTests() {
  const database = getAppClient();
  return resolveOnlineQuery<TestRow[]>({
    online: async () => {
      if (!database) {
        throw new Error("MySQL is not configured.");
      }

      const { data, error } = await database
        .from("tests")
        .select("*, facilities(id, name, code)")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return ((data ?? []) as TestRow[]).sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    }
  });
}

async function fetchRecentOrders() {
  const database = getAppClient();
  return resolveOnlineQuery<RecentOrderRow[]>({
    online: async () => {
      if (!database) {
        throw new Error("MySQL is not configured.");
      }

      const { data, error } = await database
        .from("orders")
        .select(
          "id, order_number, status, priority, notes, created_at, patient_id, facility_id, ordered_at, ordered_by, reported_at, updated_at, patients(id, name, lab_id, phone), order_tests(id, order_id, test_id, sample_code, status, specimen_label, barcode_value, qr_value, created_at, updated_at, collected_at, collected_by, in_progress_at, results_entered_at, verified_at, reported_at, tests(id, name))"
        )
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as RecentOrderRow[];
    }
  });
}

async function fetchFacilityBundles(facilityId: string) {
  const database = getAppClient() as unknown as {
    from: (table: "test_bundles") => {
      select: (columns: string) => {
        eq: (
          column: "facility_id",
          value: string
        ) => {
          eq: (
            column: "is_active",
            value: boolean
          ) => {
            order: (
              column: "name",
              options: { ascending: boolean }
            ) => Promise<{ data: TestBundleRow[] | null; error: Error | null }>;
          };
        };
      };
    };
  } | null;
  return resolveOnlineQuery<TestBundleRow[]>({
    online: async () => {
      if (!database) {
        throw new Error("MySQL is not configured.");
      }

      const response = await database
        .from("test_bundles")
        .select("*")
        .eq("facility_id", facilityId)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (response.error) {
        throw response.error;
      }

      return sortBundlesByUsage(response.data ?? []);
    }
  });
}

async function bumpBundleUsage(bundleId: string) {
  const database = getAppClient() as unknown as {
    rpc: (
      functionName: "bump_test_bundle_usage",
      args: { target_bundle_id: string }
    ) => Promise<{ error: Error | null }>;
  } | null;

  if (!database) {
    return;
  }

  const { error } = await database.rpc("bump_test_bundle_usage", {
    target_bundle_id: bundleId
  });

  if (error) {
    throw error;
  }
}

async function fetchOrderForEdit(orderId: string) {
  const database = getAppClient();
  return resolveOnlineQuery<RecentOrderRow | null>({
    online: async () => {
      if (!database) {
        throw new Error("MySQL is not configured.");
      }

      const { data, error } = await database
        .from("orders")
        .select(
          "id, order_number, status, priority, notes, created_at, patient_id, facility_id, ordered_at, ordered_by, reported_at, updated_at, patients(id, name, lab_id, phone), order_tests(id, order_id, test_id, sample_code, status, specimen_label, barcode_value, qr_value, created_at, updated_at, collected_at, collected_by, in_progress_at, results_entered_at, verified_at, reported_at, tests(id, name))"
        )
        .eq("id", orderId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
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
  const [showRecentPanel, setShowRecentPanel] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<TestCategoryOption | "">("");
  const [selectedCatalogueTestId, setSelectedCatalogueTestId] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const deferredTestSearch = useDeferredValue(testSearch);
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [testPickerOpen, setTestPickerOpen] = useState(false);
  const [highlightedPatientIndex, setHighlightedPatientIndex] = useState(0);
  const [highlightedTestIndex, setHighlightedTestIndex] = useState(0);
  const [formState, setFormState] = useState<OrderFormValues>(initialOrderFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [bundleName, setBundleName] = useState("");
  const [bundleDescription, setBundleDescription] = useState("");
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [savingBundle, setSavingBundle] = useState(false);
  const [deletingBundleId, setDeletingBundleId] = useState<string | null>(null);
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
  const patientInputRef = useRef<HTMLInputElement | null>(null);
  const testInputRef = useRef<HTMLInputElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const createdOrderFocusRef = useRef<HTMLDivElement | null>(null);
  const { frontDeskMode, toggleFrontDeskMode } = useFrontDeskMode();

  const canAccessOrders = canAccessOrdersRole(role);
  const canCreateOrders = canCreateOrdersRole(role);

  const patientsQuery = useQuery({
    queryKey: ["order-patients", deferredPatientSearch],
    queryFn: () => fetchPatients(deferredPatientSearch),
    enabled: canAccessOrders && Boolean(facilityId)
  });

  const selectedPatient = useMemo(
    () =>
      (patientsQuery.data ?? []).find((patient) => patient.id === formState.patient_id) ??
      null,
    [formState.patient_id, patientsQuery.data]
  );

  const effectiveTestFacilityId = selectedPatient?.facility_id ?? facilityId ?? null;

  const testsQuery = useQuery({
    queryKey: ["active-tests", facilityId],
    queryFn: fetchActiveTests,
    enabled: canAccessOrders && Boolean(facilityId)
  });

  const recentOrdersQuery = useQuery({
    queryKey: ["recent-orders"],
    queryFn: fetchRecentOrders,
    enabled: canAccessOrders && Boolean(facilityId)
  });

  const bundlesQuery = useQuery({
    queryKey: ["facility-test-bundles", selectedPatient?.facility_id ?? facilityId],
    queryFn: () => fetchFacilityBundles((selectedPatient?.facility_id ?? facilityId) as string),
    enabled: canAccessOrders && Boolean(selectedPatient?.facility_id ?? facilityId)
  });

  const editOrderQuery = useQuery({
    queryKey: ["order-edit", editingOrderId],
    queryFn: () => fetchOrderForEdit(editingOrderId as string),
    enabled: canAccessOrders && Boolean(facilityId) && Boolean(editingOrderId)
  });

  const editingOrder = useMemo(
    () =>
      (recentOrdersQuery.data ?? []).find((order) => order.id === editingOrderId) ??
      editOrderQuery.data ??
      null,
    [editOrderQuery.data, editingOrderId, recentOrdersQuery.data]
  );

  const printBillForOrder = async (orderId: string) => {
    try {
      const invoice = await fetchInvoiceForOrder(orderId);
      printHtmlDocument(buildInvoicePrintHtml(invoice));
      toast({
        title: "Bill sent to printer",
        description: `${invoice.invoice_number} is ready for printing.`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Bill not printed automatically",
        description:
          error instanceof Error
            ? error.message
            : "Open the bill from the button below to print manually.",
        variant: "error"
      });
    }
  };

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

  const visibleTests = useMemo(() => {
    if (!effectiveTestFacilityId) {
      return [];
    }

    return (testsQuery.data ?? [])
      .filter((test) => test.facility_id === effectiveTestFacilityId)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [effectiveTestFacilityId, testsQuery.data]);

  const testsById = useMemo(
    () => new Map(visibleTests.map((test) => [test.id, test])),
    [visibleTests]
  );

  const groupedTests = useMemo(() => {
    const groups = new Map<TestCategoryOption, TestRow[]>();

    visibleTests.forEach((test) => {
      const category = normalizeTestCategory(test.category) ?? "Uncategorized";
      const current = groups.get(category) ?? [];
      current.push(test);
      groups.set(category, current);
    });

    groups.forEach((tests) => tests.sort((left, right) => left.name.localeCompare(right.name)));
    return groups;
  }, [visibleTests]);

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

  const filteredTestsInSelectedCategory = useMemo(() => {
    const needle = normalizeLookupValue(deferredTestSearch);
    if (!needle) {
      return testsInSelectedCategory;
    }

    return testsInSelectedCategory.filter((test) =>
      `${normalizeLookupValue(test.test_code)} ${normalizeLookupValue(test.name)} ${normalizeLookupValue(test.category)}`
        .includes(needle)
    );
  }, [deferredTestSearch, testsInSelectedCategory]);

  const selectedTests = useMemo(
    () =>
      formState.selected_test_ids
        .map((testId) => testsById.get(testId) ?? null)
        .filter((test): test is TestRow => Boolean(test)),
    [formState.selected_test_ids, testsById]
  );

  useEffect(() => {
    const visibleIds = new Set(visibleTests.map((test) => test.id));
    setFormState((current) => {
      const nextSelected = current.selected_test_ids.filter((testId) => visibleIds.has(testId));
      return nextSelected.length === current.selected_test_ids.length
        ? current
        : {
            ...current,
            selected_test_ids: nextSelected
          };
    });
  }, [visibleTests]);

  const selectedTestsTotal = useMemo(
    () => selectedTests.reduce((sum, test) => sum + Number(test.price ?? 0), 0),
    [selectedTests]
  );

  const quickBundles = useMemo(
    () => findQuickBundleMatches(visibleTests),
    [visibleTests]
  );

  const resolvedBundles = useMemo(
    () =>
      sortBundlesByUsage(
        (bundlesQuery.data ?? []).map((bundle) => ({
          ...bundle,
          tests: bundle.test_ids
            .map((testId) => testsById.get(testId) ?? null)
            .filter((test): test is TestRow => Boolean(test))
        }))
      ),
    [bundlesQuery.data, testsById]
  );

  const highlightedPatient =
    (patientsQuery.data ?? [])[highlightedPatientIndex] ?? null;
  const highlightedCatalogueTest =
    filteredTestsInSelectedCategory[highlightedTestIndex] ?? null;

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

  useEffect(() => {
    setHighlightedPatientIndex(0);
  }, [patientsQuery.data]);

  useEffect(() => {
    setHighlightedTestIndex(0);
  }, [filteredTestsInSelectedCategory]);

  useEffect(() => {
    if (frontDeskMode) {
      setShowRecentPanel(false);
    }
  }, [frontDeskMode]);

  useEffect(() => {
    if (!createdOrder) {
      return;
    }

    createdOrderFocusRef.current?.focus();
    createdOrderFocusRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, [createdOrder]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      const isTypingTarget =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        Boolean(target?.isContentEditable);

      if (!isTypingTarget && event.key === "/") {
        event.preventDefault();
        setPatientPickerOpen(true);
        patientInputRef.current?.focus();
        patientInputRef.current?.select();
        return;
      }

      if (event.altKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        setTestPickerOpen(true);
        testInputRef.current?.focus();
        testInputRef.current?.select();
        return;
      }

      if (event.altKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        setShowRecentPanel((current) => !current);
        return;
      }

      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        submitButtonRef.current?.click();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

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
            Complete the hospital setup before creating or viewing tests.
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

  const selectPatient = (patient: PatientSearchRow) => {
    setFormState((current) => ({
      ...current,
      patient_id: patient.id
    }));
    setPatientSearch(formatPatientOption(patient));
    setPatientPickerOpen(false);
    setErrors((current) => ({ ...current, patient_id: undefined }));
  };

  const selectCatalogueTest = (test: TestRow) => {
    setSelectedCatalogueTestId(test.id);
    setTestSearch(`${test.test_code} - ${test.name}`);
    setTestPickerOpen(false);
  };

  const handleAddSelectedTest = (targetTestId = selectedCatalogueTestId) => {
    if (!targetTestId) {
      return;
    }

    setFormState((current) => {
      if (current.selected_test_ids.includes(targetTestId)) {
        return current;
      }

      return {
        ...current,
        selected_test_ids: [...current.selected_test_ids, targetTestId]
      };
    });
    setErrors((current) => ({ ...current, selected_test_ids: undefined }));
  };

  const resetBundleEditor = () => {
    setEditingBundleId(null);
    setBundleName("");
    setBundleDescription("");
  };

  const handleStartBundleEdit = (bundle: {
    description: string | null;
    id: string;
    name: string;
    tests: TestRow[];
  }) => {
    setEditingBundleId(bundle.id);
    setBundleName(bundle.name);
    setBundleDescription(bundle.description ?? "");
    setFormState((current) => ({
      ...current,
      selected_test_ids: bundle.tests.map((test) => test.id)
    }));
    setErrors((current) => ({ ...current, selected_test_ids: undefined }));
    toast({
      title: `Editing ${bundle.name}`,
      description: "Adjust the selected tests, then update the saved test bundle.",
      variant: "success"
    });
  };

  const recordBundleUsage = async (bundleId: string) => {
    if (!effectiveTestFacilityId) {
      return;
    }

    const usedAt = new Date().toISOString();

    queryClient.setQueryData(
      ["facility-test-bundles", effectiveTestFacilityId],
      (current: TestBundleRow[] | undefined) =>
        sortBundlesByUsage(
          (current ?? []).map((bundle) =>
            bundle.id === bundleId
              ? {
                  ...bundle,
                  last_used_at: usedAt,
                  usage_count: Number(bundle.usage_count ?? 0) + 1
                }
              : bundle
          )
        )
    );

    try {
      await bumpBundleUsage(bundleId);
    } finally {
      await queryClient.invalidateQueries({
        queryKey: ["facility-test-bundles", effectiveTestFacilityId]
      });
    }
  };

  const handleApplyQuickBundle = (bundle: QuickBundleMatch) => {
    if (bundle.missingCount > 0 || bundle.matchedTests.length === 0) {
      toast({
        title: "Bundle not ready",
        description: `${bundle.label} is missing one or more tests in the catalogue.`,
        variant: "error"
      });
      return;
    }

    setFormState((current) => ({
      ...current,
      selected_test_ids: Array.from(
        new Set([...current.selected_test_ids, ...bundle.matchedTests.map((test) => test.id)])
      )
    }));
    setErrors((current) => ({ ...current, selected_test_ids: undefined }));
    toast({
      title: `${bundle.label} added`,
      description: `${bundle.matchedTests.length} test${bundle.matchedTests.length > 1 ? "s" : ""} added to this request.`,
      variant: "success"
    });
  };

  const handleApplySavedBundle = (bundle: {
    id: string;
    name: string;
    tests: TestRow[];
  }) => {
    if (bundle.tests.length === 0) {
      toast({
        title: "Bundle has no active tests",
        description: `${bundle.name} needs to be updated because its tests are missing from the active catalogue.`,
        variant: "error"
      });
      return;
    }

    setFormState((current) => ({
      ...current,
      selected_test_ids: Array.from(
        new Set([...current.selected_test_ids, ...bundle.tests.map((test) => test.id)])
      )
    }));
    setErrors((current) => ({ ...current, selected_test_ids: undefined }));
    toast({
      title: `${bundle.name} added`,
      description: `${bundle.tests.length} saved test${bundle.tests.length > 1 ? "s" : ""} added.`,
      variant: "success"
    });
    void recordBundleUsage(bundle.id);
  };

  const handleSaveCurrentBundle = async () => {
    if (!effectiveTestFacilityId) {
      return;
    }

    const trimmedName = bundleName.trim();
    if (!trimmedName) {
      toast({
        title: "Bundle name required",
        description: "Enter a bundle name before saving.",
        variant: "error"
      });
      return;
    }

    if (selectedTests.length === 0) {
      toast({
        title: "Select tests first",
        description: "Choose at least one test before saving a test bundle.",
        variant: "error"
      });
      return;
    }

    setSavingBundle(true);

    try {
      const database = getAppClient() as unknown as {
        from: (table: "test_bundles") => {
          insert: (payload: Record<string, unknown>) => Promise<{ error: Error | null }>;
          update: (payload: Record<string, unknown>) => {
            eq: (column: "id", value: string) => Promise<{ error: Error | null }>;
          };
        };
      };

      const payload = {
        created_by: user?.id ?? null,
        description: bundleDescription.trim() || null,
        facility_id: effectiveTestFacilityId,
        name: trimmedName,
        test_ids: selectedTests.map((test) => test.id)
      };

      const { error } = editingBundleId
        ? await database.from("test_bundles").update(payload).eq("id", editingBundleId)
        : await database.from("test_bundles").insert(payload);

      if (error) {
        throw error;
      }

      resetBundleEditor();
      await queryClient.invalidateQueries({
        queryKey: ["facility-test-bundles", effectiveTestFacilityId]
      });
      toast({
        title: editingBundleId ? "Facility bundle updated" : "Facility bundle saved",
        description: editingBundleId
          ? `${trimmedName} now reflects the current test selection.`
          : `${trimmedName} is now available for this hospital.`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: editingBundleId ? "Bundle could not be updated" : "Bundle could not be saved",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setSavingBundle(false);
    }
  };

  const handleDeleteBundle = async (bundleId: string, bundleNameValue: string) => {
    setDeletingBundleId(bundleId);

    try {
      const database = getAppClient() as unknown as {
        from: (table: "test_bundles") => {
          delete: () => {
            eq: (
              column: "id",
              value: string
            ) => Promise<{ error: Error | null }>;
          };
        };
      };

      const { error } = await database.from("test_bundles").delete().eq("id", bundleId);

      if (error) {
        throw error;
      }

      if (editingBundleId === bundleId) {
        resetBundleEditor();
      }
      await queryClient.invalidateQueries({
        queryKey: ["facility-test-bundles", effectiveTestFacilityId]
      });
      toast({
        title: "Bundle removed",
        description: `${bundleNameValue} was removed from this hospital.`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Bundle could not be removed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setDeletingBundleId(null);
    }
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
      const selectedTests = visibleTests.filter((test) =>
        parsed.data.selected_test_ids.includes(test.id)
      );
      if (selectedTests.length === 0) {
        setSubmitError("No samples were generated for this test request.");
        return;
      }

      if (!selectedPatient?.facility_id) {
        setSubmitError("Select a patient before creating a test request.");
        return;
      }

      const patientName = selectedPatient?.name || "Selected patient";
      if (editingOrder) {
        const created = await addTestsToOrder({
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
        setTestSearch("");
        setPatientPickerOpen(false);
        setTestPickerOpen(false);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["recent-orders"] }),
          queryClient.invalidateQueries({ queryKey: ["patient-orders"] }),
          queryClient.invalidateQueries({ queryKey: ["billing-invoices"] }),
          queryClient.invalidateQueries({ queryKey: ["patients"] })
        ]);
        await printBillForOrder(created.orderId);
        return;
      }

      const created = await createTestOrderBundle({
        notes: parsed.data.notes.trim() || null,
        patient: {
          facility_id: selectedPatient.facility_id,
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
        description: `${created.orderNumber} has ${created.samples.length} sample label(s).`,
        variant: "success"
      });
      setFormState(initialOrderFormState);
      setPatientSearch("");
      setTestSearch("");
      setPatientPickerOpen(false);
      setTestPickerOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recent-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["patient-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["billing-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["patients"] })
      ]);
      await printBillForOrder(created.orderId);
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

      <section
        className={cn(
          "grid gap-6",
          showRecentPanel
            ? "xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]"
            : "xl:grid-cols-1"
        )}
      >
        <Card className="overflow-hidden border-blue-100 print-hidden">
          <CardHeader className="border-b border-blue-100 bg-[linear-gradient(135deg,_rgba(239,246,255,0.95),_rgba(255,255,255,1))]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <CardTitle className="flex items-center gap-2">
                  <ClipboardPlus className="h-5 w-5 text-blue-700" />
                  {editingOrder ? `Edit test order ${editingOrder.order_number}` : "Create lab test"}
                </CardTitle>
                <CardDescription className="mt-2">
                  {editingOrder
                    ? "Add extra tests to the same order number, keep the sample trail intact, and refresh the bill automatically."
                    : "Move from patient search to bundled tests, labels, and billing without the screen feeling crowded."}
                </CardDescription>
                {!frontDeskMode ? (
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">/ patient</Badge>
                    <Badge variant="outline">Alt+T test</Badge>
                    <Badge variant="outline">Ctrl+Enter create</Badge>
                    <Badge variant="outline">Alt+R recent</Badge>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {canCreateOrders ? "Reception/Admin" : "View only"}
                </Badge>
                <Button
                  type="button"
                  variant={frontDeskMode ? "default" : "outline"}
                  className="hidden lg:inline-flex"
                  onClick={toggleFrontDeskMode}
                >
                  <Keyboard className="h-4 w-4" />
                  {frontDeskMode ? "Front desk mode on" : "Front desk mode"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="hidden xl:inline-flex"
                  onClick={() => setShowRecentPanel((current) => !current)}
                  aria-expanded={showRecentPanel}
                >
                  {showRecentPanel ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                  {showRecentPanel ? "Hide recent tests" : "Show recent tests"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {!canCreateOrders ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                Your role can view tests, but only reception and admin users can create new
                test requests.
              </div>
            ) : (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
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

                <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-2">
                      <Label htmlFor="patient-search-input">Patient search</Label>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          ref={patientInputRef}
                          id="patient-search-input"
                          className={cn("pl-9", frontDeskMode && "h-12 text-base")}
                          value={patientSearch}
                          onFocus={() => setPatientPickerOpen(true)}
                          onBlur={() => {
                            window.setTimeout(() => setPatientPickerOpen(false), 120);
                          }}
                          onChange={(event) => {
                            setPatientSearch(event.target.value);
                            setPatientPickerOpen(true);
                            if (formState.patient_id) {
                              setFormState((current) => ({
                                ...current,
                                patient_id: ""
                              }));
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowDown") {
                              event.preventDefault();
                              setPatientPickerOpen(true);
                              setHighlightedPatientIndex((current) =>
                                Math.min(
                                  current + 1,
                                  Math.max((patientsQuery.data ?? []).length - 1, 0)
                                )
                              );
                            }

                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              setHighlightedPatientIndex((current) => Math.max(current - 1, 0));
                            }

                            if (event.key === "Enter" && highlightedPatient) {
                              event.preventDefault();
                              selectPatient(highlightedPatient);
                            }
                          }}
                          placeholder="Search patient name, phone, or lab ID"
                        />

                        {patientPickerOpen ? (
                          <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                            {patientsQuery.isLoading ? (
                              <div className="flex items-center gap-2 px-3 py-6 text-sm text-slate-600">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                                Searching patients...
                              </div>
                            ) : (patientsQuery.data ?? []).length === 0 ? (
                              <div className="px-3 py-6 text-sm text-slate-500">
                                No patient matches this search yet.
                              </div>
                            ) : (
                              (patientsQuery.data ?? []).map((patient, index) => (
                                <button
                                  key={patient.id}
                                  type="button"
                                  className={cn(
                                    "flex w-full items-start justify-between rounded-xl px-3 py-3 text-left transition",
                                    index === highlightedPatientIndex
                                      ? "bg-blue-50 text-blue-900"
                                      : "hover:bg-slate-50"
                                  )}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => selectPatient(patient)}
                                >
                                  <div>
                                    <p className="font-medium">
                                      {renderHighlightedText(patient.name, patientSearch)}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {renderHighlightedText(patient.lab_id, patientSearch)}
                                      {patient.phone ? (
                                        <>
                                          {" / "}
                                          {renderHighlightedText(patient.phone, patientSearch)}
                                        </>
                                      ) : null}
                                    </p>
                                  </div>
                                  <ArrowRight className="mt-0.5 h-4 w-4 text-slate-400" />
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                      {errors.patient_id ? (
                        <p className="text-xs text-red-700">{errors.patient_id}</p>
                      ) : null}
                      {selectedPatient ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          <Badge variant="secondary">Selected</Badge>
                          <span>{formatPatientOption(selectedPatient)}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="priority">Priority</Label>
                      <select
                        id="priority"
                        className={cn(
                          "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm",
                          frontDeskMode && "h-12 text-base"
                        )}
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
                      <p className="text-xs text-slate-500">
                        Choose routine, urgent, or stat before final submission.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <Label className="text-base">Test selection</Label>
                      <p className="mt-1 text-sm text-slate-500">
                        Search within a category, tap quick bundles, and keep the bench list tidy.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {quickBundles.map((bundle) => (
                        <Button
                          key={bundle.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full px-3 text-xs"
                          disabled={bundle.missingCount > 0}
                          onClick={() => handleApplyQuickBundle(bundle)}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {bundle.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 rounded-2xl border border-dashed border-blue-200 bg-white/80 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                      <Input
                        value={bundleName}
                        onChange={(event) => setBundleName(event.target.value)}
                        placeholder={
                          editingBundleId
                            ? "Rename this saved test bundle"
                            : "Save current selection as a test bundle"
                        }
                        className={cn(frontDeskMode && "h-12 text-base")}
                      />
                      <Input
                        value={bundleDescription}
                        onChange={(event) => setBundleDescription(event.target.value)}
                        placeholder="Optional note, e.g. walk-in malaria package"
                        className={cn(frontDeskMode && "h-12 text-base", frontDeskMode && "hidden")}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={handleSaveCurrentBundle}
                        disabled={savingBundle}
                        className={cn(frontDeskMode && "h-12 px-5 text-base")}
                      >
                        {savingBundle ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {editingBundleId ? "Update bundle" : "Save bundle"}
                      </Button>
                      {editingBundleId ? (
                        <Button type="button" variant="outline" onClick={resetBundleEditor}>
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                    <div className="lg:col-span-2">
                      <div className="flex flex-wrap gap-2">
                        {resolvedBundles.map((bundle) => (
                          <div
                            key={bundle.id}
                            className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1"
                          >
                            <button
                              type="button"
                              className="rounded-full px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white"
                              onClick={() => handleApplySavedBundle(bundle)}
                            >
                              {bundle.name}
                            </button>
                            <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                              {bundle.usage_count ?? 0}x
                            </span>
                            <button
                              type="button"
                              className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-blue-700"
                              onClick={() => handleStartBundleEdit(bundle)}
                              aria-label={`Edit ${bundle.name}`}
                            >
                              <PencilLine className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-red-600"
                              disabled={deletingBundleId === bundle.id}
                              onClick={() => handleDeleteBundle(bundle.id, bundle.name)}
                              aria-label={`Delete ${bundle.name}`}
                            >
                              {deletingBundleId === bundle.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        ))}
                        {resolvedBundles.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            No saved test bundles yet.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
                    <div className="space-y-2">
                      <Label htmlFor="test-category-select">Category</Label>
                      <select
                        id="test-category-select"
                        className={cn(
                          "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm",
                          frontDeskMode && "h-12 text-base"
                        )}
                          value={selectedCategory}
                          onChange={(event) => {
                            setSelectedCategory(event.target.value as TestCategoryOption | "");
                            setTestSearch("");
                            setTestPickerOpen(true);
                          }}
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
                        <Label htmlFor="test-search-input">Search test</Label>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                          <Input
                            ref={testInputRef}
                            id="test-search-input"
                            className={cn("pl-9", frontDeskMode && "h-12 text-base")}
                            value={testSearch}
                            onFocus={() => setTestPickerOpen(true)}
                            onBlur={() => {
                              window.setTimeout(() => setTestPickerOpen(false), 120);
                            }}
                            onChange={(event) => {
                              setTestSearch(event.target.value);
                              setTestPickerOpen(true);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowDown") {
                                event.preventDefault();
                                setTestPickerOpen(true);
                                setHighlightedTestIndex((current) =>
                                  Math.min(
                                    current + 1,
                                    Math.max(filteredTestsInSelectedCategory.length - 1, 0)
                                  )
                                );
                              }

                              if (event.key === "ArrowUp") {
                                event.preventDefault();
                                setHighlightedTestIndex((current) => Math.max(current - 1, 0));
                              }

                              if (event.key === "Enter" && highlightedCatalogueTest) {
                                event.preventDefault();
                                selectCatalogueTest(highlightedCatalogueTest);
                                handleAddSelectedTest(highlightedCatalogueTest.id);
                              }
                            }}
                            placeholder="Search test code or name"
                          />

                          {testPickerOpen ? (
                            <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                              {testsQuery.isLoading ? (
                                <div className="flex items-center gap-2 px-3 py-6 text-sm text-slate-600">
                                  <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                                  Loading test catalogue...
                                </div>
                              ) : filteredTestsInSelectedCategory.length === 0 ? (
                                <div className="px-3 py-6 text-sm text-slate-500">
                                  No test matches this category and search.
                                </div>
                              ) : (
                                filteredTestsInSelectedCategory.map((test, index) => (
                                  <button
                                    key={test.id}
                                    type="button"
                                    className={cn(
                                      "flex w-full items-start justify-between rounded-xl px-3 py-3 text-left transition",
                                  index === highlightedTestIndex
                                        ? "bg-blue-50 text-blue-900"
                                        : "hover:bg-slate-50"
                                    )}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => selectCatalogueTest(test)}
                                  >
                                  <div className="min-w-0">
                                     <p className="font-medium">
                                       {renderHighlightedText(test.test_code, testSearch)} -{" "}
                                       {renderHighlightedText(test.name, testSearch)}
                                     </p>
                                      <p className="text-xs text-slate-500">
                                        {getTestCategoryLabel(test.category)} / N
                                        {Number(test.price).toLocaleString("en-NG")}
                                       </p>
                                     </div>
                                     <ArrowRight className="mt-0.5 h-4 w-4 text-slate-400" />
                                   </button>
                                ))
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!selectedCatalogueTestId}
                          className={cn(frontDeskMode && "h-12 px-5 text-base")}
                          onClick={() => handleAddSelectedTest()}
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

                <Button ref={submitButtonRef} type="submit" className="w-full" disabled={creating}>
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

                <div className="xl:sticky xl:top-24 xl:self-start">
                  <Card className="border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,1),_rgba(255,255,255,1))] shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Order summary</CardTitle>
                      <CardDescription>
                        Keep the patient, tests, and billing impact visible while you register.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                          Patient
                        </p>
                        <p className="mt-2 font-semibold text-slate-950">
                          {selectedPatient?.name || "No patient selected"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {selectedPatient?.lab_id || "Search and select a patient first"}
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                            Priority
                          </p>
                          <p className="mt-2 text-lg font-semibold text-slate-950">
                            {formState.priority}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                            Running total
                          </p>
                          <p className="mt-2 text-lg font-semibold text-slate-950">
                            N{selectedTestsTotal.toLocaleString("en-NG")}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                            Selected tests
                          </p>
                          <Badge variant="secondary">{selectedTests.length}</Badge>
                        </div>
                        {selectedTests.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-500">
                            No tests selected yet.
                          </p>
                        ) : frontDeskMode ? (
                            <p className="mt-3 text-sm text-slate-600">
                              {selectedTests.length} test{selectedTests.length > 1 ? "s" : ""} selected for this request.
                            </p>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {selectedTests.map((test) => (
                                <div
                                  key={test.id}
                                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-950">
                                      {test.test_code} - {test.name}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {getTestCategoryLabel(test.category)}
                                    </p>
                                  </div>
                                  <p className="text-sm font-medium text-slate-700">
                                    N{Number(test.price).toLocaleString("en-NG")}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>

                      <div
                        className={cn(
                          "rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-4",
                          frontDeskMode && "hidden"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Keyboard className="mt-0.5 h-4 w-4 text-blue-700" />
                          <div className="space-y-2 text-sm text-blue-900">
                            <p className="font-medium">Reception shortcuts</p>
                            <p>/ jumps to patient search.</p>
                            <p>Alt+T jumps to test search.</p>
                            <p>Ctrl+Enter submits the request.</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className={cn(
            "border-blue-100 print-hidden xl:self-start",
            !showRecentPanel && "xl:hidden"
          )}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-blue-700" />
                  Recent tests
                </CardTitle>
                <CardDescription>
                  Last five requests for quick follow-up.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden xl:inline-flex"
                onClick={() => setShowRecentPanel(false)}
              >
                <PanelRightClose className="h-4 w-4" />
                Hide
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="grid gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="h-9 pl-9 text-sm"
                  value={recentSearch}
                  onChange={(event) => setRecentSearch(event.target.value)}
                  placeholder="Search request, patient, or sample"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
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
                  className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
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
                No tests created yet for this hospital.
              </div>
            ) : null}

            <div className="space-y-3 xl:max-h-[720px] xl:overflow-y-auto xl:pr-1">
              {filteredRecentOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950">{order.order_number}</p>
                      <Badge variant="secondary">
                        {formatSampleStatus(order.status)}
                      </Badge>
                      <Badge variant="outline">{order.priority}</Badge>
                    </div>
                    <p className="text-sm text-slate-600">
                      {order.patients?.name || "Unknown patient"} •{" "}
                      {order.patients?.lab_id || "No lab ID"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(order.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => setEditingOrderId(order.id)}
                    >
                      <PencilLine className="h-4 w-4" />
                      Edit tests
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                      <Link href={`/billing?patientId=${order.patient_id}&orderId=${order.id}`}>
                        <FileText className="h-4 w-4" />
                        Bill
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                      <Link href={`/results?orderId=${order.id}`}>Results</Link>
                    </Button>
                  </div>
                  </div>

                  <Separator className="my-3" />

                  <div className="grid gap-3 md:grid-cols-2">
                    {(order.order_tests ?? []).map((sample) => (
                      <div
                        key={sample.id}
                        className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
                      >
                        <p className="text-sm font-medium text-slate-900">
                          {sample.tests?.name || "Unknown test"}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">{sample.sample_code}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{formatSampleStatus(sample.status)}</Badge>
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                          >
                            <Link href={`/results?sampleId=${sample.id}`}>Edit result</Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {createdOrder ? (
        <div
          ref={createdOrderFocusRef}
          tabIndex={-1}
          className="space-y-4 outline-none"
        >
          <Card className="border-blue-100 print-hidden">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-950">
                  Bill ready for {createdOrder.orderNumber}
                </p>
                <p className="text-sm text-slate-600">
                  The invoice is linked to this test order and this section now becomes the next action point.
                </p>
              </div>
              <Button asChild autoFocus>
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
