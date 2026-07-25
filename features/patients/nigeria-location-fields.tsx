"use client";

import { Label } from "@/components/ui/label";
import { getNigeriaLgas, nigeriaStates } from "@/lib/nigeria-locations";

type NigeriaLocationFieldsProps = {
  disabled?: boolean;
  idPrefix: string;
  lga: string;
  lgaError?: string;
  onChange: (location: { state: string; lga: string }) => void;
  state: string;
  stateError?: string;
};

const selectClassName =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-base sm:h-10 sm:text-sm";

export function NigeriaLocationFields({
  disabled = false,
  idPrefix,
  lga,
  lgaError,
  onChange,
  state,
  stateError
}: NigeriaLocationFieldsProps) {
  const lgas = getNigeriaLgas(state);
  const hasLegacyState = Boolean(state && !nigeriaStates.some((item) => item === state));
  const hasLegacyLga = Boolean(lga && !lgas.some((item) => item === lga));

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-state`}>State</Label>
        <select
          id={`${idPrefix}-state`}
          className={selectClassName}
          disabled={disabled}
          value={state}
          onChange={(event) => onChange({ state: event.target.value, lga: "" })}
        >
          <option value="">Select state</option>
          {hasLegacyState ? <option value={state}>{state}</option> : null}
          {nigeriaStates.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        {stateError ? <p className="text-xs text-red-700">{stateError}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-lga`}>Local government area</Label>
        <select
          id={`${idPrefix}-lga`}
          className={selectClassName}
          disabled={disabled || !state}
          value={lga}
          onChange={(event) => onChange({ state, lga: event.target.value })}
        >
          <option value="">{state ? "Select local government" : "Select a state first"}</option>
          {hasLegacyLga ? <option value={lga}>{lga}</option> : null}
          {lgas.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        {lgaError ? <p className="text-xs text-red-700">{lgaError}</p> : null}
      </div>
    </>
  );
}
