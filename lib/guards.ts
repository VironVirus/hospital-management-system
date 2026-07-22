import type { AppRole } from "@/lib/auth-types";

export function isAdminRole(role: AppRole | null | undefined) {
  return role === "Admin";
}

export function canAccessAdministrationRole(role: AppRole | null | undefined) {
  return isAdminRole(role);
}

export function canAccessPatientsRole(role: AppRole | null | undefined) {
  return (
    isAdminRole(role) ||
    role === "Receptionist" ||
    role === "LabScientist" ||
    role === "Doctor" ||
    role === "Nurse" ||
    role === "Pharmacist" ||
    role === "Radiologist"
  );
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
  return isAdminRole(role) || role === "LabScientist" || role === "Accountant" || role === "Storekeeper" || role === "Pharmacist";
}

export function canManageInventoryRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "LabScientist" || role === "Accountant" || role === "Storekeeper" || role === "Pharmacist";
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

export function canAccessClinicalRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || ["Receptionist", "Doctor", "Nurse", "LabScientist", "Pharmacist", "Radiologist"].includes(role ?? "");
}

export function canManageClinicalRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Doctor" || role === "Nurse";
}

export function canManageWardsRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Nurse";
}

export function canAccessPharmacyRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || ["Doctor", "Nurse", "Pharmacist", "Storekeeper"].includes(role ?? "");
}

export function canPrescribeRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Doctor";
}

export function canDispenseRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Pharmacist";
}

export function canManageMedicationStockRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Pharmacist" || role === "Storekeeper";
}

export function canAccessHospitalBillingRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Receptionist" || role === "Accountant" || role === "Doctor" || role === "Nurse";
}

export function canOpenEncountersRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Receptionist" || role === "Doctor" || role === "Nurse";
}

export function canAccessRadiologyRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || ["Receptionist", "Doctor", "Nurse", "Radiologist", "Accountant"].includes(role ?? "");
}

export function canRequestRadiologyRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Receptionist" || role === "Doctor";
}

export function canManageRadiologyRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Radiologist";
}

export function canManageHospitalBillingRole(role: AppRole | null | undefined) {
  return isAdminRole(role) || role === "Receptionist" || role === "Accountant";
}
