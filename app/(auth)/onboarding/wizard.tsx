"use client";

import { useActionState, useMemo, useState } from "react";
import { completeOnboardingAction, type OnboardingResult } from "./actions";
import { Label, MoneyField, MoneyInput, NumberField, PercentField } from "@/app/_components/fields";

/**
 * The 3-step, phone-first onboarding wizard (constitution §1, §3.2). One `<form>`; the
 * steps show/hide (fields stay mounted so every value submits together). Human dollars and
 * percentages are converted to integer cents/bp on the server (constitution §3.1) — this
 * client only collects and previews. Persisting continues to the Review screen.
 */

type Values = Record<string, string>;

const STEP_FIELDS: string[][] = [
  ["annualOverhead"],
  ["ownerWage", "laborBurden", "workingDaysPerYear", "billableHoursPerDay"],
  ["incomeGoal", "profitTarget", "targetMargin", "defaultContingency"],
];

const STEP_TITLES = ["Your overhead", "The cost of an hour", "Your goals"];

type OverheadItem = { name: string; amount: string };

export function OnboardingWizard({
  initial,
  initialItems,
}: {
  initial?: Values | undefined;
  initialItems?: OverheadItem[] | undefined;
}) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>(initial ?? {});
  const [itemize, setItemize] = useState((initialItems?.length ?? 0) > 0);
  const [items, setItems] = useState<OverheadItem[]>(
    initialItems && initialItems.length > 0 ? initialItems : [{ name: "", amount: "" }],
  );

  const [state, formAction, pending] = useActionState<OnboardingResult | null, FormData>(
    async (_prev, formData) => completeOnboardingAction(formData),
    null,
  );

  const set = (name: string, value: string) =>
    setValues((v) => ({ ...v, [name]: value }));

  // When itemizing, the annual overhead total is the sum of the items (kept reconciled;
  // the engine only ever reads the total — constitution §6.8).
  const itemsSum = useMemo(
    () =>
      items.reduce((sum, it) => {
        const n = Number(it.amount.replace(/[$,\s]/g, ""));
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [items],
  );
  const overheadValue = itemize ? String(itemsSum) : values.annualOverhead ?? "";
  const itemsJson = itemize
    ? JSON.stringify(
        items
          .filter((it) => it.name.trim() !== "" || it.amount.trim() !== "")
          .map((it) => ({ name: it.name, amount: it.amount })),
      )
    : "";

  const isLast = step === STEP_FIELDS.length - 1;

  return (
    <form action={formAction} className="space-y-5">
      {/* Progress — text, not color alone (constitution §6). */}
      <div>
        <p className="text-xs font-medium text-neutral-500">
          Step {step + 1} of {STEP_FIELDS.length}
        </p>
        <div className="mt-1 flex gap-1" aria-hidden>
          {STEP_FIELDS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-neutral-900 dark:bg-white" : "bg-neutral-200 dark:bg-neutral-800"}`}
            />
          ))}
        </div>
        <h2 className="mt-3 text-lg font-semibold">{STEP_TITLES[step]}</h2>
      </div>

      {/* Step 1 — overhead + optional itemization. */}
      <fieldset hidden={step !== 0} className="space-y-3">
        {itemize ? (
          <div className="space-y-2">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              List your yearly overhead items — insurance, vehicle, phone, software, rent. The
              total below is what the math uses.
            </p>
            {items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={it.name}
                  onChange={(e) =>
                    setItems((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                  placeholder="Item (e.g. insurance)"
                  className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
                />
                <MoneyInput
                  value={it.amount}
                  onChange={(val) =>
                    setItems((arr) => arr.map((x, j) => (j === i ? { ...x, amount: val } : x)))
                  }
                  placeholder="0"
                  className="w-28"
                />
                <button
                  type="button"
                  onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))}
                  aria-label="Remove item"
                  className="rounded-md border border-neutral-300 px-3 text-neutral-500 dark:border-neutral-700"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setItems((arr) => [...arr, { name: "", amount: "" }])}
              className="text-sm font-medium text-neutral-700 underline dark:text-neutral-300"
            >
              + Add item
            </button>
            <div className="flex items-center justify-between rounded-md bg-neutral-100 px-3 py-2 dark:bg-neutral-900">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Annual overhead</span>
              <span className="text-base font-semibold tabular-nums">${itemsSum.toLocaleString()}</span>
            </div>
            <button
              type="button"
              onClick={() => setItemize(false)}
              className="text-sm text-neutral-500 underline"
            >
              Enter a single total instead
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="annualOverhead">Annual overhead</Label>
            <p className="text-sm text-neutral-500">
              Everything it costs to keep the business running for a year, outside the cost of
              doing the jobs themselves.
            </p>
            <MoneyInput
              id="annualOverhead"
              value={values.annualOverhead ?? ""}
              onChange={(val) => set("annualOverhead", val)}
              placeholder="60,000"
            />
            <button
              type="button"
              onClick={() => setItemize(true)}
              className="text-sm text-neutral-500 underline"
            >
              Itemize it instead
            </button>
          </div>
        )}
        {/* Submitted overhead + items (hidden; kept reconciled with the UI above). */}
        <input type="hidden" name="annualOverhead" value={overheadValue} />
        <input type="hidden" name="overheadItems" value={itemsJson} />
      </fieldset>

      {/* Step 2 — wage, burden, capacity. */}
      <fieldset hidden={step !== 1} className="space-y-4">
        <MoneyField
          name="ownerWage"
          label="Your hourly wage on the tools"
          hint="What you pay yourself per hour of hands-on work."
          value={values.ownerWage ?? ""}
          onChange={(val) => set("ownerWage", val)}
          placeholder="35"
        />
        <PercentField
          name="laborBurden"
          label="Labor burden"
          hint="Payroll taxes, workers' comp, and benefits as a % of wage. ~25% is common."
          value={values.laborBurden ?? ""}
          onChange={(val) => set("laborBurden", val)}
          placeholder="25"
        />
        <NumberField
          name="workingDaysPerYear"
          label="Working days per year"
          hint="Days you actually bill work — after weekends, holidays, and time off."
          value={values.workingDaysPerYear ?? ""}
          onChange={(val) => set("workingDaysPerYear", val)}
          placeholder="200"
        />
        <NumberField
          name="billableHoursPerDay"
          label="Billable hours per day"
          hint="Hours on the tools per day — not driving, quoting, or admin."
          value={values.billableHoursPerDay ?? ""}
          onChange={(val) => set("billableHoursPerDay", val)}
          placeholder="6"
        />
      </fieldset>

      {/* Step 3 — goals. */}
      <fieldset hidden={step !== 2} className="space-y-4">
        <MoneyField
          name="incomeGoal"
          label="Income goal"
          hint="What you want to pay yourself for the year, on top of your hourly wage."
          value={values.incomeGoal ?? ""}
          onChange={(val) => set("incomeGoal", val)}
          placeholder="90,000"
        />
        <MoneyField
          name="profitTarget"
          label="Profit target"
          hint="Profit the business should keep for the year, beyond your pay."
          value={values.profitTarget ?? ""}
          onChange={(val) => set("profitTarget", val)}
          placeholder="15,000"
        />
        <PercentField
          name="targetMargin"
          label="Target margin"
          hint="Default profit margin on a job's price. Must be under 100%."
          value={values.targetMargin ?? ""}
          onChange={(val) => set("targetMargin", val)}
          placeholder="45"
        />
        <PercentField
          name="defaultContingency"
          label="Default contingency"
          hint="A cushion added to job cost for the unexpected. ~10% is common."
          value={values.defaultContingency ?? ""}
          onChange={(val) => set("defaultContingency", val)}
          placeholder="10"
        />
      </fieldset>

      {state && !state.ok ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <div className="flex gap-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-base font-medium dark:border-neutral-700"
          >
            Back
          </button>
        ) : null}
        {isLast ? (
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {pending ? "Saving…" : "See my numbers"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="flex-1 rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            Next
          </button>
        )}
      </div>
    </form>
  );
}
