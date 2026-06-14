import type { Tables } from "@/types/supabase";

export type InventoryItemRow = Tables<"inventory_items">;
export type InventoryTransactionRow = Tables<"inventory_transactions">;
export type InventoryTransactionType =
  | "stock_in"
  | "stock_out"
  | "usage"
  | "adjustment";

export const inventoryTransactionOptions: Array<{
  description: string;
  label: string;
  value: InventoryTransactionType;
}> = [
  {
    value: "stock_in",
    label: "Stock in",
    description: "Receive new kits, reagents, or consumables into stock."
  },
  {
    value: "stock_out",
    label: "Stock out",
    description: "Issue stock outward without marking it as a direct usage event."
  },
  {
    value: "usage",
    label: "Usage",
    description: "Record routine laboratory consumption against a bench, analyzer, or order."
  },
  {
    value: "adjustment",
    label: "Adjustment",
    description:
      "Correct balances after reconciliation. Positive adds stock, negative removes it."
  }
];

export const NEAR_EXPIRY_DAYS = 60;

export function formatInventoryDate(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function formatInventoryDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatQuantity(quantity: number, unit: string | null) {
  return `${Number(quantity).toLocaleString("en-NG", {
    maximumFractionDigits: 2
  })} ${unit || "units"}`;
}

export function formatInventoryCurrency(value: number | null | undefined) {
  const amount = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value ?? 0);

  return `N${amount}`;
}

export function getDaysUntilExpiry(expiryDate: string | null) {
  if (!expiryDate) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

export function getExpiryState(item: Pick<InventoryItemRow, "expiry_date">) {
  const daysUntilExpiry = getDaysUntilExpiry(item.expiry_date);

  if (daysUntilExpiry === null) {
    return "ok" as const;
  }

  if (daysUntilExpiry < 0) {
    return "expired" as const;
  }

  if (daysUntilExpiry <= NEAR_EXPIRY_DAYS) {
    return "near_expiry" as const;
  }

  return "ok" as const;
}

export function isLowStock(item: Pick<InventoryItemRow, "quantity" | "reorder_level">) {
  return Number(item.quantity) <= Number(item.reorder_level);
}

export function matchesInventorySearch(item: InventoryItemRow, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    item.name,
    item.category,
    item.lot_number,
    item.vendor,
    item.storage_location
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function getAlertSummary(item: InventoryItemRow) {
  const lowStock = isLowStock(item);
  const expiryState = getExpiryState(item);
  const daysUntilExpiry = getDaysUntilExpiry(item.expiry_date);

  if (expiryState === "expired") {
    return {
      severity: "high" as const,
      title: "Expired stock",
      description: `${item.name} expired ${Math.abs(daysUntilExpiry ?? 0)} day(s) ago.`
    };
  }

  if (lowStock && expiryState === "near_expiry") {
    return {
      severity: "high" as const,
      title: "Low stock and near expiry",
      description: `${item.name} is at or below reorder level and expires in ${daysUntilExpiry} day(s).`
    };
  }

  if (lowStock) {
    return {
      severity: "medium" as const,
      title: "Low stock",
      description: `${item.name} is at or below its reorder level.`
    };
  }

  if (expiryState === "near_expiry") {
    return {
      severity: "medium" as const,
      title: "Near expiry",
      description: `${item.name} expires in ${daysUntilExpiry} day(s).`
    };
  }

  return null;
}
