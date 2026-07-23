type Filter = { column: string; operator: "eq" | "neq" | "in" | "is" | "gte" | "lte" | "like" | "ilike"; value: unknown };
// The compatibility client mirrors the fluent query shape used throughout the UI.
// Runtime validation and authorization happen in the server API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryResponse<T = any> = { data: T | null; error: { message: string } | null; count?: number | null };

class QueryBuilder implements PromiseLike<QueryResponse> {
  private operation: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private values: unknown = null;
  private columns = "*";
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private rowLimit: number | null = null;
  private rowRange: [number, number] | null = null;
  private conflictColumn: string | null = null;
  private orExpression: string | null = null;

  constructor(private readonly table: string) {}

  select(columns = "*") { this.columns = columns; return this; }
  insert(values: unknown) { this.operation = "insert"; this.values = values; return this; }
  update(values: unknown) { this.operation = "update"; this.values = values; return this; }
  upsert(values: unknown, options?: { onConflict?: string }) { this.operation = "upsert"; this.values = values; this.conflictColumn = options?.onConflict ?? "id"; return this; }
  delete() { this.operation = "delete"; return this; }
  eq(column: string, value: unknown) { this.filters.push({ column, operator: "eq", value }); return this; }
  neq(column: string, value: unknown) { this.filters.push({ column, operator: "neq", value }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ column, operator: "in", value }); return this; }
  is(column: string, value: null | boolean) { this.filters.push({ column, operator: "is", value }); return this; }
  gte(column: string, value: unknown) { this.filters.push({ column, operator: "gte", value }); return this; }
  lte(column: string, value: unknown) { this.filters.push({ column, operator: "lte", value }); return this; }
  like(column: string, value: unknown) { this.filters.push({ column, operator: "like", value }); return this; }
  ilike(column: string, value: unknown) { this.filters.push({ column, operator: "ilike", value }); return this; }
  or(expression: string) { this.orExpression = expression; return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orderBy = { column, ascending: options?.ascending ?? true }; return this; }
  limit(value: number) { this.rowLimit = value; return this; }
  range(from: number, to: number) { this.rowRange = [from, to]; return this; }
  single() { return this.execute(true); }
  maybeSingle() { return this.execute(true); }

  private async execute(single = false): Promise<QueryResponse> {
    try {
      const response = await fetch("/api/data", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          table: this.table,
          operation: this.operation,
          values: this.values,
          columns: this.columns,
          filters: this.filters,
          order: this.orderBy,
          limit: this.rowLimit,
          range: this.rowRange,
          onConflict: this.conflictColumn,
          or: this.orExpression,
          single
        })
      });
      const payload = await response.json().catch(() => null) as QueryResponse | null;
      if (!response.ok) return { data: null, error: { message: payload?.error?.message || "Request failed." } };
      return payload ?? { data: null, error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Request failed." } };
    }
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class AppClient {
  from(table: string) { return new QueryBuilder(table); }
  async rpc(name: string, args: Record<string, unknown> = {}): Promise<QueryResponse> {
    try {
      const response = await fetch("/api/data/rpc", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, args })
      });
      const payload = await response.json().catch(() => null) as QueryResponse | null;
      if (!response.ok) return { data: null, error: { message: payload?.error?.message || "Operation failed." } };
      return payload ?? { data: null, error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Operation failed." } };
    }
  }
}

const appClient = new AppClient();

export function getAppClient() {
  return appClient;
}
