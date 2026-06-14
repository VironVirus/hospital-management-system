import type { Json, Tables } from "@/types/supabase";
import { db } from "@/lib/dexie";
import {
  buildOfflineInvoiceNumber,
  buildOfflineOrderNumber,
  buildOfflineReceiptNumber,
  buildOfflineSampleCode,
  commitLocalMutation,
  generateLocalId,
  putLocalOnlyRow
} from "@/lib/offline-core";

const sampleWorkflow = [
  "Registered",
  "Collected",
  "In_Progress",
  "Results_Entered",
  "Verified",
  "Reported"
] as const;

function getWorkflowIndex(status: Tables<"order_tests">["status"]) {
  return sampleWorkflow.indexOf(status);
}

function deriveOrderStatus(statuses: Tables<"order_tests">["status"][]) {
  if (statuses.length === 0) {
    return "Registered" as Tables<"orders">["status"];
  }

  return statuses.reduce((current, next) =>
    getWorkflowIndex(next) > getWorkflowIndex(current) ? next : current
  );
}

async function refreshLocalOrderStatus(orderId: string) {
  const orderTests = await db.order_tests.where("order_id").equals(orderId).toArray();
  const order = await db.orders.get(orderId);
  if (!order) {
    return;
  }

  const nextStatus = deriveOrderStatus(orderTests.map((row) => row.status));
  await commitLocalMutation({
    action: "update",
    entity: "orders",
    payload: {
      status: nextStatus,
      updated_at: new Date().toISOString()
    },
    recordId: orderId
  });
}

export async function queueAuditLog(args: {
  action: string;
  actorId?: string | null;
  entityId: string;
  entityTable: string;
  facilityId: string;
  payload: Json;
}) {
  const row: Tables<"audit_logs"> = {
    action: args.action,
    actor_id: args.actorId ?? null,
    created_at: new Date().toISOString(),
    entity_id: args.entityId,
    entity_table: args.entityTable,
    facility_id: args.facilityId,
    id: generateLocalId("audit"),
    payload: args.payload
  };

  await commitLocalMutation({
    action: "insert",
    critical: false,
    entity: "audit_logs",
    facilityId: args.facilityId,
    payload: row,
    recordId: row.id,
    userId: args.actorId ?? null
  });
}

export async function createOfflineOrderBundle(args: {
  facilityId: string;
  notes: string | null;
  patient: Pick<Tables<"patients">, "id" | "name">;
  priority: string;
  tests: Array<Pick<Tables<"tests">, "id" | "name" | "price">>;
  userId?: string | null;
}) {
  const now = new Date().toISOString();
  const orderId = generateLocalId("order");
  const invoiceId = generateLocalId("invoice");
  const orderNumber = buildOfflineOrderNumber();

  const orderRow: Tables<"orders"> = {
    created_at: now,
    facility_id: args.facilityId,
    id: orderId,
    notes: args.notes,
    order_number: orderNumber,
    ordered_at: now,
    ordered_by: args.userId ?? null,
    patient_id: args.patient.id,
    priority: args.priority,
    reported_at: null,
    status: "Registered",
    updated_at: now
  };

  const invoiceSubtotal = args.tests.reduce((sum, test) => sum + Number(test.price), 0);
  const invoiceRow: Tables<"invoices"> = {
    amount_paid: 0,
    created_at: now,
    created_by: args.userId ?? null,
    discount_amount: 0,
    due_at: null,
    facility_id: args.facilityId,
    id: invoiceId,
    invoice_number: buildOfflineInvoiceNumber(),
    issued_at: now,
    notes: null,
    order_id: orderId,
    payment_status: "Unpaid",
    subtotal: invoiceSubtotal,
    total_amount: invoiceSubtotal,
    updated_at: now
  };

  await commitLocalMutation({
    action: "insert",
    entity: "orders",
    facilityId: args.facilityId,
    payload: orderRow,
    recordId: orderId,
    userId: args.userId ?? null
  });

  await commitLocalMutation({
    action: "insert",
    entity: "invoices",
    facilityId: args.facilityId,
    payload: invoiceRow,
    recordId: invoiceId,
    userId: args.userId ?? null
  });

  const samples = [] as Array<{
    barcode_value: string;
    order_number: string;
    order_test_id: string;
    patient_name: string;
    qr_value: string;
    sample_code: string;
    sample_status: Tables<"order_tests">["status"];
    test_name: string;
  }>;

  for (const [index, test] of args.tests.entries()) {
    const orderTestId = generateLocalId("order-test");
    const sampleCode = await buildOfflineSampleCode(index);
    const sampleRow: Tables<"order_tests"> = {
      barcode_value: sampleCode,
      collected_at: null,
      collected_by: null,
      created_at: now,
      id: orderTestId,
      in_progress_at: null,
      order_id: orderId,
      qr_value: sampleCode,
      reported_at: null,
      results_entered_at: null,
      sample_code: sampleCode,
      specimen_label: test.name,
      status: "Registered",
      test_id: test.id,
      updated_at: now,
      verified_at: null
    };

    const invoiceItemRow: Tables<"invoice_items"> = {
      created_at: now,
      id: generateLocalId("invoice-item"),
      invoice_id: invoiceId,
      line_total: Number(test.price),
      order_test_id: orderTestId,
      quantity: 1,
      test_name: test.name,
      unit_price: Number(test.price)
    };

    const custodyRow: Tables<"sample_custody_logs"> = {
      action: "sample_registered",
      actor_id: args.userId ?? null,
      created_at: now,
      from_status: null,
      id: generateLocalId("custody"),
      notes: "Captured offline and queued for synchronization.",
      order_test_id: orderTestId,
      to_status: "Registered"
    };

    await commitLocalMutation({
      action: "insert",
      entity: "order_tests",
      facilityId: args.facilityId,
      payload: sampleRow,
      recordId: orderTestId,
      userId: args.userId ?? null
    });

    await putLocalOnlyRow("invoice_items", invoiceItemRow);
    await putLocalOnlyRow("sample_custody_logs", custodyRow);

    samples.push({
      barcode_value: sampleRow.barcode_value,
      order_number: orderNumber,
      order_test_id: orderTestId,
      patient_name: args.patient.name,
      qr_value: sampleRow.qr_value,
      sample_code: sampleCode,
      sample_status: sampleRow.status,
      test_name: test.name
    });
  }

  return {
    orderId,
    orderNumber,
    patientName: args.patient.name,
    samples
  };
}

export async function updateSampleStatusOffline(args: {
  actorId?: string | null;
  facilityId: string;
  nextStatus: Tables<"order_tests">["status"];
  sample: Pick<Tables<"order_tests">, "id" | "order_id" | "sample_code" | "status">;
}) {
  const now = new Date().toISOString();
  const statusPatch: Partial<Tables<"order_tests">> = {
    status: args.nextStatus,
    updated_at: now
  };

  if (args.nextStatus === "Collected") {
    statusPatch.collected_at = now;
    statusPatch.collected_by = args.actorId ?? null;
  }

  if (args.nextStatus === "In_Progress") {
    statusPatch.in_progress_at = now;
  }

  if (args.nextStatus === "Results_Entered") {
    statusPatch.results_entered_at = now;
  }

  if (args.nextStatus === "Verified") {
    statusPatch.verified_at = now;
  }

  if (args.nextStatus === "Reported") {
    statusPatch.reported_at = now;
  }

  await commitLocalMutation({
    action: "update",
    critical: true,
    entity: "order_tests",
    facilityId: args.facilityId,
    payload: statusPatch,
    recordId: args.sample.id,
    userId: args.actorId ?? null
  });

  await putLocalOnlyRow("sample_custody_logs", {
    action: "status_transition",
    actor_id: args.actorId ?? null,
    created_at: now,
    from_status: args.sample.status,
    id: generateLocalId("custody"),
    notes: `Moved offline to ${args.nextStatus}.`,
    order_test_id: args.sample.id,
    to_status: args.nextStatus
  });

  await refreshLocalOrderStatus(args.sample.order_id);
}

export async function saveResultOffline(args: {
  abnormalFlag: boolean;
  abnormalReason: string | null;
  actorId?: string | null;
  displayValue: string;
  facilityId: string;
  orderTest: Pick<Tables<"order_tests">, "id" | "order_id" | "sample_code" | "status">;
  payload: Pick<
    Partial<Tables<"order_test_results">>,
    | "abnormal_flag"
    | "abnormal_reason"
    | "interpretation"
    | "value_boolean"
    | "value_numeric"
    | "value_text"
  >;
}) {
  const now = new Date().toISOString();
  const existing = await db.order_test_results.where("order_test_id").equals(args.orderTest.id).first();
  const resultId = existing?.id ?? generateLocalId("result");

  const resultRow: Tables<"order_test_results"> = {
    abnormal_flag: args.payload.abnormal_flag ?? false,
    abnormal_reason: args.payload.abnormal_reason ?? null,
    created_at: existing?.created_at ?? now,
    entered_at: now,
    entered_by: args.actorId ?? null,
    id: resultId,
    interpretation: args.payload.interpretation ?? null,
    order_test_id: args.orderTest.id,
    updated_at: now,
    value_boolean: args.payload.value_boolean ?? null,
    value_numeric: args.payload.value_numeric ?? null,
    value_text: args.payload.value_text ?? null,
    verified_at: null,
    verified_by: null
  };

  await commitLocalMutation({
    action: existing ? "upsert" : "insert",
    entity: "order_test_results",
    facilityId: args.facilityId,
    payload: resultRow,
    recordId: resultId,
    userId: args.actorId ?? null
  });

  await updateSampleStatusOffline({
    actorId: args.actorId,
    facilityId: args.facilityId,
    nextStatus: "Results_Entered",
    sample: args.orderTest
  });

  await queueAuditLog({
    action: "result_entered",
    actorId: args.actorId ?? null,
    entityId: resultId,
    entityTable: "order_test_results",
    facilityId: args.facilityId,
    payload: {
      abnormal_flag: args.abnormalFlag,
      abnormal_reason: args.abnormalReason,
      display_value: args.displayValue,
      sample_code: args.orderTest.sample_code
    }
  });
}

export async function verifyResultOffline(args: {
  actorId?: string | null;
  facilityId: string;
  orderTest: Pick<Tables<"order_tests">, "id" | "order_id" | "sample_code" | "status">;
  result: Tables<"order_test_results">;
}) {
  const now = new Date().toISOString();

  await commitLocalMutation({
    action: "update",
    critical: true,
    entity: "order_test_results",
    facilityId: args.facilityId,
    payload: {
      verified_at: now,
      verified_by: args.actorId ?? null
    },
    recordId: args.result.id,
    userId: args.actorId ?? null
  });

  await updateSampleStatusOffline({
    actorId: args.actorId,
    facilityId: args.facilityId,
    nextStatus: "Verified",
    sample: args.orderTest
  });

  await queueAuditLog({
    action: "result_verified",
    actorId: args.actorId ?? null,
    entityId: args.result.id,
    entityTable: "order_test_results",
    facilityId: args.facilityId,
    payload: {
      sample_code: args.orderTest.sample_code,
      verified_at: now
    }
  });
}

export async function applyInventoryTransactionOffline(args: {
  actorId?: string | null;
  facilityId: string;
  item: Tables<"inventory_items">;
  notes: string | null;
  quantity: number;
  reason: string | null;
  referenceNumber: string | null;
  transactionType: string;
  unitCost: number;
}) {
  const now = new Date().toISOString();
  const signedQuantity =
    args.transactionType === "stock_out" || args.transactionType === "usage"
      ? -Math.abs(args.quantity)
      : args.transactionType === "adjustment"
        ? args.quantity
        : Math.abs(args.quantity);
  const nextBalance = Number(args.item.quantity) + Number(signedQuantity);
  const normalizedUnitCost = Math.max(Number(args.unitCost) || 0, 0);
  const transactionId = generateLocalId("inventory-transaction");

  await commitLocalMutation({
    action: "insert",
    entity: "inventory_transactions",
    facilityId: args.facilityId,
    payload: {
      balance_after: nextBalance,
      created_at: now,
      facility_id: args.facilityId,
      id: transactionId,
      item_id: args.item.id,
      notes: args.notes,
      performed_by: args.actorId ?? null,
      quantity: signedQuantity,
      reason: args.reason,
      reference_number: args.referenceNumber,
      total_cost: Math.abs(Number(signedQuantity)) * normalizedUnitCost,
      transaction_type: args.transactionType,
      unit_cost: normalizedUnitCost
    } satisfies Tables<"inventory_transactions">,
    recordId: transactionId,
    userId: args.actorId ?? null
  });

  await commitLocalMutation({
    action: "update",
    entity: "inventory_items",
    facilityId: args.facilityId,
    payload: {
      last_stocked_at:
        signedQuantity > 0 ? now : args.item.last_stocked_at,
      quantity: nextBalance,
      unit_cost:
        args.transactionType === "stock_in" && normalizedUnitCost > 0
          ? normalizedUnitCost
          : args.item.unit_cost,
      updated_at: now
    } satisfies Partial<Tables<"inventory_items">>,
    recordId: args.item.id,
    userId: args.actorId ?? null
  });
}

export async function recordInvoicePaymentOffline(args: {
  actorId?: string | null;
  amount: number;
  facilityId: string;
  invoice: Tables<"invoices">;
  method: string;
  notes: string | null;
  referenceNumber: string | null;
}) {
  const now = new Date().toISOString();
  const paymentId = generateLocalId("payment");
  const nextAmountPaid = Number(args.invoice.amount_paid) + Number(args.amount);
  const totalAmount = Number(args.invoice.total_amount);
  const nextStatus =
    nextAmountPaid >= totalAmount
      ? "Paid"
      : nextAmountPaid > 0
        ? "Partial"
        : "Unpaid";

  await commitLocalMutation({
    action: "insert",
    critical: true,
    entity: "invoice_payments",
    facilityId: args.facilityId,
    payload: {
      amount: args.amount,
      created_at: now,
      facility_id: args.facilityId,
      id: paymentId,
      invoice_id: args.invoice.id,
      notes: args.notes,
      payment_method: args.method,
      receipt_number: buildOfflineReceiptNumber(),
      received_at: now,
      received_by: args.actorId ?? null,
      reference_number: args.referenceNumber
    } satisfies Tables<"invoice_payments">,
    recordId: paymentId,
    userId: args.actorId ?? null
  });

  await commitLocalMutation({
    action: "update",
    critical: true,
    entity: "invoices",
    facilityId: args.facilityId,
    payload: {
      amount_paid: nextAmountPaid,
      payment_status: nextStatus,
      updated_at: now
    } satisfies Partial<Tables<"invoices">>,
    recordId: args.invoice.id,
    userId: args.actorId ?? null
  });
}

export async function markReportsReleasedOffline(args: {
  action: "report_downloaded" | "report_printed" | "report_delivery_placeholder";
  actorId?: string | null;
  facilityId: string;
  orders: Array<
    Pick<Tables<"orders">, "id" | "order_number"> & {
      order_tests: Array<
        Pick<Tables<"order_tests">, "id" | "sample_code" | "status"> & {
          order_test_results: Pick<Tables<"order_test_results">, "verified_at"> | null;
        }
      >;
    }
  >;
}) {
  const now = new Date().toISOString();

  for (const order of args.orders) {
    for (const orderTest of order.order_tests) {
      if (!orderTest.order_test_results?.verified_at || orderTest.status === "Reported") {
        continue;
      }

      await commitLocalMutation({
        action: "update",
        critical: true,
        entity: "order_tests",
        facilityId: args.facilityId,
        payload: {
          reported_at: now,
          status: "Reported",
          updated_at: now
        },
        recordId: orderTest.id,
        userId: args.actorId ?? null
      });
    }

    await commitLocalMutation({
      action: "update",
      critical: true,
      entity: "orders",
      facilityId: args.facilityId,
      payload: {
        reported_at: now,
        status: "Reported",
        updated_at: now
      },
      recordId: order.id,
      userId: args.actorId ?? null
    });

    await queueAuditLog({
      action: args.action,
      actorId: args.actorId ?? null,
      entityId: order.id,
      entityTable: "orders",
      facilityId: args.facilityId,
      payload: {
        generated_at: now,
        order_number: order.order_number,
        report_test_count: order.order_tests.length
      }
    });
  }
}
