import { generateId, commitOnlineMutation } from "@/lib/online-core";
import { getAppClient } from "@/lib/app-client";
import type { Json, Tables } from "@/types/database";

function requireDatabase() {
  const database = getAppClient();
  if (!database) {
    throw new Error("Service unavailable.");
  }

  return database;
}

function nowIso() {
  return new Date().toISOString();
}

function getStatusPatch(
  nextStatus: Tables<"order_tests">["status"],
  actorId?: string | null
) {
  const now = nowIso();
  const patch: Partial<Tables<"order_tests">> = {
    status: nextStatus,
    updated_at: now
  };

  if (nextStatus === "Collected") {
    patch.collected_at = now;
    patch.collected_by = actorId ?? null;
  }

  if (nextStatus === "In_Progress") {
    patch.in_progress_at = now;
  }

  if (nextStatus === "Results_Entered") {
    patch.results_entered_at = now;
  }

  if (nextStatus === "Verified") {
    patch.verified_at = now;
  }

  if (nextStatus === "Reported") {
    patch.reported_at = now;
  }

  return patch;
}

export async function recordAuditLog(args: {
  action: string;
  actorId?: string | null;
  entityId: string;
  entityTable: string;
  facilityId: string;
  payload: Json;
}) {
  const database = requireDatabase();
  const { error } = await database.from("audit_logs").insert({
    action: args.action,
    actor_id: args.actorId ?? null,
    entity_id: args.entityId,
    entity_table: args.entityTable,
    facility_id: args.facilityId,
    id: generateId(),
    payload: args.payload
  });

  if (error) {
    throw error;
  }
}

export async function createTestOrderBundle(args: {
  notes: string | null;
  patient: Pick<Tables<"patients">, "facility_id" | "id" | "name">;
  priority: string;
  tests: Array<Pick<Tables<"tests">, "id" | "name" | "price">>;
  userId?: string | null;
}) {
  const database = requireDatabase();
  const { data: order, error: orderError } = await database
    .from("orders")
    .insert({
      facility_id: args.patient.facility_id,
      notes: args.notes,
      ordered_by: args.userId ?? null,
      patient_id: args.patient.id,
      priority: args.priority,
      status: "Registered"
    })
    .select("id, order_number")
    .single();

  if (orderError) {
    throw orderError;
  }

  const { data: orderTests, error: testsError } = await database
    .from("order_tests")
    .insert(
      args.tests.map((test) => ({
        order_id: order.id,
        specimen_label: test.name,
        status: "Registered",
        test_id: test.id
      }))
    )
    .select("id, barcode_value, order_id, qr_value, sample_code, status, specimen_label");

  if (testsError) {
    throw testsError;
  }

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    patientId: args.patient.id,
    samples: (orderTests ?? []).map((row: Record<string, unknown>) => ({
      barcode_value: row.barcode_value,
      order_number: order.order_number,
      order_test_id: row.id,
      patient_name: args.patient.name,
      qr_value: row.qr_value,
      sample_code: row.sample_code,
      sample_status: row.status,
      test_name: row.specimen_label
    }))
  };
}

export async function addTestsToOrder(args: {
  order: Pick<Tables<"orders">, "id" | "order_number" | "patient_id">;
  patientName: string;
  tests: Array<Pick<Tables<"tests">, "id" | "name" | "price">>;
  userId?: string | null;
}) {
  const database = requireDatabase();
  const { data: existingRows, error: existingError } = await database
    .from("order_tests")
    .select("test_id")
    .eq("order_id", args.order.id);

  if (existingError) {
    throw existingError;
  }

  const existingTestIds = new Set((existingRows ?? []).map((row: Record<string, unknown>) => row.test_id));
  const newTests = args.tests.filter((test) => !existingTestIds.has(test.id));

  if (newTests.length === 0) {
    return {
      orderId: args.order.id,
      orderNumber: args.order.order_number,
      samples: [] as Awaited<ReturnType<typeof createTestOrderBundle>>["samples"]
    };
  }

  const { data, error } = await database
    .from("order_tests")
    .insert(
      newTests.map((test) => ({
        order_id: args.order.id,
        specimen_label: test.name,
        status: "Registered",
        test_id: test.id
      }))
    )
    .select("id, barcode_value, qr_value, sample_code, status, specimen_label");

  if (error) {
    throw error;
  }

  return {
    orderId: args.order.id,
    orderNumber: args.order.order_number,
    samples: (data ?? []).map((row: Record<string, unknown>) => ({
      barcode_value: row.barcode_value,
      order_number: args.order.order_number,
      order_test_id: row.id,
      patient_name: args.patientName,
      qr_value: row.qr_value,
      sample_code: row.sample_code,
      sample_status: row.status,
      test_name: row.specimen_label
    }))
  };
}

export async function updateSampleStatus(args: {
  actorId?: string | null;
  facilityId: string;
  nextStatus: Tables<"order_tests">["status"];
  sample: Pick<Tables<"order_tests">, "id" | "order_id" | "sample_code" | "status">;
}) {
  await commitOnlineMutation({
    action: "update",
    entity: "order_tests",
    payload: getStatusPatch(args.nextStatus, args.actorId) as Json,
    recordId: args.sample.id
  });
}

export async function saveResult(args: {
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
  const database = requireDatabase();
  const now = nowIso();
  const { data: existing, error: existingError } = await database
    .from("order_test_results")
    .select("id, created_at")
    .eq("order_test_id", args.orderTest.id)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const resultId = existing?.id ?? generateId();
  const row = {
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

  const { error } = existing
    ? await database.from("order_test_results").update(row).eq("id", resultId)
    : await database.from("order_test_results").insert(row);

  if (error) {
    throw error;
  }

  await updateSampleStatus({
    actorId: args.actorId,
    facilityId: args.facilityId,
    nextStatus: "Results_Entered",
    sample: args.orderTest
  });

  await recordAuditLog({
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

export async function verifyResult(args: {
  actorId?: string | null;
  facilityId: string;
  orderTest: Pick<Tables<"order_tests">, "id" | "order_id" | "sample_code" | "status">;
  result: Tables<"order_test_results">;
}) {
  const database = requireDatabase() as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ error: Error | null }>;
  };
  const { error } = await database.rpc("verify_result", {
    target_result_id: args.result.id,
    verification_notes: null
  });

  if (error) {
    throw error;
  }
}

export async function applyInventoryTransaction(args: {
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
  const database = requireDatabase() as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ error: Error | null }>;
  };
  const { error } = await database.rpc("apply_inventory_transaction", {
    item_unit_cost_value: Math.max(Number(args.unitCost) || 0, 0),
    notes_value: args.notes,
    quantity_value: args.quantity,
    reason_value: args.reason,
    reference_number_value: args.referenceNumber,
    target_item_id: args.item.id,
    transaction_type_value: args.transactionType
  });

  if (error) {
    throw error;
  }
}

export async function recordInvoicePayment(args: {
  actorId?: string | null;
  amount: number;
  facilityId: string;
  invoice: Tables<"invoices">;
  method: string;
  notes: string | null;
  referenceNumber: string | null;
}) {
  const database = requireDatabase();
  const { error } = await database.rpc("register_invoice_payment", {
    amount_value: args.amount,
    notes_value: args.notes,
    payment_method_value: args.method,
    reference_number_value: args.referenceNumber,
    target_invoice_id: args.invoice.id
  });

  if (error) {
    throw error;
  }
}

export async function markReportsReleased(args: {
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
  const now = nowIso();

  for (const order of args.orders) {
    const reportableIds = order.order_tests
      .filter((test) => test.order_test_results?.verified_at && test.status !== "Reported")
      .map((test) => test.id);

    if (reportableIds.length > 0) {
      const database = requireDatabase();
      const { error } = await database
        .from("order_tests")
        .update({ reported_at: now, status: "Reported", updated_at: now })
        .in("id", reportableIds);

      if (error) {
        throw error;
      }
    }

    await commitOnlineMutation({
      action: "update",
      entity: "orders",
      payload: {
        reported_at: now,
        status: "Reported",
        updated_at: now
      } as Json,
      recordId: order.id
    });

    await recordAuditLog({
      action: args.action,
      actorId: args.actorId ?? null,
      entityId: order.id,
      entityTable: "orders",
      facilityId: args.facilityId,
      payload: {
        generated_at: now,
        order_number: order.order_number
      }
    });
  }
}
