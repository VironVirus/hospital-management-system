import Dexie, { type Table } from "dexie";
import type { Json, Tables } from "@/types/supabase";

export const syncedTableNames = [
  "audit_logs",
  "expenses",
  "facilities",
  "inventory_items",
  "inventory_transactions",
  "invoice_items",
  "invoice_payments",
  "invoices",
  "order_test_results",
  "order_tests",
  "orders",
  "patients",
  "profiles",
  "sample_custody_logs",
  "tests"
] as const;

export type SyncedTableName = (typeof syncedTableNames)[number];
export type QueueAction = "insert" | "update" | "upsert" | "delete";
export type QueueStatus = "pending" | "processing" | "failed" | "conflict" | "synced";

export type LocalTableMap = {
  audit_logs: Tables<"audit_logs">;
  expenses: Tables<"expenses">;
  facilities: Tables<"facilities">;
  inventory_items: Tables<"inventory_items">;
  inventory_transactions: Tables<"inventory_transactions">;
  invoice_items: Tables<"invoice_items">;
  invoice_payments: Tables<"invoice_payments">;
  invoices: Tables<"invoices">;
  order_test_results: Tables<"order_test_results">;
  order_tests: Tables<"order_tests">;
  orders: Tables<"orders">;
  patients: Tables<"patients">;
  profiles: Tables<"profiles">;
  sample_custody_logs: Tables<"sample_custody_logs">;
  tests: Tables<"tests">;
};

export type QueueRecord = {
  action: QueueAction;
  attemptCount: number;
  createdAt: string;
  critical: boolean;
  entity: SyncedTableName;
  facilityId: string | null;
  id: string;
  lastError: string | null;
  metadata: Json | null;
  payload: Json;
  recordId: string;
  status: QueueStatus;
  updatedAt: string;
  userId: string | null;
};

export type ConflictRecord = {
  createdAt: string;
  entity: SyncedTableName;
  id: string;
  localPayload: Json;
  queueId: string;
  reason: string;
  recordId: string;
  remotePayload: Json | null;
  resolvedAt: string | null;
};

export type RecordSyncState = {
  entity: SyncedTableName;
  isDeleted: boolean;
  isDirty: boolean;
  key: string;
  lastModifiedAt: string;
  lastSyncedAt: string | null;
  recordId: string;
  source: "local" | "remote";
};

export type QuerySnapshot = {
  data: Json;
  facilityId: string | null;
  key: string;
  updatedAt: string;
};

export type SyncStateRow = {
  details: string | null;
  key: string;
  updatedAt: string;
  value: string | null;
};

export class LimsDatabase extends Dexie {
  audit_logs!: Table<LocalTableMap["audit_logs"], string>;
  expenses!: Table<LocalTableMap["expenses"], string>;
  facilities!: Table<LocalTableMap["facilities"], string>;
  inventory_items!: Table<LocalTableMap["inventory_items"], string>;
  inventory_transactions!: Table<LocalTableMap["inventory_transactions"], string>;
  invoice_items!: Table<LocalTableMap["invoice_items"], string>;
  invoice_payments!: Table<LocalTableMap["invoice_payments"], string>;
  invoices!: Table<LocalTableMap["invoices"], string>;
  order_test_results!: Table<LocalTableMap["order_test_results"], string>;
  order_tests!: Table<LocalTableMap["order_tests"], string>;
  orders!: Table<LocalTableMap["orders"], string>;
  patients!: Table<LocalTableMap["patients"], string>;
  profiles!: Table<LocalTableMap["profiles"], string>;
  query_snapshots!: Table<QuerySnapshot, string>;
  record_sync_state!: Table<RecordSyncState, string>;
  sample_custody_logs!: Table<LocalTableMap["sample_custody_logs"], string>;
  sync_conflicts!: Table<ConflictRecord, string>;
  sync_queue!: Table<QueueRecord, string>;
  sync_state!: Table<SyncStateRow, string>;
  tests!: Table<LocalTableMap["tests"], string>;

  constructor() {
    super("lims-offline-db");

    this.version(4).stores({
      audit_logs: "id, facility_id, entity_table, entity_id, created_at",
      expenses: "id, facility_id, expense_date, category, source, updated_at",
      facilities: "id, code, name, updated_at",
      inventory_items:
        "id, facility_id, name, category, updated_at, expiry_date, is_active, unit_cost",
      inventory_transactions:
        "id, facility_id, item_id, created_at, transaction_type, unit_cost, total_cost",
      invoice_items: "id, invoice_id, order_test_id, created_at",
      invoice_payments: "id, facility_id, invoice_id, received_at, payment_method",
      invoices: "id, facility_id, order_id, invoice_number, issued_at, payment_status, updated_at",
      order_test_results: "id, order_test_id, entered_at, updated_at, verified_at, abnormal_flag",
      order_tests:
        "id, order_id, test_id, sample_code, barcode_value, status, created_at, updated_at",
      orders: "id, facility_id, patient_id, order_number, status, ordered_at, updated_at",
      patients: "id, facility_id, lab_id, name, phone, updated_at",
      profiles: "id, facility_id, role, updated_at",
      query_snapshots: "key, facilityId, updatedAt",
      record_sync_state: "key, entity, recordId, isDirty, source, lastModifiedAt",
      sample_custody_logs: "id, order_test_id, created_at, action",
      sync_conflicts: "id, queueId, entity, recordId, createdAt, resolvedAt",
      sync_queue: "id, status, entity, recordId, createdAt, updatedAt, facilityId",
      sync_state: "key, updatedAt",
      tests: "id, test_code, name, category, is_active, result_type, updated_at"
    });
  }
}

export const db = new LimsDatabase();
