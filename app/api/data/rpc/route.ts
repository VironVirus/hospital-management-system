import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getCurrentSession, isPreviewSession } from "@/lib/auth-session";
import { getPool, nextCounter, withTransaction } from "@/lib/db";
import { HOSPITAL_ID } from "@/lib/db/schema";
import {
  calculateMedicationQuantity,
  getMedicationFrequency,
  medicationDoseCount
} from "@/lib/medication-schedule";

function response(data: unknown = null) {
  return NextResponse.json({ data, error: null });
}

function moneyStatus(paid: number, total: number) {
  return paid >= total && total > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
}

function forbidden() {
  return NextResponse.json({ data: null, error: { message: "Your staff role cannot perform this action." } }, { status: 403 });
}

function prescriptionSchedule(item: Record<string, unknown>) {
  const frequency = getMedicationFrequency(String(item.frequency_code || item.frequency || ""));
  const durationDays = Math.trunc(Number(item.duration_days || Number.parseInt(String(item.duration || ""), 10)));
  const unitsPerDose = Number(item.units_per_dose || 1);
  if (!frequency) throw new Error("Select a medication frequency from the list.");
  if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 90) {
    throw new Error("Treatment duration must be between 1 and 90 days.");
  }
  if (!Number.isFinite(unitsPerDose) || unitsPerDose <= 0 || unitsPerDose > 100) {
    throw new Error("Units per dose must be greater than zero.");
  }
  return {
    frequency,
    durationDays,
    unitsPerDose,
    duration: `${durationDays} day${durationDays === 1 ? "" : "s"}`,
    quantity: calculateMedicationQuantity(unitsPerDose, frequency.code, durationDays),
    doseCount: medicationDoseCount(frequency.code, durationDays)
  };
}

async function createAdministrationSchedule(input: {
  connection: PoolConnection;
  admissionId: string | null;
  patientId: string;
  encounterId: string;
  prescriptionId: string;
  prescriptionItemId: string;
  frequencyCode: string;
  durationDays: number;
  firstDoseAt: Date;
}) {
  if (!input.admissionId) return;
  const frequency = getMedicationFrequency(input.frequencyCode);
  if (!frequency) return;
  const doseCount = medicationDoseCount(frequency.code, input.durationDays);
  for (let doseIndex = 0; doseIndex < doseCount; doseIndex += 1) {
    const scheduledAt = new Date(
      input.firstDoseAt.getTime() + doseIndex * frequency.intervalHours * 60 * 60 * 1000
    );
    await input.connection.execute(
      `INSERT IGNORE INTO medication_administrations
        (id, facility_id, patient_id, encounter_id, admission_id, prescription_id, prescription_item_id, scheduled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), HOSPITAL_ID, input.patientId, input.encounterId, input.admissionId, input.prescriptionId, input.prescriptionItemId, scheduledAt]
    );
  }
}

export async function POST(request: Request) {
  let previewSession = false;
  let name = "";

  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ data: null, error: { message: "Sign in required." } }, { status: 401 });
    previewSession = isPreviewSession(session);
    const currentSession = session;
    const payload = await request.json().catch(() => null) as { name?: string; args?: Record<string, unknown> } | null;
    name = payload?.name || "";
    const args = payload?.args || {};
    const pool = getPool();

    if (name === "search_patients") {
      if (currentSession.profile.role === "Storekeeper") return forbidden();
      const term = String(args.search_term || "").trim();
      const page = Math.max(Number(args.page_number || 1), 1);
      const size = Math.min(Math.max(Number(args.page_size || 10), 1), 100);
      const like = `%${term}%`;
      const where = term ? "AND (p.name LIKE ? OR p.phone LIKE ? OR p.hospital_id LIKE ? OR p.lab_id LIKE ?)" : "";
      const params = term ? [HOSPITAL_ID, like, like, like, like] : [HOSPITAL_ID];
      const [counts] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM patients p WHERE p.facility_id = ? ${where}`, params);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT p.*, w.name AS current_ward, a.admitted_at AS admission_date,
          (SELECT COUNT(*) FROM orders o WHERE o.patient_id = p.id) AS order_count
         FROM patients p
         LEFT JOIN admissions a ON a.patient_id = p.id AND a.status = 'Admitted'
         LEFT JOIN wards w ON w.id = a.ward_id
         WHERE p.facility_id = ? ${where}
         ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
        [...params, size, (page - 1) * size]
      );
      return response(rows.map((row) => ({ ...row, total_count: Number(counts[0]?.total || 0), similarity_score: 1 })));
    }

    if (name === "register_patient_with_services") {
      if (!["Admin", "Receptionist"].includes(currentSession.profile.role)) return forbidden();
      const patient = (args.patient && typeof args.patient === "object" ? args.patient : {}) as Record<string, unknown>;
      const patientName = String(patient.name || "").trim();
      if (patientName.length < 2) throw new Error("Enter the patient's full name.");
      if (!patient.ndpr_consent) throw new Error("Patient consent is required before registration.");

      const labTestIds = [...new Set((Array.isArray(args.lab_test_ids) ? args.lab_test_ids : []).map(String).filter(Boolean))];
      const medicationRequests = (Array.isArray(args.medication_requests) ? args.medication_requests : []) as Array<Record<string, unknown>>;
      const radiologyServiceId = String(args.radiology_service_id || "").trim();
      const bookConsultation = Boolean(args.book_consultation);
      const billRegistration = Boolean(args.bill_registration);
      const registrationFee = Math.max(Number(args.registration_fee || 0), 0);
      const consultationFee = Math.max(Number(args.consultation_fee || 0), 0);
      if (labTestIds.length > 100 || medicationRequests.length > 30) throw new Error("Too many services were selected at once.");

      const data = await withTransaction(async (connection) => {
        const patientId = randomUUID();
        const enteredHospitalId = String(patient.lab_id || patient.hospital_id || "").trim();
        const hospitalId = enteredHospitalId || `SGH-${new Date().getUTCFullYear()}-${String(await nextCounter("hospital_patient", connection)).padStart(6, "0")}`;
        const nullable = (value: unknown) => String(value || "").trim() || null;
        await connection.execute(
          `INSERT INTO patients
            (id, facility_id, hospital_id, lab_id, name, phone, dob, sex, address, email, emergency_contact, national_id, lga, state, ndpr_consent, ndpr_consent_at, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, UTC_TIMESTAMP(3), ?, ?)`,
          [patientId, HOSPITAL_ID, hospitalId, hospitalId, patientName, nullable(patient.phone), nullable(patient.dob), nullable(patient.sex), nullable(patient.address), nullable(patient.email), nullable(patient.emergency_contact), nullable(patient.national_id), nullable(patient.lga), nullable(patient.state), nullable(patient.notes), currentSession.user.id]
        );

        const needsEncounter = bookConsultation || labTestIds.length > 0 || medicationRequests.length > 0 || Boolean(radiologyServiceId);
        const encounterId = needsEncounter ? randomUUID() : null;
        const encounterNumber = needsEncounter
          ? `ENC-${String(await nextCounter("encounter", connection)).padStart(7, "0")}`
          : null;
        if (encounterId && encounterNumber) {
          await connection.execute(
            "INSERT INTO clinical_encounters (id, facility_id, patient_id, encounter_number, encounter_type, status, created_by) VALUES (?, ?, ?, ?, 'Outpatient', 'Open', ?)",
            [encounterId, HOSPITAL_ID, patientId, encounterNumber, currentSession.user.id]
          );
        }

        const createCharge = async (input: { id?: string; description: string; category: string; quantity?: number; unitPrice: number; radiologyRequestId?: string | null }) => {
          const quantity = Math.max(Number(input.quantity || 1), 0);
          const total = quantity * Math.max(Number(input.unitPrice || 0), 0);
          await connection.execute(
            `INSERT INTO encounter_charges
              (id, facility_id, patient_id, encounter_id, radiology_request_id, description, category, quantity, unit_price, total_amount, payment_status, charged_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [input.id || randomUUID(), HOSPITAL_ID, patientId, encounterId, input.radiologyRequestId || null, input.description, input.category, quantity, input.unitPrice, total, total > 0 ? "Unpaid" : "Paid", currentSession.user.id]
          );
        };

        if (billRegistration) {
          await createCharge({ description: "Patient registration", category: "Registration", unitPrice: registrationFee });
        }
        if (bookConsultation) {
          await createCharge({ description: "Consultation", category: "Consultation", unitPrice: consultationFee });
        }

        let orderNumber: string | null = null;
        let invoiceNumber: string | null = null;
        if (labTestIds.length) {
          const placeholders = labTestIds.map(() => "?").join(",");
          const [tests] = await connection.query<RowDataPacket[]>(
            `SELECT id, name, price FROM tests WHERE id IN (${placeholders}) AND facility_id = ? AND is_active = 1 ORDER BY name`,
            [...labTestIds, HOSPITAL_ID]
          );
          if (tests.length !== labTestIds.length) throw new Error("One or more laboratory tests are unavailable.");
          const orderId = randomUUID();
          orderNumber = `ORD-${String(await nextCounter("lab_order", connection)).padStart(6, "0")}`;
          await connection.execute(
            "INSERT INTO orders (id, facility_id, order_number, patient_id, status, priority, notes, ordered_by) VALUES (?, ?, ?, ?, 'Registered', 'routine', ?, ?)",
            [orderId, HOSPITAL_ID, orderNumber, patientId, encounterNumber ? `Registration handoff · ${encounterNumber}` : "Registration handoff", currentSession.user.id]
          );
          const orderTests: Array<{ id: string; name: string; price: number }> = [];
          for (const test of tests) {
            const orderTestId = randomUUID();
            const sampleCode = `SMP-${String(await nextCounter("sample", connection)).padStart(7, "0")}`;
            await connection.execute(
              "INSERT INTO order_tests (id, order_id, test_id, specimen_label, status, sample_code, barcode_value, qr_value) VALUES (?, ?, ?, ?, 'Registered', ?, ?, ?)",
              [orderTestId, orderId, test.id, test.name, sampleCode, sampleCode, sampleCode]
            );
            orderTests.push({ id: orderTestId, name: String(test.name), price: Number(test.price || 0) });
          }
          const subtotal = orderTests.reduce((sum, test) => sum + test.price, 0);
          const invoiceId = randomUUID();
          invoiceNumber = `INV-${String(await nextCounter("invoice", connection)).padStart(6, "0")}`;
          await connection.execute(
            "INSERT INTO invoices (id, facility_id, order_id, invoice_number, subtotal, total_amount, payment_status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [invoiceId, HOSPITAL_ID, orderId, invoiceNumber, subtotal, subtotal, subtotal > 0 ? "Unpaid" : "Paid", currentSession.user.id]
          );
          for (const test of orderTests) await connection.execute(
            "INSERT INTO invoice_items (id, invoice_id, order_test_id, test_name, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, 1, ?, ?)",
            [randomUUID(), invoiceId, test.id, test.name, test.price, test.price]
          );
        }

        let prescriptionId: string | null = null;
        if (medicationRequests.length) {
          const medicationIds = [...new Set(medicationRequests.map((item) => String(item.medication_id || "")).filter(Boolean))];
          const placeholders = medicationIds.map(() => "?").join(",");
          const [medications] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM medications WHERE id IN (${placeholders}) AND facility_id = ? AND is_active = 1`,
            [...medicationIds, HOSPITAL_ID]
          );
          const medicationIndex = new Map(medications.map((item) => [String(item.id), item]));
          if (medicationIndex.size !== medicationIds.length) throw new Error("One or more medications are unavailable.");
          if (!encounterId) throw new Error("A patient visit is required for a pharmacy request.");
          prescriptionId = randomUUID();
          await connection.execute(
            "INSERT INTO prescriptions (id, facility_id, patient_id, encounter_id, status, notes, prescribed_by) VALUES (?, ?, ?, ?, 'Pending', ?, ?)",
            [prescriptionId, HOSPITAL_ID, patientId, encounterId, "Created during patient registration", currentSession.user.id]
          );
          for (const item of medicationRequests) {
            const medication = medicationIndex.get(String(item.medication_id || ""));
            if (!medication) throw new Error("Select a medication from the hospital list.");
            const dose = String(item.dose || "").trim();
            if (!dose) throw new Error(`Enter the dose for ${medication.generic_name}.`);
            const schedule = prescriptionSchedule(item);
            const prescriptionItemId = randomUUID();
            const medicationName = [medication.generic_name, medication.brand_name, medication.strength].filter(Boolean).join(" · ");
            await connection.execute(
              `INSERT INTO prescription_items
                (id, prescription_id, medication_id, medication_name, dose, frequency, duration, route, quantity, instructions, unit_price)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [prescriptionItemId, prescriptionId, medication.id, medicationName, dose, schedule.frequency.label, schedule.duration, String(item.route || medication.route || "").trim() || null, schedule.quantity, String(item.instructions || "").trim() || null, Number(medication.unit_price || 0)]
            );
            await createCharge({ id: prescriptionItemId, description: medicationName, category: "Medication", quantity: schedule.quantity, unitPrice: Number(medication.unit_price || 0) });
          }
        }

        let radiologyRequestNumber: string | null = null;
        if (radiologyServiceId) {
          const [services] = await connection.query<RowDataPacket[]>(
            "SELECT * FROM radiology_services WHERE id = ? AND facility_id = ? AND is_active = 1 LIMIT 1",
            [radiologyServiceId, HOSPITAL_ID]
          );
          const service = services[0];
          if (!service) throw new Error("The selected radiology service is unavailable.");
          const requestId = randomUUID();
          radiologyRequestNumber = `RAD-${String(await nextCounter("radiology", connection)).padStart(7, "0")}`;
          await connection.execute(
            `INSERT INTO radiology_requests
              (id, facility_id, request_number, patient_id, encounter_id, service_id, clinical_indication, priority, status, requested_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'Routine', 'Requested', ?)`,
            [requestId, HOSPITAL_ID, radiologyRequestNumber, patientId, encounterId, service.id, String(args.radiology_indication || "Requested during registration").trim(), currentSession.user.id]
          );
          await createCharge({ description: String(service.name), category: "Radiology", unitPrice: Number(service.unit_price || 0), radiologyRequestId: requestId });
        }

        return { patient_id: patientId, hospital_id: hospitalId, encounter_id: encounterId, encounter_number: encounterNumber, order_number: orderNumber, invoice_number: invoiceNumber, prescription_id: prescriptionId, radiology_request_number: radiologyRequestNumber };
      });
      return response(data);
    }

    if (name === "bump_test_bundle_usage") {
      if (!["Admin", "Receptionist", "LabScientist"].includes(currentSession.profile.role)) return forbidden();
      await pool.execute("UPDATE test_bundles SET usage_count = usage_count + 1, last_used_at = UTC_TIMESTAMP(3) WHERE id = ? AND facility_id = ?", [String(args.target_bundle_id), HOSPITAL_ID]);
      return response(null);
    }

    if (name === "apply_inventory_transaction") {
      if (!["Admin", "Accountant", "Storekeeper", "Pharmacist", "LabScientist"].includes(currentSession.profile.role)) return forbidden();
      await withTransaction(async (connection) => {
        const [items] = await connection.query<RowDataPacket[]>("SELECT * FROM inventory_items WHERE id = ? AND facility_id = ? FOR UPDATE", [String(args.target_item_id), HOSPITAL_ID]);
        const item = items[0];
        if (!item) throw new Error("Inventory item not found.");
        const quantity = Number(args.quantity_value || 0);
        const type = String(args.transaction_type_value || "adjustment");
        if (!["stock_in", "stock_out", "adjustment"].includes(type)) throw new Error("Unknown inventory transaction type.");
        if ((type === "adjustment" && quantity < 0) || (type !== "adjustment" && quantity <= 0)) throw new Error("Enter a valid positive quantity.");
        const current = Number(item.quantity || 0);
        const next = type === "stock_in" ? current + quantity : type === "adjustment" ? quantity : current - quantity;
        if (next < 0) throw new Error("This transaction would make stock negative.");
        const unitCost = Math.max(Number(args.item_unit_cost_value || item.unit_cost || 0), 0);
        const id = randomUUID();
        await connection.execute("UPDATE inventory_items SET quantity = ?, unit_cost = ?, last_stocked_at = IF(? = 'stock_in', UTC_TIMESTAMP(3), last_stocked_at) WHERE id = ?", [next, unitCost, type, item.id]);
        await connection.execute(
          `INSERT INTO inventory_transactions (id, facility_id, item_id, transaction_type, quantity, unit_cost, total_cost, balance_after, reason, reference_number, notes, performed_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, HOSPITAL_ID, item.id, type, quantity, unitCost, quantity * unitCost, next, args.reason_value || null, args.reference_number_value || null, args.notes_value || null, currentSession.user.id]
        );
      });
      return response(null);
    }

    if (name === "register_invoice_payment") {
      if (!["Admin", "Accountant"].includes(currentSession.profile.role)) return forbidden();
      const data = await withTransaction(async (connection) => {
        const [invoices] = await connection.query<RowDataPacket[]>("SELECT * FROM invoices WHERE id = ? AND facility_id = ? FOR UPDATE", [String(args.target_invoice_id), HOSPITAL_ID]);
        const invoice = invoices[0];
        if (!invoice) throw new Error("Invoice not found.");
        const amount = Number(args.amount_value || 0);
        const total = Number(invoice.total_amount || 0);
        const paid = Number(invoice.amount_paid || 0) + amount;
        if (amount <= 0 || paid > total) throw new Error("Payment is outside the invoice balance.");
        const receipt = `RCT-${String(await nextCounter("receipt", connection)).padStart(6, "0")}`;
        const paymentId = randomUUID();
        await connection.execute(
          `INSERT INTO invoice_payments (id, facility_id, invoice_id, receipt_number, amount, payment_method, reference_number, notes, received_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [paymentId, HOSPITAL_ID, invoice.id, receipt, amount, args.payment_method_value, args.reference_number_value || null, args.notes_value || null, currentSession.user.id]
        );
        const status = moneyStatus(paid, total);
        await connection.execute("UPDATE invoices SET amount_paid = ?, payment_status = ? WHERE id = ?", [paid, status, invoice.id]);
        return [{ payment_id: paymentId, invoice_id: invoice.id, receipt_number: receipt, amount, amount_paid: paid, balance_due: total - paid, payment_status: status, received_at: new Date().toISOString() }];
      });
      return response(data);
    }

    if (name === "verify_result") {
      if (!["Admin", "Verifier"].includes(currentSession.profile.role)) throw new Error("Only a result verifier can approve results.");
      await withTransaction(async (connection) => {
        const [results] = await connection.query<RowDataPacket[]>("SELECT * FROM order_test_results WHERE id = ? FOR UPDATE", [String(args.target_result_id)]);
        const result = results[0];
        if (!result) throw new Error("Result not found.");
        await connection.execute("UPDATE order_test_results SET verified_by = ?, verified_at = UTC_TIMESTAMP(3) WHERE id = ?", [currentSession.user.id, result.id]);
        await connection.execute("UPDATE order_tests SET status = 'Verified', verified_at = UTC_TIMESTAMP(3) WHERE id = ?", [result.order_test_id]);
        await connection.execute(
          "INSERT INTO audit_logs (id, facility_id, entity_table, entity_id, action, payload, actor_id) VALUES (?, ?, 'order_test_results', ?, 'result_verified', ?, ?)",
          [randomUUID(), HOSPITAL_ID, result.id, JSON.stringify({ verification_notes: args.verification_notes || null }), currentSession.user.id]
        );
      });
      return response(null);
    }

    if (name === "create_clinical_lab_order") {
      if (!["Admin", "Doctor", "Nurse", "Receptionist"].includes(currentSession.profile.role)) return forbidden();
      const patientId = String(args.patient_id || "");
      const encounterId = String(args.encounter_id || "");
      const testIds = [...new Set((Array.isArray(args.test_ids) ? args.test_ids : []).map(String).filter(Boolean))];
      if (!patientId || !encounterId || !testIds.length) throw new Error("Select at least one laboratory test.");

      const data = await withTransaction(async (connection) => {
        const [encounters] = await connection.query<RowDataPacket[]>(
          "SELECT id, encounter_number FROM clinical_encounters WHERE id = ? AND patient_id = ? AND facility_id = ? LIMIT 1",
          [encounterId, patientId, HOSPITAL_ID]
        );
        if (!encounters[0]) throw new Error("Clinical encounter not found.");
        const placeholders = testIds.map(() => "?").join(",");
        const [tests] = await connection.query<RowDataPacket[]>(
          `SELECT id, name, price FROM tests WHERE id IN (${placeholders}) AND facility_id = ? AND is_active = 1 ORDER BY name`,
          [...testIds, HOSPITAL_ID]
        );
        if (tests.length !== testIds.length) throw new Error("One or more laboratory tests are unavailable.");

        const orderId = randomUUID();
        const orderNumber = `ORD-${String(await nextCounter("lab_order", connection)).padStart(6, "0")}`;
        const priority = ["routine", "urgent", "stat"].includes(String(args.priority || "").toLowerCase())
          ? String(args.priority).toLowerCase()
          : "routine";
        const notes = [
          `Clinical encounter ${String(encounters[0].encounter_number)}`,
          String(args.notes || "").trim()
        ].filter(Boolean).join(" · ");
        await connection.execute(
          "INSERT INTO orders (id, facility_id, order_number, patient_id, status, priority, notes, ordered_by) VALUES (?, ?, ?, ?, 'Registered', ?, ?, ?)",
          [orderId, HOSPITAL_ID, orderNumber, patientId, priority, notes || null, currentSession.user.id]
        );

        const orderTests: Array<{ id: string; name: string; price: number }> = [];
        for (const test of tests) {
          const orderTestId = randomUUID();
          const sampleCode = `SMP-${String(await nextCounter("sample", connection)).padStart(7, "0")}`;
          await connection.execute(
            "INSERT INTO order_tests (id, order_id, test_id, specimen_label, status, sample_code, barcode_value, qr_value) VALUES (?, ?, ?, ?, 'Registered', ?, ?, ?)",
            [orderTestId, orderId, test.id, test.name, sampleCode, sampleCode, sampleCode]
          );
          orderTests.push({ id: orderTestId, name: String(test.name), price: Number(test.price || 0) });
        }

        const subtotal = orderTests.reduce((sum, test) => sum + test.price, 0);
        const invoiceId = randomUUID();
        const invoiceNumber = `INV-${String(await nextCounter("invoice", connection)).padStart(6, "0")}`;
        await connection.execute(
          "INSERT INTO invoices (id, facility_id, order_id, invoice_number, subtotal, total_amount, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [invoiceId, HOSPITAL_ID, orderId, invoiceNumber, subtotal, subtotal, currentSession.user.id]
        );
        for (const test of orderTests) await connection.execute(
          "INSERT INTO invoice_items (id, invoice_id, order_test_id, test_name, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, 1, ?, ?)",
          [randomUUID(), invoiceId, test.id, test.name, test.price, test.price]
        );
        return { order_id: orderId, order_number: orderNumber, invoice_number: invoiceNumber };
      });
      return response(data);
    }

    if (name === "create_clinical_prescription") {
      if (!["Admin", "Doctor"].includes(currentSession.profile.role)) return forbidden();
      const patientId = String(args.patient_id || "");
      const encounterId = String(args.encounter_id || "");
      const items = (Array.isArray(args.items) ? args.items : []) as Array<Record<string, unknown>>;
      if (!patientId || !encounterId || !items.length) throw new Error("Add at least one medication.");
      if (items.length > 50) throw new Error("Too many medications were added at once.");

      const data = await withTransaction(async (connection) => {
        const [encounters] = await connection.query<RowDataPacket[]>(
          "SELECT id FROM clinical_encounters WHERE id = ? AND patient_id = ? AND facility_id = ? LIMIT 1",
          [encounterId, patientId, HOSPITAL_ID]
        );
        if (!encounters[0]) throw new Error("Clinical encounter not found.");
        const medicationIds = [...new Set(items.map((item) => String(item.medication_id || "")).filter(Boolean))];
        const placeholders = medicationIds.map(() => "?").join(",");
        let medications: RowDataPacket[] = [];
        if (medicationIds.length) {
          const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM medications WHERE id IN (${placeholders}) AND facility_id = ? AND is_active = 1`,
            [...medicationIds, HOSPITAL_ID]
          );
          medications = rows;
        }
        const medicationIndex = new Map(medications.map((item) => [String(item.id), item]));
        if (medicationIndex.size !== medicationIds.length) throw new Error("One or more medications are unavailable.");
        const [admissions] = await connection.query<RowDataPacket[]>(
          "SELECT id FROM admissions WHERE patient_id = ? AND encounter_id = ? AND facility_id = ? AND status = 'Admitted' ORDER BY admitted_at DESC LIMIT 1",
          [patientId, encounterId, HOSPITAL_ID]
        );
        const admissionId = admissions[0] ? String(admissions[0].id) : null;
        const firstDoseAt = new Date();

        const prescriptionId = randomUUID();
        await connection.execute(
          "INSERT INTO prescriptions (id, facility_id, patient_id, encounter_id, status, notes, prescribed_by) VALUES (?, ?, ?, ?, 'Pending', ?, ?)",
          [prescriptionId, HOSPITAL_ID, patientId, encounterId, String(args.notes || "").trim() || null, currentSession.user.id]
        );
        for (const item of items) {
          const medication = medicationIndex.get(String(item.medication_id || ""));
          if (!medication) throw new Error("Select a medication from the hospital list.");
          const dose = String(item.dose || "").trim();
          if (!dose) throw new Error(`Enter the dose for ${medication.generic_name}.`);
          const schedule = prescriptionSchedule(item);
          const prescriptionItemId = randomUUID();
          const medicationName = [medication.generic_name, medication.brand_name, medication.strength].filter(Boolean).join(" · ");
          await connection.execute(
            `INSERT INTO prescription_items
              (id, prescription_id, medication_id, medication_name, dose, frequency, duration, route, quantity, instructions, unit_price)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [prescriptionItemId, prescriptionId, medication.id, medicationName, dose, schedule.frequency.label, schedule.duration, String(item.route || medication.route || "").trim() || null, schedule.quantity, String(item.instructions || "").trim() || null, Number(medication.unit_price || 0)]
          );
          const total = schedule.quantity * Number(medication.unit_price || 0);
          await connection.execute(
            `INSERT INTO encounter_charges
              (id, facility_id, patient_id, encounter_id, description, category, quantity, unit_price, total_amount, payment_status, charged_by)
             VALUES (?, ?, ?, ?, ?, 'Medication', ?, ?, ?, ?, ?)`,
            [prescriptionItemId, HOSPITAL_ID, patientId, encounterId, medicationName, schedule.quantity, Number(medication.unit_price || 0), total, total > 0 ? "Unpaid" : "Paid", currentSession.user.id]
          );
          await createAdministrationSchedule({
            connection,
            admissionId,
            patientId,
            encounterId,
            prescriptionId,
            prescriptionItemId,
            frequencyCode: schedule.frequency.code,
            durationDays: schedule.durationDays,
            firstDoseAt
          });
        }
        return { prescription_id: prescriptionId, nursing_schedule_created: Boolean(admissionId) };
      });
      return response(data);
    }

    if (name === "dispense_prescription") {
      if (!["Admin", "Pharmacist"].includes(currentSession.profile.role)) throw new Error("Only pharmacy staff can dispense medication.");
      await withTransaction(async (connection) => {
        const [items] = await connection.query<RowDataPacket[]>("SELECT * FROM prescription_items WHERE prescription_id = ? FOR UPDATE", [String(args.target_prescription_id)]);
        for (const item of items) {
          if (item.medication_id) {
            const [medications] = await connection.query<RowDataPacket[]>("SELECT quantity_on_hand FROM medications WHERE id = ? FOR UPDATE", [item.medication_id]);
            const needed = Number(item.quantity) - Number(item.dispensed_quantity);
            if (Number(medications[0]?.quantity_on_hand || 0) < needed) throw new Error(`Insufficient stock for ${item.medication_name}.`);
            await connection.execute("UPDATE medications SET quantity_on_hand = quantity_on_hand - ? WHERE id = ?", [needed, item.medication_id]);
          }
          await connection.execute("UPDATE prescription_items SET dispensed_quantity = quantity WHERE id = ?", [item.id]);
        }
        await connection.execute("UPDATE prescriptions SET status = 'Dispensed', dispensed_by = ?, dispensed_at = UTC_TIMESTAMP(3) WHERE id = ?", [currentSession.user.id, String(args.target_prescription_id)]);
      });
      return response(null);
    }

    if (name === "get_nursing_medication_dashboard") {
      if (!["Admin", "Nurse"].includes(currentSession.profile.role)) return forbidden();
      const [patients] = await pool.query<RowDataPacket[]>(
        `SELECT a.id AS admission_id, a.patient_id, a.encounter_id, a.admitted_at,
          p.name, p.hospital_id, p.phone,
          w.name AS ward_name, w.code AS ward_code, b.bed_number
         FROM admissions a
         JOIN patients p ON p.id = a.patient_id
         JOIN wards w ON w.id = a.ward_id
         LEFT JOIN beds b ON b.id = a.bed_id
         WHERE a.facility_id = ? AND a.status = 'Admitted'
         ORDER BY w.name, b.bed_number, p.name`,
        [HOSPITAL_ID]
      );
      const [doses] = await pool.query<RowDataPacket[]>(
        `SELECT ma.id, ma.patient_id, ma.encounter_id, ma.admission_id,
          ma.prescription_id, ma.prescription_item_id, ma.scheduled_at,
          ma.status, ma.administered_at, ma.administered_by, ma.notes,
          pi.medication_name, pi.dose, pi.frequency, pi.duration, pi.route, pi.instructions,
          p.status AS prescription_status,
          COALESCE(staff.display_name, staff.email) AS administered_by_name
         FROM medication_administrations ma
         JOIN admissions a ON a.id = ma.admission_id AND a.status = 'Admitted'
         JOIN prescription_items pi ON pi.id = ma.prescription_item_id
         JOIN prescriptions p ON p.id = ma.prescription_id
         LEFT JOIN profiles staff ON staff.id = ma.administered_by
         WHERE ma.facility_id = ?
           AND ma.scheduled_at <= DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)
           AND (ma.status = 'Scheduled' OR ma.administered_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 24 HOUR))
         ORDER BY ma.scheduled_at ASC
         LIMIT 2000`,
        [HOSPITAL_ID]
      );
      return response({ server_time: new Date().toISOString(), patients, doses });
    }

    if (name === "record_medication_administrations") {
      if (!["Admin", "Nurse"].includes(currentSession.profile.role)) return forbidden();
      const administrationIds = [...new Set(
        (Array.isArray(args.administration_ids) ? args.administration_ids : []).map(String).filter(Boolean)
      )];
      if (!administrationIds.length) throw new Error("Select at least one medication to administer.");
      if (administrationIds.length > 50) throw new Error("Record no more than 50 doses at once.");
      const notes = String(args.notes || "").trim() || null;
      const administeredCount = await withTransaction(async (connection) => {
        const placeholders = administrationIds.map(() => "?").join(",");
        const [rows] = await connection.query<RowDataPacket[]>(
          `SELECT ma.id
           FROM medication_administrations ma
           JOIN admissions a ON a.id = ma.admission_id
           WHERE ma.id IN (${placeholders}) AND ma.facility_id = ?
             AND ma.status = 'Scheduled' AND a.status = 'Admitted'
           FOR UPDATE`,
          [...administrationIds, HOSPITAL_ID]
        );
        if (rows.length !== administrationIds.length) {
          throw new Error("One or more selected doses are no longer available.");
        }
        await connection.execute(
          `UPDATE medication_administrations
           SET status = 'Administered', administered_at = UTC_TIMESTAMP(3), administered_by = ?, notes = ?
           WHERE id IN (${placeholders})`,
          [currentSession.user.id, notes, ...administrationIds]
        );
        return rows.length;
      });
      return response({ administered_count: administeredCount });
    }

    if (name === "manage_account_bill") {
      if (!["Admin", "Accountant"].includes(currentSession.profile.role)) return forbidden();
      const source = String(args.source || "");
      const billId = String(args.bill_id || "");
      const operation = String(args.operation || "");
      const reason = String(args.reason || "").trim();
      if (!["invoice", "charge"].includes(source) || !billId || !["update", "delete"].includes(operation)) {
        throw new Error("Invalid billing action.");
      }
      if (reason.length < 3) throw new Error("Enter a reason for this change.");

      const result = await withTransaction(async (connection) => {
        const table = source === "invoice" ? "invoices" : "encounter_charges";
        const [rows] = await connection.query<RowDataPacket[]>(
          `SELECT * FROM ${table} WHERE id = ? AND facility_id = ? FOR UPDATE`,
          [billId, HOSPITAL_ID]
        );
        const before = rows[0];
        if (!before) throw new Error("Bill not found.");
        const related: Record<string, unknown> = {};
        if (source === "invoice") {
          const [items] = await connection.query<RowDataPacket[]>("SELECT * FROM invoice_items WHERE invoice_id = ?", [billId]);
          const [payments] = await connection.query<RowDataPacket[]>("SELECT * FROM invoice_payments WHERE invoice_id = ?", [billId]);
          related.items = items;
          related.payments = payments;
        } else {
          const [payments] = await connection.query<RowDataPacket[]>("SELECT * FROM hospital_payments WHERE charge_id = ?", [billId]);
          related.payments = payments;
        }

        let after: Record<string, unknown> | null = null;
        if (operation === "update") {
          if (source === "invoice") {
            const discount = Number(args.discount_amount ?? before.discount_amount ?? 0);
            const subtotal = Number(before.subtotal || 0);
            const paid = Number(before.amount_paid || 0);
            const total = subtotal - discount;
            if (!Number.isFinite(discount) || discount < 0 || total < paid) throw new Error("Discount cannot make the total lower than the amount already paid.");
            const notes = String(args.notes || "").trim() || null;
            await connection.execute(
              "UPDATE invoices SET discount_amount = ?, total_amount = ?, payment_status = ?, notes = ? WHERE id = ?",
              [discount, total, moneyStatus(paid, total), notes, billId]
            );
          } else {
            const description = String(args.description || "").trim();
            const category = String(args.category || "").trim();
            const quantity = Number(args.quantity || 0);
            const unitPrice = Number(args.unit_price || 0);
            const total = quantity * unitPrice;
            const paid = Number(before.amount_paid || 0);
            if (!description || !category || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || total < paid) {
              throw new Error("Check the bill details. The new total cannot be lower than the amount already paid.");
            }
            await connection.execute(
              "UPDATE encounter_charges SET description = ?, category = ?, quantity = ?, unit_price = ?, total_amount = ?, payment_status = ? WHERE id = ?",
              [description, category, quantity, unitPrice, total, moneyStatus(paid, total), billId]
            );
          }
          const [updatedRows] = await connection.query<RowDataPacket[]>(`SELECT * FROM ${table} WHERE id = ?`, [billId]);
          after = updatedRows[0] as Record<string, unknown>;
        } else if (source === "invoice") {
          await connection.execute("DELETE FROM invoice_payments WHERE invoice_id = ?", [billId]);
          await connection.execute("DELETE FROM invoice_items WHERE invoice_id = ?", [billId]);
          await connection.execute("DELETE FROM invoices WHERE id = ?", [billId]);
        } else {
          await connection.execute("DELETE FROM hospital_payments WHERE charge_id = ?", [billId]);
          await connection.execute("DELETE FROM encounter_charges WHERE id = ?", [billId]);
        }

        const actor = {
          id: currentSession.user.id,
          name: currentSession.profile.display_name || currentSession.user.email,
          email: currentSession.user.email,
          role: currentSession.profile.role
        };
        const auditPayload = { actor, after, before, reason, related };
        await connection.execute(
          "INSERT INTO audit_logs (id, facility_id, entity_table, entity_id, action, payload, actor_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [randomUUID(), HOSPITAL_ID, table, billId, operation === "update" ? "bill_updated" : "bill_deleted", JSON.stringify(auditPayload), currentSession.user.id]
        );
        return { action: operation, id: billId };
      });
      return response(result);
    }

    if (name === "record_hospital_payment") {
      if (!["Admin", "Receptionist", "Accountant"].includes(currentSession.profile.role)) return forbidden();
      const data = await withTransaction(async (connection) => {
        const [charges] = await connection.query<RowDataPacket[]>("SELECT * FROM encounter_charges WHERE id = ? AND facility_id = ? FOR UPDATE", [String(args.target_charge_id), HOSPITAL_ID]);
        const charge = charges[0];
        if (!charge) throw new Error("Patient charge not found.");
        const amount = Number(args.amount_value || 0);
        const total = Number(charge.total_amount || 0);
        const paid = Number(charge.amount_paid || 0) + amount;
        if (amount <= 0 || paid > total) throw new Error("Payment is outside the outstanding balance.");
        const id = randomUUID();
        await connection.execute(
          `INSERT INTO hospital_payments (id, facility_id, charge_id, patient_id, amount, payment_method, reference_number, notes, received_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, HOSPITAL_ID, charge.id, charge.patient_id, amount, args.payment_method_value, args.reference_number_value || null, args.notes_value || null, currentSession.user.id]
        );
        await connection.execute("UPDATE encounter_charges SET amount_paid = ?, payment_status = ? WHERE id = ?", [paid, moneyStatus(paid, total), charge.id]);
        return id;
      });
      return response(data);
    }

    return NextResponse.json({ data: null, error: { message: "Unknown server operation." } }, { status: 400 });
  } catch (error) {
    if (previewSession) {
      if (name === "search_patients") return response([]);

      return NextResponse.json(
        { data: null, error: { message: "Preview mode is read-only while the database is offline." } },
        { status: 503 }
      );
    }

    const databaseError = error as { code?: string };
    console.error("[data-rpc]", error);
    return NextResponse.json({
      data: null,
      error: { message: databaseError.code ? "The request could not be completed." : error instanceof Error ? error.message : "The request could not be completed." }
    }, { status: 500 });
  }
}
