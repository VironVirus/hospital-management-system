import type { Tables } from "@/types/database";

type ReferenceRange = Tables<"tests">["reference_range"];

export type SimpleReferenceRange =
  | {
      mode: "numeric";
      min: number | null;
      max: number | null;
      text: null;
      options: null;
      positive_label: null;
      negative_label: null;
    }
  | {
      mode: "text";
      min: null;
      max: null;
      text: string;
      options: null;
      positive_label: null;
      negative_label: null;
    }
  | {
      mode: "select";
      min: null;
      max: null;
      text: string | null;
      options: string[];
      positive_label: null;
      negative_label: null;
    }
  | {
      mode: "boolean";
      min: null;
      max: null;
      text: string | null;
      options: null;
      positive_label: string;
      negative_label: string;
    };

export type StoredReferenceRange =
  | SimpleReferenceRange
  | {
      mode: "panel";
      min: null;
      max: null;
      text: string | null;
      options: null;
      positive_label: null;
      negative_label: null;
      parameters: Array<{
        id: string;
        name: string;
        result_type: "numeric" | "text" | "boolean" | "select";
        unit: string | null;
        reference_range: SimpleReferenceRange;
      }>;
    };

export function isStoredReferenceRange(
  value: ReferenceRange
): value is StoredReferenceRange {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  if (!("mode" in value)) {
    return false;
  }

  if (value.mode === "text") {
    return typeof value.text === "string";
  }

  if (value.mode === "numeric") {
    const minValid = value.min === null || typeof value.min === "number";
    const maxValid = value.max === null || typeof value.max === "number";
    return minValid && maxValid;
  }

  if (value.mode === "select") {
    return Array.isArray(value.options);
  }

  if (value.mode === "boolean") {
    return (
      typeof value.positive_label === "string" &&
      typeof value.negative_label === "string"
    );
  }

  if (value.mode === "panel") {
    return Array.isArray(value.parameters);
  }

  return false;
}

export function formatReferenceRange(referenceRange: ReferenceRange) {
  if (!isStoredReferenceRange(referenceRange)) {
    return "Not set";
  }

  if (referenceRange.mode === "text") {
    return referenceRange.text ? referenceRange.text : "Not set";
  }

  if (referenceRange.mode === "select") {
    return referenceRange.options.length > 0
      ? `Options: ${referenceRange.options.join(", ")}`
      : "No options set";
  }

  if (referenceRange.mode === "boolean") {
    return `${referenceRange.positive_label} / ${referenceRange.negative_label}`;
  }

  if (referenceRange.mode === "panel") {
    return `${referenceRange.parameters.length} parameter${
      referenceRange.parameters.length === 1 ? "" : "s"
    }`;
  }

  const min = referenceRange.min;
  const max = referenceRange.max;

  if (min !== null && max !== null) {
    return `${min} - ${max}`;
  }

  if (min !== null) {
    return `>= ${min}`;
  }

  if (max !== null) {
    return `<= ${max}`;
  }

  return "Not set";
}
