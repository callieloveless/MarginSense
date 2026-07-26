"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboardingAction, type OnboardingResult } from "./actions";
import {
  Label,
  MoneyField,
  MoneyInput,
  NumberField,
  PercentField,
  TextField,
} from "@/app/_components/fields";
import { SteppedProgress } from "@/app/_components/ui";

/**
 * The guided, phone-first onboarding (constitution §1, §3.2). A welcome (with a "Skip for now")
 * then a stepped `<form>` — steps show/hide, fields stay mounted so every value submits together.
 * Step 1 folds in identity (business name/trade shown, service area captured for code lookups);
 * the three profit steps follow. Human dollars/percents convert to integer cents/bp on the server
 * (§3.1) — this client only collects and previews. Persisting continues to the Review screen.
 */

type Values = Record<string, string>;
type OverheadItem = { name: string; amount: string };

const STEP_TITLES = ["Your business", "Your overhead", "The cost of an hour", "Your goals"];
const STEP_BLURBS = [
  "Where you work sets which building code we look up for your jobs.",
  "Everything it costs to keep the business running for a year — outside the jobs themselves.",
  "The four numbers behind every profit signal in the app.",
  "What the year should earn you, on top of covering your costs.",
];
const STEP_COUNT = STEP_TITLES.length;

export function OnboardingWizard({
  initial,
  initialItems,
  businessName,
  tradeType,
}: {
  initial?: Values | undefined;
  initialItems?: OverheadItem[] | undefined;
  businessName?: string | undefined;
  tradeType?: string | undefined;
}) {
  const router = useRouter();
  const [started, setStarted] = useState(false);
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

  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));

  // When itemizing, the annual overhead total is the sum of the items (the engine reads only the
  // total — constitution §6.8).
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

  const isLast = step === STEP_COUNT - 1;

  if (!started) {
    return (
      <div className="space-y-6 pt-6 text-center">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-ink">
          Let&apos;s find out what your jobs really pay.
        </h1>
        <p className="text-base leading-relaxed text-ink-soft">
          A few quick numbers. After that, every estimate tells you whether it&apos;s worth the
          crew hours it takes.
        </p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="w-full rounded-xl bg-brand px-4 py-3.5 text-base font-semibold text-brand-ink"
          >
            Get started
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="w-full rounded-xl px-4 py-3 text-base font-medium text-muted"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted">
          Step {step + 1} of {STEP_COUNT}
        </p>
        <div className="mt-1.5">
          <SteppedProgress step={step + 1} total={STEP_COUNT} />
        </div>
        <h2 className="mt-3 text-xl font-bold tracking-tight text-ink">{STEP_TITLES[step]}</h2>
        <p className="mt-1 text-sm text-ink-soft">{STEP_BLURBS[step]}</p>
      </div>

      {/* Step 1 — identity: business name/trade (set at sign-up) + service area. */}
      <fieldset hidden={step !== 0} className="space-y-4">
        {businessName || tradeType ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Your business
            </div>
            {businessName ? (
              <div className="mt-1 font-semibold text-ink">{businessName}</div>
            ) : null}
            {tradeType ? <div className="text-sm text-muted">{tradeType}</div> : null}
            <p className="mt-1.5 text-xs text-muted">
              Set when you created your account — change it later in Settings.
            </p>
          </div>
        ) : null}
        <TextField
          name="serviceArea"
          label="Service area"
          hint="Where you work (e.g. “Austin, TX”). Sets the building code we look up and biases material prices. Optional."
          value={values.serviceArea ?? ""}
          onChange={(val) => set("serviceArea", val)}
          placeholder="City, state"
        />
      </fieldset>

      {/* Step 2 — overhead + optional itemization. */}
      <fieldset hidden={step !== 1} className="space-y-3">
        {itemize ? (
          <div className="space-y-2">
            <p className="text-sm text-ink-soft">
              List your yearly overhead items — insurance, vehicle, phone, software, rent. The total
              below is what the math uses.
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
                  className="rounded-md border border-line px-3 text-muted"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setItems((arr) => [...arr, { name: "", amount: "" }])}
              className="text-sm font-semibold text-brand underline"
            >
              + Add item
            </button>
            <div className="flex items-center justify-between rounded-xl bg-brand-soft px-3 py-2">
              <span className="text-sm text-ink-soft">Annual overhead</span>
              <span className="text-base font-semibold tabular-nums text-ink">
                ${itemsSum.toLocaleString()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setItemize(false)}
              className="text-sm text-muted underline"
            >
              Enter a single total instead
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="annualOverhead">Annual overhead</Label>
            <p className="text-sm text-muted">
              Everything it costs to keep the business running for a year, outside the cost of doing
              the jobs themselves.
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
              className="text-sm text-muted underline"
            >
              Itemize it instead
            </button>
          </div>
        )}
        <input type="hidden" name="annualOverhead" value={overheadValue} />
        <input type="hidden" name="overheadItems" value={itemsJson} />
      </fieldset>

      {/* Step 3 — wage, burden, capacity. */}
      <fieldset hidden={step !== 2} className="space-y-4">
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

      {/* Step 4 — goals. */}
      <fieldset hidden={step !== 3} className="space-y-4">
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

      {state && !state.ok ? <p className="text-sm text-danger-fg">{state.error}</p> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => (step > 0 ? setStep((s) => s - 1) : setStarted(false))}
          className="flex-1 rounded-xl border border-line px-3 py-3 text-base font-semibold text-ink"
        >
          Back
        </button>
        {isLast ? (
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-xl bg-brand px-3 py-3 text-base font-semibold text-brand-ink disabled:opacity-50"
          >
            {pending ? "Saving…" : "See my numbers"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="flex-1 rounded-xl bg-brand px-3 py-3 text-base font-semibold text-brand-ink"
          >
            Next
          </button>
        )}
      </div>
    </form>
  );
}
