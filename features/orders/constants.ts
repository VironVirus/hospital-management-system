import type { Enums } from "@/types/database";

export type SampleStatus = Enums<"sample_status">;

export const sampleStatuses: SampleStatus[] = [
  "Registered",
  "Collected",
  "In_Progress",
  "Results_Entered",
  "Verified",
  "Reported"
];

export const priorityOptions = ["routine", "urgent", "stat"] as const;

export function formatSampleStatus(status: SampleStatus) {
  return status.replaceAll("_", " ");
}

export function getSampleStatusIndex(status: SampleStatus) {
  return sampleStatuses.indexOf(status);
}

export function getNextSampleStatus(status: SampleStatus) {
  const currentIndex = getSampleStatusIndex(status);
  if (currentIndex < 0 || currentIndex === sampleStatuses.length - 1) {
    return null;
  }

  return sampleStatuses[currentIndex + 1];
}

export function canTransitionToStatus(
  currentStatus: SampleStatus,
  nextStatus: SampleStatus
) {
  return getSampleStatusIndex(nextStatus) > getSampleStatusIndex(currentStatus);
}
