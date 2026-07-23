import type { Json } from "@/types/database";
import { getAppClient } from "@/lib/app-client";

export function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function resolveOnlineQuery<T>({ online }: { online: () => Promise<T> }) {
  return online();
}

export async function commitOnlineMutation({
  action,
  entity,
  payload,
  recordId
}: {
  action: "delete" | "insert" | "update" | "upsert";
  entity: string;
  payload: Json;
  recordId: string;
}) {
  const database = getAppClient();
  if (!database) {
    throw new Error("Service unavailable.");
  }

  const client = database as unknown as {
    from: (table: string) => {
      delete: () => {
        eq: (column: string, value: string) => Promise<{ error: Error | null }>;
      };
      insert: (row: Json) => Promise<{ error: Error | null }>;
      update: (row: Json) => {
        eq: (column: string, value: string) => Promise<{ error: Error | null }>;
      };
      upsert: (row: Json) => Promise<{ error: Error | null }>;
    };
  };

  const table = client.from(entity);
  const result =
    action === "delete"
      ? await table.delete().eq("id", recordId)
      : action === "update"
        ? await table.update(payload).eq("id", recordId)
        : action === "upsert"
          ? await table.upsert(payload)
          : await table.insert(payload);

  if (result.error) {
    throw result.error;
  }
}
