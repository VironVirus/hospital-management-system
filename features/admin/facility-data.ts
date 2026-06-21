"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Tables } from "@/types/supabase";

export type FacilityRow = Tables<"facilities">;
export type FacilityStaffRow = Pick<
  Tables<"profiles">,
  "created_at" | "display_name" | "email" | "facility_id" | "id" | "role"
>;
export type FacilityMode = "standalone" | "child";
export type FacilityStatusFilter = "all" | "active" | "inactive";
export type FacilityStructureFilter = "all" | "standalone" | "child";
export type FacilityAdminFilter = "all" | "with-admin" | "without-admin";

const facilitySelect =
  "id, name, code, address, phone, email, is_active, approval_status, approval_note, approved_at, approved_by, access_mode, access_started_at, access_ends_at, annual_fee, created_by, parent_facility_id, created_at, updated_at";

export function normalizeFacilityCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export function formatDateTime(value: string | null) {
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

export function cleanOptionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getFacilitySearchText(facility: FacilityRow, parentName?: string | null) {
  return [
    facility.name,
    facility.code,
    facility.address,
    facility.phone,
    facility.email,
    parentName,
    facility.is_active ? "active" : "inactive",
    facility.parent_facility_id ? "child branch" : "standalone facility"
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export async function fetchFacilities() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("facilities")
    .select(facilitySelect)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as FacilityRow[];
}

export async function fetchFacilityStaff() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email, facility_id, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as FacilityStaffRow[];
}
