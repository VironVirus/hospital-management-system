import type { ApprovalStatus, FacilityAccessMode } from "@/lib/auth-types";

export type AccessState =
  | "active"
  | "account_pending"
  | "account_rejected"
  | "facility_unassigned"
  | "facility_missing"
  | "facility_pending"
  | "facility_rejected"
  | "facility_inactive"
  | "payment_required"
  | "demo_expired"
  | "trial_expired"
  | "subscription_expired"
  | "profile_missing";

export type AccessSnapshot = {
  access_message: string;
  access_state: AccessState | string;
  annual_fee: number;
  facility_access_ends_at: string | null;
  facility_access_mode: FacilityAccessMode;
  facility_access_started_at: string | null;
  facility_approval_status: ApprovalStatus;
  facility_id: string | null;
  facility_is_active: boolean;
  facility_name: string | null;
  profile_approval_status: ApprovalStatus;
  profile_id: string;
  role: string;
};

export function isAccessStateActive(state: string | null | undefined) {
  return state === "active";
}

export function formatFacilityAccessMode(mode: FacilityAccessMode | null | undefined) {
  if (!mode) {
    return "Unknown";
  }

  if (mode === "FreeTrial") {
    return "Free Trial";
  }

  return mode;
}

export function formatApprovalStatus(status: ApprovalStatus | null | undefined) {
  if (!status) {
    return "Unknown";
  }

  return status;
}

export function formatAccessDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function buildAccessStatusUrl(state?: string | null) {
  if (!state) {
    return "/access-status";
  }

  return `/access-status?state=${encodeURIComponent(state)}`;
}
