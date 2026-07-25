"use client";

import { useDeferredValue, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Loader2,
  ReceiptText,
  Search,
  ShieldAlert,
  Trash2,
  Wallet
} from "lucide-react";
import { z } from "zod";
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
import {
  buildAccountsSummary,
  buildExpenseExportRows,
  buildIncomeByCategory,
  buildIncomeByTest,
  buildInventoryCostExportRows,
  buildInventoryCostRows,
  buildInvoiceExportRows,
  buildServiceChargeExportRows,
  exportAccountsWorkbook,
  formatCurrency,
  getCurrentMonthKey,
  isWithinMonth,
  normalizeCategory,
  type AccountExpenseRow,
  type AccountHospitalCharge,
  type AccountHospitalPayment,
  type AccountInvoiceRow
} from "@/features/accounts/accounts-utils";
import { useToast } from "@/hooks/use-toast";
import { canAccessAccountsRole, canManageAccountsRole } from "@/lib/guards";
import { commitOnlineMutation, generateId } from "@/lib/online-core";
import { recordAuditLog } from "@/lib/online-mutations";
import { getAppClient } from "@/lib/app-client";
import type { Json, Tables, TablesInsert } from "@/types/database";

type AccountsData = {
  expenses: AccountExpenseRow[];
  hospitalCharges: AccountHospitalCharge[];
  hospitalPayments: AccountHospitalPayment[];
  inventoryItems: Tables<"inventory_items">[];
  inventoryTransactions: Tables<"inventory_transactions">[];
  invoices: AccountInvoiceRow[];
};

type ExpenseFormState = {
  amount: number;
  category: string;
  expense_date: string;
  notes: string;
  source: "manual" | "other";
  title: string;
};

const expenseFormSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  category: z.string().trim().min(2, "Category is required").max(80, "Category is too long"),
  expense_date: z.string().trim().min(1, "Expense date is required"),
  notes: z.string().trim().max(300, "Notes are too long"),
  source: z.enum(["manual", "other"]),
  title: z.string().trim().min(2, "Expense title is required").max(120, "Title is too long")
});

const initialExpenseFormState: ExpenseFormState = {
  amount: 0,
  category: "Operations",
  expense_date: new Date().toISOString().slice(0, 10),
  notes: "",
  source: "manual",
  title: ""
};

async function fetchAccountsData(facilityId: string): Promise<AccountsData> {
  const database = getAppClient();
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - 11, 1);
  windowStart.setHours(0, 0, 0, 0);
  const startIso = windowStart.toISOString();

  if (!database) {
    throw new Error("Service unavailable.");
  }

  const [invoicesResponse, expensesResponse, transactionsResponse, inventoryResponse, chargesResponse, hospitalPaymentsResponse] =
    await Promise.all([
      database
        .from("invoices")
        .select(
          "id, facility_id, order_id, invoice_number, subtotal, discount_amount, total_amount, amount_paid, payment_status, notes, issued_at, due_at, created_at, created_by, updated_at, orders(id, order_number, ordered_at, patients(id, name, hospital_id, lab_id, phone)), invoice_items(id, invoice_id, order_test_id, test_name, quantity, unit_price, line_total, created_at, order_tests(test_id, tests(id, name, category))), invoice_payments(id, facility_id, invoice_id, receipt_number, amount, payment_method, reference_number, notes, received_at, received_by, created_at)"
        )
        .eq("facility_id", facilityId)
        .gte("issued_at", startIso)
        .order("issued_at", { ascending: false })
        .limit(220),
      database
        .from("expenses")
        .select("*, inventory_items(id, name, category, unit)")
        .eq("facility_id", facilityId)
        .gte("expense_date", startIso.slice(0, 10))
        .order("expense_date", { ascending: false })
        .limit(240),
      database
        .from("inventory_transactions")
        .select("*")
        .eq("facility_id", facilityId)
        .gte("created_at", startIso)
        .order("created_at", { ascending: false })
        .limit(480),
      database
        .from("inventory_items")
        .select("*")
        .eq("facility_id", facilityId)
        .order("updated_at", { ascending: false })
        .limit(240),
      database
        .from("encounter_charges")
        .select("id, patient_id, encounter_id, description, category, quantity, unit_price, total_amount, amount_paid, payment_status, charged_at, patients(id, name, hospital_id, lab_id, phone), clinical_encounters(id, encounter_number)")
        .eq("facility_id", facilityId)
        .gte("charged_at", startIso)
        .order("charged_at", { ascending: false })
        .limit(600),
      database
        .from("hospital_payments")
        .select("id, charge_id, patient_id, amount, payment_method, reference_number, notes, received_at")
        .eq("facility_id", facilityId)
        .gte("received_at", startIso)
        .order("received_at", { ascending: false })
        .limit(600)
    ]);

  if (invoicesResponse.error) {
    throw new Error(invoicesResponse.error.message);
  }

  if (expensesResponse.error) {
    throw new Error(expensesResponse.error.message);
  }

  if (transactionsResponse.error) {
    throw new Error(transactionsResponse.error.message);
  }

  if (inventoryResponse.error) {
    throw new Error(inventoryResponse.error.message);
  }

  if (chargesResponse.error) {
    throw new Error(chargesResponse.error.message);
  }

  if (hospitalPaymentsResponse.error) {
    throw new Error(hospitalPaymentsResponse.error.message);
  }

  return {
    expenses: (expensesResponse.data ?? []) as AccountExpenseRow[],
    hospitalCharges: (chargesResponse.data ?? []) as AccountHospitalCharge[],
    hospitalPayments: (hospitalPaymentsResponse.data ?? []) as AccountHospitalPayment[],
    inventoryItems: (inventoryResponse.data ?? []) as Tables<"inventory_items">[],
    inventoryTransactions:
      (transactionsResponse.data ?? []) as Tables<"inventory_transactions">[],
    invoices: (invoicesResponse.data ?? []) as AccountInvoiceRow[]
  };
}

function SummaryTile({
  title,
  value
}: {
  title: string;
  value: string;
}) {
  return (
    <Card className="border-blue-100 shadow-sm">
      <CardHeader className="pb-3">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl text-slate-950">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function AccountsWorkspace() {
  const queryClient = useQueryClient();
  const { facilityId, loading, role, user } = useAuth();
  const { toast } = useToast();
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey());
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(initialExpenseFormState);
  const [expenseErrors, setExpenseErrors] = useState<Partial<Record<keyof ExpenseFormState, string>>>(
    {}
  );
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [expenseSuccess, setExpenseSuccess] = useState<string | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const canAccessAccounts = canAccessAccountsRole(role);
  const canManageAccounts = canManageAccountsRole(role);
  const activeFacilityId = facilityId as string | undefined;

  const accountsQuery = useQuery({
    queryKey: ["accounts-workspace", activeFacilityId],
    queryFn: () => fetchAccountsData(activeFacilityId as string),
    enabled: canAccessAccounts && Boolean(activeFacilityId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  });

  const invoicePayments = useMemo(
    () =>
      (accountsQuery.data?.invoices ?? []).flatMap((invoice) => invoice.invoice_payments ?? []),
    [accountsQuery.data?.invoices]
  );

  const filteredInvoices = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();

    return (accountsQuery.data?.invoices ?? []).filter((invoice) => {
      if (!isWithinMonth(invoice.issued_at, monthKey)) {
        return false;
      }

      if (!needle) {
        return true;
      }

      return [
        invoice.invoice_number,
        invoice.orders?.order_number,
        invoice.orders?.patients?.name,
        invoice.orders?.patients?.lab_id,
        ...(invoice.invoice_items ?? []).map((item) => item.test_name)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [accountsQuery.data?.invoices, deferredSearch, monthKey]);

  const filteredHospitalCharges = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return (accountsQuery.data?.hospitalCharges ?? []).filter((charge) => {
      if (!isWithinMonth(charge.charged_at, monthKey)) return false;
      if (!needle) return true;
      return [
        charge.patients?.name,
        charge.patients?.hospital_id,
        charge.patients?.lab_id,
        charge.clinical_encounters?.encounter_number,
        charge.category,
        charge.description,
        charge.payment_status
      ].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [accountsQuery.data?.hospitalCharges, deferredSearch, monthKey]);

  const billingLedger = useMemo(() => [
    ...filteredInvoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      reference: invoice.invoice_number,
      date: invoice.issued_at,
      patientName: invoice.orders?.patients?.name || "Unknown patient",
      hospitalId: invoice.orders?.patients?.hospital_id || invoice.orders?.patients?.lab_id || "No hospital ID",
      category: "Laboratory",
      description: (invoice.invoice_items ?? []).map((item) => item.test_name).join(", ") || "Laboratory tests",
      status: invoice.payment_status,
      total: Number(invoice.total_amount),
      paid: Number(invoice.amount_paid)
    })),
    ...filteredHospitalCharges.map((charge) => ({
      id: `charge-${charge.id}`,
      reference: charge.clinical_encounters?.encounter_number || "Service charge",
      date: charge.charged_at,
      patientName: charge.patients?.name || "Unknown patient",
      hospitalId: charge.patients?.hospital_id || charge.patients?.lab_id || "No hospital ID",
      category: charge.category,
      description: charge.description,
      status: charge.payment_status,
      total: Number(charge.total_amount),
      paid: Number(charge.amount_paid)
    }))
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()), [filteredHospitalCharges, filteredInvoices]);

  const filteredExpenses = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();

    return (accountsQuery.data?.expenses ?? []).filter((expense) => {
      if (!isWithinMonth(expense.expense_date, monthKey)) {
        return false;
      }

      if (!needle) {
        return true;
      }

      return [expense.title, expense.category, expense.notes, expense.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [accountsQuery.data?.expenses, deferredSearch, monthKey]);

  const inventoryItemMap = useMemo(
    () =>
      new Map(
        (accountsQuery.data?.inventoryItems ?? []).map((item) => [
          item.id,
          { name: item.name, unit: item.unit }
        ])
      ),
    [accountsQuery.data?.inventoryItems]
  );

  const fallbackTestMap = useMemo(() => {
    const map = new Map<string, { category: string; name: string }>();

    (accountsQuery.data?.invoices ?? []).forEach((invoice) => {
      (invoice.invoice_items ?? []).forEach((item) => {
        if (!item.order_test_id) {
          return;
        }

        map.set(item.order_test_id, {
          category: normalizeCategory(item.order_tests?.tests?.category),
          name: item.order_tests?.tests?.name || item.test_name
        });
      });
    });

    return map;
  }, [accountsQuery.data?.invoices]);

  const incomeByTest = useMemo(
    () => buildIncomeByTest(accountsQuery.data?.invoices ?? [], fallbackTestMap, monthKey),
    [accountsQuery.data?.invoices, fallbackTestMap, monthKey]
  );

  const incomeByCategory = useMemo(() => {
    const totals = new Map(buildIncomeByCategory(incomeByTest).map((row) => [row.category, row]));
    (accountsQuery.data?.hospitalCharges ?? [])
      .filter((charge) => isWithinMonth(charge.charged_at, monthKey))
      .forEach((charge) => {
        const category = normalizeCategory(charge.category);
        const current = totals.get(category) ?? { category, revenue: 0, tests: 0 };
        totals.set(category, { ...current, revenue: current.revenue + Number(charge.total_amount), tests: current.tests + 1 });
      });
    return [...totals.values()].sort((left, right) => right.revenue - left.revenue);
  }, [accountsQuery.data?.hospitalCharges, incomeByTest, monthKey]);

  const inventoryCostRows = useMemo(
    () =>
      buildInventoryCostRows(
        accountsQuery.data?.inventoryTransactions ?? [],
        inventoryItemMap,
        monthKey
      ),
    [accountsQuery.data?.inventoryTransactions, inventoryItemMap, monthKey]
  );

  const summary = useMemo(
    () =>
      buildAccountsSummary({
        expenses: accountsQuery.data?.expenses ?? [],
        hospitalCharges: accountsQuery.data?.hospitalCharges ?? [],
        hospitalPayments: accountsQuery.data?.hospitalPayments ?? [],
        invoices: accountsQuery.data?.invoices ?? [],
        monthKey,
        payments: invoicePayments,
        transactions: accountsQuery.data?.inventoryTransactions ?? []
      }),
    [accountsQuery.data?.expenses, accountsQuery.data?.hospitalCharges, accountsQuery.data?.hospitalPayments, accountsQuery.data?.inventoryTransactions, accountsQuery.data?.invoices, invoicePayments, monthKey]
  );

  const topTestRevenue = incomeByTest[0]?.revenue ?? 0;
  const topCategoryRevenue = incomeByCategory[0]?.revenue ?? 0;

  const handleExpenseFieldChange = <K extends keyof ExpenseFormState>(
    field: K,
    value: ExpenseFormState[K]
  ) => {
    setExpenseForm((current) => ({ ...current, [field]: value }));
  };

  const resetExpenseForm = () => {
    setExpenseForm({
      ...initialExpenseFormState,
      expense_date: new Date().toISOString().slice(0, 10)
    });
    setExpenseErrors({});
    setExpenseError(null);
  };

  const writeAuditLog = async (action: string, entityId: string, payload: Record<string, unknown>) => {
    if (!activeFacilityId) {
      return;
    }

    await recordAuditLog({
      action,
      actorId: user?.id ?? null,
      entityId,
      entityTable: "expenses",
      facilityId: activeFacilityId,
      payload: payload as Json
    });
  };

  const handleExpenseSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setExpenseErrors({});
    setExpenseError(null);
    setExpenseSuccess(null);

    const parsed = expenseFormSchema.safeParse(expenseForm);
    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof ExpenseFormState, string>> = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0] as keyof ExpenseFormState;
        if (key && !nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      });
      setExpenseErrors(nextErrors);
      return;
    }

    if (!activeFacilityId) {
      setExpenseError("Access unavailable.");
      return;
    }

    try {
      setSavingExpense(true);
      const rowId = generateId();
      const row: TablesInsert<"expenses"> & { id: string } = {
        amount: parsed.data.amount,
        category: parsed.data.category,
        expense_date: parsed.data.expense_date,
        facility_id: activeFacilityId,
        id: rowId,
        notes: parsed.data.notes || null,
        source: parsed.data.source,
        title: parsed.data.title,
        created_by: user?.id ?? null,
        updated_at: new Date().toISOString()
      };

      await commitOnlineMutation({
        action: "insert",
        entity: "expenses",
        payload: row as Json,
        recordId: rowId
      });

      await writeAuditLog("expense_created", rowId, {
        amount: row.amount,
        category: row.category,
        title: row.title
      });

      setExpenseSuccess(`${row.title} was added successfully.`);
      toast({
        title: "Expense recorded",

        variant: "success"
      });

      resetExpenseForm();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts-workspace", activeFacilityId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] })
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the expense.";
      setExpenseError(message);
      toast({
        title: "Expense save failed",
        description: message,
        variant: "error"
      });
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (expense: AccountExpenseRow) => {
    if (!activeFacilityId) {
      return;
    }

    if (!window.confirm(`Delete expense "${expense.title}"?`)) {
      return;
    }

    try {
      setDeletingExpenseId(expense.id);
      await commitOnlineMutation({
        action: "delete",
        entity: "expenses",
        payload: { id: expense.id },
        recordId: expense.id
      });

      await writeAuditLog("expense_deleted", expense.id, {
        amount: expense.amount,
        title: expense.title
      });

      toast({
        title: "Expense deleted",

        variant: "success"
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts-workspace", activeFacilityId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] })
      ]);
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unable to delete the expense.",
        variant: "error"
      });
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const handleExportWorkbook = async () => {
    setExporting(true);
    try {
      await exportAccountsWorkbook({
        expenseRows: buildExpenseExportRows(filteredExpenses),
        incomeByCategory,
        incomeByTest,
        inventoryCostRows: buildInventoryCostExportRows(inventoryCostRows),
        invoiceRows: buildInvoiceExportRows(filteredInvoices),
        serviceChargeRows: buildServiceChargeExportRows(filteredHospitalCharges),
        monthKey,
        summary
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Unable to export workbook.",
        variant: "error"
      });
    } finally {
      setExporting(false);
    }
  };

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

  if (!canAccessAccounts) {
    return (
      <Card className="border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="h-5 w-5" />
            Accounts access is restricted
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (!activeFacilityId) {
    return (
      <Card className="border-amber-200 bg-amber-50/80">
        <CardHeader>
          <CardTitle className="text-amber-950">Access unavailable</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-3xl border border-blue-100 bg-[linear-gradient(135deg,_rgba(239,246,255,0.95),_rgba(255,255,255,1))] p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-950">Accounts</h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="space-y-2">
            <Label htmlFor="accounts-month">Month</Label>
            <Input
              id="accounts-month"
              type="month"
              value={monthKey}
              onChange={(event) => setMonthKey(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accounts-search">Search</Label>
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="accounts-search"
                className="pl-9"
                placeholder="Patient, hospital ID, service, invoice"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <Button
            className="self-end"
            disabled={exporting || accountsQuery.isLoading}
            onClick={() => void handleExportWorkbook()}
            type="button"
            variant="outline"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export workbook
          </Button>
        </div>
      </section>

      {accountsQuery.isLoading ? (
        <Card className="border-blue-100">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
            Loading...
          </CardContent>
        </Card>
      ) : null}

      {accountsQuery.isError ? (
        <Card className="border-red-100 bg-red-50/70">
          <CardContent className="p-6 text-sm text-red-800">
            {accountsQuery.error instanceof Error
              ? accountsQuery.error.message
              : "Unable to load."}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          title="Total billed"
          value={formatCurrency(summary.billed)}
        />
        <SummaryTile
          title="Cash received"
          value={formatCurrency(summary.collected)}
        />
        <SummaryTile
          title="Total cost"
          value={formatCurrency(summary.totalCost)}
        />
        <SummaryTile
          title="Net cashflow"
          value={formatCurrency(summary.netCashflow)}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          title="Outstanding"
          value={formatCurrency(summary.outstanding)}
        />
        <SummaryTile
          title="Manual expenses"
          value={formatCurrency(summary.manualExpenses)}
        />
        <SummaryTile
          title="Inventory purchases"
          value={formatCurrency(summary.inventoryPurchaseCost)}
        />
        <SummaryTile
          title="Inventory usage"
          value={formatCurrency(summary.inventoryUsageCost)}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-blue-100 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-blue-700" />
                  Income by test
                </CardTitle>
              </div>
              <Badge variant="outline">{incomeByTest.length} billed test lines</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {incomeByTest.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                No income found.
              </div>
            ) : null}

            {incomeByTest.slice(0, 10).map((row) => (
              <div key={`${row.category}-${row.testName}`} className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{row.testName}</p>
                    <p className="text-xs text-slate-500">
                      {row.category} • Qty {row.quantity.toLocaleString("en-NG")}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-950">{formatCurrency(row.revenue)}</p>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{
                      width: `${topTestRevenue > 0 ? (row.revenue / topTestRevenue) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-blue-100 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-blue-700" />
              Income by category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {incomeByCategory.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                No income found.
              </div>
            ) : null}

            {incomeByCategory.map((row) => (
              <div key={row.category} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{row.category}</p>
                    <p className="text-xs text-slate-500">{row.tests} billed line(s)</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-950">{formatCurrency(row.revenue)}</p>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-emerald-600"
                    style={{
                      width: `${topCategoryRevenue > 0 ? (row.revenue / topCategoryRevenue) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-slate-950">Billing register</CardTitle>
              <Badge variant="outline">{billingLedger.length} records</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {billingLedger.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                No billing records found.
              </div>
            ) : null}

            {billingLedger.map((record) => (
              <div key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950">{record.reference}</p>
                      <Badge variant="secondary">{record.category}</Badge>
                      <Badge variant="outline">{record.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {record.patientName} • {record.hospitalId}
                    </p>
                    <p className="mt-2 break-words text-xs text-slate-500">
                      {record.description} • {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(record.date))}
                    </p>
                  </div>
                  <div className="text-left lg:text-right">
                    <p className="text-sm font-semibold text-slate-950">
                      {formatCurrency(record.total)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Paid {formatCurrency(record.paid)} • Due {formatCurrency(Math.max(record.total - record.paid, 0))}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-slate-950">Post manual expenditure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {expenseError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                {expenseError}
              </div>
            ) : null}

            {expenseSuccess ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                {expenseSuccess}
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={(event) => void handleExpenseSubmit(event)}>
              <div className="space-y-2">
                <Label htmlFor="expense-title">Expense title</Label>
                <Input
                  id="expense-title"
                  value={expenseForm.title}
                  onChange={(event) => handleExpenseFieldChange("title", event.target.value)}
                  placeholder="Generator fuel"
                />
                {expenseErrors.title ? (
                  <p className="text-xs text-red-600">{expenseErrors.title}</p>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expense-category">Category</Label>
                  <Input
                    id="expense-category"
                    value={expenseForm.category}
                    onChange={(event) => handleExpenseFieldChange("category", event.target.value)}
                    placeholder="Utilities, Maintenance, Transport"
                  />
                  {expenseErrors.category ? (
                    <p className="text-xs text-red-600">{expenseErrors.category}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense-amount">Amount (N)</Label>
                  <Input
                    id="expense-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={expenseForm.amount}
                    onChange={(event) =>
                      handleExpenseFieldChange("amount", Number(event.target.value))
                    }
                  />
                  {expenseErrors.amount ? (
                    <p className="text-xs text-red-600">{expenseErrors.amount}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expense-date">Expense date</Label>
                  <Input
                    id="expense-date"
                    type="date"
                    value={expenseForm.expense_date}
                    onChange={(event) =>
                      handleExpenseFieldChange("expense_date", event.target.value)
                    }
                  />
                  {expenseErrors.expense_date ? (
                    <p className="text-xs text-red-600">{expenseErrors.expense_date}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense-source">Source</Label>
                  <select
                    id="expense-source"
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    value={expenseForm.source}
                    onChange={(event) =>
                      handleExpenseFieldChange(
                        "source",
                        event.target.value as ExpenseFormState["source"]
                      )
                    }
                  >
                    <option value="manual">Manual expense</option>
                    <option value="other">Other expense</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense-notes">Notes</Label>
                <Textarea
                  id="expense-notes"
                  value={expenseForm.notes}
                  onChange={(event) => handleExpenseFieldChange("notes", event.target.value)}
                  placeholder="Optional note about why the cost was recorded"
                  rows={3}
                />
                {expenseErrors.notes ? (
                  <p className="text-xs text-red-600">{expenseErrors.notes}</p>
                ) : null}
              </div>

              <Button disabled={!canManageAccounts || savingExpense} type="submit">
                {savingExpense ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                Save expense
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-slate-950">Expense register</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredExpenses.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                No expenses found.
              </div>
            ) : null}

            {filteredExpenses.map((expense) => (
              <div key={expense.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950">{expense.title}</p>
                      <Badge variant="outline">{expense.category}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {expense.expense_date} • {expense.source}
                    </p>
                    {expense.notes ? (
                      <p className="mt-2 text-sm text-slate-600">{expense.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-slate-950">
                      {formatCurrency(expense.amount)}
                    </p>
                    {canManageAccounts ? (
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        disabled={deletingExpenseId === expense.id}
                        onClick={() => void handleDeleteExpense(expense)}
                      >
                        {deletingExpenseId === expense.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-slate-950">Inventory-based monthly cost</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {inventoryCostRows.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                No inventory costs found.
              </div>
            ) : null}

            {inventoryCostRows.slice(0, 16).map((row) => (
              <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950">{row.itemName}</p>
                      <Badge variant="outline" className="capitalize">
                        {row.transaction_type.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.created_at} • Qty {row.quantity} {row.unit} • Unit cost{" "}
                      {formatCurrency(row.unit_cost)}
                    </p>
                    {row.reason ? (
                      <p className="mt-2 text-sm text-slate-600">{row.reason}</p>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-slate-950">
                    {formatCurrency(row.total_cost)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
