import type { Database } from "@/types/supabase";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type ApprovalStatus = Database["public"]["Enums"]["approval_status"];
export type FacilityAccessMode = Database["public"]["Enums"]["facility_access_mode"];

export const appRoles: AppRole[] = [
  "SuperAdmin",
  "Admin",
  "Receptionist",
  "LabScientist",
  "Verifier",
  "Accountant"
];

export function formatAppRole(role: AppRole | null | undefined) {
  if (!role) {
    return "Unknown";
  }

  if (role === "LabScientist") {
    return "Lab Scientist";
  }

  if (role === "SuperAdmin") {
    return "Super Admin";
  }

  if (role === "Verifier") {
    return "HOD of Lab / Chief Scientist";
  }

  return role;
}

export type UserProfile = {
  approval_note: string | null;
  approval_status: ApprovalStatus;
  approved_at: string | null;
  approved_by: string | null;
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  facility_id: string | null;
  role: AppRole;
  created_at: string;
  updated_at: string;
};
