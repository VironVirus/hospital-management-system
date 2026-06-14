import type { Tables, TablesInsert } from "@/types/supabase";
import {
  isStoredReferenceRange,
  type StoredReferenceRange
} from "@/features/tests/reference-range";

export type TestDefinition = Pick<
  Tables<"tests">,
  "id" | "name" | "reference_range" | "result_type" | "unit"
>;

export type ResultFormValues = {
  rawValue: string;
  interpretation: string;
};

export type ResultEvaluation = {
  abnormalFlag: boolean;
  abnormalReason: string | null;
  displayValue: string;
  payload: Pick<
    TablesInsert<"order_test_results">,
    | "abnormal_flag"
    | "abnormal_reason"
    | "interpretation"
    | "value_boolean"
    | "value_numeric"
    | "value_text"
  >;
};

export type ResultFlagCode = "H" | "L" | null;

export function getReferenceRange(
  referenceRange: Tables<"tests">["reference_range"]
): StoredReferenceRange | null {
  return isStoredReferenceRange(referenceRange) ? referenceRange : null;
}

export function getBooleanLabels(test: TestDefinition) {
  const referenceRange = getReferenceRange(test.reference_range);
  if (referenceRange?.mode === "boolean") {
    return {
      positive: referenceRange.positive_label,
      negative: referenceRange.negative_label
    };
  }

  return {
    positive: "Positive",
    negative: "Negative"
  };
}

export function getDropdownOptions(test: TestDefinition) {
  const referenceRange = getReferenceRange(test.reference_range);
  if (referenceRange?.mode === "select") {
    return referenceRange.options;
  }

  return [];
}

export function getResultInputMode(test: TestDefinition) {
  const referenceRange = getReferenceRange(test.reference_range);

  if (referenceRange?.mode === "panel") {
    return "panel" as const;
  }

  if (test.result_type === "numeric") {
    return "numeric" as const;
  }

  if (test.result_type === "boolean") {
    return "boolean" as const;
  }

  if (referenceRange?.mode === "select") {
    return "select" as const;
  }

  return "text" as const;
}

export function formatExistingResult(result: Tables<"order_test_results"> | null) {
  if (!result) {
    return "";
  }

  if (result.value_numeric !== null) {
    return String(result.value_numeric);
  }

  if (result.value_boolean !== null) {
    return result.value_boolean ? "true" : "false";
  }

  return result.value_text ?? "";
}

export function parsePanelResult(rawValue: string) {
  if (!rawValue.trim()) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function formatPanelResultValue(
  rawValue: string,
  test: TestDefinition
) {
  const referenceRange = getReferenceRange(test.reference_range);
  if (referenceRange?.mode !== "panel") {
    return rawValue;
  }

  const values = parsePanelResult(rawValue);
  return referenceRange.parameters
    .map((parameter) => {
      const value = values[parameter.id] ?? "";
      return `${parameter.name}: ${value || "Pending"}`;
    })
    .join("\n");
}

export function getResultFlagCode(
  result: Tables<"order_test_results"> | null,
  test: TestDefinition | null
): ResultFlagCode {
  if (!result) {
    return null;
  }

  const referenceRange = test ? getReferenceRange(test.reference_range) : null;
  if (referenceRange?.mode === "numeric" && typeof result.value_numeric === "number") {
    if (referenceRange.max !== null && result.value_numeric > referenceRange.max) {
      return "H";
    }

    if (referenceRange.min !== null && result.value_numeric < referenceRange.min) {
      return "L";
    }
  }

  const reason = result.abnormal_reason?.toLowerCase() ?? "";
  if (reason.includes("above") || reason.includes("high")) {
    return "H";
  }

  if (reason.includes("below") || reason.includes("low")) {
    return "L";
  }

  return null;
}

export function getResultFlagLabel(
  result: Tables<"order_test_results"> | null,
  test: TestDefinition | null
) {
  const flagCode = getResultFlagCode(result, test);
  return flagCode ?? "";
}

export function evaluateResult(
  test: TestDefinition,
  formValues: ResultFormValues
): ResultEvaluation {
  const trimmedValue = formValues.rawValue.trim();
  const interpretation = formValues.interpretation.trim() || null;
  const referenceRange = getReferenceRange(test.reference_range);
  const inputMode = getResultInputMode(test);

  if (inputMode === "panel") {
    const range = referenceRange?.mode === "panel" ? referenceRange : null;
    const values = parsePanelResult(trimmedValue);
    const abnormalReasons: string[] = [];

    range?.parameters.forEach((parameter) => {
      if (parameter.reference_range.mode !== "numeric") {
        return;
      }

      const numericValue = Number(values[parameter.id]);
      if (!Number.isFinite(numericValue)) {
        return;
      }

      const low = parameter.reference_range.min;
      const high = parameter.reference_range.max;
      if (low !== null && numericValue < low) {
        abnormalReasons.push(`${parameter.name} below minimum (${low})`);
      }

      if (high !== null && numericValue > high) {
        abnormalReasons.push(`${parameter.name} above maximum (${high})`);
      }
    });

    return {
      abnormalFlag: abnormalReasons.length > 0,
      abnormalReason: abnormalReasons.length > 0 ? abnormalReasons.join("; ") : null,
      displayValue: range ? formatPanelResultValue(trimmedValue, test) : trimmedValue,
      payload: {
        abnormal_flag: abnormalReasons.length > 0,
        abnormal_reason: abnormalReasons.length > 0 ? abnormalReasons.join("; ") : null,
        interpretation,
        value_boolean: null,
        value_numeric: null,
        value_text: trimmedValue
      }
    };
  }

  if (inputMode === "numeric") {
    const numericValue = Number(trimmedValue);
    const range =
      referenceRange?.mode === "numeric" ? referenceRange : null;
    const low = range?.min ?? null;
    const high = range?.max ?? null;
    const below = low !== null && numericValue < low;
    const above = high !== null && numericValue > high;
    const abnormalFlag = below || above;
    const abnormalReason = below
      ? `Below minimum reference value (${low})`
      : above
        ? `Above maximum reference value (${high})`
        : null;

    return {
      abnormalFlag,
      abnormalReason,
      displayValue: trimmedValue,
      payload: {
        abnormal_flag: abnormalFlag,
        abnormal_reason: abnormalReason,
        interpretation,
        value_boolean: null,
        value_numeric: numericValue,
        value_text: trimmedValue
      }
    };
  }

  if (inputMode === "boolean") {
    const valueBoolean = trimmedValue === "true";
    const labels = getBooleanLabels(test);
    const abnormalFlag = valueBoolean;
    const abnormalReason = valueBoolean
      ? `${labels.positive} result needs review`
      : null;

    return {
      abnormalFlag,
      abnormalReason,
      displayValue: valueBoolean ? labels.positive : labels.negative,
      payload: {
        abnormal_flag: abnormalFlag,
        abnormal_reason: abnormalReason,
        interpretation,
        value_boolean: valueBoolean,
        value_numeric: null,
        value_text: valueBoolean ? labels.positive : labels.negative
      }
    };
  }

  return {
    abnormalFlag: false,
    abnormalReason: null,
    displayValue: trimmedValue,
    payload: {
      abnormal_flag: false,
      abnormal_reason: null,
      interpretation,
      value_boolean: null,
      value_numeric: null,
      value_text: trimmedValue
    }
  };
}
