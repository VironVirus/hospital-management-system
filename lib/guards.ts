import type { AppRole } from "@/lib/auth-types";

export function isAdminRole(role: AppRole | null | undefined) {
  return role === "Admin";
}

export function canAccessPatientsRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "Receptionist" || role === "LabScientist";
}

export function canRegisterPatientsRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "Receptionist";
}

export function canManagePatientsRole(role: AppRole | null | undefined) {
  return role === "Admin";
}

export function canAccessOrdersRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "Receptionist" || role === "LabScientist";
}

export function canCreateOrdersRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "Receptionist";
}

export function canAccessSampleReceptionRole(role: AppRole | null | undefined) {
  return (
    role === "Admin" ||
    role === "Receptionist" ||
    role === "LabScientist" ||
    role === "Verifier"
  );
}

export function canEnterResultsRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "LabScientist";
}

export function canVerifyResultsRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "Verifier";
}

export function canAccessReportsRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "Receptionist" || role === "Verifier";
}

export function canAccessInventoryRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "LabScientist" || role === "Accountant";
}

export function canManageInventoryRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "LabScientist" || role === "Accountant";
}

export function canAccessBillingRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "Accountant";
}

export function canManageBillingRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "Accountant";
}

export function canAccessAccountsRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "Accountant";
}

export function canManageAccountsRole(role: AppRole | null | undefined) {
  return role === "Admin" || role === "Accountant";
}
