import type { AppRole } from "@/lib/auth-types";

export function isAdminRole(role: AppRole | null | undefined) {
  return role === "SuperAdmin" || role === "Admin";
}

export function isSuperAdminRole(role: AppRole | null | undefined) {
  return role === "SuperAdmin";
}

export function canAccessAdministrationRole(role: AppRole | null | undefined) {
  return isAdminRole(role);
}

export function canManageFacilitiesRole(role: AppRole | null | undefined) {
  return isAdminRole(role);
}

export function canCreateFacilitiesRole(role: AppRole | null | undefined) {
  return isSuperAdminRole(role);
}

export function canAccessPatientsRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Receptionist" || role === "LabScientist";
}

export function canRegisterPatientsRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Receptionist";
}

export function canManagePatientsRole(role: AppRole | null | undefined) {
  return isAdminRole(role);
}

export function canAccessOrdersRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Receptionist" || role === "LabScientist";
}

export function canCreateOrdersRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Receptionist";
}

export function canAccessSampleReceptionRole(role: AppRole | null | undefined) {
  return (
    isAdminRole(role) ||
    role === "Receptionist" ||
    role === "LabScientist" ||
    role === "Verifier"
  );
}

export function canEnterResultsRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "LabScientist";
}

export function canVerifyResultsRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Verifier";
}

export function canAccessReportsRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Receptionist" || role === "Verifier";
}

export function canAccessInventoryRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "LabScientist" || role === "Accountant";
}

export function canManageInventoryRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "LabScientist" || role === "Accountant";
}

export function canAccessBillingRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Accountant";
}

export function canManageBillingRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Accountant";
}

export function canAccessAccountsRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Accountant";
}

export function canManageAccountsRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Accountant";
}

export function canAccessQcRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "LabScientist" || role === "Verifier";
}

export function canManageQcRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "LabScientist";
}
