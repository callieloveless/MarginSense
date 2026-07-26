"use client";

import { useActionState, useState } from "react";
import { MoneyField, NumberField, PercentField, TextField } from "@/app/_components/fields";
import { saveSettingsAction, type SettingsActionResult } from "./actions";

/**
 * Full settings form (constitution §3.2) — every input the wizard captures, flat (not
 * stepped), plus the advanced defaults (markup, tax) that live only here. Prefilled from
 * the stored inputs; saving recomputes the derived rates shown above it. Phone-first.
 */
export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const set = (name: string, val: string) => setValues((v) => ({ ...v, [name]: val }));

  const [state, formAction, pending] = useActionState<SettingsActionResult | null, FormData>(
    async (_prev, formData) => saveSettingsAction(formData),
    null,
  );

  const v = (name: string) => values[name] ?? "";

  return (
    <form action={formAction} className="space-y-4">
      <MoneyField name="annualOverhead" label="Annual overhead" value={v("annualOverhead")} onChange={(x) => set("annualOverhead", x)} />
      <MoneyField name="ownerWage" label="Hourly wage on the tools" value={v("ownerWage")} onChange={(x) => set("ownerWage", x)} />
      <PercentField name="laborBurden" label="Labor burden" value={v("laborBurden")} onChange={(x) => set("laborBurden", x)} />
      <NumberField name="workingDaysPerYear" label="Working days per year" value={v("workingDaysPerYear")} onChange={(x) => set("workingDaysPerYear", x)} />
      <NumberField name="billableHoursPerDay" label="Billable hours per day" value={v("billableHoursPerDay")} onChange={(x) => set("billableHoursPerDay", x)} />
      <MoneyField name="incomeGoal" label="Income goal" value={v("incomeGoal")} onChange={(x) => set("incomeGoal", x)} />
      <MoneyField name="profitTarget" label="Profit target" value={v("profitTarget")} onChange={(x) => set("profitTarget", x)} />
      <PercentField name="targetMargin" label="Target margin" value={v("targetMargin")} onChange={(x) => set("targetMargin", x)} />
      <PercentField name="defaultContingency" label="Default contingency" value={v("defaultContingency")} onChange={(x) => set("defaultContingency", x)} />

      <TextField
        name="serviceArea"
        label="Service area"
        hint="Where you work (e.g. “Austin, TX”). Material Finder uses it to find local prices. Optional."
        value={v("serviceArea")}
        onChange={(x) => set("serviceArea", x)}
        placeholder="City, state"
      />

      <details className="rounded-xl border border-line px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-ink">Advanced defaults</summary>
        <div className="mt-3 space-y-4">
          <PercentField
            name="defaultMarkup"
            label="Default markup"
            hint="Optional. Used when pricing by markup instead of margin."
            value={v("defaultMarkup")}
            onChange={(x) => set("defaultMarkup", x)}
          />
          <PercentField
            name="defaultTaxRate"
            label="Default tax rate"
            hint="Optional. Sales/use tax applied on client documents."
            value={v("defaultTaxRate")}
            onChange={(x) => set("defaultTaxRate", x)}
          />
        </div>
      </details>

      {state && !state.ok ? <p className="text-sm text-danger-fg">{state.error}</p> : null}
      {state && state.ok ? <p className="text-sm text-ok-fg">{state.message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand px-3 py-3 text-base font-semibold text-brand-ink disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
