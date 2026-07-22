import { getAppClient } from "@/lib/app-client";

type QueryError = { message: string } | null;
type QueryResponse = { data: unknown; error: QueryError };

export type HospitalQuery = PromiseLike<QueryResponse> & {
  select: (columns?: string) => HospitalQuery;
  insert: (values: unknown) => HospitalQuery;
  update: (values: unknown) => HospitalQuery;
  delete: () => HospitalQuery;
  eq: (column: string, value: unknown) => HospitalQuery;
  neq: (column: string, value: unknown) => HospitalQuery;
  in: (column: string, values: unknown[]) => HospitalQuery;
  is: (column: string, value: null | boolean) => HospitalQuery;
  gte: (column: string, value: unknown) => HospitalQuery;
  order: (column: string, options?: { ascending?: boolean }) => HospitalQuery;
  limit: (count: number) => HospitalQuery;
  single: () => Promise<QueryResponse>;
  maybeSingle: () => Promise<QueryResponse>;
};

type HospitalClient = {
  from: (table: string) => HospitalQuery;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<QueryResponse>;
};

export function getHospitalClient() {
  return getAppClient() as unknown as HospitalClient;
}

export function throwIfHospitalError(error: QueryError) {
  if (error) throw new Error(error.message);
}
