export type AppRole =
  | "Admin"
  | "Receptionist"
  | "LabScientist"
  | "Verifier"
  | "Accountant"
  | "Doctor"
  | "Nurse"
  | "Pharmacist"
  | "Storekeeper"
  | "Radiologist";

export const appRoles: AppRole[] = [
  "Admin",
  "Receptionist",
  "LabScientist",
  "Verifier",
  "Accountant",
  "Doctor",
  "Nurse",
  "Pharmacist",
  "Storekeeper",
  "Radiologist"
];

export function formatAppRole(role: AppRole | null | undefined) {
  if (!role) {
    return "Unknown";
  }

  if (role === "LabScientist") {
    return "Lab Scientist";
  }

  if (role === "Verifier") {
    return "HOD of Lab / Chief Scientist";
  }

  if (role === "Storekeeper") {
    return "Storekeeper";
  }

  return role;
}

export type UserProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  facility_id: string | null;
  role: AppRole;
  approval_status: "Pending" | "Approved" | "Rejected";
  created_at: string;
  updated_at: string;
};
