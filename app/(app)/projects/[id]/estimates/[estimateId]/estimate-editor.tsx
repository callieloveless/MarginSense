"use client";

/**
 * Phone-first estimate editor (constitution §1, §3.4, §6). The contractor enters costs and, on any
 * line, an optional price; the engine does the math. It shows the profit signal and each line's
 * economics live — computed **server-side** by `previewEstimateAction` (never re-implemented here)
 * — but the guaranteed path is **save**, which always shows engine-true numbers and works on one bar
 * of signal (the live preview is a progressive enhancement that degrades to it). A per-line
 * red/yellow/green is shown only where it's real: an *entered-price* labor line (a baseline line's
 * profit-per-hour is uniform by construction). Unsaved work is mirrored to a local draft and guarded
 * on navigate-away. This client only gathers input.
 */

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/src/engine";
import type { EstimateDTO, EstimateLineDTO } from "@/app/_lib/estimate-dto";
import { Card } from "@/app/_components/ui";
import { SignalBadge } from "@/app/_components/signal-badge";
import { EstimatePanel } from "@/app/_components/estimate-panel";
import { saveEstimateAction, previewEstimateAction } from "../actions";

const CATEGORIES = [
  "labor",
  "material",
  "subcontractor",
  "equipment",
  "permit",
  "disposal",
  "other",
] as const;

export interface EditorInitialLine {
  category: string;
  description: string;
  laborHours: string;
  quantity: string;
  unitCost: string;
  price: string;
}

interface EditorLine extends EditorInitialLine {
  key: string;
}

const EMPTY_LINE: EditorInitialLine = {
  category: "labor",
  description: "",
  laborHours: "",
  quantity: "",
  unitCost: "",
  price: "",
};

/** A line the user has actually started (so blank scratch rows aren't sent to the engine). */
function nonEmpty(l: EditorLine): boolean {
  return Boolean(l.description.trim() || l.laborHours || l.quantity || l.unitCost || l.price);
}

/** An editor line in the raw shape `parseLineItems` expects (labor as hours; price optional). */
function toRaw(l: EditorLine) {
  return l.category === "labor"
    ? { category: "labor", description: l.description, laborHours: l.laborHours, price: l.price }
    : { category: l.category, description: l.description, quantity: l.quantity, unitCost: l.unitCost, price: l.price };
}

export function EstimateEditor({
  estimateId,
  projectId,
  initialTargetMargin,
  initialContingency,
  initialOverride,
  initialLines,
  initialLineIds,
  initialDto,
}: {
  estimateId: string;
  projectId: string;
  initialTargetMargin: string;
  initialContingency: string;
  initialOverride: string;
  initialLines: EditorInitialLine[];
  /** The server line-item ids at load — sent back on save so a concurrent change (an accepted tool
   * suggestion) is detected instead of silently overwritten (Critique #4). */
  initialLineIds: string[];
  /** Null when the estimate can't be priced yet (no settings / not-applicable) — the editor stays
   * usable for entering + saving; the panel shows a plain "finish setup" note instead of numbers. */
  initialDto: EstimateDTO | null;
}) {
  const router = useRouter();
  const draftKey = `estimate-draft:${estimateId}`;

  // Build the initial lines with stable keys ONCE, so both `lines` and `dtoKeys` share the same keys.
  const initial = useRef(
    (initialLines.length > 0 ? initialLines : [EMPTY_LINE]).map((l, i) => ({ ...l, key: `k${i}` })),
  ).current;
  const keyRef = useRef(initial.length);
  const makeKey = () => `k${keyRef.current++}`;

  const [lines, setLines] = useState<EditorLine[]>(initial);
  const [targetMargin, setTargetMargin] = useState(initialTargetMargin);
  const [contingency, setContingency] = useState(initialContingency);
  const [override, setOverride] = useState(initialOverride);

  const [dirty, setDirty] = useState(false);
  const [restored, setRestored] = useState(false);

  // The live computation and which line keys produced it (so a line renders its OWN economics even
  // after reorder/edit, and shows nothing rather than a neighbour's numbers when out of sync).
  const [dto, setDto] = useState<EstimateDTO | null>(initialDto);
  const [dtoKeys, setDtoKeys] = useState<string[]>(initial.filter(nonEmpty).map((l) => l.key));
  const [updating, setUpdating] = useState(false);
  const [previewNote, setPreviewNote] = useState<string | null>(null);

  const rawLines = useMemo(() => lines.filter(nonEmpty), [lines]);
  const linesJson = useMemo(() => JSON.stringify(rawLines.map(toRaw)), [rawLines]);

  // --- Draft: restore on mount, mirror on change, clear on save (Critique #3) ------------------
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        lines?: EditorLine[];
        targetMargin?: string;
        contingency?: string;
        override?: string;
      };
      if (!Array.isArray(d.lines)) return;
      // Re-key restored lines so our key counter can't collide with them.
      keyRef.current = 0;
      setLines(d.lines.map((l) => ({ ...l, key: `k${keyRef.current++}` })));
      setTargetMargin(d.targetMargin ?? initialTargetMargin);
      setContingency(d.contingency ?? initialContingency);
      setOverride(d.override ?? initialOverride);
      setDirty(true);
      setRestored(true);
    } catch {
      /* ignore a corrupt draft */
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ lines, targetMargin, contingency, override }));
    } catch {
      /* storage may be unavailable; the editor still works */
    }
  }, [dirty, lines, targetMargin, contingency, override, draftKey]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // --- Live preview: engine-truthful, debounced, degrades to save (Critiques #1, #2) -----------
  const didMount = useRef(false);
  const reqRef = useRef(0);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true; // initialDto already matches the first paint
      return;
    }
    const keysAtRequest = rawLines.map((l) => l.key);
    const handle = setTimeout(async () => {
      const id = ++reqRef.current;
      setUpdating(true);
      const fd = new FormData();
      fd.set("targetMargin", targetMargin);
      fd.set("contingency", contingency);
      fd.set("totalPriceOverride", override);
      fd.set("lines", linesJson);
      let result: Awaited<ReturnType<typeof previewEstimateAction>>;
      try {
        result = await previewEstimateAction(estimateId, fd);
      } catch {
        result = { ok: false, error: "offline" };
      }
      if (id !== reqRef.current) return; // a newer edit superseded this one
      setUpdating(false);
      if (result.ok) {
        setDto(result.dto);
        setDtoKeys(keysAtRequest);
        setPreviewNote(null);
      } else {
        // Keep the last good numbers; tell the truth about it.
        setPreviewNote("Numbers update when you save.");
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [linesJson, targetMargin, contingency, override, estimateId, rawLines]);

  // --- Save: the guaranteed engine-true path ---------------------------------------------------
  const [saveState, formAction, pending] = useActionState<
    Awaited<ReturnType<typeof saveEstimateAction>> | null,
    FormData
  >(async (_prev, formData) => {
    const result = await saveEstimateAction(estimateId, projectId, formData);
    if (result.ok) {
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      setDirty(false);
      setRestored(false);
      router.refresh();
    }
    return result;
  }, null);

  // --- Line editing ----------------------------------------------------------------------------
  const patch = (i: number, p: Partial<EditorLine>) => {
    setLines((arr) => arr.map((l, j) => (j === i ? { ...l, ...p } : l)));
    setDirty(true);
  };
  const addLine = () => {
    setLines((arr) => [...arr, { ...EMPTY_LINE, key: makeKey() }]);
    setDirty(true);
  };
  const duplicateLine = (i: number) => {
    setLines((arr) => {
      const copy = { ...arr[i]!, key: makeKey() };
      return [...arr.slice(0, i + 1), copy, ...arr.slice(i + 1)];
    });
    setDirty(true);
  };
  const removeLine = (i: number) => {
    setLines((arr) => (arr.length > 1 ? arr.filter((_, j) => j !== i) : arr));
    setDirty(true);
  };
  const move = (i: number, dir: -1 | 1) => {
    setLines((arr) => {
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const next = arr.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
    setDirty(true);
  };

  const discard = () => {
    keyRef.current = initial.length;
    setLines(initial);
    setTargetMargin(initialTargetMargin);
    setContingency(initialContingency);
    setOverride(initialOverride);
    setDirty(false);
    setRestored(false);
    setDto(initialDto);
    setDtoKeys(initial.filter(nonEmpty).map((l) => l.key));
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  };

  const econFor = (key: string): EstimateLineDTO | null => {
    if (!dto) return null;
    const idx = dtoKeys.indexOf(key);
    return idx >= 0 ? (dto.lines[idx] ?? null) : null;
  };

  const subtotals = useMemo(() => {
    if (!dto) return [] as [string, { cost: number; price: number }][];
    const m = new Map<string, { cost: number; price: number }>();
    for (const l of dto.lines) {
      const e = m.get(l.category) ?? { cost: 0, price: 0 };
      e.cost += l.costCents;
      e.price += l.priceCents;
      m.set(l.category, e);
    }
    return [...m.entries()];
  }, [dto]);

  return (
    <div className="space-y-4">
      {/* Profit panel — kept near the top so the signal stays in view while editing. */}
      {dto ? (
        <EstimatePanel dto={dto} updating={updating} note={previewNote} />
      ) : (
        <div className="rounded-xl border border-notice-line bg-notice-bg px-3 py-2 text-sm text-notice-fg">
          Add working days and billable hours in Settings to price this estimate. You can still enter
          line items and save — the numbers appear once setup is complete.
        </div>
      )}

      {restored ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-notice-line bg-notice-bg px-3 py-2 text-sm text-notice-fg">
          <span>Restored your unsaved changes.</span>
          <button type="button" onClick={discard} className="font-medium underline">
            Discard to last saved
          </button>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">Line items</h3>
          {lines.map((line, i) => {
            const isLabor = line.category === "labor";
            const econ = econFor(line.key);
            const baselineHint =
              !line.price && econ ? `auto ${formatCents(econ.priceCents)}` : "optional";
            return (
              <Card key={line.key} className="space-y-2">
                <div className="flex items-start gap-2">
                  <label className="sr-only" htmlFor={`cat-${line.key}`}>
                    Category
                  </label>
                  <select
                    id={`cat-${line.key}`}
                    value={line.category}
                    onChange={(e) => patch(i, { category: e.target.value })}
                    className="rounded-full border border-line bg-brand-soft px-3 py-1.5 text-sm font-medium capitalize text-ink"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c} className="capitalize">
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Line ${i + 1} description`}
                    value={line.description}
                    onChange={(e) => patch(i, { description: e.target.value })}
                    placeholder="Description"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink"
                  />
                  <button
                    type="button"
                    onClick={() => duplicateLine(i)}
                    aria-label={`Duplicate line ${i + 1}`}
                    className="rounded-lg border border-line px-2.5 py-2 text-muted"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    aria-label={`Remove line ${i + 1}`}
                    className="rounded-lg border border-line px-2.5 py-2 text-muted"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  {isLabor ? (
                    <Field
                      label="Labor hours"
                      value={line.laborHours}
                      onChange={(v) => patch(i, { laborHours: v })}
                      placeholder="8"
                      width="w-24"
                    />
                  ) : (
                    <>
                      <Field
                        label="Qty"
                        value={line.quantity}
                        onChange={(v) => patch(i, { quantity: v })}
                        placeholder="4"
                        width="w-20"
                      />
                      <Field
                        label="Unit $"
                        value={line.unitCost}
                        onChange={(v) => patch(i, { unitCost: v })}
                        placeholder="12.50"
                        width="w-24"
                      />
                    </>
                  )}
                  <Field
                    label="Price"
                    value={line.price}
                    onChange={(v) => patch(i, { price: v })}
                    placeholder={baselineHint}
                    width="w-28"
                    prefix="$"
                  />
                  <div className="ml-auto flex gap-1">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label={`Move line ${i + 1} up`}
                      className="rounded-lg border border-line px-2 py-1 text-muted disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === lines.length - 1}
                      aria-label={`Move line ${i + 1} down`}
                      className="rounded-lg border border-line px-2 py-1 text-muted disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </div>
                </div>

                <LineEconomics econ={econ} targetEphCents={dto?.targetEphCents ?? null} category={line.category} />
              </Card>
            );
          })}

          <button type="button" onClick={addLine} className="text-sm font-medium text-brand underline">
            + Add line
          </button>
        </section>

        {subtotals.length > 0 ? (
          <section className="rounded-xl border border-line bg-surface px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Subtotals by category</h3>
            <ul className="mt-1 space-y-0.5 text-sm">
              {subtotals.map(([cat, v]) => (
                <li key={cat} className="flex items-center justify-between gap-3">
                  <span className="capitalize text-ink-soft">{cat}</span>
                  <span className="tabular-nums text-ink">
                    price {formatCents(v.price)} · cost {formatCents(v.cost)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Target margin"
            name="targetMargin"
            value={targetMargin}
            onChange={(v) => {
              setTargetMargin(v);
              setDirty(true);
            }}
            suffix="%"
            width="w-full"
          />
          <Field
            label="Contingency"
            name="contingency"
            value={contingency}
            onChange={(v) => {
              setContingency(v);
              setDirty(true);
            }}
            suffix="%"
            width="w-full"
          />
        </div>

        <Field
          label="Override total price (blank = margin-solve)"
          name="totalPriceOverride"
          value={override}
          onChange={(v) => {
            setOverride(v);
            setDirty(true);
          }}
          placeholder="leave blank"
          prefix="$"
          width="w-full"
        />

        <input type="hidden" name="lines" value={linesJson} />
        <input type="hidden" name="baseLineIds" value={JSON.stringify(initialLineIds)} />

        {saveState && !saveState.ok ? <p className="text-sm text-danger-fg">{saveState.error}</p> : null}
        {saveState && saveState.ok ? (
          <p className="text-sm text-ok-fg">{saveState.message ?? "Saved."}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-brand px-3 py-3 text-base font-semibold text-brand-ink disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save estimate"}
        </button>
      </form>
    </div>
  );
}

/** A labeled numeric field (real `<label>`, not placeholder-only — a11y, Critique #5). */
function Field({
  label,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  width = "w-full",
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  width?: string;
  name?: string;
}) {
  return (
    <label className={`block text-sm ${width}`}>
      <span className="mb-1 block text-xs font-medium text-ink-soft">{label}</span>
      <span className="flex items-center rounded-lg border border-line bg-paper px-3">
        {prefix ? <span className="text-muted">{prefix}</span> : null}
        <input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          className="w-full min-w-0 bg-transparent py-2 pl-1 text-base text-ink outline-none"
        />
        {suffix ? <span className="text-muted">{suffix}</span> : null}
      </span>
    </label>
  );
}

/** One line's economics — a per-line colour ONLY on an entered-price labor line (Critique #1). */
function LineEconomics({
  econ,
  targetEphCents,
  category,
}: {
  econ: EstimateLineDTO | null;
  targetEphCents: number | null;
  category: string;
}) {
  if (!econ) {
    return <p className="text-xs text-muted">Economics update as you edit.</p>;
  }
  const eph = econ.ephCents === null ? "—" : `${formatCents(econ.ephCents)}/hr`;
  const target = targetEphCents === null ? "—" : `${formatCents(targetEphCents)}/hr`;
  const belowTarget =
    econ.ephCents !== null && targetEphCents !== null ? econ.ephCents < targetEphCents : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span>
        price <strong className="text-ink tabular-nums">{formatCents(econ.priceCents)}</strong>
      </span>
      <span className="tabular-nums">cost {formatCents(econ.costCents)}</span>
      <span className="tabular-nums">net {formatCents(econ.netCents)}</span>
      {econ.markupBp !== null ? <span className="tabular-nums">{(econ.markupBp / 100).toFixed(0)}% markup</span> : null}
      {econ.signalColor ? (
        <span className="inline-flex items-center gap-1.5">
          <SignalBadge color={econ.signalColor} size="sm" />
          <span>
            {eph} vs {target} target{belowTarget === null ? "" : belowTarget ? " (below)" : " (at/above)"}
          </span>
        </span>
      ) : category === "labor" ? (
        <span>shares your blended labor rate — set a price to judge this line on its own</span>
      ) : (
        <span>labor is what the signal measures</span>
      )}
    </div>
  );
}
