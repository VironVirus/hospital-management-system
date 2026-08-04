import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { getCurrentSession } from "@/lib/auth-session";
import { formatAppRole } from "@/lib/auth-types";
import { getPool, migrateDatabase } from "@/lib/db";
import { HOSPITAL_ID } from "@/lib/db/schema";
import type { ActivityReportSection, HospitalActivityReport } from "@/features/admin/hospital-activity-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function section(title: string, columns: Array<[string, string]>, rows: RowDataPacket[]): ActivityReportSection {
  return {
    title,
    columns: columns.map(([key, label]) => ({ key, label })),
    rows: rows as Array<Record<string, string | number | null>>
  };
}

function lagosDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lagos",
    year: "numeric"
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Access unavailable." }, { status: 403 });

    const today = lagosDate();
    const start = new Date(`${today}T00:00:00+01:00`);
    const end = new Date(`${today}T00:00:00+01:00`);
    end.setUTCDate(end.getUTCDate() + 1);
    const staffId = session.user.id;

    await migrateDatabase();
    const pool = getPool();
    const dateTime = (column: string) => `DATE_FORMAT(CONVERT_TZ(${column}, '+00:00', '+01:00'), '%d %b %Y %H:%i')`;
    const own = [HOSPITAL_ID, staffId, start, end];

    const [
      [patients], [encounters], [admissions], [laboratory], [labResults], [sampleActivity], [qcRuns], [calibrations], [maintenance], [prescriptions],
      [radiologyRequests], [radiologyReports], [charges], [hospitalPayments], [labPayments],
      [inventory], [expenses], [administrations], [diagnoses], [vitals], [notes], [audit]
    ] = await Promise.all([
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("p.created_at")} AS activity_date, p.hospital_id, p.name AS patient, COALESCE(p.phone, '-') AS phone FROM patients p WHERE p.facility_id = ? AND p.created_by = ? AND p.created_at >= ? AND p.created_at < ? ORDER BY p.created_at`, own),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("e.started_at")} AS activity_date, e.encounter_number, p.name AS patient, e.encounter_type, e.status FROM clinical_encounters e JOIN patients p ON p.id = e.patient_id WHERE e.facility_id = ? AND (e.created_by = ? OR e.attending_clinician = ?) AND e.started_at >= ? AND e.started_at < ? ORDER BY e.started_at`, [HOSPITAL_ID, staffId, staffId, start, end]),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("a.admitted_at")} AS activity_date, p.name AS patient, w.name AS ward, COALESCE(b.bed_number, '-') AS bed, a.status FROM admissions a JOIN patients p ON p.id = a.patient_id JOIN wards w ON w.id = a.ward_id LEFT JOIN beds b ON b.id = a.bed_id WHERE a.facility_id = ? AND ((a.admitted_by = ? AND a.admitted_at >= ? AND a.admitted_at < ?) OR (a.discharged_by = ? AND a.discharged_at >= ? AND a.discharged_at < ?)) ORDER BY a.admitted_at`, [HOSPITAL_ID, staffId, start, end, staffId, start, end]),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("o.ordered_at")} AS activity_date, o.order_number, p.name AS patient, o.status, COALESCE(GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', '), '-') AS tests FROM orders o JOIN patients p ON p.id = o.patient_id LEFT JOIN order_tests ot ON ot.order_id = o.id LEFT JOIN tests t ON t.id = ot.test_id WHERE o.facility_id = ? AND o.ordered_by = ? AND o.ordered_at >= ? AND o.ordered_at < ? GROUP BY o.id, o.ordered_at, o.order_number, p.name, o.status ORDER BY o.ordered_at`, own),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("COALESCE(r.verified_at, r.entered_at)")} AS activity_date, o.order_number, p.name AS patient, t.name AS test, CASE WHEN r.verified_by = ? THEN 'Verified' ELSE 'Result entered' END AS action FROM order_test_results r JOIN order_tests ot ON ot.id = r.order_test_id JOIN orders o ON o.id = ot.order_id JOIN patients p ON p.id = o.patient_id JOIN tests t ON t.id = ot.test_id WHERE o.facility_id = ? AND ((r.entered_by = ? AND r.entered_at >= ? AND r.entered_at < ?) OR (r.verified_by = ? AND r.verified_at >= ? AND r.verified_at < ?)) ORDER BY COALESCE(r.verified_at, r.entered_at)`, [staffId, HOSPITAL_ID, staffId, start, end, staffId, start, end]),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("s.created_at")} AS activity_date, o.order_number, p.name AS patient, t.name AS test, s.action, COALESCE(s.to_status, '-') AS status FROM sample_custody_logs s JOIN order_tests ot ON ot.id = s.order_test_id JOIN orders o ON o.id = ot.order_id JOIN patients p ON p.id = o.patient_id JOIN tests t ON t.id = ot.test_id WHERE o.facility_id = ? AND s.actor_id = ? AND s.created_at >= ? AND s.created_at < ? ORDER BY s.created_at`, own),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("q.performed_at")} AS activity_date, c.name AS control_name, COALESCE(CAST(q.value_numeric AS CHAR), q.value_text, '-') AS result, q.status, COALESCE(q.notes, '-') AS notes FROM qc_runs q JOIN qc_controls c ON c.id = q.control_id WHERE q.facility_id = ? AND q.performed_by = ? AND q.performed_at >= ? AND q.performed_at < ? ORDER BY q.performed_at`, own),
      pool.query<RowDataPacket[]>(`SELECT DATE_FORMAT(c.calibration_date, '%d %b %Y') AS activity_date, a.name AS analyzer, c.status, COALESCE(c.due_date, '-') AS due_date, COALESCE(c.notes, '-') AS notes FROM calibration_logs c JOIN analyzers a ON a.id = c.analyzer_id WHERE c.facility_id = ? AND c.performed_by = ? AND c.created_at >= ? AND c.created_at < ? ORDER BY c.created_at`, own),
      pool.query<RowDataPacket[]>(`SELECT DATE_FORMAT(m.maintenance_date, '%d %b %Y') AS activity_date, a.name AS analyzer, m.maintenance_type, m.status, COALESCE(m.notes, '-') AS notes FROM maintenance_logs m JOIN analyzers a ON a.id = m.analyzer_id WHERE m.facility_id = ? AND m.performed_by = ? AND m.created_at >= ? AND m.created_at < ? ORDER BY m.created_at`, own),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("COALESCE(pr.dispensed_at, pr.prescribed_at)")} AS activity_date, p.name AS patient, pr.status, COALESCE(GROUP_CONCAT(CONCAT(pi.medication_name, ' ', pi.dose, ' ', pi.frequency) ORDER BY pi.medication_name SEPARATOR '; '), '-') AS details FROM prescriptions pr JOIN patients p ON p.id = pr.patient_id LEFT JOIN prescription_items pi ON pi.prescription_id = pr.id WHERE pr.facility_id = ? AND ((pr.prescribed_by = ? AND pr.prescribed_at >= ? AND pr.prescribed_at < ?) OR (pr.dispensed_by = ? AND pr.dispensed_at >= ? AND pr.dispensed_at < ?)) GROUP BY pr.id, pr.prescribed_at, pr.dispensed_at, p.name, pr.status ORDER BY COALESCE(pr.dispensed_at, pr.prescribed_at)`, [HOSPITAL_ID, staffId, start, end, staffId, start, end]),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("rr.requested_at")} AS activity_date, rr.request_number, p.name AS patient, rs.name AS study, rr.status FROM radiology_requests rr JOIN patients p ON p.id = rr.patient_id JOIN radiology_services rs ON rs.id = rr.service_id WHERE rr.facility_id = ? AND (rr.requested_by = ? OR rr.assigned_to = ?) AND rr.requested_at >= ? AND rr.requested_at < ? ORDER BY rr.requested_at`, [HOSPITAL_ID, staffId, staffId, start, end]),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("r.reported_at")} AS activity_date, rr.request_number, p.name AS patient, rs.name AS study, LEFT(r.impression, 220) AS impression FROM radiology_reports r JOIN radiology_requests rr ON rr.id = r.request_id JOIN patients p ON p.id = rr.patient_id JOIN radiology_services rs ON rs.id = rr.service_id WHERE r.facility_id = ? AND (r.reported_by = ? OR r.verified_by = ?) AND r.reported_at >= ? AND r.reported_at < ? ORDER BY r.reported_at`, [HOSPITAL_ID, staffId, staffId, start, end]),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("c.charged_at")} AS activity_date, p.name AS patient, c.description, FORMAT(c.total_amount, 2) AS total, c.payment_status AS status FROM encounter_charges c JOIN patients p ON p.id = c.patient_id WHERE c.facility_id = ? AND c.charged_by = ? AND c.charged_at >= ? AND c.charged_at < ? ORDER BY c.charged_at`, own),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("hp.received_at")} AS activity_date, p.name AS patient, FORMAT(hp.amount, 2) AS amount, hp.payment_method, COALESCE(hp.reference_number, '-') AS reference FROM hospital_payments hp JOIN patients p ON p.id = hp.patient_id WHERE hp.facility_id = ? AND hp.received_by = ? AND hp.received_at >= ? AND hp.received_at < ? ORDER BY hp.received_at`, own),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("ip.received_at")} AS activity_date, i.invoice_number, FORMAT(ip.amount, 2) AS amount, ip.payment_method, ip.receipt_number FROM invoice_payments ip JOIN invoices i ON i.id = ip.invoice_id WHERE ip.facility_id = ? AND ip.received_by = ? AND ip.received_at >= ? AND ip.received_at < ? ORDER BY ip.received_at`, own),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("it.created_at")} AS activity_date, ii.name AS item, it.transaction_type, it.quantity, FORMAT(it.total_cost, 2) AS total_cost, COALESCE(it.reason, '-') AS reason FROM inventory_transactions it JOIN inventory_items ii ON ii.id = it.item_id WHERE it.facility_id = ? AND it.performed_by = ? AND it.created_at >= ? AND it.created_at < ? ORDER BY it.created_at`, own),
      pool.query<RowDataPacket[]>(`SELECT DATE_FORMAT(e.expense_date, '%d %b %Y') AS activity_date, e.title, e.category, FORMAT(e.amount, 2) AS amount, COALESCE(e.notes, '-') AS notes FROM expenses e WHERE e.facility_id = ? AND e.created_by = ? AND e.created_at >= ? AND e.created_at < ? ORDER BY e.created_at`, own),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("ma.administered_at")} AS activity_date, p.name AS patient, pi.medication_name, ma.status, COALESCE(ma.notes, '-') AS notes FROM medication_administrations ma JOIN patients p ON p.id = ma.patient_id JOIN prescription_items pi ON pi.id = ma.prescription_item_id WHERE ma.facility_id = ? AND ma.administered_by = ? AND ma.administered_at >= ? AND ma.administered_at < ? ORDER BY ma.administered_at`, own),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("d.diagnosed_at")} AS activity_date, p.name AS patient, d.diagnosis_name, d.diagnosis_type, COALESCE(d.icd10_code, '-') AS code FROM diagnoses d JOIN patients p ON p.id = d.patient_id WHERE d.facility_id = ? AND d.diagnosed_by = ? AND d.diagnosed_at >= ? AND d.diagnosed_at < ? ORDER BY d.diagnosed_at`, own),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("v.measured_at")} AS activity_date, p.name AS patient, CONCAT(COALESCE(v.systolic_bp, '-'), '/', COALESCE(v.diastolic_bp, '-')) AS blood_pressure, COALESCE(v.temperature_c, '-') AS temperature, COALESCE(v.pulse_bpm, '-') AS pulse, COALESCE(v.oxygen_saturation, '-') AS oxygen FROM vital_signs v JOIN patients p ON p.id = v.patient_id WHERE v.facility_id = ? AND v.measured_by = ? AND v.measured_at >= ? AND v.measured_at < ? ORDER BY v.measured_at`, own),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("n.authored_at")} AS activity_date, p.name AS patient, n.note_type, COALESCE(n.report_title, '-') AS title, LEFT(COALESCE(n.assessment, n.plan, '-'), 220) AS details FROM clinical_notes n JOIN patients p ON p.id = n.patient_id WHERE n.facility_id = ? AND n.authored_by = ? AND n.authored_at >= ? AND n.authored_at < ? ORDER BY n.authored_at`, own),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("al.created_at")} AS activity_date, al.entity_table AS module, al.action, al.entity_id AS reference FROM audit_logs al WHERE al.facility_id = ? AND al.actor_id = ? AND al.created_at >= ? AND al.created_at < ? ORDER BY al.created_at`, own)
    ]);

    const sections = [
      section("Patient registrations", [["activity_date", "Time"], ["hospital_id", "Hospital ID"], ["patient", "Patient"], ["phone", "Phone"]], patients),
      section("Clinical encounters", [["activity_date", "Time"], ["encounter_number", "Encounter"], ["patient", "Patient"], ["encounter_type", "Type"], ["status", "Status"]], encounters),
      section("Ward activity", [["activity_date", "Time"], ["patient", "Patient"], ["ward", "Ward"], ["bed", "Bed"], ["status", "Status"]], admissions),
      section("Laboratory requests", [["activity_date", "Time"], ["order_number", "Request"], ["patient", "Patient"], ["tests", "Tests"], ["status", "Status"]], laboratory),
      section("Laboratory results", [["activity_date", "Time"], ["order_number", "Request"], ["patient", "Patient"], ["test", "Test"], ["action", "Action"]], labResults),
      section("Sample handling", [["activity_date", "Time"], ["order_number", "Request"], ["patient", "Patient"], ["test", "Test"], ["action", "Action"], ["status", "Status"]], sampleActivity),
      section("Quality control", [["activity_date", "Time"], ["control_name", "Control"], ["result", "Result"], ["status", "Status"], ["notes", "Notes"]], qcRuns),
      section("Analyzer calibration", [["activity_date", "Date"], ["analyzer", "Analyzer"], ["status", "Status"], ["due_date", "Due"], ["notes", "Notes"]], calibrations),
      section("Analyzer maintenance", [["activity_date", "Date"], ["analyzer", "Analyzer"], ["maintenance_type", "Type"], ["status", "Status"], ["notes", "Notes"]], maintenance),
      section("Prescriptions", [["activity_date", "Time"], ["patient", "Patient"], ["details", "Medication"], ["status", "Status"]], prescriptions),
      section("Radiology requests", [["activity_date", "Time"], ["request_number", "Request"], ["patient", "Patient"], ["study", "Study"], ["status", "Status"]], radiologyRequests),
      section("Radiology reports", [["activity_date", "Time"], ["request_number", "Request"], ["patient", "Patient"], ["study", "Study"], ["impression", "Impression"]], radiologyReports),
      section("Bills posted", [["activity_date", "Time"], ["patient", "Patient"], ["description", "Description"], ["total", "Total"], ["status", "Status"]], charges),
      section("Patient payments", [["activity_date", "Time"], ["patient", "Patient"], ["amount", "Amount"], ["payment_method", "Method"], ["reference", "Reference"]], hospitalPayments),
      section("Laboratory payments", [["activity_date", "Time"], ["invoice_number", "Invoice"], ["amount", "Amount"], ["payment_method", "Method"], ["receipt_number", "Receipt"]], labPayments),
      section("Store activity", [["activity_date", "Time"], ["item", "Item"], ["transaction_type", "Type"], ["quantity", "Quantity"], ["total_cost", "Cost"], ["reason", "Reason"]], inventory),
      section("Expenses", [["activity_date", "Date"], ["title", "Expense"], ["category", "Category"], ["amount", "Amount"], ["notes", "Notes"]], expenses),
      section("Medication administration", [["activity_date", "Time"], ["patient", "Patient"], ["medication_name", "Medication"], ["status", "Status"], ["notes", "Notes"]], administrations),
      section("Diagnoses", [["activity_date", "Time"], ["patient", "Patient"], ["diagnosis_name", "Diagnosis"], ["diagnosis_type", "Type"], ["code", "Code"]], diagnoses),
      section("Vital signs", [["activity_date", "Time"], ["patient", "Patient"], ["blood_pressure", "BP"], ["temperature", "Temp"], ["pulse", "Pulse"], ["oxygen", "SpO2"]], vitals),
      section("Clinical notes", [["activity_date", "Time"], ["patient", "Patient"], ["note_type", "Type"], ["title", "Title"], ["details", "Details"]], notes),
      section("Other recorded activity", [["activity_date", "Time"], ["module", "Module"], ["action", "Action"], ["reference", "Reference"]], audit)
    ].filter((item) => item.rows.length > 0);

    const displayName = session.profile.display_name || session.user.email;
    const report: HospitalActivityReport = {
      from: today,
      generatedAt: new Date().toISOString(),
      hospitalName: session.facilityName || "St Gianna Specialist Hospital",
      reportTitle: `${displayName} · ${formatAppRole(session.profile.role)} daily activity`,
      sections,
      summary: sections.map((item) => ({ label: item.title, value: item.rows.length })),
      to: today
    };
    return NextResponse.json(report);
  } catch (error) {
    console.error("[staff-daily-report]", error);
    return NextResponse.json({ error: "Daily report could not be prepared." }, { status: 500 });
  }
}
