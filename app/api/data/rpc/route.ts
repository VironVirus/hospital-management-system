import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { getCurrentSession } from "@/lib/auth-session";
import { getPool, nextCounter, withTransaction } from "@/lib/db";
import { HOSPITAL_ID } from "@/lib/db/schema";

function response(data: unknown = null) {
  return NextResponse.json({ data, error: null });
}

function moneyStatus(paid: number, total: number) {
  return paid >= total && total > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
}

function forbidden() {
  return NextResponse.json({ data: null, error: { message: "Your staff role cannot perform this action." } }, { status: 403 });
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ data: null, error: { message: "Sign in required." } }, { status: 401 });
    const payload = await request.json().catch(() => null) as { name?: string; args?: Record<string, unknown> } | null;
    const name = payload?.name || "";
    const args = payload?.args || {};
    const pool = getPool();

    if (name === "search_patients") {
      if (session.profile.role === "Storekeeper") return forbidden();
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

    if (name === "bump_test_bundle_usage") {
      if (!["Admin", "Receptionist", "LabScientist"].includes(session.profile.role)) return forbidden();
      await pool.execute("UPDATE test_bundles SET usage_count = usage_count + 1, last_used_at = UTC_TIMESTAMP(3) WHERE id = ? AND facility_id = ?", [String(args.target_bundle_id), HOSPITAL_ID]);
      return response(null);
    }

    if (name === "apply_inventory_transaction") {
      if (!["Admin", "Accountant", "Storekeeper", "Pharmacist", "LabScientist"].includes(session.profile.role)) return forbidden();
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
          [id, HOSPITAL_ID, item.id, type, quantity, unitCost, quantity * unitCost, next, args.reason_value || null, args.reference_number_value || null, args.notes_value || null, session.user.id]
        );
      });
      return response(null);
    }

    if (name === "register_invoice_payment") {
      if (!["Admin", "Accountant"].includes(session.profile.role)) return forbidden();
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
          [paymentId, HOSPITAL_ID, invoice.id, receipt, amount, args.payment_method_value, args.reference_number_value || null, args.notes_value || null, session.user.id]
        );
        const status = moneyStatus(paid, total);
        await connection.execute("UPDATE invoices SET amount_paid = ?, payment_status = ? WHERE id = ?", [paid, status, invoice.id]);
        return [{ payment_id: paymentId, invoice_id: invoice.id, receipt_number: receipt, amount, amount_paid: paid, balance_due: total - paid, payment_status: status, received_at: new Date().toISOString() }];
      });
      return response(data);
    }

    if (name === "verify_result") {
      if (!["Admin", "Verifier"].includes(session.profile.role)) throw new Error("Only a result verifier can approve results.");
      await withTransaction(async (connection) => {
        const [results] = await connection.query<RowDataPacket[]>("SELECT * FROM order_test_results WHERE id = ? FOR UPDATE", [String(args.target_result_id)]);
        const result = results[0];
        if (!result) throw new Error("Result not found.");
        await connection.execute("UPDATE order_test_results SET verified_by = ?, verified_at = UTC_TIMESTAMP(3) WHERE id = ?", [session.user.id, result.id]);
        await connection.execute("UPDATE order_tests SET status = 'Verified', verified_at = UTC_TIMESTAMP(3) WHERE id = ?", [result.order_test_id]);
        await connection.execute(
          "INSERT INTO audit_logs (id, facility_id, entity_table, entity_id, action, payload, actor_id) VALUES (?, ?, 'order_test_results', ?, 'result_verified', ?, ?)",
          [randomUUID(), HOSPITAL_ID, result.id, JSON.stringify({ verification_notes: args.verification_notes || null }), session.user.id]
        );
      });
      return response(null);
    }

    if (name === "dispense_prescription") {
      if (!["Admin", "Pharmacist"].includes(session.profile.role)) throw new Error("Only pharmacy staff can dispense medication.");
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
        await connection.execute("UPDATE prescriptions SET status = 'Dispensed', dispensed_by = ?, dispensed_at = UTC_TIMESTAMP(3) WHERE id = ?", [session.user.id, String(args.target_prescription_id)]);
      });
      return response(null);
    }

    if (name === "record_hospital_payment") {
      if (!["Admin", "Receptionist", "Accountant"].includes(session.profile.role)) return forbidden();
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
          [id, HOSPITAL_ID, charge.id, charge.patient_id, amount, args.payment_method_value, args.reference_number_value || null, args.notes_value || null, session.user.id]
        );
        await connection.execute("UPDATE encounter_charges SET amount_paid = ?, payment_status = ? WHERE id = ?", [paid, moneyStatus(paid, total), charge.id]);
        return id;
      });
      return response(data);
    }

    return NextResponse.json({ data: null, error: { message: "Unknown server operation." } }, { status: 400 });
  } catch (error) {
    const databaseError = error as { code?: string };
    console.error("[data-rpc]", error);
    return NextResponse.json({
      data: null,
      error: { message: databaseError.code ? "The request could not be completed." : error instanceof Error ? error.message : "The request could not be completed." }
    }, { status: 500 });
  }
}
