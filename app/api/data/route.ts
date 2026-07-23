import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getCurrentSession } from "@/lib/auth-session";
import { getPool, migrateDatabase, nextCounter } from "@/lib/db";
import { HOSPITAL_ID } from "@/lib/db/schema";
import type { AppRole } from "@/lib/auth-types";

type Filter = { column: string; operator: "eq" | "neq" | "in" | "is" | "gte" | "lte" | "like" | "ilike"; value: unknown };
type QueryPayload = {
  table?: string;
  operation?: "select" | "insert" | "update" | "upsert" | "delete";
  values?: unknown;
  columns?: string;
  filters?: Filter[];
  order?: { column: string; ascending: boolean } | null;
  limit?: number | null;
  range?: [number, number] | null;
  onConflict?: string | null;
  or?: string | null;
  single?: boolean;
};

const tables = new Set([
  "facilities", "profiles", "patients", "tests", "test_bundles", "orders", "order_tests", "sample_custody_logs",
  "order_test_results", "invoices", "invoice_items", "invoice_payments", "inventory_items", "inventory_transactions",
  "expenses", "audit_logs", "lab_branding_settings", "wards", "beds", "clinical_encounters", "admissions", "vital_signs",
  "clinical_notes", "diagnoses", "medications", "prescriptions", "prescription_items", "encounter_charges", "hospital_payments",
  "radiology_services", "radiology_requests", "radiology_reports", "qc_controls", "qc_runs", "analyzers", "calibration_logs", "maintenance_logs"
]);

const facilityTables = new Set([...tables].filter((table) => ![
  "facilities", "profiles", "order_tests", "sample_custody_logs", "order_test_results", "invoice_items", "prescription_items"
].includes(table)));

const readRoles: Partial<Record<string, AppRole[]>> = {
  facilities: ["Admin", "Receptionist", "LabScientist", "Verifier", "Accountant", "Doctor", "Nurse", "Pharmacist", "Storekeeper", "Radiologist"],
  profiles: ["Admin"],
  patients: ["Admin", "Receptionist", "LabScientist", "Verifier", "Accountant", "Doctor", "Nurse", "Pharmacist", "Radiologist"],
  tests: ["Admin", "Receptionist", "LabScientist", "Verifier", "Accountant", "Doctor", "Nurse"],
  test_bundles: ["Admin", "Receptionist", "LabScientist", "Verifier"],
  orders: ["Admin", "Receptionist", "LabScientist", "Verifier", "Accountant", "Doctor", "Nurse"],
  order_tests: ["Admin", "Receptionist", "LabScientist", "Verifier", "Accountant", "Doctor", "Nurse"],
  sample_custody_logs: ["Admin", "Receptionist", "LabScientist", "Verifier"],
  order_test_results: ["Admin", "Receptionist", "LabScientist", "Verifier", "Doctor", "Nurse"],
  invoices: ["Admin", "Receptionist", "Accountant"], invoice_items: ["Admin", "Receptionist", "Accountant"], invoice_payments: ["Admin", "Accountant"],
  inventory_items: ["Admin", "LabScientist", "Accountant", "Storekeeper", "Pharmacist"],
  inventory_transactions: ["Admin", "LabScientist", "Accountant", "Storekeeper", "Pharmacist"],
  expenses: ["Admin", "Accountant"], audit_logs: ["Admin"],
  lab_branding_settings: ["Admin", "Receptionist", "LabScientist", "Verifier"],
  wards: ["Admin", "Receptionist", "LabScientist", "Doctor", "Nurse", "Pharmacist", "Radiologist"], beds: ["Admin", "Receptionist", "LabScientist", "Doctor", "Nurse", "Pharmacist", "Radiologist"], admissions: ["Admin", "Receptionist", "LabScientist", "Doctor", "Nurse", "Pharmacist", "Radiologist"],
  clinical_encounters: ["Admin", "Receptionist", "LabScientist", "Doctor", "Nurse", "Pharmacist", "Radiologist"],
  vital_signs: ["Admin", "Receptionist", "LabScientist", "Doctor", "Nurse", "Pharmacist", "Radiologist"],
  clinical_notes: ["Admin", "Receptionist", "LabScientist", "Doctor", "Nurse", "Pharmacist", "Radiologist"],
  diagnoses: ["Admin", "Receptionist", "LabScientist", "Doctor", "Nurse", "Pharmacist", "Radiologist"],
  medications: ["Admin", "Doctor", "Nurse", "Pharmacist", "Storekeeper"], prescriptions: ["Admin", "Receptionist", "LabScientist", "Doctor", "Nurse", "Pharmacist", "Storekeeper", "Radiologist"], prescription_items: ["Admin", "Receptionist", "LabScientist", "Doctor", "Nurse", "Pharmacist", "Storekeeper", "Radiologist"],
  encounter_charges: ["Admin", "Receptionist", "LabScientist", "Accountant", "Doctor", "Nurse", "Pharmacist", "Radiologist"], hospital_payments: ["Admin", "Receptionist", "Accountant"],
  radiology_services: ["Admin", "Receptionist", "LabScientist", "Accountant", "Doctor", "Nurse", "Pharmacist", "Radiologist"],
  radiology_requests: ["Admin", "Receptionist", "LabScientist", "Accountant", "Doctor", "Nurse", "Pharmacist", "Radiologist"], radiology_reports: ["Admin", "Receptionist", "LabScientist", "Doctor", "Nurse", "Pharmacist", "Radiologist"],
  qc_controls: ["Admin", "LabScientist", "Verifier"], qc_runs: ["Admin", "LabScientist", "Verifier"],
  analyzers: ["Admin", "LabScientist", "Verifier"], calibration_logs: ["Admin", "LabScientist", "Verifier"], maintenance_logs: ["Admin", "LabScientist", "Verifier"]
};

const mutationRoles: Partial<Record<string, AppRole[]>> = {
  profiles: ["Admin"], patients: ["Admin", "Receptionist"], tests: ["Admin"], test_bundles: ["Admin", "Receptionist"],
  orders: ["Admin", "Receptionist", "LabScientist"], order_tests: ["Admin", "Receptionist", "LabScientist", "Verifier"],
  sample_custody_logs: ["Admin", "Receptionist", "LabScientist", "Verifier"], order_test_results: ["Admin", "LabScientist", "Verifier"],
  invoices: ["Admin", "Accountant"], invoice_items: ["Admin", "Accountant"], invoice_payments: ["Admin", "Accountant"],
  inventory_items: ["Admin", "Accountant", "Storekeeper", "Pharmacist", "LabScientist"],
  inventory_transactions: ["Admin", "Accountant", "Storekeeper", "Pharmacist", "LabScientist"], expenses: ["Admin", "Accountant"],
  audit_logs: ["Admin", "LabScientist", "Verifier", "Accountant"], lab_branding_settings: ["Admin"],
  wards: ["Admin", "Nurse"], beds: ["Admin", "Nurse"], clinical_encounters: ["Admin", "Receptionist", "Doctor", "Nurse"],
  admissions: ["Admin", "Doctor", "Nurse"], vital_signs: ["Admin", "Doctor", "Nurse"], clinical_notes: ["Admin", "Doctor", "Nurse"],
  diagnoses: ["Admin", "Doctor"], medications: ["Admin", "Pharmacist", "Storekeeper"], prescriptions: ["Admin", "Doctor", "Pharmacist"],
  prescription_items: ["Admin", "Doctor", "Pharmacist"], encounter_charges: ["Admin", "Receptionist", "Accountant"], hospital_payments: ["Admin", "Receptionist", "Accountant"],
  radiology_services: ["Admin", "Radiologist"], radiology_requests: ["Admin", "Receptionist", "Doctor", "Radiologist"], radiology_reports: ["Admin", "Radiologist"],
  qc_controls: ["Admin", "LabScientist"], qc_runs: ["Admin", "LabScientist"], analyzers: ["Admin", "LabScientist"], calibration_logs: ["Admin", "LabScientist"], maintenance_logs: ["Admin", "LabScientist"]
};

const columnCache = new Map<string, Set<string>>();
function identifier(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error("Invalid database identifier.");
  return `\`${value}\``;
}

async function columnsFor(table: string) {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const [rows] = await getPool().query<RowDataPacket[]>(`SHOW COLUMNS FROM ${identifier(table)}`);
  const columns = new Set(rows.map((row) => String(row.Field)));
  columnCache.set(table, columns);
  return columns;
}

function jsonValue(value: unknown) {
  if (value === undefined) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return new Date(value);
  if (Array.isArray(value) || (value && typeof value === "object" && !(value instanceof Date))) return JSON.stringify(value);
  return value;
}

async function nextReference(key: string, prefix: string, width = 6) {
  const number = await nextCounter(key);
  return `${prefix}${String(number).padStart(width, "0")}`;
}

async function prepareRecord(table: string, input: Record<string, unknown>, session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>) {
  const record = { ...input };
  record.id ??= randomUUID();
  if (facilityTables.has(table)) record.facility_id = HOSPITAL_ID;
  if (table === "patients") {
    const id = await nextReference("hospital_patient", `SGH-${new Date().getUTCFullYear()}-`);
    record.hospital_id ||= id;
    record.lab_id ||= record.hospital_id;
    record.name ||= [record.first_name, record.last_name].filter(Boolean).join(" ");
    record.created_by ||= session.user.id;
  }
  if (table === "tests") record.test_code ||= await nextReference("test", "T", 5);
  if (table === "orders") {
    record.order_number ||= await nextReference("lab_order", "ORD-", 6);
    record.ordered_by ||= session.user.id;
  }
  if (table === "order_tests") {
    record.sample_code ||= await nextReference("sample", "SMP-", 7);
    record.barcode_value ||= record.sample_code;
    record.qr_value ||= String(record.sample_code);
  }
  if (table === "invoices") record.invoice_number ||= await nextReference("invoice", "INV-", 6);
  if (table === "invoice_payments") record.receipt_number ||= await nextReference("receipt", "RCT-", 6);
  if (table === "clinical_encounters") {
    record.encounter_number ||= await nextReference("encounter", "ENC-", 7);
    record.created_by ||= session.user.id;
  }
  if (table === "encounter_charges") record.total_amount = Number(record.quantity || 1) * Number(record.unit_price || 0);
  if (table === "radiology_requests") {
    record.request_number ||= await nextReference("radiology", "RAD-", 7);
    record.requested_by ||= session.user.id;
  }
  if (table === "expenses") record.expense_date ||= new Date().toISOString().slice(0, 10);
  if (table === "calibration_logs") record.calibration_date ||= new Date().toISOString().slice(0, 10);
  if (table === "maintenance_logs") record.maintenance_date ||= new Date().toISOString().slice(0, 10);
  return record;
}

function buildFilters(filters: Filter[], allowedColumns: Set<string>) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  for (const filter of filters) {
    const columnName = filter.column.includes(".") ? filter.column.split(".").at(-1)! : filter.column;
    if (!allowedColumns.has(columnName) || filter.column.includes(".")) continue;
    const column = identifier(columnName);
    if (filter.operator === "in") {
      const values = Array.isArray(filter.value) ? filter.value : [];
      if (!values.length) { clauses.push("1 = 0"); continue; }
      clauses.push(`${column} IN (${values.map(() => "?").join(",")})`);
      params.push(...values);
    } else if (filter.operator === "is") {
      if (filter.value === null) clauses.push(`${column} IS NULL`);
      else { clauses.push(`${column} = ?`); params.push(filter.value ? 1 : 0); }
    } else {
      const operators = { eq: "=", neq: "<>", gte: ">=", lte: "<=", like: "LIKE", ilike: "LIKE" } as const;
      clauses.push(`${column} ${operators[filter.operator]} ?`);
      params.push(filter.value);
    }
  }
  return { clauses, params };
}

function buildOr(expression: string | null | undefined, allowedColumns: Set<string>) {
  if (!expression) return { clause: "", params: [] as unknown[] };
  const clauses: string[] = [];
  const params: unknown[] = [];
  for (const part of expression.split(",")) {
    const [columnName, operator, ...raw] = part.split(".");
    if (!allowedColumns.has(columnName) || !["eq", "ilike", "like"].includes(operator)) continue;
    clauses.push(`${identifier(columnName)} ${operator === "eq" ? "=" : "LIKE"} ?`);
    params.push(raw.join("."));
  }
  return { clause: clauses.length ? `(${clauses.join(" OR ")})` : "", params };
}

async function rowsByIds(table: string, ids: string[]) {
  if (!ids.length) return [] as Record<string, unknown>[];
  const [rows] = await getPool().query<RowDataPacket[]>(`SELECT * FROM ${identifier(table)} WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
  return rows as Record<string, unknown>[];
}

async function attachBelongs(rows: Record<string, unknown>[], property: string, target: string, foreignKey: string) {
  const ids = [...new Set(rows.map((row) => row[foreignKey]).filter(Boolean).map(String))];
  const related = await rowsByIds(target, ids);
  const index = new Map(related.map((row) => [String(row.id), row]));
  rows.forEach((row) => { row[property] = row[foreignKey] ? index.get(String(row[foreignKey])) ?? null : null; });
  return related;
}

async function attachMany(rows: Record<string, unknown>[], property: string, target: string, foreignKey: string) {
  const ids = rows.map((row) => String(row.id));
  if (!ids.length) return [] as Record<string, unknown>[];
  const [children] = await getPool().query<RowDataPacket[]>(`SELECT * FROM ${identifier(target)} WHERE ${identifier(foreignKey)} IN (${ids.map(() => "?").join(",")})`, ids);
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const child of children) {
    const key = String(child[foreignKey]);
    groups.set(key, [...(groups.get(key) ?? []), child as Record<string, unknown>]);
  }
  rows.forEach((row) => { row[property] = groups.get(String(row.id)) ?? []; });
  return children as Record<string, unknown>[];
}

async function hydrate(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return rows;
  if (facilityTables.has(table)) await attachBelongs(rows, "facilities", "facilities", "facility_id");
  if (["orders", "clinical_encounters", "admissions", "prescriptions", "encounter_charges", "radiology_requests"].includes(table)) await attachBelongs(rows, "patients", "patients", "patient_id");
  if (table === "orders") {
    const children = await attachMany(rows, "order_tests", "order_tests", "order_id");
    await attachBelongs(children, "tests", "tests", "test_id");
    const results = await attachMany(children, "__results", "order_test_results", "order_test_id");
    children.forEach((child) => { const values = child.__results as Record<string, unknown>[]; child.order_test_results = values[0] ?? null; delete child.__results; });
    void results;
  }
  if (table === "order_tests") {
    await attachBelongs(rows, "tests", "tests", "test_id");
    const parents = await attachBelongs(rows, "orders", "orders", "order_id");
    await attachBelongs(parents, "patients", "patients", "patient_id");
    await attachBelongs(parents, "facilities", "facilities", "facility_id");
    await attachMany(rows, "__results", "order_test_results", "order_test_id");
    rows.forEach((row) => { const values = row.__results as Record<string, unknown>[]; row.order_test_results = values[0] ?? null; delete row.__results; });
  }
  if (table === "invoices") {
    const orders = await attachBelongs(rows, "orders", "orders", "order_id");
    await attachBelongs(orders, "patients", "patients", "patient_id");
    await attachBelongs(orders, "facilities", "facilities", "facility_id");
    const items = await attachMany(rows, "invoice_items", "invoice_items", "invoice_id");
    const orderTests = await attachBelongs(items, "order_tests", "order_tests", "order_test_id");
    await attachBelongs(orderTests, "tests", "tests", "test_id");
    await attachMany(rows, "invoice_payments", "invoice_payments", "invoice_id");
  }
  if (table === "expenses") await attachBelongs(rows, "inventory_items", "inventory_items", "inventory_item_id");
  if (table === "qc_runs") await attachBelongs(rows, "qc_controls", "qc_controls", "control_id");
  if (["calibration_logs", "maintenance_logs"].includes(table)) await attachBelongs(rows, "analyzers", "analyzers", "analyzer_id");
  if (table === "wards") await attachMany(rows, "beds", "beds", "ward_id");
  if (table === "admissions") {
    await attachBelongs(rows, "wards", "wards", "ward_id");
    await attachBelongs(rows, "beds", "beds", "bed_id");
    await attachBelongs(rows, "clinical_encounters", "clinical_encounters", "encounter_id");
  }
  if (["prescriptions", "encounter_charges", "radiology_requests"].includes(table)) await attachBelongs(rows, "clinical_encounters", "clinical_encounters", "encounter_id");
  if (table === "prescriptions") await attachMany(rows, "prescription_items", "prescription_items", "prescription_id");
  if (table === "radiology_requests") {
    await attachBelongs(rows, "radiology_services", "radiology_services", "service_id");
    await attachMany(rows, "radiology_reports", "radiology_reports", "request_id");
  }
  return rows;
}

function removeSecrets(table: string, rows: Record<string, unknown>[]) {
  if (table === "profiles") rows.forEach((row) => delete row.password_hash);
  return rows;
}

type Selection = { key: string; nested?: Selection[]; wildcard?: boolean };

function parseSelection(columns = "*"): Selection[] {
  const tokens: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < columns.length; index += 1) {
    const character = columns[index];
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(depth - 1, 0);
    if (character === "," && depth === 0) {
      tokens.push(columns.slice(start, index).trim());
      start = index + 1;
    }
  }
  tokens.push(columns.slice(start).trim());
  return tokens.filter(Boolean).map((token) => {
    if (token === "*") return { key: "*", wildcard: true };
    const open = token.indexOf("(");
    const relation = (open >= 0 ? token.slice(0, open) : token).trim();
    const key = relation.includes(":") ? relation.split(":")[0].trim() : relation;
    return open >= 0
      ? { key, nested: parseSelection(token.slice(open + 1, token.lastIndexOf(")"))) }
      : { key };
  });
}

function projectRecord(row: Record<string, unknown>, selection: Selection[]): Record<string, unknown> {
  const output: Record<string, unknown> = selection.some((item) => item.wildcard) ? { ...row } : {};
  for (const item of selection) {
    if (item.wildcard || !(item.key in row)) continue;
    const value = row[item.key];
    if (item.nested && Array.isArray(value)) {
      output[item.key] = value.map((child) => projectRecord(child as Record<string, unknown>, item.nested!));
    } else if (item.nested && value && typeof value === "object") {
      output[item.key] = projectRecord(value as Record<string, unknown>, item.nested);
    } else output[item.key] = value;
  }
  return output;
}

function projectRows(rows: Record<string, unknown>[], columns?: string) {
  const selection = parseSelection(columns);
  return rows.map((row) => projectRecord(row, selection));
}

async function syncInvoice(orderId: string, actorId: string) {
  const pool = getPool();
  const [orders] = await pool.query<RowDataPacket[]>("SELECT * FROM orders WHERE id = ? LIMIT 1", [orderId]);
  const order = orders[0];
  if (!order) return;
  const [tests] = await pool.query<RowDataPacket[]>(
    `SELECT ot.id AS order_test_id, t.name, t.price FROM order_tests ot JOIN tests t ON t.id = ot.test_id WHERE ot.order_id = ?`, [orderId]
  );
  const [invoiceRows] = await pool.query<RowDataPacket[]>("SELECT * FROM invoices WHERE order_id = ? LIMIT 1", [orderId]);
  let invoice: Record<string, unknown> | undefined = invoiceRows[0];
  if (!invoice) {
    const id = randomUUID();
    const number = await nextReference("invoice", "INV-", 6);
    await pool.execute("INSERT INTO invoices (id, facility_id, order_id, invoice_number, created_by) VALUES (?, ?, ?, ?, ?)", [id, HOSPITAL_ID, orderId, number, actorId]);
    invoice = { id, discount_amount: 0, amount_paid: 0 };
  }
  for (const test of tests) {
    await pool.execute(
      `INSERT INTO invoice_items (id, invoice_id, order_test_id, test_name, quantity, unit_price, line_total)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE test_name = VALUES(test_name), unit_price = VALUES(unit_price), line_total = VALUES(line_total)`,
      [randomUUID(), invoice.id, test.order_test_id, test.name, test.price, test.price]
    );
  }
  const subtotal = tests.reduce((sum, test) => sum + Number(test.price), 0);
  const total = Math.max(subtotal - Number(invoice.discount_amount || 0), 0);
  const paid = Number(invoice.amount_paid || 0);
  const status = paid >= total && total > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
  await pool.execute("UPDATE invoices SET subtotal = ?, total_amount = ?, payment_status = ? WHERE id = ?", [subtotal, total, status, String(invoice.id)]);
}

async function afterInsert(table: string, records: Record<string, unknown>[], actorId: string) {
  if (table === "order_tests") for (const record of records) await syncInvoice(String(record.order_id), actorId);
  if (table === "radiology_requests") {
    for (const record of records) {
      const [services] = await getPool().query<RowDataPacket[]>("SELECT name, unit_price FROM radiology_services WHERE id = ? LIMIT 1", [String(record.service_id)]);
      const service = services[0];
      if (service) await getPool().execute(
        `INSERT IGNORE INTO encounter_charges (id, facility_id, patient_id, encounter_id, radiology_request_id, description, category, quantity, unit_price, total_amount, charged_by)
         VALUES (?, ?, ?, ?, ?, ?, 'Radiology', 1, ?, ?, ?)`,
        [randomUUID(), HOSPITAL_ID, record.patient_id, record.encounter_id || null, record.id, service.name, service.unit_price, service.unit_price, actorId]
      );
    }
  }
  if (table === "admissions") {
    for (const record of records) if (record.bed_id) await getPool().execute("UPDATE beds SET status = 'Occupied' WHERE id = ?", [String(record.bed_id)]);
  }
  if (table === "radiology_reports") {
    for (const record of records) await getPool().execute(
      "UPDATE radiology_requests SET status = 'Completed', completed_at = UTC_TIMESTAMP(3) WHERE id = ? AND facility_id = ?",
      [String(record.request_id), HOSPITAL_ID]
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: { message: "Sign in required." } }, { status: 401 });
    await migrateDatabase();
    const payload = await request.json() as QueryPayload;
    const table = payload.table || "";
    const operation = payload.operation || "select";
    if (!tables.has(table)) return NextResponse.json({ error: { message: "Unknown data resource." } }, { status: 400 });
    if (operation === "select" && !(readRoles[table] ?? []).includes(session.profile.role)) {
      return NextResponse.json({ error: { message: "Your staff role cannot view this hospital data." } }, { status: 403 });
    }
    if (table === "facilities" && operation !== "select") {
      return NextResponse.json({ error: { message: "This is a fixed single-hospital installation." } }, { status: 403 });
    }
    if (operation !== "select" && !(mutationRoles[table] ?? []).includes(session.profile.role)) {
      return NextResponse.json({ error: { message: "Your staff role cannot perform this action." } }, { status: 403 });
    }
    if (operation === "delete" && table !== "test_bundles") {
      return NextResponse.json({ error: { message: "Clinical and financial records cannot be deleted from the application." } }, { status: 403 });
    }
    if (table === "profiles" && session.profile.role !== "Admin") return NextResponse.json({ error: { message: "Admin access required." } }, { status: 403 });
    const allowedColumns = await columnsFor(table);
    const filters = buildFilters(payload.filters ?? [], allowedColumns);
    if (facilityTables.has(table)) { filters.clauses.push("`facility_id` = ?"); filters.params.push(HOSPITAL_ID); }
    const or = buildOr(payload.or, allowedColumns);
    if (or.clause) { filters.clauses.push(or.clause); filters.params.push(...or.params); }
    const where = filters.clauses.length ? ` WHERE ${filters.clauses.join(" AND ")}` : "";
    const pool = getPool();

    if (operation === "select") {
      let sql = `SELECT * FROM ${identifier(table)}${where}`;
      if (payload.order && allowedColumns.has(payload.order.column)) sql += ` ORDER BY ${identifier(payload.order.column)} ${payload.order.ascending ? "ASC" : "DESC"}`;
      if (payload.range) sql += ` LIMIT ${Math.max(payload.range[1] - payload.range[0] + 1, 1)} OFFSET ${Math.max(payload.range[0], 0)}`;
      else if (payload.limit) sql += ` LIMIT ${Math.min(Math.max(payload.limit, 1), 2000)}`;
      const [rawRows] = await pool.query<RowDataPacket[]>(sql, filters.params as never[]);
      const rows = projectRows(removeSecrets(table, await hydrate(table, rawRows as Record<string, unknown>[])), payload.columns);
      return NextResponse.json({ data: payload.single ? rows[0] ?? null : rows, error: null });
    }

    if (operation === "insert" || operation === "upsert") {
      const inputs = (Array.isArray(payload.values) ? payload.values : [payload.values]).filter(Boolean) as Record<string, unknown>[];
      const records: Record<string, unknown>[] = [];
      for (const input of inputs) records.push(await prepareRecord(table, input, session));
      for (const record of records) {
        const entries = Object.entries(record).filter(([key]) => allowedColumns.has(key));
        const names = entries.map(([key]) => identifier(key));
        const values = entries.map(([, value]) => jsonValue(value));
        let sql = `INSERT INTO ${identifier(table)} (${names.join(",")}) VALUES (${values.map(() => "?").join(",")})`;
        if (operation === "upsert") {
          const updates = entries.filter(([key]) => key !== (payload.onConflict || "id")).map(([key]) => `${identifier(key)} = VALUES(${identifier(key)})`);
          sql += ` ON DUPLICATE KEY UPDATE ${updates.join(",") || `${identifier(payload.onConflict || "id")} = ${identifier(payload.onConflict || "id")}`}`;
        }
        await pool.execute(sql, values as never[]);
      }
      await afterInsert(table, records, session.user.id);
      const ids = records.map((record) => String(record.id)).filter(Boolean);
      let rows: Record<string, unknown>[];
      if (table === "lab_branding_settings") {
        const [branding] = await pool.query<RowDataPacket[]>("SELECT * FROM lab_branding_settings WHERE facility_id = ?", [HOSPITAL_ID]);
        rows = branding as Record<string, unknown>[];
      } else rows = await rowsByIds(table, ids);
      rows = projectRows(removeSecrets(table, await hydrate(table, rows)), payload.columns);
      return NextResponse.json({ data: payload.single ? rows[0] ?? null : rows, error: null });
    }

    if (!filters.clauses.length) return NextResponse.json({ error: { message: "A filter is required for updates and deletes." } }, { status: 400 });
    if (operation === "update") {
      const values = (payload.values || {}) as Record<string, unknown>;
      const entries = Object.entries(values).filter(([key]) => allowedColumns.has(key) && !["id", "facility_id", "password_hash"].includes(key));
      if (!entries.length) return NextResponse.json({ data: [], error: null });
      const set = entries.map(([key]) => `${identifier(key)} = ?`).join(",");
      const parameters = [...entries.map(([, value]) => jsonValue(value)), ...filters.params];
      await pool.execute(`UPDATE ${identifier(table)} SET ${set}${where}`, parameters as never[]);
      const [rawRows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ${identifier(table)}${where}`, filters.params as never[]);
      const rows = projectRows(removeSecrets(table, await hydrate(table, rawRows as Record<string, unknown>[])), payload.columns);
      if (table === "order_tests") for (const row of rows) await syncInvoice(String(row.order_id), session.user.id);
      if (table === "admissions") {
        for (const row of rows) if (row.bed_id) await pool.execute(
          "UPDATE beds SET status = ? WHERE id = ?",
          [row.status === "Admitted" ? "Occupied" : "Available", String(row.bed_id)]
        );
      }
      return NextResponse.json({ data: payload.single ? rows[0] ?? null : rows, error: null });
    }

    const [result] = await pool.execute<ResultSetHeader>(`DELETE FROM ${identifier(table)}${where}`, filters.params as never[]);
    return NextResponse.json({ data: { deleted: result.affectedRows }, error: null });
  } catch (error) {
    const databaseError = error as { code?: string };
    console.error("[data-api]", error);
    const message = databaseError.code === "ER_DUP_ENTRY"
      ? "A matching record already exists."
      : databaseError.code
        ? "The request could not be completed."
        : error instanceof Error
          ? error.message
          : "The request could not be completed.";
    return NextResponse.json({ error: { message }, data: null }, { status: 500 });
  }
}
