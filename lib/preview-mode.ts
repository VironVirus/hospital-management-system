import { randomUUID } from "node:crypto";
import { HOSPITAL_ID } from "@/lib/db/schema";
import type { AppSession } from "@/lib/auth-session";

type PreviewRow = Record<string, unknown>;
type PreviewFilter = { column: string; operator: string; value: unknown };
type PreviewPayload = {
  table?: string;
  operation?: "select" | "insert" | "update" | "upsert" | "delete";
  values?: unknown;
  filters?: PreviewFilter[];
  order?: { column: string; ascending: boolean } | null;
  limit?: number | null;
  range?: [number, number] | null;
  or?: string | null;
  single?: boolean;
};

type PreviewState = {
  tables: Record<string, PreviewRow[]>;
  patientCounter: number;
  encounterCounter: number;
  orderCounter: number;
  invoiceCounter: number;
  radiologyCounter: number;
};

declare global {
  var __stGiannaPreviewState: PreviewState | undefined;
}

const previewFacility = {
  id: HOSPITAL_ID,
  name: "St Gianna Specialist Hospital",
  code: "ST-GIANNA",
  address: "No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State",
  is_active: true
};

function numericRange(min: number | null, max: number | null) {
  return { mode: "numeric", min, max, text: null, options: null, positive_label: null, negative_label: null };
}

function createPreviewState(): PreviewState {
  const now = new Date().toISOString();
  const patient = {
    id: "preview-patient-1",
    facility_id: HOSPITAL_ID,
    hospital_id: "SGH-2026-001004",
    lab_id: "SGH-2026-001004",
    name: "Adaeze Okafor",
    phone: "08030000001",
    dob: "1991-04-18",
    sex: "Female",
    state: "Enugu",
    lga: "Enugu North",
    ndpr_consent: true,
    created_at: now,
    updated_at: now
  };
  const tests = [
    ["preview-test-1", "HE00001", "Full Blood Count", "Haematology", 6500, "panel", "cells/L"],
    ["preview-test-2", "HE00002", "Erythrocyte Sedimentation Rate", "Haematology", 3500, "numeric", "mm/hr"],
    ["preview-test-3", "BL00001", "Blood Group and Rhesus Factor", "Blood Group Serology", 3000, "text", null],
    ["preview-test-4", "MI00001", "Urinalysis", "Microbiology", 4000, "text", null],
    ["preview-test-5", "CH00001", "Liver Function Test", "Chemical Pathology", 12000, "panel", null],
    ["preview-test-6", "CH00002", "Fasting Blood Sugar", "Chemical Pathology", 2500, "numeric", "mmol/L"],
    ["preview-test-7", "HI00001", "Histology Examination", "Histopathology", 25000, "text", null]
  ].map(([id, test_code, name, category, price, result_type, unit], index) => ({
    id,
    facility_id: HOSPITAL_ID,
    test_code,
    name,
    category,
    price,
    result_type,
    unit,
    is_active: true,
    reference_range: result_type === "numeric"
      ? numericRange(index === 5 ? 3.9 : 0, index === 5 ? 5.5 : 20)
      : result_type === "panel"
        ? { mode: "panel", min: null, max: null, text: null, options: null, positive_label: null, negative_label: null, parameters: [] }
        : { mode: "text", min: null, max: null, text: "Report finding", options: null, positive_label: null, negative_label: null },
    facilities: previewFacility,
    created_at: now,
    updated_at: now
  }));
  const encounter = {
    id: "preview-encounter-1",
    facility_id: HOSPITAL_ID,
    patient_id: patient.id,
    encounter_number: "ENC-0001042",
    encounter_type: "Outpatient",
    status: "Open",
    presenting_complaint: null,
    attending_clinician: null,
    started_at: now,
    ended_at: null,
    patients: patient
  };
  const charge = {
    id: "preview-charge-1",
    facility_id: HOSPITAL_ID,
    patient_id: patient.id,
    encounter_id: encounter.id,
    description: "Consultation",
    category: "Consultation",
    quantity: 1,
    unit_price: 15000,
    total_amount: 15000,
    amount_paid: 5000,
    payment_status: "Partial",
    charged_at: now,
    created_at: now,
    patients: patient,
    clinical_encounters: { id: encounter.id, encounter_number: encounter.encounter_number }
  };
  const order = {
    id: "preview-order-1",
    facility_id: HOSPITAL_ID,
    patient_id: patient.id,
    order_number: "ORD-001120",
    status: "Registered",
    priority: "routine",
    ordered_at: now,
    patients: patient
  };
  const invoice = {
    id: "preview-invoice-1",
    facility_id: HOSPITAL_ID,
    order_id: order.id,
    invoice_number: "INV-001120",
    subtotal: 10000,
    discount_amount: 0,
    total_amount: 10000,
    amount_paid: 10000,
    payment_status: "Paid",
    notes: null,
    issued_at: now,
    due_at: null,
    created_at: now,
    updated_at: now,
    orders: order,
    invoice_items: [
      { id: "preview-invoice-item-1", invoice_id: "preview-invoice-1", order_test_id: "preview-order-test-1", test_name: "Full Blood Count", quantity: 1, unit_price: 6500, line_total: 6500, created_at: now, order_tests: { test_id: "preview-test-1", tests: tests[0] } },
      { id: "preview-invoice-item-2", invoice_id: "preview-invoice-1", order_test_id: "preview-order-test-2", test_name: "Erythrocyte Sedimentation Rate", quantity: 1, unit_price: 3500, line_total: 3500, created_at: now, order_tests: { test_id: "preview-test-2", tests: tests[1] } }
    ],
    invoice_payments: [
      { id: "preview-payment-1", facility_id: HOSPITAL_ID, invoice_id: "preview-invoice-1", receipt_number: "RCT-001120", amount: 10000, payment_method: "Cash", reference_number: null, notes: null, received_at: now, created_at: now }
    ]
  };
  return {
    patientCounter: 1004,
    encounterCounter: 1042,
    orderCounter: 1120,
    invoiceCounter: 1120,
    radiologyCounter: 420,
    tables: {
      facilities: [previewFacility],
      profiles: [],
      patients: [patient],
      tests,
      test_bundles: [],
      orders: [order],
      order_tests: [],
      sample_custody_logs: [],
      order_test_results: [],
      invoices: [invoice],
      invoice_items: invoice.invoice_items as PreviewRow[],
      invoice_payments: invoice.invoice_payments as PreviewRow[],
      inventory_items: [],
      inventory_transactions: [],
      expenses: [],
      audit_logs: [],
      lab_branding_settings: [{ facility_id: HOSPITAL_ID, lab_name: previewFacility.name, address: previewFacility.address }],
      wards: [],
      beds: [],
      clinical_encounters: [encounter],
      admissions: [],
      vital_signs: [],
      clinical_notes: [],
      diagnoses: [],
      medications: [
        { id: "preview-med-1", facility_id: HOSPITAL_ID, generic_name: "Paracetamol", brand_name: null, strength: "500 mg", dosage_form: "Tablet", route: "Oral", unit: "tablets", unit_price: 100, quantity_on_hand: 250, reorder_level: 30, is_active: true },
        { id: "preview-med-2", facility_id: HOSPITAL_ID, generic_name: "Amoxicillin", brand_name: null, strength: "500 mg", dosage_form: "Capsule", route: "Oral", unit: "capsules", unit_price: 250, quantity_on_hand: 120, reorder_level: 20, is_active: true }
      ],
      prescriptions: [],
      prescription_items: [],
      encounter_charges: [charge],
      hospital_payments: [{ id: "preview-hospital-payment-1", facility_id: HOSPITAL_ID, charge_id: charge.id, patient_id: patient.id, amount: 5000, payment_method: "POS", reference_number: null, notes: null, received_at: now, created_at: now }],
      radiology_services: [
        { id: "preview-radio-1", facility_id: HOSPITAL_ID, name: "Chest X-Ray", modality: "X-Ray", body_part: "Chest", unit_price: 10000, is_active: true },
        { id: "preview-radio-2", facility_id: HOSPITAL_ID, name: "Abdominal Ultrasound", modality: "Ultrasound", body_part: "Abdomen", unit_price: 18000, is_active: true }
      ],
      radiology_requests: [],
      radiology_reports: [],
      qc_controls: [],
      qc_runs: [],
      analyzers: [],
      calibration_logs: [],
      maintenance_logs: []
    }
  };
}

function state() {
  global.__stGiannaPreviewState ??= createPreviewState();
  return global.__stGiannaPreviewState;
}

export function isPreviewMode() {
  return process.env.NODE_ENV !== "production" && process.env.HMS_PREVIEW_MODE === "1";
}

export function getPreviewSession(): AppSession {
  const now = new Date();
  const email = process.env.HMS_ADMIN_EMAIL?.trim().toLowerCase() || "admin@stgianna.preview";
  return {
    user: { id: "preview-admin", email },
    profile: {
      id: "preview-admin",
      display_name: process.env.HMS_ADMIN_NAME?.trim() || "Hospital Administrator",
      email,
      facility_id: HOSPITAL_ID,
      role: "Admin",
      approval_status: "Approved",
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    },
    facilityName: previewFacility.name,
    expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString()
  };
}

function comparable(value: unknown) {
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function matchesFilter(row: PreviewRow, filter: PreviewFilter) {
  const value = row[filter.column.split(".").at(-1) || filter.column];
  const expected = filter.value;
  if (filter.operator === "eq") return comparable(value) === comparable(expected);
  if (filter.operator === "neq") return comparable(value) !== comparable(expected);
  if (filter.operator === "in") return Array.isArray(expected) && expected.map(comparable).includes(comparable(value));
  if (filter.operator === "is") return expected === null ? value == null : comparable(value) === comparable(expected);
  if (filter.operator === "gte") return String(value ?? "") >= String(expected ?? "");
  if (filter.operator === "lte") return String(value ?? "") <= String(expected ?? "");
  if (filter.operator === "like" || filter.operator === "ilike") {
    return String(value ?? "").toLowerCase().includes(String(expected ?? "").replaceAll("%", "").toLowerCase());
  }
  return true;
}

function matchesOr(row: PreviewRow, expression?: string | null) {
  if (!expression) return true;
  return expression.split(",").some((part) => {
    const [column, operator, ...rest] = part.split(".");
    return matchesFilter(row, { column, operator, value: rest.join(".") });
  });
}

export function handlePreviewData(payload: PreviewPayload) {
  const preview = state();
  const table = payload.table || "";
  const rows = preview.tables[table] ?? (preview.tables[table] = []);
  const operation = payload.operation || "select";
  const filters = payload.filters ?? [];
  if (operation === "select") {
    let selected = rows.filter((row) => filters.every((filter) => matchesFilter(row, filter)) && matchesOr(row, payload.or));
    if (payload.order?.column) {
      const { column, ascending } = payload.order;
      selected = [...selected].sort((left, right) => String(left[column] ?? "").localeCompare(String(right[column] ?? "")) * (ascending ? 1 : -1));
    }
    if (payload.range) selected = selected.slice(payload.range[0], payload.range[1] + 1);
    else if (payload.limit) selected = selected.slice(0, payload.limit);
    return { data: payload.single ? selected[0] ?? null : selected, error: null };
  }

  const values = (Array.isArray(payload.values) ? payload.values : [payload.values]).filter(Boolean) as PreviewRow[];
  if (operation === "insert") {
    const inserted = values.map((value) => ({ id: value.id || randomUUID(), facility_id: HOSPITAL_ID, ...value }));
    rows.push(...inserted);
    return { data: payload.single ? inserted[0] ?? null : inserted, error: null };
  }
  if (operation === "update") {
    const updated: PreviewRow[] = [];
    rows.forEach((row, index) => {
      if (filters.every((filter) => matchesFilter(row, filter))) {
        rows[index] = { ...row, ...(values[0] ?? {}) };
        updated.push(rows[index]);
      }
    });
    return { data: payload.single ? updated[0] ?? null : updated, error: null };
  }
  if (operation === "delete") {
    const kept = rows.filter((row) => !filters.every((filter) => matchesFilter(row, filter)));
    preview.tables[table] = kept;
    return { data: null, error: null };
  }
  if (operation === "upsert") {
    for (const value of values) {
      const index = rows.findIndex((row) => row.id === value.id);
      if (index >= 0) rows[index] = { ...rows[index], ...value };
      else rows.push({ id: value.id || randomUUID(), facility_id: HOSPITAL_ID, ...value });
    }
    return { data: values, error: null };
  }
  return { data: null, error: null };
}

function attachChargeRelations(charge: PreviewRow, patient: PreviewRow, encounter: PreviewRow | null) {
  charge.patients = patient;
  charge.clinical_encounters = encounter ? { id: encounter.id, encounter_number: encounter.encounter_number } : null;
  return charge;
}

export function handlePreviewRpc(name: string, args: Record<string, unknown>) {
  const preview = state();
  if (name === "search_patients") {
    const term = String(args.search_term || "").trim().toLowerCase();
    const page = Math.max(Number(args.page_number || 1), 1);
    const size = Math.max(Number(args.page_size || 20), 1);
    const matches = preview.tables.patients.filter((patient) => !term || [patient.name, patient.phone, patient.hospital_id, patient.lab_id].filter(Boolean).join(" ").toLowerCase().includes(term));
    return { data: matches.slice((page - 1) * size, page * size).map((patient) => ({ ...patient, current_ward: null, admission_date: null, order_count: preview.tables.orders.filter((order) => order.patient_id === patient.id).length, total_count: matches.length, similarity_score: 1 })), error: null };
  }

  if (name === "register_patient_with_services") {
    const input = (args.patient && typeof args.patient === "object" ? args.patient : {}) as PreviewRow;
    const now = new Date().toISOString();
    const patientId = randomUUID();
    const hospitalId = String(input.lab_id || `SGH-2026-${String(++preview.patientCounter).padStart(6, "0")}`);
    const patient = { ...input, id: patientId, facility_id: HOSPITAL_ID, hospital_id: hospitalId, lab_id: hospitalId, created_at: now, updated_at: now };
    preview.tables.patients.unshift(patient);
    const hasServices = Boolean(args.book_consultation) || (Array.isArray(args.lab_test_ids) && args.lab_test_ids.length > 0) || (Array.isArray(args.medication_requests) && args.medication_requests.length > 0) || Boolean(args.radiology_service_id);
    const encounter = hasServices ? {
      id: randomUUID(), facility_id: HOSPITAL_ID, patient_id: patientId, encounter_number: `ENC-${String(++preview.encounterCounter).padStart(7, "0")}`, encounter_type: "Outpatient", status: "Open", presenting_complaint: null, attending_clinician: null, started_at: now, ended_at: null, patients: patient
    } : null;
    if (encounter) preview.tables.clinical_encounters.unshift(encounter);
    const addCharge = (description: string, category: string, quantity: number, unitPrice: number) => {
      const total = quantity * unitPrice;
      preview.tables.encounter_charges.unshift(attachChargeRelations({ id: randomUUID(), facility_id: HOSPITAL_ID, patient_id: patientId, encounter_id: encounter?.id ?? null, description, category, quantity, unit_price: unitPrice, total_amount: total, amount_paid: 0, payment_status: total > 0 ? "Unpaid" : "Paid", charged_at: now, created_at: now }, patient, encounter));
    };
    if (args.bill_registration) addCharge("Patient registration", "Registration", 1, Number(args.registration_fee || 0));
    if (args.book_consultation) addCharge("Consultation", "Consultation", 1, Number(args.consultation_fee || 0));
    for (const request of (Array.isArray(args.medication_requests) ? args.medication_requests : []) as PreviewRow[]) {
      const medication = preview.tables.medications.find((item) => item.id === request.medication_id);
      if (medication) addCharge(`${medication.generic_name} ${medication.strength}`, "Medication", Number(request.quantity || 1), Number(medication.unit_price || 0));
    }
    let orderNumber: string | null = null;
    let invoiceNumber: string | null = null;
    const testIds = Array.isArray(args.lab_test_ids) ? args.lab_test_ids.map(String) : [];
    if (testIds.length) {
      const selectedTests = preview.tables.tests.filter((test) => testIds.includes(String(test.id)));
      const orderId = randomUUID();
      orderNumber = `ORD-${String(++preview.orderCounter).padStart(6, "0")}`;
      const order = { id: orderId, facility_id: HOSPITAL_ID, patient_id: patientId, order_number: orderNumber, status: "Registered", priority: "routine", ordered_at: now, patients: patient };
      preview.tables.orders.unshift(order);
      invoiceNumber = `INV-${String(++preview.invoiceCounter).padStart(6, "0")}`;
      const invoiceItems = selectedTests.map((test) => ({ id: randomUUID(), invoice_id: "", order_test_id: randomUUID(), test_name: test.name, quantity: 1, unit_price: Number(test.price || 0), line_total: Number(test.price || 0), created_at: now, order_tests: { test_id: test.id, tests: test } }));
      const total = invoiceItems.reduce((sum, item) => sum + item.line_total, 0);
      const invoiceId = randomUUID();
      invoiceItems.forEach((item) => { item.invoice_id = invoiceId; });
      preview.tables.invoices.unshift({ id: invoiceId, facility_id: HOSPITAL_ID, order_id: orderId, invoice_number: invoiceNumber, subtotal: total, discount_amount: 0, total_amount: total, amount_paid: 0, payment_status: total > 0 ? "Unpaid" : "Paid", notes: null, issued_at: now, due_at: null, created_at: now, updated_at: now, orders: order, invoice_items: invoiceItems, invoice_payments: [] });
    }
    let radiologyRequestNumber: string | null = null;
    if (args.radiology_service_id) {
      const service = preview.tables.radiology_services.find((item) => item.id === args.radiology_service_id);
      if (service) {
        radiologyRequestNumber = `RAD-${String(++preview.radiologyCounter).padStart(7, "0")}`;
        preview.tables.radiology_requests.unshift({ id: randomUUID(), facility_id: HOSPITAL_ID, request_number: radiologyRequestNumber, patient_id: patientId, encounter_id: encounter?.id ?? null, service_id: service.id, clinical_indication: args.radiology_indication || "Requested during registration", priority: "Routine", status: "Requested", requested_at: now, patients: patient, clinical_encounters: encounter, radiology_services: service, radiology_reports: [] });
        addCharge(String(service.name), "Radiology", 1, Number(service.unit_price || 0));
      }
    }
    return { data: { patient_id: patientId, hospital_id: hospitalId, encounter_id: encounter?.id ?? null, encounter_number: encounter?.encounter_number ?? null, order_number: orderNumber, invoice_number: invoiceNumber, radiology_request_number: radiologyRequestNumber }, error: null };
  }

  if (name === "record_hospital_payment") {
    const charge = preview.tables.encounter_charges.find((item) => item.id === args.target_charge_id);
    if (charge) {
      charge.amount_paid = Number(charge.amount_paid || 0) + Number(args.amount_value || 0);
      charge.payment_status = Number(charge.amount_paid) >= Number(charge.total_amount) ? "Paid" : "Partial";
      preview.tables.hospital_payments.unshift({ id: randomUUID(), facility_id: HOSPITAL_ID, charge_id: charge.id, patient_id: charge.patient_id, amount: Number(args.amount_value || 0), payment_method: args.payment_method_value || "Cash", reference_number: args.reference_number_value || null, notes: args.notes_value || null, received_at: new Date().toISOString() });
    }
    return { data: randomUUID(), error: null };
  }

  return { data: null, error: null };
}
