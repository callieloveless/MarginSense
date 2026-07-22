"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveEstimateAction, type EstimateActionResult } from "../actions";

/**
 * Phone-first estimate editor (constitution §1). Collects granular line items and the pricing
 * inputs (target margin, contingency, optional total-price override), submitting all to the
 * server action. Costs are entered; the price/signal are recomputed server-side by the engine
 * — on save we refresh so the roll-up panel above updates. This client only gathers input.
 */

const CATEGORIES = [
  "labor",
  "material",
  "subcontractor",
  "equipment",
  "permit",
  "disposal",
  "other",
] as const;

type EditorLine = {
  category: string;
  description: string;
  laborHours: string;
  quantity: string;
  unitCost: string;
};

const EMPTY_LINE: EditorLine = { category: "labor", description: "", laborHours: "", quantity: "", unitCost: "" };

export function EstimateEditor({
  estimateId,
  projectId,
  initialTargetMargin,
  initialContingency,
  initialOverride,
  initialLines,
}: {
  estimateId: string;
  projectId: string;
  initialTargetMargin: string;
  initialContingency: string;
  initialOverride: string;
  initialLines: EditorLine[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorLine[]>(
    initialLines.length > 0 ? initialLines : [{ ...EMPTY_LINE }],
  );

  const [state, formAction, pending] = useActionState<EstimateActionResult | null, FormData>(
    async (_prev, formData) => {
      const result = await saveEstimateAction(estimateId, projectId, formData);
      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

  const setLine = (i: number, patch: Partial<EditorLine>) =>
    setLines((arr) => arr.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const linesJson = useMemo(
    () =>
      JSON.stringify(
        lines
          .filter((l) => l.description.trim() !== "" || l.laborHours || l.quantity || l.unitCost)
          .map((l) =>
            l.category === "labor"
              ? { category: "labor", description: l.description, laborHours: l.laborHours }
              : {
                  category: l.category,
                  description: l.description,
                  quantity: l.quantity,
                  unitCost: l.unitCost,
                },
          ),
      ),
    [lines],
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Line items</h3>
        {lines.map((l, i) => (
          <div key={i} className="rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
            <div className="flex gap-2">
              <select
                value={l.category}
                onChange={(e) => setLine(i, { category: e.target.value })}
                className="rounded-md border border-neutral-300 px-2 py-2 text-sm capitalize dark:border-neutral-700 dark:bg-neutral-900"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
              <input
                value={l.description}
                onChange={(e) => setLine(i, { description: e.target.value })}
                placeholder="Description"
                className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
              />
              <button
                type="button"
                onClick={() => setLines((arr) => arr.filter((_, j) => j !== i))}
                aria-label="Remove line"
                className="rounded-md border border-neutral-300 px-3 text-neutral-500 dark:border-neutral-700"
              >
                ×
              </button>
            </div>
            <div className="mt-2">
              {l.category === "labor" ? (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-500">Labor hours</span>
                  <input
                    value={l.laborHours}
                    onChange={(e) => setLine(i, { laborHours: e.target.value })}
                    inputMode="decimal"
                    placeholder="8"
                    className="w-24 rounded-md border border-neutral-300 px-3 py-1.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </label>
              ) : (
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-500">Qty</span>
                    <input
                      value={l.quantity}
                      onChange={(e) => setLine(i, { quantity: e.target.value })}
                      inputMode="decimal"
                      placeholder="4"
                      className="w-20 rounded-md border border-neutral-300 px-3 py-1.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-500">Unit $</span>
                    <input
                      value={l.unitCost}
                      onChange={(e) => setLine(i, { unitCost: e.target.value })}
                      inputMode="decimal"
                      placeholder="12.50"
                      className="w-24 rounded-md border border-neutral-300 px-3 py-1.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((arr) => [...arr, { ...EMPTY_LINE }])}
          className="text-sm font-medium text-neutral-700 underline dark:text-neutral-300"
        >
          + Add line
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block font-medium">Target margin</span>
          <div className="mt-1 flex items-center rounded-md border border-neutral-300 px-3 dark:border-neutral-700 dark:bg-neutral-900">
            <input name="targetMargin" defaultValue={initialTargetMargin} inputMode="decimal" className="w-full min-w-0 bg-transparent py-2 outline-none" />
            <span className="text-neutral-400">%</span>
          </div>
        </label>
        <label className="text-sm">
          <span className="block font-medium">Contingency</span>
          <div className="mt-1 flex items-center rounded-md border border-neutral-300 px-3 dark:border-neutral-700 dark:bg-neutral-900">
            <input name="contingency" defaultValue={initialContingency} inputMode="decimal" className="w-full min-w-0 bg-transparent py-2 outline-none" />
            <span className="text-neutral-400">%</span>
          </div>
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium">Override total price</span>
        <span className="ml-1 text-neutral-500">(optional — leave blank to margin-solve)</span>
        <div className="mt-1 flex items-center rounded-md border border-neutral-300 px-3 dark:border-neutral-700 dark:bg-neutral-900">
          <span className="text-neutral-400">$</span>
          <input name="totalPriceOverride" defaultValue={initialOverride} inputMode="decimal" placeholder="leave blank" className="w-full min-w-0 bg-transparent py-2 pl-1 outline-none" />
        </div>
      </label>

      <input type="hidden" name="lines" value={linesJson} />

      {state && !state.ok ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state && state.ok ? <p className="text-sm text-green-700 dark:text-green-500">{state.message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Saving…" : "Save estimate"}
      </button>
    </form>
  );
}
