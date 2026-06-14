import type { Database, Tables } from "@/types/supabase";
import { db, type SyncedTableName } from "@/lib/dexie";
import { cacheRows } from "@/lib/offline-core";
import { normalizeTestCategory } from "@/features/tests/categories";

type SearchPatientRow =
  Database["public"]["Functions"]["search_patients"]["Returns"][number];

function isLocalOnlyId(value: string | null | undefined) {
  return Boolean(value && value.startsWith("local-"));
}

function compareDatesDescending(left: string | null | undefined, right: string | null | undefined) {
  return new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();
}

function matchesText(haystack: Array<string | null | undefined>, needle: string) {
  const target = needle.trim().toLowerCase();
  if (!target) {
    return true;
  }

  return haystack
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(target);
}

function hasStringId(value: unknown): value is Record<string, unknown> & { id: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof (value as { id?: unknown }).id === "string"
  );
}

async function putRows(entity: SyncedTableName, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return;
  }

  await cacheRows(entity, rows);
}

export async function cacheProfiles(rows: Tables<"profiles">[]) {
  await putRows("profiles", rows);
}

export async function cacheExpenses(rows: Tables<"expenses">[]) {
  await putRows("expenses", rows);
}

export async function cacheTests(rows: Tables<"tests">[]) {
  await putRows("tests", rows);
}

export async function cachePatients(rows: Array<Partial<Tables<"patients">> & { id: string }>) {
  const normalized = rows.map((row) => ({
    address: row.address ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    created_by: row.created_by ?? null,
    date_of_birth: row.date_of_birth ?? null,
    dob: row.dob ?? null,
    email: row.email ?? null,
    emergency_contact: row.emergency_contact ?? null,
    facility_id: row.facility_id ?? "",
    first_name: row.first_name ?? null,
    id: row.id,
    lab_id: row.lab_id ?? "",
    last_name: row.last_name ?? null,
    lga: row.lga ?? null,
    medical_record_number: row.medical_record_number ?? null,
    name: row.name ?? "Unknown patient",
    national_id: row.national_id ?? null,
    ndpr_consent: row.ndpr_consent ?? false,
    ndpr_consent_at: row.ndpr_consent_at ?? null,
    notes: row.notes ?? null,
    phone: row.phone ?? null,
    sex: row.sex ?? null,
    state: row.state ?? null,
    updated_at: row.updated_at ?? new Date().toISOString()
  }));

  await putRows("patients", normalized);
}

export async function cacheOrdersWithRelations(rows: Array<Record<string, unknown>>) {
  const orders: Tables<"orders">[] = [];
  const patients: Array<Partial<Tables<"patients">> & { id: string }> = [];
  const tests: Tables<"tests">[] = [];
  const orderTests: Tables<"order_tests">[] = [];
  const results: Tables<"order_test_results">[] = [];
  const facilities: Tables<"facilities">[] = [];

  rows.forEach((entry) => {
    const row = entry as Record<string, unknown>;
    if (hasStringId(row)) {
      orders.push(row as unknown as Tables<"orders">);
    }

    const patientRelation = row["patients"];
    if (hasStringId(patientRelation)) {
      patients.push(patientRelation as Partial<Tables<"patients">> & { id: string });
    }

    const facilityRelation = row["facilities"];
    if (hasStringId(facilityRelation)) {
      facilities.push(facilityRelation as Tables<"facilities">);
    }

    const nestedOrderTests = Array.isArray(row["order_tests"]) ? row["order_tests"] : [];
    nestedOrderTests.forEach((orderTestValue: unknown) => {
      const orderTest = orderTestValue as Record<string, unknown>;
      if (hasStringId(orderTest)) {
        orderTests.push(orderTest as unknown as Tables<"order_tests">);
      }

      const testRelation = orderTest["tests"];
      if (hasStringId(testRelation)) {
        tests.push(testRelation as Tables<"tests">);
      }

      const resultRelation = orderTest["order_test_results"];
      if (hasStringId(resultRelation)) {
        results.push(resultRelation as Tables<"order_test_results">);
      }
    });
  });

  await Promise.all([
    putRows("orders", orders),
    cachePatients(patients),
    putRows("facilities", facilities),
    putRows("order_tests", orderTests),
    putRows("tests", tests),
    putRows("order_test_results", results)
  ]);
}

export async function cacheOrderTestsWithRelations(rows: Array<Record<string, unknown>>) {
  const orderTests: Tables<"order_tests">[] = [];
  const orders: Tables<"orders">[] = [];
  const patients: Array<Partial<Tables<"patients">> & { id: string }> = [];
  const tests: Tables<"tests">[] = [];
  const results: Tables<"order_test_results">[] = [];

  rows.forEach((entry) => {
    const row = entry as Record<string, unknown>;
    if (hasStringId(row)) {
      orderTests.push(row as unknown as Tables<"order_tests">);
    }

    const testRelation = row["tests"];
    if (hasStringId(testRelation)) {
      tests.push(testRelation as Tables<"tests">);
    }

    const orderRelation = row["orders"];
    if (orderRelation && typeof orderRelation === "object") {
      const order = orderRelation as Record<string, unknown>;
      if (hasStringId(order)) {
        orders.push(order as unknown as Tables<"orders">);
      }

      const patientRelation = order["patients"];
      if (hasStringId(patientRelation)) {
        patients.push(patientRelation as Partial<Tables<"patients">> & { id: string });
      }
    }

    const resultRelation = row["order_test_results"];
    if (hasStringId(resultRelation)) {
      results.push(resultRelation as Tables<"order_test_results">);
    }
  });

  await Promise.all([
    putRows("order_tests", orderTests),
    putRows("orders", orders),
    cachePatients(patients),
    putRows("tests", tests),
    putRows("order_test_results", results)
  ]);
}

export async function cacheSampleCustodyLogs(rows: Tables<"sample_custody_logs">[]) {
  await putRows("sample_custody_logs", rows);
}

export async function cacheAuditLogs(rows: Tables<"audit_logs">[]) {
  await putRows("audit_logs", rows);
}

export async function cacheInventoryItems(rows: Tables<"inventory_items">[]) {
  await putRows("inventory_items", rows);
}

export async function cacheInventoryTransactions(rows: Tables<"inventory_transactions">[]) {
  await putRows("inventory_transactions", rows);
}

export async function cacheInvoicesWithRelations(rows: Array<Record<string, unknown>>) {
  const invoices: Tables<"invoices">[] = [];
  const invoiceItems: Tables<"invoice_items">[] = [];
  const invoicePayments: Tables<"invoice_payments">[] = [];
  const orders: Tables<"orders">[] = [];
  const orderTests: Tables<"order_tests">[] = [];
  const patients: Array<Partial<Tables<"patients">> & { id: string }> = [];
  const facilities: Tables<"facilities">[] = [];
  const tests: Tables<"tests">[] = [];

  rows.forEach((entry) => {
    const row = entry as Record<string, unknown>;
    if (hasStringId(row)) {
      invoices.push(row as unknown as Tables<"invoices">);
    }

    const nestedOrder = row["orders"];
    if (nestedOrder && typeof nestedOrder === "object") {
      const order = nestedOrder as Record<string, unknown>;
      if (hasStringId(order)) {
        orders.push(order as unknown as Tables<"orders">);
      }

      const patientRelation = order["patients"];
      if (hasStringId(patientRelation)) {
        patients.push(patientRelation as Partial<Tables<"patients">> & { id: string });
      }

      const facilityRelation = order["facilities"];
      if (hasStringId(facilityRelation)) {
        facilities.push(facilityRelation as Tables<"facilities">);
      }
    }

    const nestedItems = Array.isArray(row["invoice_items"]) ? row["invoice_items"] : [];
    nestedItems.forEach((item: unknown) => {
      if (hasStringId(item)) {
        invoiceItems.push(item as Tables<"invoice_items">);
      }

      const itemRelations = item as Record<string, unknown>;
      const orderTestRelation = itemRelations["order_tests"];
      if (hasStringId(orderTestRelation)) {
        orderTests.push(orderTestRelation as Tables<"order_tests">);
      }

      if (
        orderTestRelation &&
        typeof orderTestRelation === "object" &&
        hasStringId((orderTestRelation as Record<string, unknown>)["tests"])
      ) {
        tests.push((orderTestRelation as Record<string, unknown>)["tests"] as Tables<"tests">);
      }
    });

    const nestedPayments = Array.isArray(row["invoice_payments"]) ? row["invoice_payments"] : [];
    nestedPayments.forEach((payment: unknown) => {
      if (hasStringId(payment)) {
        invoicePayments.push(payment as Tables<"invoice_payments">);
      }
    });
  });

  await Promise.all([
    putRows("invoices", invoices),
    putRows("invoice_items", invoiceItems),
    putRows("invoice_payments", invoicePayments),
    putRows("orders", orders),
    putRows("order_tests", orderTests),
    cachePatients(patients),
    putRows("facilities", facilities),
    putRows("tests", tests)
  ]);
}

export async function getTestsLocal(args: {
  category?: "all" | "uncategorized" | string;
  query: string;
  resultType: "all" | string;
  status: "all" | "active" | "inactive";
}) {
  const rows = await db.tests.orderBy("name").toArray();

  return rows.filter((row) => {
    if (!matchesText([row.name], args.query)) {
      return false;
    }

    if (args.status === "active" && !row.is_active) {
      return false;
    }

    if (args.status === "inactive" && row.is_active) {
      return false;
    }

    if (args.resultType !== "all" && row.result_type !== args.resultType) {
      return false;
    }

    if (args.category && args.category !== "all") {
      const category = normalizeTestCategory(row.category);
      if (args.category === "uncategorized") {
        return category === null;
      }

      if (category !== args.category) {
        return false;
      }
    }

    return true;
  });
}

export async function getActiveTestsLocal() {
  const rows = await db.tests.toArray();
  return rows.filter((row) => row.is_active).sort((left, right) => left.name.localeCompare(right.name));
}

export async function searchPatientsLocal(searchTerm: string, page: number, pageSize: number) {
  const [patients, orders] = await Promise.all([db.patients.toArray(), db.orders.toArray()]);
  const orderCounts = new Map<string, number>();

  orders.forEach((order) => {
    orderCounts.set(order.patient_id, (orderCounts.get(order.patient_id) ?? 0) + 1);
  });

  const filtered = patients
    .filter((patient) =>
      matchesText([patient.name, patient.phone, patient.lab_id, patient.email], searchTerm)
    )
    .sort((left, right) => compareDatesDescending(left.created_at, right.created_at))
    .map(
      (patient) =>
        ({
          address: patient.address ?? "",
          created_at: patient.created_at,
          created_by: patient.created_by ?? "",
          dob: patient.dob ?? "",
          email: patient.email ?? "",
          emergency_contact: patient.emergency_contact ?? "",
          facility_id: patient.facility_id,
          id: patient.id,
          lab_id: patient.lab_id,
          lga: patient.lga ?? "",
          name: patient.name,
          national_id: patient.national_id ?? "",
          ndpr_consent: patient.ndpr_consent ?? false,
          ndpr_consent_at: patient.ndpr_consent_at ?? null,
          notes: patient.notes ?? "",
          order_count: orderCounts.get(patient.id) ?? 0,
          phone: patient.phone ?? "",
          sex: patient.sex ?? "",
          similarity_score: searchTerm.trim() ? 1 : 0,
          state: patient.state ?? "",
          total_count: 0,
          updated_at: patient.updated_at
        }) satisfies SearchPatientRow
    );

  const totalCount = filtered.length;
  const pageRows = filtered
    .slice((page - 1) * pageSize, page * pageSize)
    .map((row) => ({ ...row, total_count: totalCount }));

  return {
    rows: pageRows,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize))
  };
}

export async function getPatientLocal(patientId: string) {
  return db.patients.get(patientId);
}

export async function getPatientOrdersLocal(patientId: string) {
  const [orders, orderTests, tests] = await Promise.all([
    db.orders.where("patient_id").equals(patientId).sortBy("created_at"),
    db.order_tests.toArray(),
    db.tests.toArray()
  ]);
  const testMap = new Map(tests.map((row) => [row.id, row]));

  return orders
    .sort((left, right) => compareDatesDescending(left.created_at, right.created_at))
    .map((order) => ({
      created_at: order.created_at,
      id: order.id,
      notes: order.notes,
      order_number: order.order_number,
      order_tests: orderTests
        .filter((row) => row.order_id === order.id)
        .map((orderTest) => ({
          id: orderTest.id,
          sample_code: orderTest.sample_code,
          status: orderTest.status,
          tests: (() => {
            const test = testMap.get(orderTest.test_id);
            return test
              ? {
                  id: test.id,
                  name: test.name,
                  result_type: test.result_type
                }
              : null;
          })()
        })),
      priority: order.priority,
      status: order.status,
      updated_at: order.updated_at
    }));
}

export async function getRecentOrdersLocal(limit = 10) {
  const [orders, patients, orderTests, tests] = await Promise.all([
    db.orders.toArray(),
    db.patients.toArray(),
    db.order_tests.toArray(),
    db.tests.toArray()
  ]);
  const patientMap = new Map(patients.map((row) => [row.id, row]));
  const testMap = new Map(tests.map((row) => [row.id, row]));

  return orders
    .sort((left, right) => compareDatesDescending(left.created_at, right.created_at))
    .slice(0, limit)
    .map((order) => ({
      created_at: order.created_at,
      id: order.id,
      notes: order.notes,
      order_number: order.order_number,
      order_tests: orderTests
        .filter((row) => row.order_id === order.id)
        .map((orderTest) => ({
          id: orderTest.id,
          sample_code: orderTest.sample_code,
          status: orderTest.status,
          tests: (() => {
            const test = testMap.get(orderTest.test_id);
            return test ? { id: test.id, name: test.name } : null;
          })()
        })),
      patients: (() => {
        const patient = patientMap.get(order.patient_id);
        return patient
          ? {
              id: patient.id,
              lab_id: patient.lab_id,
              name: patient.name,
              phone: patient.phone
            }
          : null;
      })(),
      priority: order.priority,
      status: order.status
    }));
}

export async function findSampleByCodeLocal(code: string) {
  const [orderTests, orders, patients, tests] = await Promise.all([
    db.order_tests.toArray(),
    db.orders.toArray(),
    db.patients.toArray(),
    db.tests.toArray()
  ]);
  const orderMap = new Map(orders.map((row) => [row.id, row]));
  const patientMap = new Map(patients.map((row) => [row.id, row]));
  const testMap = new Map(tests.map((row) => [row.id, row]));

  const sample = orderTests.find(
    (row) => row.sample_code === code || row.barcode_value === code
  );

  if (!sample) {
    return null;
  }

  const order = orderMap.get(sample.order_id);
  const patient = order ? patientMap.get(order.patient_id) : null;
  const test = testMap.get(sample.test_id);

  return {
    ...sample,
    orders: order
      ? {
          id: order.id,
          order_number: order.order_number,
          patients: patient
            ? {
                id: patient.id,
                lab_id: patient.lab_id,
                name: patient.name,
                phone: patient.phone
              }
            : null,
          priority: order.priority,
          status: order.status
        }
      : null,
    tests: test ? { id: test.id, name: test.name } : null
  };
}

export async function getCustodyLogsLocal(orderTestId: string) {
  const rows = await db.sample_custody_logs.where("order_test_id").equals(orderTestId).toArray();
  return rows.sort((left, right) => compareDatesDescending(left.created_at, right.created_at));
}

export async function getReceptionQueueLocal(limit = 12) {
  const [orderTests, orders, patients, tests] = await Promise.all([
    db.order_tests.toArray(),
    db.orders.toArray(),
    db.patients.toArray(),
    db.tests.toArray()
  ]);
  const orderMap = new Map(orders.map((row) => [row.id, row]));
  const patientMap = new Map(patients.map((row) => [row.id, row]));
  const testMap = new Map(tests.map((row) => [row.id, row]));

  return orderTests
    .filter((row) => row.status !== "Reported")
    .sort((left, right) => compareDatesDescending(left.created_at, right.created_at))
    .slice(0, limit)
    .map((row) => {
      const order = orderMap.get(row.order_id);
      const patient = order ? patientMap.get(order.patient_id) : null;
      const test = testMap.get(row.test_id);

      return {
        id: row.id,
        orders: order
          ? {
              order_number: order.order_number,
              patients: patient
                ? {
                    lab_id: patient.lab_id,
                    name: patient.name
                  }
                : null
            }
          : null,
        sample_code: row.sample_code,
        status: row.status,
        tests: test ? { name: test.name } : null
      };
    });
}

export async function getResultsQueueLocal(limit = 40) {
  const [orderTests, orders, patients, tests, results] = await Promise.all([
    db.order_tests.toArray(),
    db.orders.toArray(),
    db.patients.toArray(),
    db.tests.toArray(),
    db.order_test_results.toArray()
  ]);
  const orderMap = new Map(orders.map((row) => [row.id, row]));
  const patientMap = new Map(patients.map((row) => [row.id, row]));
  const testMap = new Map(tests.map((row) => [row.id, row]));
  const resultMap = new Map(results.map((row) => [row.order_test_id, row]));

  return orderTests
    .filter((row) =>
      ["Registered", "Collected", "In_Progress", "Results_Entered", "Verified"].includes(
        row.status
      )
    )
    .sort((left, right) => compareDatesDescending(left.updated_at, right.updated_at))
    .slice(0, limit)
    .map((row) => {
      const order = orderMap.get(row.order_id);
      const patient = order ? patientMap.get(order.patient_id) : null;
      return {
        created_at: row.created_at,
        id: row.id,
        order_id: row.order_id,
        order_test_results: resultMap.get(row.id) ?? null,
        orders: order
          ? {
              id: order.id,
              order_number: order.order_number,
              patients: patient
                ? {
                    id: patient.id,
                    lab_id: patient.lab_id,
                    name: patient.name,
                    phone: patient.phone
                  }
                : null,
              priority: order.priority
            }
          : null,
        sample_code: row.sample_code,
        specimen_label: row.specimen_label,
        status: row.status,
        tests: testMap.get(row.test_id) ?? null,
        updated_at: row.updated_at
      };
    });
}

export async function getAuditLogsLocal(entityTable: string, entityId: string, limit = 15) {
  const rows = await db.audit_logs
    .filter((row) => row.entity_table === entityTable && row.entity_id === entityId)
    .toArray();

  return rows.sort((left, right) => compareDatesDescending(left.created_at, right.created_at)).slice(0, limit);
}

export async function getInventoryItemsLocal() {
  const rows = await db.inventory_items.toArray();
  return rows.sort((left, right) => compareDatesDescending(left.updated_at, right.updated_at));
}

export async function getInventoryTransactionsLocal(itemId: string) {
  const rows = await db.inventory_transactions.where("item_id").equals(itemId).toArray();
  return rows.sort((left, right) => compareDatesDescending(left.created_at, right.created_at)).slice(0, 20);
}

export async function getExpensesLocal(limit = 240) {
  const rows = await db.expenses.toArray();
  return rows
    .sort((left, right) => compareDatesDescending(left.expense_date, right.expense_date))
    .slice(0, limit);
}

export async function getInvoicesLocal(limit = 120) {
  const [invoices, orders, patients, facilities, items, payments] = await Promise.all([
    db.invoices.toArray(),
    db.orders.toArray(),
    db.patients.toArray(),
    db.facilities.toArray(),
    db.invoice_items.toArray(),
    db.invoice_payments.toArray()
  ]);

  const orderMap = new Map(orders.map((row) => [row.id, row]));
  const patientMap = new Map(patients.map((row) => [row.id, row]));
  const facilityMap = new Map(facilities.map((row) => [row.id, row]));

  const dedupedInvoices = [...invoices]
    .sort((left, right) => {
      if (left.order_id === right.order_id) {
        return isLocalOnlyId(left.id) ? 1 : -1;
      }

      return compareDatesDescending(left.issued_at, right.issued_at);
    })
    .filter((invoice, index, array) => index === array.findIndex((candidate) => candidate.order_id === invoice.order_id));

  return dedupedInvoices
    .sort((left, right) => compareDatesDescending(left.issued_at, right.issued_at))
    .slice(0, limit)
    .map((invoice) => {
      const order = orderMap.get(invoice.order_id);
      const patient = order ? patientMap.get(order.patient_id) : null;
      const facility = order ? facilityMap.get(order.facility_id) ?? null : null;

      return {
        ...invoice,
        invoice_items: items
          .filter((row) => row.invoice_id === invoice.id)
          .sort((left, right) => left.test_name.localeCompare(right.test_name)),
        invoice_payments: payments
          .filter((row) => row.invoice_id === invoice.id)
          .sort((left, right) => compareDatesDescending(left.received_at, right.received_at)),
        orders: order
          ? {
              id: order.id,
              order_number: order.order_number,
              ordered_at: order.ordered_at,
              patients: patient
                ? {
                    id: patient.id,
                    lab_id: patient.lab_id,
                    name: patient.name,
                    phone: patient.phone
                  }
                : null,
              priority: order.priority,
              facilities: facility
                ? {
                    code: facility.code,
                    id: facility.id,
                    name: facility.name
                  }
                : null
            }
          : null
      };
    });
}

export async function getReportsQueueLocal(limit = 60) {
  const [orders, facilities, patients, orderTests, tests, results] = await Promise.all([
    db.orders.toArray(),
    db.facilities.toArray(),
    db.patients.toArray(),
    db.order_tests.toArray(),
    db.tests.toArray(),
    db.order_test_results.toArray()
  ]);

  const facilityMap = new Map(facilities.map((row) => [row.id, row]));
  const patientMap = new Map(patients.map((row) => [row.id, row]));
  const testMap = new Map(tests.map((row) => [row.id, row]));
  const resultMap = new Map(results.map((row) => [row.order_test_id, row]));

  return orders
    .sort((left, right) => compareDatesDescending(left.ordered_at, right.ordered_at))
    .slice(0, limit)
    .map((order) => {
      const patient = patientMap.get(order.patient_id) ?? null;
      const facility = facilityMap.get(order.facility_id) ?? null;

      return {
        ...order,
        facilities: facility
          ? {
              code: facility.code,
              id: facility.id,
              name: facility.name
            }
          : null,
        order_tests: orderTests
          .filter((row) => row.order_id === order.id)
          .map((orderTest) => ({
            ...orderTest,
            order_test_results: resultMap.get(orderTest.id) ?? null,
            tests: testMap.get(orderTest.test_id) ?? null
          })),
        patients: patient
          ? {
              address: patient.address,
              dob: patient.dob,
              id: patient.id,
              lab_id: patient.lab_id,
              name: patient.name,
              phone: patient.phone,
              sex: patient.sex
            }
          : null
      };
    });
}
