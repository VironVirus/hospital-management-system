import type { Database, Json } from "@/types/supabase";
import {
  db,
  type QueueAction,
  type QueueRecord,
  type SyncedTableName
} from "@/lib/dexie";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type LocalMutationArgs = {
  action: QueueAction;
  critical?: boolean;
  entity: SyncedTableName;
  facilityId?: string | null;
  metadata?: Json | null;
  payload: Json;
  queue?: boolean;
  recordId: string;
  userId?: string | null;
};

type QueryResolverArgs<T> = {
  cacheKey: string;
  facilityId?: string | null;
  offline: () => Promise<T>;
  online: () => Promise<T>;
};

type SyncSummary = {
  conflicts: number;
  failed: number;
  lastSyncedAt: string | null;
  pending: number;
  processing: boolean;
};

type ConflictMetadata = {
  conflictBaseTimestamp?: string | null;
  hasPendingChain?: boolean;
};

const criticalEntities = new Set<SyncedTableName>([
  "expenses",
  "invoice_payments",
  "invoices",
  "order_test_results",
  "order_tests",
  "orders"
]);

let activeSync: Promise<SyncSummary> | null = null;

function getEntityTable(entity: SyncedTableName) {
  return db.table(entity);
}

function isBrowser() {
  return typeof window !== "undefined";
}

function isOnline() {
  return !isBrowser() || window.navigator.onLine;
}

function toIsoNow() {
  return new Date().toISOString();
}

const uuidValuePattern =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function buildRecordKey(entity: SyncedTableName, recordId: string) {
  return `${entity}:${recordId}`;
}

function normalizeUuidValue(value: string) {
  const match = value.match(uuidValuePattern);
  return match ? match[1] : value;
}

function shouldNormalizeUuidKey(key: string) {
  return key === "id" || key.endsWith("_id");
}

function normalizeUuidReferences<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeUuidReferences(entry)) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (typeof entry === "string" && shouldNormalizeUuidKey(key)) {
        return [key, normalizeUuidValue(entry)];
      }

      return [key, normalizeUuidReferences(entry)];
    })
  ) as T;
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown offline synchronization error.";
}

function getRowTimestamp(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const row = payload as Record<string, unknown>;
  const value =
    row.updated_at ??
    row.received_at ??
    row.entered_at ??
    row.issued_at ??
    row.ordered_at ??
    row.created_at ??
    null;

  return typeof value === "string" ? value : null;
}

function shouldTreatAsOfflineError(error: unknown) {
  const message = normalizeErrorMessage(error).toLowerCase();

  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("offline")
  );
}

function isJsonRecord(value: Json | null | undefined): value is Record<string, Json | undefined> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readConflictMetadata(metadata: Json | null | undefined): ConflictMetadata {
  if (!isJsonRecord(metadata)) {
    return {};
  }

  return {
    conflictBaseTimestamp:
      typeof metadata.conflictBaseTimestamp === "string" || metadata.conflictBaseTimestamp === null
        ? metadata.conflictBaseTimestamp
        : undefined,
    hasPendingChain:
      typeof metadata.hasPendingChain === "boolean" ? metadata.hasPendingChain : undefined
  };
}

async function updateRecordSyncState(args: {
  entity: SyncedTableName;
  isDeleted: boolean;
  isDirty: boolean;
  recordId: string;
  source: "local" | "remote";
}) {
  await db.record_sync_state.put({
    entity: args.entity,
    isDeleted: args.isDeleted,
    isDirty: args.isDirty,
    key: buildRecordKey(args.entity, args.recordId),
    lastModifiedAt: toIsoNow(),
    lastSyncedAt: args.source === "remote" && !args.isDirty ? toIsoNow() : null,
    recordId: args.recordId,
    source: args.source
  });
}

export function generateLocalId(_prefix: string) {
  void _prefix;

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const segments = [
    Math.random().toString(16).slice(2, 10).padEnd(8, "0"),
    Math.random().toString(16).slice(2, 6).padEnd(4, "0"),
    `4${Math.random().toString(16).slice(2, 5).padEnd(3, "0")}`,
    `a${Math.random().toString(16).slice(2, 5).padEnd(3, "0")}`,
    `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`
      .padEnd(12, "0")
      .slice(0, 12)
  ];

  return segments.join("-");
}

export function buildOfflineOrderNumber() {
  return `ORD-OFF-${Date.now().toString().slice(-8)}`;
}

function getLagosSamplePrefix(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lagos"
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${month}${day}`;
}

export async function buildOfflineSampleCode(index: number) {
  const prefix = getLagosSamplePrefix();
  const rows = await db.order_tests.toArray();
  const highestSerial = rows.reduce((max, row) => {
    if (!new RegExp(`^${prefix}\\d{3}$`).test(row.sample_code)) {
      return max;
    }

    return Math.max(max, Number(row.sample_code.slice(-3)) || 0);
  }, 0);
  const serial = highestSerial + index + 1;

  if (serial > 999) {
    throw new Error(
      `Sample ID limit reached for ${prefix}. Archive or widen the format before creating more samples.`
    );
  }

  return `${prefix}${String(serial).padStart(3, "0")}`;
}

export function buildOfflineInvoiceNumber() {
  return `INV-OFF-${Date.now().toString().slice(-8)}`;
}

export function buildOfflineReceiptNumber() {
  return `RCP-OFF-${Date.now().toString().slice(-8)}`;
}

export async function cacheRows(
  entity: SyncedTableName,
  rows: Array<Record<string, unknown>>
) {
  if (rows.length === 0) {
    return;
  }

  const normalizedRows = rows.filter(
    (row): row is Record<string, unknown> & { id: string } => typeof row.id === "string"
  );

  if (normalizedRows.length === 0) {
    return;
  }

  const table = getEntityTable(entity);

  await db.transaction("rw", table, db.record_sync_state, async () => {
    await table.bulkPut(normalizedRows);
    await db.record_sync_state.bulkPut(
      normalizedRows
        .map((row) => {
          return {
            entity,
            isDeleted: false,
            isDirty: false,
            key: buildRecordKey(entity, row.id),
            lastModifiedAt: getRowTimestamp(row) ?? toIsoNow(),
            lastSyncedAt: toIsoNow(),
            recordId: row.id,
            source: "remote" as const
          };
        })
    );
  });
}

export async function cacheQuerySnapshot<T>(
  cacheKey: string,
  data: T,
  facilityId: string | null = null
) {
  await db.query_snapshots.put({
    data: data as Json,
    facilityId,
    key: cacheKey,
    updatedAt: toIsoNow()
  });
}

export async function readQuerySnapshot<T>(cacheKey: string) {
  const row = await db.query_snapshots.get(cacheKey);
  return (row?.data as T | undefined) ?? null;
}

export async function resolveOfflineQuery<T>({
  cacheKey,
  facilityId = null,
  offline,
  online
}: QueryResolverArgs<T>) {
  let onlineError: unknown = null;

  if (isOnline()) {
    try {
      const data = await online();
      await cacheQuerySnapshot(cacheKey, data, facilityId);
      return data;
    } catch (error) {
      onlineError = error;
      if (!shouldTreatAsOfflineError(error)) {
        throw error;
      }
    }
  }

  try {
    const localData = await offline();
    await cacheQuerySnapshot(cacheKey, localData, facilityId);
    return localData;
  } catch (error) {
    const snapshot = await readQuerySnapshot<T>(cacheKey);
    if (snapshot !== null) {
      return snapshot;
    }

    throw onlineError ?? error;
  }
}

export async function putLocalOnlyRow(
  entity: SyncedTableName,
  payload: Record<string, unknown>
) {
  const recordId = typeof payload.id === "string" ? payload.id : null;
  if (!recordId) {
    throw new Error(`Local ${entity} rows must include an id.`);
  }

  const table = getEntityTable(entity);
  await db.transaction("rw", table, db.record_sync_state, async () => {
    await table.put(payload);
    await updateRecordSyncState({
      entity,
      isDeleted: false,
      isDirty: false,
      recordId,
      source: "local"
    });
  });
}

export async function commitLocalMutation({
  action,
  critical: providedCritical,
  entity,
  facilityId = null,
  metadata = null,
  payload,
  queue = true,
  recordId,
  userId = null
}: LocalMutationArgs) {
  const critical = providedCritical ?? criticalEntities.has(entity);
  const table = getEntityTable(entity);
  const queueId = generateLocalId("queue");
  const timestamp = toIsoNow();

  await db.transaction("rw", table, db.record_sync_state, db.sync_queue, async () => {
    const currentBeforeMutation =
      ((await table.get(recordId)) as Record<string, unknown> | undefined) ?? null;
    const syncState = await db.record_sync_state.get(buildRecordKey(entity, recordId));
    const queuedItemsForRecord = queue
      ? await db.sync_queue
          .filter(
            (row) =>
              row.entity === entity &&
              normalizeUuidValue(row.recordId) === normalizeUuidValue(recordId) &&
              row.status !== "synced"
          )
          .count()
      : 0;
    const hasPendingChain = Boolean(syncState?.isDirty) || queuedItemsForRecord > 0;

    if (action === "delete") {
      await table.delete(recordId);
      await updateRecordSyncState({
        entity,
        isDeleted: true,
        isDirty: queue,
        recordId,
        source: "local"
      });
    } else if (action === "insert" || action === "upsert") {
      const row = payload as Record<string, unknown>;
      await table.put(row);
      await updateRecordSyncState({
        entity,
        isDeleted: false,
        isDirty: queue,
        recordId,
        source: "local"
      });
    } else {
      const current = ((await table.get(recordId)) as Record<string, unknown> | undefined) ?? {};
      const nextRow = {
        ...current,
        ...(payload as Record<string, unknown>)
      };

      await table.put(nextRow);
      await updateRecordSyncState({
        entity,
        isDeleted: false,
        isDirty: queue,
        recordId,
        source: "local"
      });
    }

    if (queue) {
      const nextMetadata: Json | null = critical
        ? ({
            ...(isJsonRecord(metadata) ? metadata : {}),
            conflictBaseTimestamp:
              getRowTimestamp(currentBeforeMutation) ??
              syncState?.lastModifiedAt ??
              null,
            hasPendingChain
          } satisfies Json)
        : metadata;

      const row: QueueRecord = {
        action,
        attemptCount: 0,
        createdAt: timestamp,
        critical,
        entity,
        facilityId,
        id: queueId,
        lastError: null,
        metadata: nextMetadata,
        payload,
        recordId,
        status: "pending",
        updatedAt: timestamp,
        userId
      };

      await db.sync_queue.put(row);
    }
  });

  if (queue && isOnline()) {
    void syncPendingMutations();
  }
}

async function setSyncState(processing: boolean, details: string | null = null) {
  await db.sync_state.put({
    details,
    key: "queue",
    updatedAt: toIsoNow(),
    value: processing ? "processing" : "idle"
  });
}

async function fetchRemoteRecord(entity: SyncedTableName, recordId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return null;
  }

  const canonicalRecordId = normalizeUuidValue(recordId);

  const response = await supabase
    .from(entity as keyof Database["public"]["Tables"] & string)
    .select("*")
    .eq("id", canonicalRecordId)
    .maybeSingle();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data as Record<string, unknown> | null;
}

async function markQueueConflict(
  row: QueueRecord,
  reason: string,
  remotePayload: Json | null
) {
  await db.transaction("rw", db.sync_queue, db.sync_conflicts, async () => {
    await db.sync_queue.put({
      ...row,
      lastError: reason,
      status: "conflict",
      updatedAt: toIsoNow()
    });

    await db.sync_conflicts.put({
      createdAt: toIsoNow(),
      entity: row.entity,
      id: generateLocalId("conflict"),
      localPayload: row.payload,
      queueId: row.id,
      reason,
      recordId: row.recordId,
      remotePayload,
      resolvedAt: null
    });
  });
}

async function executeRemoteMutation(row: QueueRecord) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const table = supabase.from(row.entity as keyof Database["public"]["Tables"] & string);
  const canonicalRecordId = normalizeUuidValue(row.recordId);
  const canonicalPayload = normalizeUuidReferences(row.payload);

  if (row.action === "delete") {
    const response = await table.delete().eq("id", canonicalRecordId);

    if (response.error) {
      throw new Error(response.error.message);
    }

    return null;
  }

  if (row.action === "insert") {
    let response = await table.insert(canonicalPayload as never).select().maybeSingle();
    if (response.error?.message.toLowerCase().includes("duplicate")) {
      response = await table.upsert(canonicalPayload as never).select().maybeSingle();
    }

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data as Record<string, unknown> | null;
  }

  if (row.action === "upsert") {
    const response = await table.upsert(canonicalPayload as never).select().maybeSingle();
    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data as Record<string, unknown> | null;
  }

  const response = await table
    .update(canonicalPayload as never)
    .eq("id", canonicalRecordId)
    .select()
    .maybeSingle();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data as Record<string, unknown> | null;
}

async function processQueueRow(row: QueueRecord) {
  await db.sync_queue.put({
    ...row,
    attemptCount: row.attemptCount + 1,
    lastError: null,
    status: "processing",
    updatedAt: toIsoNow()
  });

  try {
    if (row.critical) {
      const remote = await fetchRemoteRecord(row.entity, row.recordId);
      const remoteTimestamp = getRowTimestamp(remote);
      const conflictMetadata = readConflictMetadata(row.metadata);

      if (
        row.action !== "insert" &&
        remote &&
        remoteTimestamp &&
        conflictMetadata.hasPendingChain !== true &&
        conflictMetadata.conflictBaseTimestamp &&
        new Date(remoteTimestamp).getTime() >
          new Date(conflictMetadata.conflictBaseTimestamp).getTime()
      ) {
        await markQueueConflict(
          row,
          "Remote data changed after the local edit. Manual review is required.",
          remote as Json
        );
        return;
      }
    }

    const data = await executeRemoteMutation(row);

    await db.transaction(
      "rw",
      getEntityTable(row.entity),
      db.record_sync_state,
      db.sync_queue,
      async () => {
        const canonicalRecordId =
          data && typeof data.id === "string"
            ? normalizeUuidValue(data.id)
            : normalizeUuidValue(row.recordId);

        if (row.action === "delete") {
          await getEntityTable(row.entity).delete(row.recordId);
          if (canonicalRecordId !== row.recordId) {
            await getEntityTable(row.entity).delete(canonicalRecordId);
            await db.record_sync_state.delete(buildRecordKey(row.entity, row.recordId));
          }
          await db.record_sync_state.put({
            entity: row.entity,
            isDeleted: true,
            isDirty: false,
            key: buildRecordKey(row.entity, canonicalRecordId),
            lastModifiedAt: toIsoNow(),
            lastSyncedAt: toIsoNow(),
            recordId: canonicalRecordId,
            source: "remote"
          });
        } else if (data) {
          if (canonicalRecordId !== row.recordId) {
            await getEntityTable(row.entity).delete(row.recordId);
            await db.record_sync_state.delete(buildRecordKey(row.entity, row.recordId));
          }
          await getEntityTable(row.entity).put(data);
          await db.record_sync_state.put({
            entity: row.entity,
            isDeleted: false,
            isDirty: false,
            key: buildRecordKey(row.entity, canonicalRecordId),
            lastModifiedAt: getRowTimestamp(data) ?? toIsoNow(),
            lastSyncedAt: toIsoNow(),
            recordId: canonicalRecordId,
            source: "remote"
          });
        }

        await db.sync_queue.put({
          ...row,
          lastError: null,
          status: "synced",
          updatedAt: toIsoNow()
        });
      }
    );
  } catch (error) {
    await db.sync_queue.put({
      ...row,
      lastError: normalizeErrorMessage(error),
      status: shouldTreatAsOfflineError(error) ? "pending" : "failed",
      updatedAt: toIsoNow()
    });

    if (!shouldTreatAsOfflineError(error)) {
      throw error;
    }
  }
}

export async function getSyncSummary(): Promise<SyncSummary> {
  const [pending, failed, conflicts, queueState] = await Promise.all([
    db.sync_queue.where("status").equals("pending").count(),
    db.sync_queue.where("status").equals("failed").count(),
    db.sync_conflicts.filter((row) => row.resolvedAt === null).count(),
    db.sync_state.get("queue")
  ]);

  return {
    conflicts,
    failed,
    lastSyncedAt: queueState?.updatedAt ?? null,
    pending,
    processing: queueState?.value === "processing"
  };
}

export async function syncPendingMutations() {
  if (activeSync) {
    return activeSync;
  }

  activeSync = (async () => {
    if (!isOnline()) {
      return getSyncSummary();
    }

    await setSyncState(true, "Synchronizing queued laboratory changes.");

    try {
      const pendingRows = await db.sync_queue
        .filter((row) => row.status === "pending" || row.status === "failed")
        .sortBy("createdAt");

      for (const row of pendingRows) {
        await processQueueRow(row);
      }
    } finally {
      await setSyncState(false, "Queued changes synchronized.");
    }

    return getSyncSummary();
  })();

  try {
    return await activeSync;
  } finally {
    activeSync = null;
  }
}

export async function retryQueueConflict(conflictId: string) {
  const conflict = await db.sync_conflicts.get(conflictId);
  if (!conflict) {
    return;
  }

  const queueRow = await db.sync_queue.get(conflict.queueId);
  if (!queueRow) {
    await db.sync_conflicts.update(conflictId, {
      resolvedAt: toIsoNow()
    });
    return;
  }

  await db.transaction("rw", db.sync_conflicts, db.sync_queue, async () => {
    await db.sync_conflicts.update(conflictId, {
      resolvedAt: toIsoNow()
    });
    await db.sync_queue.put({
      ...queueRow,
      lastError: null,
      status: "pending",
      updatedAt: toIsoNow()
    });
  });

  if (isOnline()) {
    void syncPendingMutations();
  }
}

export async function retryAllQueueConflicts() {
  const conflicts = await db.sync_conflicts.filter((row) => row.resolvedAt === null).toArray();

  for (const conflict of conflicts) {
    await retryQueueConflict(conflict.id);
  }
}

async function applyConflictPayloadToLocalRecord(
  row: QueueRecord,
  payload: Json,
  updatedAt: string
) {
  if (row.action === "delete" || !isJsonRecord(payload)) {
    return;
  }

  const table = getEntityTable(row.entity);
  const current = ((await table.get(row.recordId)) as Record<string, unknown> | undefined) ?? {};
  const nextRow =
    row.action === "update"
      ? {
          ...current,
          ...payload
        }
      : {
          ...payload
        };

  if (typeof nextRow.id !== "string") {
    nextRow.id = row.recordId;
  }

  if (typeof nextRow.updated_at !== "string") {
    nextRow.updated_at = updatedAt;
  }

  await table.put(normalizeUuidReferences(nextRow));
  await updateRecordSyncState({
    entity: row.entity,
    isDeleted: false,
    isDirty: true,
    recordId: row.recordId,
    source: "local"
  });
}

export async function updateQueueConflictPayload(conflictId: string, nextPayload: Json) {
  const conflict = await db.sync_conflicts.get(conflictId);
  if (!conflict) {
    throw new Error("Conflict not found.");
  }

  const queueRow = await db.sync_queue.get(conflict.queueId);
  if (!queueRow) {
    throw new Error("The queued mutation for this conflict no longer exists.");
  }

  const timestamp = toIsoNow();
  const table = getEntityTable(queueRow.entity);

  await db.transaction(
    "rw",
    table,
    db.record_sync_state,
    db.sync_conflicts,
    db.sync_queue,
    async () => {
      await db.sync_conflicts.update(conflictId, {
        localPayload: nextPayload
      });
      await db.sync_queue.put({
        ...queueRow,
        lastError: null,
        payload: nextPayload,
        updatedAt: timestamp
      });
      await applyConflictPayloadToLocalRecord(queueRow, nextPayload, timestamp);
    }
  );
}

export async function acceptRemoteConflict(conflictId: string) {
  const conflict = await db.sync_conflicts.get(conflictId);
  if (!conflict) {
    throw new Error("Conflict not found.");
  }

  const queueRow = await db.sync_queue.get(conflict.queueId);
  const entity = queueRow?.entity ?? conflict.entity;
  const recordId = queueRow?.recordId ?? conflict.recordId;
  const canonicalRecordId = normalizeUuidValue(recordId);
  const table = getEntityTable(entity);
  const resolvedAt = toIsoNow();

  await db.transaction(
    "rw",
    table,
    db.record_sync_state,
    db.sync_conflicts,
    db.sync_queue,
    async () => {
      if (isJsonRecord(conflict.remotePayload)) {
        const remoteRow = normalizeUuidReferences(conflict.remotePayload);
        const remoteId =
          typeof remoteRow.id === "string" ? normalizeUuidValue(remoteRow.id) : canonicalRecordId;

        if (remoteId !== recordId) {
          await table.delete(recordId);
          await db.record_sync_state.delete(buildRecordKey(entity, recordId));
        }

        await table.put(remoteRow);
        await db.record_sync_state.put({
          entity,
          isDeleted: false,
          isDirty: false,
          key: buildRecordKey(entity, remoteId),
          lastModifiedAt: getRowTimestamp(remoteRow) ?? resolvedAt,
          lastSyncedAt: resolvedAt,
          recordId: remoteId,
          source: "remote"
        });
      } else {
        await table.delete(recordId);
        if (canonicalRecordId !== recordId) {
          await table.delete(canonicalRecordId);
          await db.record_sync_state.delete(buildRecordKey(entity, recordId));
        }
        await db.record_sync_state.put({
          entity,
          isDeleted: true,
          isDirty: false,
          key: buildRecordKey(entity, canonicalRecordId),
          lastModifiedAt: resolvedAt,
          lastSyncedAt: resolvedAt,
          recordId: canonicalRecordId,
          source: "remote"
        });
      }

      if (queueRow) {
        await db.sync_queue.delete(queueRow.id);
      }

      await db.sync_conflicts.update(conflictId, {
        resolvedAt
      });
    }
  );
}

export async function clearResolvedQueueItems() {
  const resolved = await db.sync_queue.where("status").equals("synced").toArray();
  await db.sync_queue.bulkDelete(resolved.map((row) => row.id));
}
