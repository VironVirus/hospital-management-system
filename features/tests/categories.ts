export const testCategories = [
  "Haematology",
  "Blood Group Serology",
  "Microbiology",
  "Chemical Pathology",
  "Histopathology"
] as const;

export type TestCategory = (typeof testCategories)[number];

const normalizedCategoryMap: Record<string, TestCategory> = {
  "blood group serology": "Blood Group Serology",
  "bloodgroupserology": "Blood Group Serology",
  "blood group": "Blood Group Serology",
  "bloodgroup": "Blood Group Serology",
  "chemical pathology": "Chemical Pathology",
  "chemicalpathology": "Chemical Pathology",
  chemistry: "Chemical Pathology",
  "clinical chemistry": "Chemical Pathology",
  "clinicalchemistry": "Chemical Pathology",
  haematology: "Haematology",
  hematology: "Haematology",
  histopathology: "Histopathology",
  microbiology: "Microbiology",
  serology: "Blood Group Serology"
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeTestCategory(value: string | null | undefined): TestCategory | null {
  if (!value?.trim()) {
    return null;
  }

  const normalized = normalizeKey(value);
  if (normalized in normalizedCategoryMap) {
    return normalizedCategoryMap[normalized];
  }

  const compact = normalized.replace(/\s+/g, "");
  if (compact in normalizedCategoryMap) {
    return normalizedCategoryMap[compact];
  }

  return testCategories.find((category) => normalizeKey(category) === normalized) ?? null;
}

export function getTestCategoryLabel(value: string | null | undefined) {
  return normalizeTestCategory(value) ?? "Uncategorized";
}
