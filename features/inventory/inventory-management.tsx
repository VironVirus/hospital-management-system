"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  Boxes,
  Loader2,
  Pencil,
  Search,
  ShieldAlert,
  Trash2
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  initialInventoryItemFormState,
  initialInventoryTransactionFormState,
  inventoryItemFormSchema,
  inventoryTransactionFormSchema,
  type InventoryItemFormValues,
  type InventoryTransactionFormValues
} from "@/features/inventory/schema";
import {
  formatInventoryCurrency,
  formatInventoryDate,
  formatInventoryDateTime,
  formatQuantity,
  getAlertSummary,
  getDaysUntilExpiry,
  getExpiryState,
  inventoryTransactionOptions,
  isLowStock,
  matchesInventorySearch,
  type InventoryItemRow,
  type InventoryTransactionRow
} from "@/features/inventory/inventory-utils";
import { useToast } from "@/hooks/use-toast";
import {
  canAccessInventoryRole,
  canManageInventoryRole
} from "@/lib/guards";
import { commitOnlineMutation, generateId, resolveOnlineQuery } from "@/lib/online-core";
import {
  applyInventoryTransaction,
  recordAuditLog
} from "@/lib/online-mutations";
import { getAppClient } from "@/lib/app-client";
import type { Json, TablesInsert, TablesUpdate } from "@/types/database";

type ItemFilter = "all" | "low_stock" | "near_expiry" | "expired" | "inactive";
type FormErrors = Partial<Record<keyof InventoryItemFormValues | "form", string>>;
type TransactionErrors = Partial<
  Record<keyof InventoryTransactionFormValues | "form", string>
>;

async function fetchInventoryItems() {
  const database = getAppClient();
  return resolveOnlineQuery<InventoryItemRow[]>({
    online: async () => {
      if (!database) {
        throw new Error("MySQL is not configured.");
      }

      const { data, error } = await database
        .from("inventory_items")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as InventoryItemRow[];
    }
  });
}

async function fetchInventoryTransactions(itemId: string | null) {
  if (!itemId) {
    return [];
  }

  const database = getAppClient();
  return resolveOnlineQuery<InventoryTransactionRow[]>({
    online: async () => {
      if (!database) {
        throw new Error("MySQL is not configured.");
      }

      const { data, error } = await database
        .from("inventory_transactions")
        .select("*")
        .eq("item_id", itemId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as InventoryTransactionRow[];
    }
  });
}

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function InventoryManagement() {
  const queryClient = useQueryClient();
  const { facilityId, loading, profile, role, user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemFormState, setItemFormState] = useState<InventoryItemFormValues>(
    initialInventoryItemFormState
  );
  const [transactionFormState, setTransactionFormState] =
    useState<InventoryTransactionFormValues>(initialInventoryTransactionFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [transactionErrors, setTransactionErrors] = useState<TransactionErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [transactionSuccess, setTransactionSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [postingTransaction, setPostingTransaction] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const canAccessInventory = canAccessInventoryRole(role);
  const canManageInventory = canManageInventoryRole(role);

  const itemsQuery = useQuery({
    queryKey: ["inventory-items"],
    queryFn: fetchInventoryItems,
    enabled: canAccessInventory && Boolean(facilityId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
  });

  const filteredItems = useMemo(() => {
    return (itemsQuery.data ?? []).filter((item) => {
      if (!matchesInventorySearch(item, deferredSearch)) {
        return false;
      }

      if (filter === "inactive") {
        return !item.is_active;
      }

      if (filter === "low_stock") {
        return item.is_active && isLowStock(item);
      }

      if (filter === "near_expiry") {
        return item.is_active && getExpiryState(item) === "near_expiry";
      }

      if (filter === "expired") {
        return item.is_active && getExpiryState(item) === "expired";
      }

      return true;
    });
  }, [deferredSearch, filter, itemsQuery.data]);

  const selectedItem = useMemo(
    () =>
      filteredItems.find((item) => item.id === selectedItemId) ??
      (itemsQuery.data ?? []).find((item) => item.id === selectedItemId) ??
      filteredItems[0] ??
      null,
    [filteredItems, itemsQuery.data, selectedItemId]
  );

  const transactionsQuery = useQuery({
    queryKey: ["inventory-transactions", selectedItem?.id ?? null],
    queryFn: () => fetchInventoryTransactions(selectedItem?.id ?? null),
    enabled: canAccessInventory && Boolean(selectedItem?.id),
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    if (!selectedItemId && filteredItems.length > 0) {
      setSelectedItemId(filteredItems[0].id);
    }
  }, [filteredItems, selectedItemId]);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    setTransactionFormState((current) => ({
      ...current,
      item_id: selectedItem.id,
      unit_cost: Number(selectedItem.unit_cost ?? 0)
    }));
  }, [selectedItem]);

  useEffect(() => {
    if (!submitSuccess) {
      return;
    }

    const timer = window.setTimeout(() => setSubmitSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [submitSuccess]);

  useEffect(() => {
    if (!transactionSuccess) {
      return;
    }

    const timer = window.setTimeout(() => setTransactionSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [transactionSuccess]);

  const stats = useMemo(() => {
    const items = itemsQuery.data ?? [];
    return {
      active: items.filter((item) => item.is_active).length,
      lowStock: items.filter((item) => item.is_active && isLowStock(item)).length,
      nearExpiry: items.filter(
        (item) => item.is_active && getExpiryState(item) === "near_expiry"
      ).length,
      expired: items.filter(
        (item) => item.is_active && getExpiryState(item) === "expired"
      ).length
    };
  }, [itemsQuery.data]);

  const alertFeed = useMemo(
    () =>
      (itemsQuery.data ?? [])
        .map((item) => ({ item, alert: getAlertSummary(item) }))
        .filter(
          (entry): entry is { item: InventoryItemRow; alert: NonNullable<ReturnType<typeof getAlertSummary>> } =>
            Boolean(entry.alert)
        )
        .sort((left, right) => {
          const leftWeight = left.alert.severity === "high" ? 0 : 1;
          const rightWeight = right.alert.severity === "high" ? 0 : 1;
          return leftWeight - rightWeight;
        }),
    [itemsQuery.data]
  );

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading inventory workspace...
        </CardContent>
      </Card>
    );
  }

  if (!canAccessInventory) {
    return (
      <Card className="border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="h-5 w-5" />
            Inventory access is restricted
          </CardTitle>
          <CardDescription className="text-red-800">
            Your current role does not include stock monitoring or inventory management.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!facilityId) {
    return (
      <Card className="border-amber-200 bg-amber-50/80">
        <CardHeader>
          <CardTitle className="text-amber-950">Facility assignment required</CardTitle>
          <CardDescription className="text-amber-900">
            Complete the hospital setup for{" "}
            <span className="font-medium">{profile?.display_name || "this user"}</span> before
            managing inventory.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const resetItemForm = () => {
    setEditingItemId(null);
    setItemFormState(initialInventoryItemFormState);
    setErrors({});
    setSubmitError(null);
  };

  const startEditingItem = (item: InventoryItemRow) => {
    setEditingItemId(item.id);
    setSelectedItemId(item.id);
    setSubmitError(null);
    setSubmitSuccess(null);
    setErrors({});
    setItemFormState({
      name: item.name,
      category: item.category ?? "",
      unit_cost: Number(item.unit_cost ?? 0),
      quantity: Number(item.quantity),
      unit: item.unit,
      lot_number: item.lot_number ?? "",
      expiry_date: item.expiry_date ?? "",
      reorder_level: Number(item.reorder_level),
      vendor: item.vendor ?? "",
      storage_location: item.storage_location ?? "",
      description: item.description ?? "",
      is_active: item.is_active
    });
  };

  const handleItemFieldChange = <K extends keyof InventoryItemFormValues>(
    field: K,
    value: InventoryItemFormValues[K]
  ) => {
    setItemFormState((current) => ({ ...current, [field]: value }));
  };

  const handleTransactionFieldChange = <
    K extends keyof InventoryTransactionFormValues
  >(
    field: K,
    value: InventoryTransactionFormValues[K]
  ) => {
    setTransactionFormState((current) => ({ ...current, [field]: value }));
  };

  const writeAuditLog = async (
    action: string,
    entityId: string,
    payload: Record<string, unknown>
  ) => {
    await recordAuditLog({
      action,
      actorId: user?.id ?? null,
      entityId,
      entityTable: "inventory_items",
      facilityId,
      payload: payload as Json
    });
  };

  const handleItemSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setSubmitError(null);
    setSubmitSuccess(null);

    const parsed = inventoryItemFormSchema.safeParse(itemFormState);
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      parsed.error.issues.forEach((issue) => {
        const key = (issue.path[0] || "form") as keyof InventoryItemFormValues | "form";
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      });
      setErrors(nextErrors);
      return;
    }

    const payload: TablesInsert<"inventory_items"> = {
      category: toNullable(parsed.data.category),
      created_by: user?.id ?? null,
      description: toNullable(parsed.data.description),
      expiry_date: parsed.data.expiry_date || null,
      facility_id: facilityId,
      is_active: parsed.data.is_active,
      last_stocked_at: parsed.data.quantity > 0 ? new Date().toISOString() : null,
      lot_number: toNullable(parsed.data.lot_number),
      name: parsed.data.name.trim(),
      quantity: parsed.data.quantity,
      reorder_level: parsed.data.reorder_level,
      storage_location: toNullable(parsed.data.storage_location),
      unit: parsed.data.unit.trim(),
      unit_cost: parsed.data.unit_cost,
      vendor: toNullable(parsed.data.vendor)
    };

    try {
      setSaving(true);

      if (editingItemId) {
        const updatePayload: TablesUpdate<"inventory_items"> = {
          ...payload,
          updated_at: new Date().toISOString()
        };
        await commitOnlineMutation({
          action: "update",
          entity: "inventory_items",
          payload: updatePayload as Json,
          recordId: editingItemId
        });

        await writeAuditLog("inventory_item_updated", editingItemId, {
          item_name: updatePayload.name,
          quantity: updatePayload.quantity,
          reorder_level: updatePayload.reorder_level
        });

        setSelectedItemId(editingItemId);
        setSubmitSuccess(`Updated ${updatePayload.name} successfully.`);
        toast({
          title: "Inventory item updated",
          description: `${updatePayload.name} was updated successfully.`,
          variant: "success"
        });
      } else {
        const rowId = generateId();
        const row = {
          ...payload,
          id: rowId,
          updated_at: new Date().toISOString()
        } satisfies TablesInsert<"inventory_items"> & { id: string };
        await commitOnlineMutation({
          action: "insert",
          entity: "inventory_items",
          payload: row as Json,
          recordId: rowId
        });

        await writeAuditLog("inventory_item_created", rowId, {
          item_name: row.name,
          quantity: row.quantity,
          reorder_level: row.reorder_level
        });

        setSelectedItemId(rowId);
        setSubmitSuccess(`Added ${row.name} to inventory.`);
        toast({
          title: "Inventory item created",
          description: `${row.name} has been added to inventory.`,
          variant: "success"
        });
      }

      resetItemForm();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-items"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] })
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save inventory item.";
      setSubmitError(message);
      toast({
        title: "Inventory save failed",
        description: message,
        variant: "error"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (item: InventoryItemRow) => {
    if (!window.confirm(`Delete ${item.name} and its transaction history?`)) {
      return;
    }

    try {
      setDeletingItemId(item.id);
      setSubmitError(null);
      await commitOnlineMutation({
        action: "delete",
        entity: "inventory_items",
        payload: { id: item.id },
        recordId: item.id
      });

      await writeAuditLog("inventory_item_deleted", item.id, {
        item_name: item.name,
        lot_number: item.lot_number
      });

      if (selectedItemId === item.id) {
        startTransition(() => setSelectedItemId(null));
      }
      if (editingItemId === item.id) {
        resetItemForm();
      }

      setSubmitSuccess(`Deleted ${item.name} successfully.`);
      toast({
        title: "Inventory item deleted",
        description: `${item.name} and its history were removed.`,
        variant: "success"
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-items"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] })
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete inventory item.";
      setSubmitError(message);
      toast({
        title: "Delete failed",
        description: message,
        variant: "error"
      });
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleTransactionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTransactionErrors({});
    setTransactionError(null);
    setTransactionSuccess(null);

    const parsed = inventoryTransactionFormSchema.safeParse(transactionFormState);
    if (!parsed.success) {
      const nextErrors: TransactionErrors = {};
      parsed.error.issues.forEach((issue) => {
        const key =
          (issue.path[0] || "form") as keyof InventoryTransactionFormValues | "form";
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      });
      setTransactionErrors(nextErrors);
      return;
    }

    try {
      setPostingTransaction(true);
      if (!selectedItem) {
        throw new Error("Select an inventory item before posting a stock movement.");
      }

      await applyInventoryTransaction({
        actorId: user?.id ?? null,
        facilityId,
        item: selectedItem,
        notes: parsed.data.notes || null,
        quantity: parsed.data.quantity,
        reason: parsed.data.reason || null,
        referenceNumber: parsed.data.reference_number || null,
        transactionType: parsed.data.transaction_type,
        unitCost: parsed.data.unit_cost
      });

      setTransactionSuccess("Inventory movement recorded successfully.");
      toast({
        title: "Stock movement logged",
        description: `${parsed.data.transaction_type.replaceAll("_", " ")} recorded for ${selectedItem.name}.`,
        variant: "success"
      });
      setTransactionFormState({
        ...initialInventoryTransactionFormState,
        item_id: parsed.data.item_id,
        unit_cost: Number(selectedItem.unit_cost ?? 0)
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-items"] }),
        queryClient.invalidateQueries({
          queryKey: ["inventory-transactions", parsed.data.item_id]
        }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] })
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to record inventory movement.";
      setTransactionError(message);
      toast({
        title: "Stock movement failed",
        description: message,
        variant: "error"
      });
    } finally {
      setPostingTransaction(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <Card className="border-blue-100">
          <CardHeader className="pb-3">
            <CardDescription>Active items</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-amber-100">
          <CardHeader className="pb-3">
            <CardDescription>Low stock</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{stats.lowStock}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-orange-100">
          <CardHeader className="pb-3">
            <CardDescription>Near expiry</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{stats.nearExpiry}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-red-100">
          <CardHeader className="pb-3">
            <CardDescription>Expired</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{stats.expired}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-blue-100 shadow-soft">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-slate-950">
                  {editingItemId ? "Edit inventory item" : "Register inventory item"}
                </CardTitle>
                <CardDescription>
                  Track reagents, consumables, and kits with lot, expiry, and reorder details.
                </CardDescription>
              </div>
              {editingItemId ? (
                <Button onClick={resetItemForm} type="button" variant="outline">
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {!canManageInventory ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                Your role can view stock levels and alerts, but only inventory managers can create
                or update items.
              </div>
            ) : null}

            {submitError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                {submitError}
              </div>
            ) : null}

            {submitSuccess ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                {submitSuccess}
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={(event) => void handleItemSubmit(event)}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="inventory-name">Item name</Label>
                  <Input
                    id="inventory-name"
                    onChange={(event) => handleItemFieldChange("name", event.target.value)}
                    value={itemFormState.name}
                  />
                  {errors.name ? <p className="text-xs text-red-600">{errors.name}</p> : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventory-category">Category</Label>
                  <Input
                    id="inventory-category"
                    onChange={(event) =>
                      handleItemFieldChange("category", event.target.value)
                    }
                    placeholder="Reagent, consumable, control"
                    value={itemFormState.category}
                  />
                  {errors.category ? (
                    <p className="text-xs text-red-600">{errors.category}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="inventory-quantity">Opening quantity</Label>
                  <Input
                    id="inventory-quantity"
                    min="0"
                    onChange={(event) =>
                      handleItemFieldChange("quantity", Number(event.target.value))
                    }
                    step="0.01"
                    type="number"
                    value={itemFormState.quantity}
                  />
                  {errors.quantity ? (
                    <p className="text-xs text-red-600">{errors.quantity}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventory-unit">Unit</Label>
                  <Input
                    id="inventory-unit"
                    onChange={(event) => handleItemFieldChange("unit", event.target.value)}
                    placeholder="bottles, packs, mL"
                    value={itemFormState.unit}
                  />
                  {errors.unit ? <p className="text-xs text-red-600">{errors.unit}</p> : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventory-unit-cost">Unit cost (N)</Label>
                  <Input
                    id="inventory-unit-cost"
                    min="0"
                    onChange={(event) =>
                      handleItemFieldChange("unit_cost", Number(event.target.value))
                    }
                    step="0.01"
                    type="number"
                    value={itemFormState.unit_cost}
                  />
                  {errors.unit_cost ? (
                    <p className="text-xs text-red-600">{errors.unit_cost}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventory-reorder">Reorder level</Label>
                  <Input
                    id="inventory-reorder"
                    min="0"
                    onChange={(event) =>
                      handleItemFieldChange("reorder_level", Number(event.target.value))
                    }
                    step="0.01"
                    type="number"
                    value={itemFormState.reorder_level}
                  />
                  {errors.reorder_level ? (
                    <p className="text-xs text-red-600">{errors.reorder_level}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventory-expiry">Expiry date</Label>
                  <Input
                    id="inventory-expiry"
                    onChange={(event) =>
                      handleItemFieldChange("expiry_date", event.target.value)
                    }
                    type="date"
                    value={itemFormState.expiry_date}
                  />
                  {errors.expiry_date ? (
                    <p className="text-xs text-red-600">{errors.expiry_date}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="inventory-lot">Lot number</Label>
                  <Input
                    id="inventory-lot"
                    onChange={(event) =>
                      handleItemFieldChange("lot_number", event.target.value)
                    }
                    value={itemFormState.lot_number}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventory-vendor">Vendor</Label>
                  <Input
                    id="inventory-vendor"
                    onChange={(event) => handleItemFieldChange("vendor", event.target.value)}
                    value={itemFormState.vendor}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventory-location">Storage location</Label>
                  <Input
                    id="inventory-location"
                    onChange={(event) =>
                      handleItemFieldChange("storage_location", event.target.value)
                    }
                    placeholder="Cold room A, Shelf 2"
                    value={itemFormState.storage_location}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-description">Description</Label>
                <Textarea
                  id="inventory-description"
                  onChange={(event) =>
                    handleItemFieldChange("description", event.target.value)
                  }
                  placeholder="Additional handling or storage notes"
                  rows={3}
                  value={itemFormState.description}
                />
                {errors.description ? (
                  <p className="text-xs text-red-600">{errors.description}</p>
                ) : null}
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  checked={itemFormState.is_active}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  onChange={(event) =>
                    handleItemFieldChange("is_active", event.target.checked)
                  }
                  type="checkbox"
                />
                Keep item active in stock monitoring
              </label>

              <Button disabled={!canManageInventory || saving} type="submit">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingItemId ? (
                  <Pencil className="h-4 w-4" />
                ) : (
                  <Boxes className="h-4 w-4" />
                )}
                {editingItemId ? "Update item" : "Add inventory item"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-blue-100 shadow-soft">
          <CardHeader>
            <Badge variant="outline" className="w-fit border-amber-200 text-amber-700">
              Notifications
            </Badge>
            <CardTitle className="text-slate-950">Low stock and expiry alerts</CardTitle>
            <CardDescription>
              Reorder signals and expiry notifications across the hospital store.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alertFeed.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                No inventory alerts right now. Stock levels and expiry dates look healthy.
              </div>
            ) : null}

            {alertFeed.slice(0, 8).map(({ item, alert }) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={
                      alert.severity === "high"
                        ? "rounded-xl bg-red-100 p-2 text-red-700"
                        : "rounded-xl bg-amber-100 p-2 text-amber-700"
                    }
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{item.name}</p>
                    <p className="mt-1 text-sm text-slate-600">{alert.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline">Qty {formatQuantity(item.quantity, item.unit)}</Badge>
                      <Badge variant="outline">
                        Reorder {formatQuantity(item.reorder_level, item.unit)}
                      </Badge>
                      {item.expiry_date ? (
                        <Badge variant="outline">Expiry {formatInventoryDate(item.expiry_date)}</Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="border-slate-200">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="text-slate-950">Inventory catalogue</CardTitle>
                <CardDescription>
                  Search, review, edit, or archive stock items by alert status.
                </CardDescription>
              </div>
              <div className="relative min-w-[240px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search item, lot, vendor, location"
                  value={search}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["all", "low_stock", "near_expiry", "expired", "inactive"] as ItemFilter[]).map(
                (value) => (
                  <Button
                    key={value}
                    onClick={() => setFilter(value)}
                    size="sm"
                    type="button"
                    variant={filter === value ? "default" : "outline"}
                  >
                    {value === "all"
                      ? "All"
                      : value === "low_stock"
                        ? "Low stock"
                        : value === "near_expiry"
                          ? "Near expiry"
                          : value === "expired"
                            ? "Expired"
                            : "Inactive"}
                  </Button>
                )
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {itemsQuery.isLoading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                Loading inventory items...
              </div>
            ) : null}

            {itemsQuery.isError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                {itemsQuery.error instanceof Error
                  ? itemsQuery.error.message
                  : "Unable to load inventory items."}
              </div>
            ) : null}

            {!itemsQuery.isLoading && filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                No inventory items matched the current filters.
              </div>
            ) : null}

            {filteredItems.map((item) => {
              const lowStock = isLowStock(item);
              const expiryState = getExpiryState(item);
              const isActive = item.id === selectedItem?.id;

              return (
                <div
                  key={item.id}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    isActive
                      ? "border-blue-200 bg-blue-50/70"
                      : "border-slate-200 bg-white hover:border-blue-100 hover:bg-slate-50"
                  }`}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.category || "Uncategorized"} • Lot {item.lot_number || "N/A"}
                      </p>
                    </div>
                    {!item.is_active ? (
                      <Badge variant="outline">Inactive</Badge>
                    ) : lowStock ? (
                      <Badge className="border-transparent bg-amber-100 text-amber-700">
                        Low stock
                      </Badge>
                    ) : expiryState === "expired" ? (
                      <Badge className="border-transparent bg-red-100 text-red-700">
                        Expired
                      </Badge>
                    ) : expiryState === "near_expiry" ? (
                      <Badge className="border-transparent bg-orange-100 text-orange-700">
                        Near expiry
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Healthy</Badge>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>Qty {formatQuantity(item.quantity, item.unit)}</span>
                    <span>• Reorder {formatQuantity(item.reorder_level, item.unit)}</span>
                    <span>• Expiry {formatInventoryDate(item.expiry_date)}</span>
                  </div>

                  {canManageInventory ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditingItem(item);
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        disabled={deletingItemId === item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteItem(item);
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {deletingItemId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-slate-950">Selected item</CardTitle>
              <CardDescription>
                Stock profile, expiry watch, and recent movement history.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {selectedItem ? (
                <>
                  <div className="rounded-3xl border border-blue-100 bg-[linear-gradient(180deg,_rgba(255,255,255,1),_rgba(245,250,255,1))] p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xl font-semibold text-slate-950">{selectedItem.name}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {selectedItem.category || "Uncategorized"} • {selectedItem.unit}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!selectedItem.is_active ? (
                          <Badge variant="outline">Inactive</Badge>
                        ) : null}
                        {isLowStock(selectedItem) ? (
                          <Badge className="border-transparent bg-amber-100 text-amber-700">
                            Reorder needed
                          </Badge>
                        ) : null}
                        {getExpiryState(selectedItem) === "near_expiry" ? (
                          <Badge className="border-transparent bg-orange-100 text-orange-700">
                            Near expiry
                          </Badge>
                        ) : null}
                        {getExpiryState(selectedItem) === "expired" ? (
                          <Badge className="border-transparent bg-red-100 text-red-700">
                            Expired
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Current quantity
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">
                          {formatQuantity(selectedItem.quantity, selectedItem.unit)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Reorder level
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">
                          {formatQuantity(selectedItem.reorder_level, selectedItem.unit)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Unit cost
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">
                          {formatInventoryCurrency(selectedItem.unit_cost)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Stock value
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">
                          {formatInventoryCurrency(
                            Number(selectedItem.quantity) * Number(selectedItem.unit_cost)
                          )}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Expiry
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">
                          {formatInventoryDate(selectedItem.expiry_date)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/90 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Days left
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">
                          {getDaysUntilExpiry(selectedItem.expiry_date) ?? "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                        <p>
                          <span className="font-medium text-slate-900">Lot number:</span>{" "}
                          {selectedItem.lot_number || "Not recorded"}
                        </p>
                        <p className="mt-2">
                          <span className="font-medium text-slate-900">Vendor:</span>{" "}
                          {selectedItem.vendor || "Not recorded"}
                        </p>
                        <p className="mt-2">
                          <span className="font-medium text-slate-900">Storage:</span>{" "}
                          {selectedItem.storage_location || "Not recorded"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                        <p>
                          <span className="font-medium text-slate-900">Description:</span>{" "}
                          {selectedItem.description || "No additional description"}
                        </p>
                        <p className="mt-2">
                          <span className="font-medium text-slate-900">Last stocked:</span>{" "}
                          {formatInventoryDateTime(selectedItem.last_stocked_at)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Card className="border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-base text-slate-950">Stock movement</CardTitle>
                      <CardDescription>
                        Record stock in, stock out, usage, or adjustment for this item.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {transactionError ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                          {transactionError}
                        </div>
                      ) : null}

                      {transactionSuccess ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                          {transactionSuccess}
                        </div>
                      ) : null}

                      <form
                        className="space-y-4"
                        onSubmit={(event) => void handleTransactionSubmit(event)}
                      >
                        <div className="space-y-2">
                          <Label htmlFor="transaction-type">Transaction type</Label>
                          <select
                            className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                            id="transaction-type"
                            onChange={(event) =>
                              handleTransactionFieldChange(
                                "transaction_type",
                                event.target.value as InventoryTransactionFormValues["transaction_type"]
                              )
                            }
                            value={transactionFormState.transaction_type}
                          >
                            {inventoryTransactionOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-slate-500">
                            {
                              inventoryTransactionOptions.find(
                                (option) =>
                                  option.value === transactionFormState.transaction_type
                              )?.description
                            }
                          </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="transaction-quantity">
                              {transactionFormState.transaction_type === "adjustment"
                                ? "Adjustment quantity"
                                : "Quantity"}
                            </Label>
                            <Input
                              id="transaction-quantity"
                              onChange={(event) =>
                                handleTransactionFieldChange(
                                  "quantity",
                                  Number(event.target.value)
                                )
                              }
                              step="0.01"
                              type="number"
                              value={transactionFormState.quantity}
                            />
                            {transactionErrors.quantity ? (
                              <p className="text-xs text-red-600">
                                {transactionErrors.quantity}
                              </p>
                            ) : null}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="transaction-unit-cost">Unit cost (N)</Label>
                            <Input
                              id="transaction-unit-cost"
                              min="0"
                              onChange={(event) =>
                                handleTransactionFieldChange(
                                  "unit_cost",
                                  Number(event.target.value)
                                )
                              }
                              step="0.01"
                              type="number"
                              value={transactionFormState.unit_cost}
                            />
                            {transactionErrors.unit_cost ? (
                              <p className="text-xs text-red-600">
                                {transactionErrors.unit_cost}
                              </p>
                            ) : null}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="transaction-reference">Reference number</Label>
                            <Input
                              id="transaction-reference"
                              onChange={(event) =>
                                handleTransactionFieldChange(
                                  "reference_number",
                                  event.target.value
                                )
                              }
                              placeholder="Invoice, batch, order, bench reference"
                              value={transactionFormState.reference_number}
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="transaction-reason">Reason</Label>
                            <Input
                              id="transaction-reason"
                              onChange={(event) =>
                                handleTransactionFieldChange("reason", event.target.value)
                              }
                              placeholder="Restock, analyzer QC run, manual recount"
                              value={transactionFormState.reason}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="transaction-notes">Notes</Label>
                            <Input
                              id="transaction-notes"
                              onChange={(event) =>
                                handleTransactionFieldChange("notes", event.target.value)
                              }
                              placeholder="Optional usage or adjustment note"
                              value={transactionFormState.notes}
                            />
                          </div>
                        </div>

                        <Button disabled={!canManageInventory || postingTransaction} type="submit">
                          {postingTransaction ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                          Log stock movement
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-base text-slate-950">Usage log</CardTitle>
                      <CardDescription>
                        Recent stock movements for this item, including usage and adjustments.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {transactionsQuery.isLoading ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                          Loading transaction history...
                        </div>
                      ) : null}

                      {!transactionsQuery.isLoading &&
                      (transactionsQuery.data ?? []).length === 0 ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                          No stock movements have been recorded for this item yet.
                        </div>
                      ) : null}

                      {(transactionsQuery.data ?? []).map((transaction) => (
                        <div
                          key={transaction.id}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-sm font-semibold capitalize text-slate-950">
                                {transaction.transaction_type.replaceAll("_", " ")}
                              </p>
                              <p className="mt-1 text-sm text-slate-600">
                                {transaction.reason || "No reason captured"}
                              </p>
                              <p className="mt-2 text-xs text-slate-500">
                                {formatInventoryDateTime(transaction.created_at)}
                              </p>
                            </div>

                            <div className="text-right">
                              <p
                                className={
                                  transaction.quantity >= 0
                                    ? "text-sm font-semibold text-emerald-700"
                                    : "text-sm font-semibold text-red-700"
                                }
                              >
                                {transaction.quantity >= 0 ? "+" : ""}
                                {formatQuantity(transaction.quantity, selectedItem.unit)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Balance{" "}
                                {formatQuantity(transaction.balance_after, selectedItem.unit)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Cost {formatInventoryCurrency(transaction.total_cost)}
                              </p>
                              {transaction.reference_number ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  Ref {transaction.reference_number}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
                  Choose an inventory item to review stock profile, alerts, and usage logs.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
