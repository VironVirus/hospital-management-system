export function formatPatientDate(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function formatPatientAge(value: string | null | undefined) {
  if (!value) {
    return "Age not recorded";
  }

  const dateOfBirth = new Date(value);
  if (Number.isNaN(dateOfBirth.getTime())) {
    return "Age not recorded";
  }

  const today = new Date();
  if (dateOfBirth > today) {
    return "Age not recorded";
  }

  const diffMs = today.getTime() - dateOfBirth.getTime();
  const diffWeeks = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7)));

  let monthCount =
    (today.getFullYear() - dateOfBirth.getFullYear()) * 12 +
    (today.getMonth() - dateOfBirth.getMonth());

  if (today.getDate() < dateOfBirth.getDate()) {
    monthCount -= 1;
  }

  const safeMonthCount = Math.max(0, monthCount);

  if (safeMonthCount < 3) {
    return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"}`;
  }

  if (safeMonthCount < 24) {
    return `${safeMonthCount} month${safeMonthCount === 1 ? "" : "s"}`;
  }

  const years = Math.max(1, Math.floor(safeMonthCount / 12));
  return `${years} year${years === 1 ? "" : "s"}`;
}
