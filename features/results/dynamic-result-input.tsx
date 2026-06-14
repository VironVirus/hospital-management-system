"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getBooleanLabels,
  getDropdownOptions,
  getReferenceRange,
  getResultInputMode,
  parsePanelResult,
  type ResultFormValues,
  type TestDefinition
} from "@/features/results/result-utils";

export function DynamicResultInput({
  disabled,
  formValues,
  onChange,
  test
}: {
  disabled?: boolean;
  formValues: ResultFormValues;
  onChange: (nextValue: ResultFormValues) => void;
  test: TestDefinition;
}) {
  const inputMode = getResultInputMode(test);

  if (inputMode === "numeric") {
    return (
      <div className="space-y-2">
        <Label htmlFor="result-value">Numeric result</Label>
        <Input
          id="result-value"
          type="number"
          step="0.01"
          disabled={disabled}
          value={formValues.rawValue}
          onChange={(event) =>
            onChange({ ...formValues, rawValue: event.target.value })
          }
          placeholder={`Enter result${test.unit ? ` (${test.unit})` : ""}`}
        />
      </div>
    );
  }

  if (inputMode === "boolean") {
    const labels = getBooleanLabels(test);

    return (
      <div className="space-y-2">
        <Label>Positive / negative</Label>
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...formValues, rawValue: "true" })}
            className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
              formValues.rawValue === "true"
                ? "border-blue-300 bg-blue-50 text-blue-800"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {labels.positive}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...formValues, rawValue: "false" })}
            className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
              formValues.rawValue === "false"
                ? "border-blue-300 bg-blue-50 text-blue-800"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {labels.negative}
          </button>
        </div>
      </div>
    );
  }

  if (inputMode === "select") {
    const options = getDropdownOptions(test);

    return (
      <div className="space-y-2">
        <Label htmlFor="result-select">Dropdown result</Label>
        <select
          id="result-select"
          disabled={disabled}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
          value={formValues.rawValue}
          onChange={(event) =>
            onChange({ ...formValues, rawValue: event.target.value })
          }
        >
          <option value="">Select result</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (inputMode === "panel") {
    const range = getReferenceRange(test.reference_range);
    const values = parsePanelResult(formValues.rawValue);
    const setParameterValue = (parameterId: string, value: string) => {
      onChange({
        ...formValues,
        rawValue: JSON.stringify({
          ...values,
          [parameterId]: value
        })
      });
    };

    if (range?.mode !== "panel") {
      return null;
    }

    return (
      <div className="space-y-4">
        {range.parameters.map((parameter) => {
          const currentValue = values[parameter.id] ?? "";

          return (
            <div
              key={parameter.id}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Label>{parameter.name}</Label>
                {parameter.unit ? (
                  <span className="text-xs font-medium text-slate-500">{parameter.unit}</span>
                ) : null}
              </div>

              {parameter.result_type === "numeric" ? (
                <Input
                  type="number"
                  step="0.01"
                  disabled={disabled}
                  value={currentValue}
                  onChange={(event) => setParameterValue(parameter.id, event.target.value)}
                  placeholder="Enter numeric value"
                />
              ) : parameter.result_type === "boolean" &&
                parameter.reference_range.mode === "boolean" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      setParameterValue(
                        parameter.id,
                        parameter.reference_range.positive_label ?? "Positive"
                      )
                    }
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                      currentValue === parameter.reference_range.positive_label
                        ? "border-blue-300 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {parameter.reference_range.positive_label}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      setParameterValue(
                        parameter.id,
                        parameter.reference_range.negative_label ?? "Negative"
                      )
                    }
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                      currentValue === parameter.reference_range.negative_label
                        ? "border-blue-300 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {parameter.reference_range.negative_label}
                  </button>
                </div>
              ) : parameter.result_type === "select" &&
                parameter.reference_range.mode === "select" ? (
                <select
                  disabled={disabled}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={currentValue}
                  onChange={(event) => setParameterValue(parameter.id, event.target.value)}
                >
                  <option value="">Select result</option>
                  {parameter.reference_range.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <Textarea
                  disabled={disabled}
                  value={currentValue}
                  onChange={(event) => setParameterValue(parameter.id, event.target.value)}
                  placeholder="Enter result"
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="result-text">Text result</Label>
      <Textarea
        id="result-text"
        disabled={disabled}
        value={formValues.rawValue}
        onChange={(event) =>
          onChange({ ...formValues, rawValue: event.target.value })
        }
        placeholder="Enter narrative or descriptive result"
      />
    </div>
  );
}
