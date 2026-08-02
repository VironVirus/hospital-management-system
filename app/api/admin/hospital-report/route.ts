import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth-session";
import { getPool, migrateDatabase } from "@/lib/db";
import { HOSPITAL_ID } from "@/lib/db/schema";
import type { ActivityReportSection, HospitalActivityReport } from "@/features/admin/hospital-activity-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

function section(title: string, columns: Array<[string, string]>, rows: RowDataPacket[]): ActivityReportSection {
  return { title, columns: columns.map(([key, label]) => ({ key, label })), rows: rows as Array<Record<string, string | number | null>> };
}

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session || session.profile.role !== "Admin") return NextResponse.json({ error: "Access unavailable." }, { status: 403 });
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
    if (!parsed.success) return NextResponse.json({ error: "Select a valid date range." }, { status: 400 });

    const start = new Date(`${parsed.data.from}T00:00:00+01:00`);
    const end = new Date(`${parsed.data.to}T00:00:00+01:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return NextResponse.json({ error: "Select a valid date range." }, { status: 400 });
    end.setUTCDate(end.getUTCDate() + 1);

    await migrateDatabase();
    const pool = getPool();
    const values = [HOSPITAL_ID, start, end];
    const dateTime = (column: string) => `DATE_FORMAT(CONVERT_TZ(${column}, '+00:00', '+01:00'), '%d %b %Y %H:%i')`;

    const [
      [patients], [encounters], [admissions], [laboratory], [prescriptions], [radiology],
      [charges], [payments], [inventory], [expenses], [administrations], [diagnoses], [vitals], [audit]
    ] = await Promise.all([
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("p.created_at")} AS activity_date, p.hospital_id, p.name, COALESCE(p.phone, '-') AS phone FROM patients p WHERE p.facility_id = ? AND p.created_at >= ? AND p.created_at < ? ORDER BY p.created_at`, values),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("e.started_at")} AS activity_date, e.encounter_number, p.name AS patient, e.encounter_type, e.status FROM clinical_encounters e JOIN patients p ON p.id = e.patient_id WHERE e.facility_id = ? AND e.started_at >= ? AND e.started_at < ? ORDER BY e.started_at`, values),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("a.admitted_at")} AS activity_date, p.name AS patient, w.name AS ward, COALESCE(b.bed_number, '-') AS bed, a.status FROM admissions a JOIN patients p ON p.id = a.patient_id JOIN wards w ON w.id = a.ward_id LEFT JOIN beds b ON b.id = a.bed_id WHERE a.facility_id = ? AND a.admitted_at >= ? AND a.admitted_at < ? ORDER BY a.admitted_at`, values),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("o.ordered_at")} AS activity_date, o.order_number, p.name AS patient, o.status, COUNT(ot.id) AS tests, COALESCE(GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', '), '-') AS details FROM orders o JOIN patients p ON p.id = o.patient_id LEFT JOIN order_tests ot ON ot.order_id = o.id LEFT JOIN tests t ON t.id = ot.test_id WHERE o.facility_id = ? AND o.ordered_at >= ? AND o.ordered_at < ? GROUP BY o.id, o.ordered_at, o.order_number, p.name, o.status ORDER BY o.ordered_at`, values),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("pr.prescribed_at")} AS activity_date, p.name AS patient, pr.status, COUNT(pi.id) AS items, COALESCE(GROUP_CONCAT(CONCAT(pi.medication_name, ' ', pi.dose, ' ', pi.frequency) ORDER BY pi.medication_name SEPARATOR '; '), '-') AS details FROM prescriptions pr JOIN patients p ON p.id = pr.patient_id LEFT JOIN prescription_items pi ON pi.prescription_id = pr.id WHERE pr.facility_id = ? AND pr.prescribed_at >= ? AND pr.prescribed_at < ? GROUP BY pr.id, pr.prescribed_at, p.name, pr.status ORDER BY pr.prescribed_at`, values),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("rr.requested_at")} AS activity_date, rr.request_number, p.name AS patient, rs.name AS study, rr.status FROM radiology_requests rr JOIN patients p ON p.id = rr.patient_id JOIN radiology_services rs ON rs.id = rr.service_id WHERE rr.facility_id = ? AND rr.requested_at >= ? AND rr.requested_at < ? ORDER BY rr.requested_at`, values),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("c.charged_at")} AS activity_date, p.name AS patient, c.description, FORMAT(c.total_amount, 2) AS total, FORMAT(c.amount_paid, 2) AS paid, c.payment_status AS status FROM encounter_charges c JOIN patients p ON p.id = c.patient_id WHERE c.facility_id = ? AND c.charged_at >= ? AND c.charged_at < ? ORDER BY c.charged_at`, values),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("hp.received_at")} AS activity_date, p.name AS patient, FORMAT(hp.amount, 2) AS amount, hp.payment_method, COALESCE(hp.reference_number, '-') AS reference FROM hospital_payments hp JOIN patients p ON p.id = hp.patient_id WHERE hp.facility_id = ? AND hp.received_at >= ? AND hp.received_at < ? ORDER BY hp.received_at`, values),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("it.created_at")} AS activity_date, ii.name AS item, it.transaction_type, it.quantity, FORMAT(it.total_cost, 2) AS total_cost, COALESCE(it.reason, '-') AS reason FROM inventory_transactions it JOIN inventory_items ii ON ii.id = it.item_id WHERE it.facility_id = ? AND it.created_at >= ? AND it.created_at < ? ORDER BY it.created_at`, values),
      pool.query<RowDataPacket[]>(`SELECT DATE_FORMAT(e.expense_date, '%d %b %Y') AS activity_date, e.title, e.category, FORMAT(e.amount, 2) AS amount, COALESCE(e.notes, '-') AS notes FROM expenses e WHERE e.facility_id = ? AND e.expense_date >= ? AND e.expense_date <= ? ORDER BY e.expense_date`, [HOSPITAL_ID, parsed.data.from, parsed.data.to]),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("ma.scheduled_at")} AS activity_date, p.name AS patient, pi.medication_name, ma.status, COALESCE(pr.display_name, '-') AS staff FROM medication_administrations ma JOIN patients p ON p.id = ma.patient_id JOIN prescription_items pi ON pi.id = ma.prescription_item_id LEFT JOIN profiles pr ON pr.id = ma.administered_by WHERE ma.facility_id = ? AND ma.scheduled_at >= ? AND ma.scheduled_at < ? ORDER BY ma.scheduled_at`, values),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("d.diagnosed_at")} AS activity_date, p.name AS patient, d.diagnosis_name, d.diagnosis_type, COALESCE(d.icd10_code, '-') AS code FROM diagnoses d JOIN patients p ON p.id = d.patient_id WHERE d.facility_id = ? AND d.diagnosed_at >= ? AND d.diagnosed_at < ? ORDER BY d.diagnosed_at`, values),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("v.measured_at")} AS activity_date, p.name AS patient, CONCAT(COALESCE(v.systolic_bp, '-'), '/', COALESCE(v.diastolic_bp, '-')) AS blood_pressure, COALESCE(v.temperature_c, '-') AS temperature, COALESCE(v.pulse_bpm, '-') AS pulse, COALESCE(v.oxygen_saturation, '-') AS oxygen FROM vital_signs v JOIN patients p ON p.id = v.patient_id WHERE v.facility_id = ? AND v.measured_at >= ? AND v.measured_at < ? ORDER BY v.measured_at`, values),
      pool.query<RowDataPacket[]>(`SELECT ${dateTime("al.created_at")} AS activity_date, COALESCE(p.display_name, p.email, '-') AS staff, al.entity_table AS module, al.action, al.entity_id AS reference FROM audit_logs al LEFT JOIN profiles p ON p.id = al.actor_id WHERE al.facility_id = ? AND al.created_at >= ? AND al.created_at < ? ORDER BY al.created_at`, values)
    ]);

    const sections = [
      section("Patient registration", [["activity_date", "Date"], ["hospital_id", "Hospital ID"], ["name", "Patient"], ["phone", "Phone"]], patients),
      section("Clinical encounters", [["activity_date", "Date"], ["encounter_number", "Encounter"], ["patient", "Patient"], ["encounter_type", "Type"], ["status", "Status"]], encounters),
      section("Ward admissions", [["activity_date", "Date"], ["patient", "Patient"], ["ward", "Ward"], ["bed", "Bed"], ["status", "Status"]], admissions),
      section("Laboratory requests", [["activity_date", "Date"], ["order_number", "Request"], ["patient", "Patient"], ["tests", "Tests"], ["status", "Status"], ["details", "Details"]], laboratory),
      section("Prescriptions", [["activity_date", "Date"], ["patient", "Patient"], ["items", "Items"], ["status", "Status"], ["details", "Details"]], prescriptions),
      section("Radiology", [["activity_date", "Date"], ["request_number", "Request"], ["patient", "Patient"], ["study", "Study"], ["status", "Status"]], radiology),
      section("Bills", [["activity_date", "Date"], ["patient", "Patient"], ["description", "Description"], ["total", "Total"], ["paid", "Paid"], ["status", "Status"]], charges),
      section("Payments", [["activity_date", "Date"], ["patient", "Patient"], ["amount", "Amount"], ["payment_method", "Method"], ["reference", "Reference"]], payments),
      section("Store activity", [["activity_date", "Date"], ["item", "Item"], ["transaction_type", "Type"], ["quantity", "Quantity"], ["total_cost", "Cost"], ["reason", "Reason"]], inventory),
      section("Expenses", [["activity_date", "Date"], ["title", "Expense"], ["category", "Category"], ["amount", "Amount"], ["notes", "Notes"]], expenses),
      section("Medication administration", [["activity_date", "Scheduled"], ["patient", "Patient"], ["medication_name", "Medication"], ["status", "Status"], ["staff", "Staff"]], administrations),
      section("Diagnoses", [["activity_date", "Date"], ["patient", "Patient"], ["diagnosis_name", "Diagnosis"], ["diagnosis_type", "Type"], ["code", "Code"]], diagnoses),
      section("Vital signs", [["activity_date", "Date"], ["patient", "Patient"], ["blood_pressure", "BP"], ["temperature", "Temp"], ["pulse", "Pulse"], ["oxygen", "SpO2"]], vitals),
      section("Audit activity", [["activity_date", "Date"], ["staff", "Staff"], ["module", "Module"], ["action", "Action"], ["reference", "Reference"]], audit)
    ];

    const report: HospitalActivityReport = {
      from: parsed.data.from,
      generatedAt: new Date().toISOString(),
      hospitalName: session.facilityName || "St Gianna Specialist Hospital",
      sections,
      summary: sections.slice(0, 12).map((item) => ({ label: item.title, value: item.rows.length })),
      to: parsed.data.to
    };
    return NextResponse.json(report);
  } catch (error) {
    console.error("[hospital-report]", error);
    return NextResponse.json({ error: "Hospital report could not be prepared." }, { status: 500 });
  }
}
