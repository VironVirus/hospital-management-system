import { NextRequest, NextResponse } from "next/server";
import type { AccessSnapshot } from "@/lib/access-control";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Tables } from "@/types/supabase";

export const runtime = "nodejs";

type ActorProfile = Pick<
  Tables<"profiles">,
  "approval_status" | "display_name" | "email" | "facility_id" | "id" | "role"
>;

type ScopedFacility = Pick<
  Tables<"facilities">,
  | "access_ends_at"
  | "access_mode"
  | "address"
  | "annual_fee"
  | "approval_note"
  | "approval_status"
  | "code"
  | "created_at"
  | "email"
  | "id"
  | "is_active"
  | "name"
  | "parent_facility_id"
  | "phone"
  | "updated_at"
>;

const AUTH_USER_REFERENCE_COLUMNS = new Set([
  "actor_id",
  "approved_by",
  "collected_by",
  "created_by",
  "entered_by",
  "ordered_by",
  "received_by",
  "updated_by",
  "verified_by"
]);

const BACKUP_CONFLICT_TARGETS: Record<string, string[]> = {
  audit_logs: ["id"],
  expenses: ["id"],
  facilities: ["id"],
  invoice_items: ["id"],
  invoice_payments: ["id"],
  invoices: ["id"],
  inventory_items: ["id"],
  inventory_transactions: ["id"],
  lab_branding_settings: ["facility_id"],
  order_test_results: ["id"],
  order_tests: ["id"],
  orders: ["id"],
  patients: ["id"],
  profiles: ["id"],
  sample_custody_logs: ["id"],
  tests: ["id"]
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildSpreadsheetTable(title: string, rows: Array<Record<string, unknown>>) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const body =
    rows.length === 0
      ? `<tr><td>No records</td></tr>`
      : [
          `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`,
          ...rows.map(
            (row) =>
              `<tr>${headers
                .map((header) => `<td>${escapeHtml(formatCellValue(row[header]))}</td>`)
                .join("")}</tr>`
          )
        ].join("");

  return `
    <h2>${escapeHtml(title)}</h2>
    <table>${body}</table>
  `;
}

function formatCellValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => formatCellValue(entry)).join(", ");
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value ?? "");
}

function normalizeRows<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, formatCellValue(value)])
    )
  );
}

function quoteSqlIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "object") {
    return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function toSqlExpression(_table: string, column: string, value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (AUTH_USER_REFERENCE_COLUMNS.has(column)) {
    return `(select id from auth.users where id = ${toSqlLiteral(value)})`;
  }

  return toSqlLiteral(value);
}

function buildSqlUpsertStatements(table: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return `-- ${table}: no rows\n`;
  }

  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const quotedColumns = columns.map(quoteSqlIdentifier).join(", ");
  const conflictColumns = BACKUP_CONFLICT_TARGETS[table] ?? ["id"];
  const conflictTarget = conflictColumns.map(quoteSqlIdentifier).join(", ");
  const updateAssignments = columns
    .filter((column) => !conflictColumns.includes(column))
    .map((column) => `${quoteSqlIdentifier(column)} = excluded.${quoteSqlIdentifier(column)}`)
    .join(",\n    ");

  return rows
    .map((row) => {
      const selectList = columns
        .map(
          (column) =>
            `${toSqlExpression(table, column, row[column])} as ${quoteSqlIdentifier(column)}`
        )
        .join(",\n  ");

      const whereClause =
        table === "profiles" && row["id"]
          ? `\nwhere exists (select 1 from auth.users where id = ${toSqlLiteral(row["id"])})`
          : "";

      const conflictClause =
        updateAssignments.length > 0
          ? `\non conflict (${conflictTarget}) do update set\n    ${updateAssignments};`
          : `\non conflict (${conflictTarget}) do nothing;`;

      return `insert into public.${quoteSqlIdentifier(table)} (${quotedColumns})\nselect\n  ${selectList}${whereClause}${conflictClause}`;
    })
    .join("\n\n");
}

function buildSqlRestoreScript(args: {
  backupPayload: {
    data: Record<string, Array<Record<string, unknown>>>;
  };
  exportDate: string;
  facilityRows: ScopedFacility[];
}) {
  const data = args.backupPayload.data ?? {};
  const orderedTables = [
    "facilities",
    "profiles",
    "tests",
    "patients",
    "orders",
    "order_tests",
    "order_test_results",
    "sample_custody_logs",
    "inventory_items",
    "inventory_transactions",
    "invoices",
    "invoice_items",
    "invoice_payments",
    "expenses",
    "audit_logs",
    "lab_branding_settings"
  ] as const;

  const sections = orderedTables.map((table) => {
    const rows = (data[table] ?? []) as Array<Record<string, unknown>>;
    return `-- ${table}\n${buildSqlUpsertStatements(table, rows)}`;
  });

  return `-- Tapxora LIMS SQL backup
-- Generated: ${args.exportDate}
-- Facilities: ${args.facilityRows.map((facility) => `${facility.name} (${facility.code})`).join(", ")}
-- Restore note: this script expects the Tapxora LIMS schema to already exist.
-- Profiles are restored only when matching auth.users rows already exist in the target project.

begin;

${sections.join("\n\n")}

commit;
`;
}

async function fetchByFacility<T extends { facility_id: string | null }>(
  adminClient: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  table: string,
  facilityIds: string[],
  select = "*"
) {
  if (facilityIds.length === 0) {
    return [] as T[];
  }

  const { data, error } = await adminClient
    .from(table as never)
    .select(select)
    .in("facility_id", facilityIds);

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  return (data ?? []) as T[];
}

export async function GET(request: NextRequest) {
  const authResponse = NextResponse.next();
  const supabase = createSupabaseServerClient(request, authResponse);

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase server environment variables are not configured." },
      { status: 500 }
    );
  }

  const format = request.nextUrl.searchParams.get("format") ?? "json";
  if (!["json", "excel", "sql"].includes(format)) {
    return NextResponse.json({ error: "Unsupported backup format." }, { status: 400 });
  }

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "You must be signed in to export backups." }, { status: 401 });
  }

  const { data: accessRows, error: accessError } = await supabase.rpc("current_user_access_snapshot");
  const access = ((accessRows as AccessSnapshot[] | null)?.[0] ?? null) as AccessSnapshot | null;

  if (accessError || !access || access.access_state !== "active") {
    return NextResponse.json(
      {
        error:
          access?.access_message ||
          "Your account must be approved and active before exporting backups."
      },
      { status: 403 }
    );
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      {
        error:
          "Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY on this deployment before exporting backups."
      },
      { status: 500 }
    );
  }

  const { data: actorProfileData, error: actorError } = await adminClient
    .from("profiles")
    .select("id, display_name, email, facility_id, role, approval_status")
    .eq("id", user.id)
    .single();
  const actor = (actorProfileData ?? null) as ActorProfile | null;

  if (actorError || !actor) {
    return NextResponse.json({ error: "Your profile could not be loaded." }, { status: 403 });
  }

  if (!["SuperAdmin", "Admin"].includes(actor.role)) {
    return NextResponse.json(
      { error: "Only Admin or Super Admin users can export facility backups." },
      { status: 403 }
    );
  }

  const { data: allFacilitiesData, error: facilitiesError } = await adminClient
    .from("facilities")
    .select(
      "id, name, code, parent_facility_id, address, phone, email, is_active, approval_status, approval_note, access_mode, access_ends_at, annual_fee, created_at, updated_at"
    )
    .order("name", { ascending: true });
  const allFacilities = (allFacilitiesData ?? []) as ScopedFacility[];

  if (facilitiesError) {
    return NextResponse.json({ error: facilitiesError.message }, { status: 400 });
  }

  const facilityIds =
    actor.role === "SuperAdmin"
      ? allFacilities.map((facility) => facility.id)
      : actor.facility_id
        ? [actor.facility_id]
        : [];

  if (facilityIds.length === 0) {
    return NextResponse.json(
      { error: "No facilities are in scope for this backup export." },
      { status: 404 }
    );
  }

  const facilityRows = allFacilities.filter((facility) => facilityIds.includes(facility.id));

  const [profiles, patients, tests, orders, inventoryItems, inventoryTransactions, expenses, invoices, invoicePayments, auditLogs, branding] =
    await Promise.all([
      fetchByFacility<Tables<"profiles">>(adminClient, "profiles", facilityIds),
      fetchByFacility<Tables<"patients">>(adminClient, "patients", facilityIds),
      fetchByFacility<Tables<"tests">>(adminClient, "tests", facilityIds),
      fetchByFacility<Tables<"orders">>(adminClient, "orders", facilityIds),
      fetchByFacility<Tables<"inventory_items">>(adminClient, "inventory_items", facilityIds),
      fetchByFacility<Tables<"inventory_transactions">>(
        adminClient,
        "inventory_transactions",
        facilityIds
      ),
      fetchByFacility<Tables<"expenses">>(adminClient, "expenses", facilityIds),
      fetchByFacility<Tables<"invoices">>(adminClient, "invoices", facilityIds),
      fetchByFacility<Tables<"invoice_payments">>(adminClient, "invoice_payments", facilityIds),
      fetchByFacility<Tables<"audit_logs">>(adminClient, "audit_logs", facilityIds),
      fetchByFacility<Record<string, unknown> & { facility_id: string | null }>(
        adminClient,
        "lab_branding_settings",
        facilityIds
      )
    ]);

  const orderIds = orders.map((row) => row.id);
  const invoiceIds = invoices.map((row) => row.id);

  const { data: orderTestsData, error: orderTestsError } =
    orderIds.length === 0
      ? { data: [], error: null }
      : await adminClient
          .from("order_tests")
          .select("*")
          .in("order_id", orderIds);

  if (orderTestsError) {
    return NextResponse.json({ error: orderTestsError.message }, { status: 400 });
  }

  const orderTests = (orderTestsData ?? []) as Tables<"order_tests">[];
  const orderTestIds = orderTests.map((row) => row.id);

  const [{ data: resultRowsData, error: resultsError }, { data: custodyRowsData, error: custodyError }, { data: invoiceItemRowsData, error: invoiceItemsError }] =
    await Promise.all([
      orderTestIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : adminClient.from("order_test_results").select("*").in("order_test_id", orderTestIds),
      orderTestIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : adminClient.from("sample_custody_logs").select("*").in("order_test_id", orderTestIds),
      invoiceIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : adminClient.from("invoice_items").select("*").in("invoice_id", invoiceIds)
    ]);

  if (resultsError || custodyError || invoiceItemsError) {
    return NextResponse.json(
      {
        error:
          resultsError?.message ||
          custodyError?.message ||
          invoiceItemsError?.message ||
          "Backup export failed."
      },
      { status: 400 }
    );
  }

  const orderTestResults = (resultRowsData ?? []) as Tables<"order_test_results">[];
  const sampleCustodyLogs = (custodyRowsData ?? []) as Tables<"sample_custody_logs">[];
  const invoiceItems = (invoiceItemRowsData ?? []) as Tables<"invoice_items">[];

  const exportDate = new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date());

  const backupPayload = {
    exported_at: new Date().toISOString(),
    exported_by: {
      display_name: actor.display_name,
      email: actor.email,
      id: actor.id,
      role: actor.role
    },
    scope: {
      facility_ids: facilityIds,
      facilities: facilityRows.map((facility) => ({
        code: facility.code,
        id: facility.id,
        name: facility.name
      }))
    },
    data: {
      facilities: facilityRows,
      profiles,
      patients,
      tests,
      orders,
      order_tests: orderTests,
      order_test_results: orderTestResults,
      sample_custody_logs: sampleCustodyLogs,
      invoices,
      invoice_items: invoiceItems,
      invoice_payments: invoicePayments,
      expenses,
      inventory_items: inventoryItems,
      inventory_transactions: inventoryTransactions,
      audit_logs: auditLogs,
      lab_branding_settings: branding
    }
  };

  const summaryRows = [
    { label: "Facilities", value: facilityRows.length },
    { label: "Profiles", value: profiles.length },
    { label: "Patients", value: patients.length },
    { label: "Tests catalogue rows", value: tests.length },
    { label: "Orders", value: orders.length },
    { label: "Order tests", value: orderTests.length },
    { label: "Results", value: orderTestResults.length },
    { label: "Invoices", value: invoices.length },
    { label: "Payments", value: invoicePayments.length },
    { label: "Expenses", value: expenses.length },
    { label: "Inventory items", value: inventoryItems.length },
    { label: "Inventory transactions", value: inventoryTransactions.length },
    { label: "Audit logs", value: auditLogs.length }
  ];

  if (format === "json") {
    return new NextResponse(JSON.stringify(backupPayload, null, 2), {
      headers: {
        "Content-Disposition": `attachment; filename="tapxora-lims-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        "Content-Type": "application/json; charset=utf-8"
      }
    });
  }

  if (format === "excel") {
    const workbookHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; }
            h1 { color: #0f172a; }
            h2 { color: #0f4c81; margin-top: 28px; }
            table { border-collapse: collapse; margin-bottom: 24px; width: 100%; }
            th { background: #eaf5ff; color: #0f172a; font-weight: 700; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
            .meta { margin-bottom: 16px; color: #475569; }
          </style>
        </head>
        <body>
          <h1>Tapxora LIMS Branch Backup</h1>
          <p class="meta">Generated ${escapeHtml(exportDate)}</p>
          ${buildSpreadsheetTable("Summary", summaryRows)}
          ${buildSpreadsheetTable("Facilities", normalizeRows(facilityRows))}
          ${buildSpreadsheetTable("Profiles", normalizeRows(profiles))}
          ${buildSpreadsheetTable("Patients", normalizeRows(patients))}
          ${buildSpreadsheetTable("Tests", normalizeRows(tests))}
          ${buildSpreadsheetTable("Orders", normalizeRows(orders))}
          ${buildSpreadsheetTable("Order Tests", normalizeRows(orderTests))}
          ${buildSpreadsheetTable("Order Test Results", normalizeRows(orderTestResults))}
          ${buildSpreadsheetTable("Sample Custody Logs", normalizeRows(sampleCustodyLogs))}
          ${buildSpreadsheetTable("Invoices", normalizeRows(invoices))}
          ${buildSpreadsheetTable("Invoice Items", normalizeRows(invoiceItems))}
          ${buildSpreadsheetTable("Invoice Payments", normalizeRows(invoicePayments))}
          ${buildSpreadsheetTable("Expenses", normalizeRows(expenses))}
          ${buildSpreadsheetTable("Inventory Items", normalizeRows(inventoryItems))}
          ${buildSpreadsheetTable("Inventory Transactions", normalizeRows(inventoryTransactions))}
          ${buildSpreadsheetTable("Audit Logs", normalizeRows(auditLogs))}
          ${buildSpreadsheetTable("Lab Branding Settings", normalizeRows(branding))}
        </body>
      </html>
    `;

    return new NextResponse(workbookHtml, {
      headers: {
        "Content-Disposition": `attachment; filename="tapxora-lims-backup-${new Date().toISOString().slice(0, 10)}.xls"`,
        "Content-Type": "application/vnd.ms-excel; charset=utf-8"
      }
    });
  }

  const restoreScript = buildSqlRestoreScript({
    backupPayload,
    exportDate,
    facilityRows
  });

  return new NextResponse(restoreScript, {
    headers: {
      "Content-Disposition": `attachment; filename="tapxora-lims-backup-${new Date().toISOString().slice(0, 10)}.sql"`,
      "Content-Type": "application/sql; charset=utf-8"
    }
  });
}
