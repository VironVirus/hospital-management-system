export const medicationFrequencies = [
  { code: "once_daily", label: "Once daily", dosesPerDay: 1, intervalHours: 24 },
  { code: "twice_daily", label: "Twice daily", dosesPerDay: 2, intervalHours: 12 },
  { code: "three_times_daily", label: "Three times daily", dosesPerDay: 3, intervalHours: 8 },
  { code: "four_times_daily", label: "Four times daily", dosesPerDay: 4, intervalHours: 6 },
  { code: "every_4_hours", label: "Every 4 hours", dosesPerDay: 6, intervalHours: 4 },
  { code: "every_6_hours", label: "Every 6 hours", dosesPerDay: 4, intervalHours: 6 },
  { code: "every_8_hours", label: "Every 8 hours", dosesPerDay: 3, intervalHours: 8 },
  { code: "every_12_hours", label: "Every 12 hours", dosesPerDay: 2, intervalHours: 12 },
  { code: "at_night", label: "At night", dosesPerDay: 1, intervalHours: 24 },
  { code: "stat", label: "STAT / once now", dosesPerDay: 1, intervalHours: 0 }
] as const;

export type MedicationFrequencyCode = (typeof medicationFrequencies)[number]["code"];

export function getMedicationFrequency(value: string) {
  const normalized = value.trim().toLowerCase();
  return medicationFrequencies.find(
    (frequency) => frequency.code === normalized || frequency.label.toLowerCase() === normalized
  ) ?? null;
}

export function calculateMedicationQuantity(
  unitsPerDose: number,
  frequencyCode: string,
  durationDays: number
) {
  const frequency = getMedicationFrequency(frequencyCode);
  if (!frequency) return 0;
  const units = Math.max(Number(unitsPerDose) || 0, 0);
  const days = Math.max(Math.trunc(Number(durationDays) || 0), 0);
  const doses = frequency.code === "stat" ? 1 : frequency.dosesPerDay * days;
  return Math.round(units * doses * 100) / 100;
}

export function medicationDoseCount(frequencyCode: string, durationDays: number) {
  const frequency = getMedicationFrequency(frequencyCode);
  if (!frequency) return 0;
  if (frequency.code === "stat") return 1;
  return frequency.dosesPerDay * Math.max(Math.trunc(Number(durationDays) || 0), 0);
}
