"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Loader2, Search, ShieldAlert } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canAccessAdministrationRole } from "@/lib/guards";
import { getAppClient } from "@/lib/app-client";
import type { Tables } from "@/types/database";

type AuditLogRow = Tables<"audit_logs">;

type EntityFilter =
  | "all"
  | "patients"
  | "orders"
  | "order_tests"
  | "order_test_results"
  | "inventory_items"
  | "invoices";

type DateFilter = "24h" | "7d" | "30d" | "all";

const entityOptions: Array<{ label: string; value: EntityFilter }> = [
  { label: "All modules", value: "all" },
  { label: "Patients", value: "patients" },
  { label: "Orders", value: "orders" },
  { label: "Samples", value: "order_tests" },
  { label: "Results", value: "order_test_results" },
  { label: "Inventory", value: "inventory_items" },
  { label: "Billing", value: "invoices" }
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function buildCutoff(filter: DateFilter) {
  if (filter === "all") {
    return null;
  }

  const now = new Date();
  const days = filter === "24h" ? 1 : filter === "7d" ? 7 : 30;
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

async function fetchAuditLogs() {
  const database = getAppClient();
  if (!database) {
    throw new Error("MySQL is not configured.");
  }

  const { data, error } = await database
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AuditLogRow[];
}

export function AuditLogsViewer() {
  const { facilityId, loading, role } = useAuth();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("7d");
  const [visibleCount, setVisibleCount] = useState(40);

  const canAccessAdministration = canAccessAdministrationRole(role);

  const query = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: fetchAuditLogs,
    enabled: canAccessAdministration && Boolean(facilityId)
  });

  useEffect(() => {
    setVisibleCount(40);
  }, [dateFilter, deferredSearch, entityFilter]);

  const filteredLogs = useMemo(() => {
    const cutoff = buildCutoff(dateFilter);
    const needle = deferredSearch.trim().toLowerCase();

    return (query.data ?? []).filter((log) => {
      if (entityFilter !== "all" && log.entity_table !== entityFilter) {
        return false;
      }

      if (cutoff && log.created_at < cutoff) {
        return false;
      }

      if (!needle) {
        return true;
      }

      return JSON.stringify({
        action: log.action,
        actor_id: log.actor_id,
        entity_id: log.entity_id,
        entity_table: log.entity_table,
        payload: log.payload
      })
        .toLowerCase()
        .includes(needle);
    });
  }, [dateFilter, deferredSearch, entityFilter, query.data]);

  const visibleLogs = filteredLogs.slice(0, visibleCount);

  const stats = useMemo(() => {
    const logs = query.data ?? [];
    return {
      total: logs.length,
      today: logs.filter((log) => {
        const createdAt = new Date(log.created_at);
        const today = new Date();
        return createdAt.toDateString() === today.toDateString();
      }).length,
      visible: filteredLogs.length
    };
  }, [filteredLogs.length, query.data]);

  if (loading) {
    return (
      <Card className="border-blue-100">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading audit workspace...
        </CardContent>
      </Card>
    );
  }

  if (!canAccessAdministration) {
    return (
      <Card className="border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="h-5 w-5" />
            Admin access required
          </CardTitle>
          <CardDescription className="text-red-800">
            Only the hospital Admin can review the full system audit trail.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Database logs</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Today&apos;s events</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{stats.today}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription>Matched filters</CardDescription>
            <CardTitle className="text-3xl text-slate-950">{stats.visible}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card className="border-blue-100 shadow-soft">
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-700" />
                Full audit logs
              </CardTitle>
              <CardDescription>
                Review changes across patient registration, orders, results, inventory, and
                billing from the central audit trail.
              </CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_160px] xl:min-w-[720px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search action, entity, actor ID, or payload"
                  value={search}
                />
              </div>
              <select
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                onChange={(event) => setEntityFilter(event.target.value as EntityFilter)}
                value={entityFilter}
              >
                {entityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                onChange={(event) => setDateFilter(event.target.value as DateFilter)}
                value={dateFilter}
              >
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="all">All logs</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {query.isLoading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
              Loading audit events...
            </div>
          ) : null}

          {query.isError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
              {query.error instanceof Error ? query.error.message : "Unable to load audit logs."}
            </div>
          ) : null}

          {!query.isLoading && !query.isError && visibleLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-5 py-8 text-center text-sm text-slate-600">
              No audit entries matched the current filters.
            </div>
          ) : null}

          <div className="space-y-3">
            {visibleLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950 dark:text-slate-50">
                        {log.action}
                      </p>
                      <Badge variant="outline">{log.entity_table}</Badge>
                      <Badge variant="secondary">{log.entity_id.slice(0, 8)}</Badge>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Actor: {log.actor_id ? log.actor_id.slice(0, 8) : "System"} ·{" "}
                      {formatDateTime(log.created_at)}
                    </p>
                  </div>
                  <Badge variant="outline">Facility scoped</Badge>
                </div>
                <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-50 p-4 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {JSON.stringify(log.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>

          {visibleLogs.length < filteredLogs.length ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setVisibleCount((current) => current + 40)}
            >
              Load more audit events
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
