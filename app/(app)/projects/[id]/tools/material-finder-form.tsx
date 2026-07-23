"use client";

import { useActionState, useRef, useState } from "react";
import {
  addMaterialAction,
  runMaterialFinderAction,
  type MaterialActionResult,
} from "./material-finder-actions";
import { type MaterialFinderMode } from "@/src/tools";
import { inputClassName } from "@/app/_components/fields";

/**
 * Material Finder's per-tool surface (add-material-finder) — the pattern #8–#10 reuse. A search
 * (mode toggle + query + location pre-filled from the service area) and a hand-add form. The
 * search runs server-side through `dispatch`; results appear under “Waiting on you” below with a
 * profit preview per option. When live AI isn’t connected the search is disabled but hand-add
 * still works (no model needed). Phone-first.
 */
export function MaterialFinderForm({
  projectId,
  serviceArea,
  aiConfigured,
}: {
  projectId: string;
  serviceArea: string;
  aiConfigured: boolean;
}) {
  const [mode, setMode] = useState<MaterialFinderMode>("query");
  const addRef = useRef<HTMLFormElement>(null);

  const [searchState, searchAction, searching] = useActionState<MaterialActionResult | null, FormData>(
    async (_prev, formData) => {
      const query = String(formData.get("query") ?? "").trim();
      const location = String(formData.get("location") ?? "").trim();
      const input = {
        mode,
        ...(query !== "" ? { query } : {}),
        ...(location !== "" ? { location } : {}),
      };
      return runMaterialFinderAction(projectId, input);
    },
    null,
  );

  const [addState, addAction, adding] = useActionState<MaterialActionResult | null, FormData>(
    async (_prev, formData) => {
      const result = await addMaterialAction(projectId, formData);
      if (result.ok) addRef.current?.reset();
      return result;
    },
    null,
  );

  // The one shared input style (app/_components/fields.tsx) — these are uncontrolled fields
  // posting to a server action, so they use the class rather than the controlled `TextField`.
  const inputClass = inputClassName;

  return (
    <div className="mt-3 space-y-6">
      {/* Search */}
      <div className="space-y-3">
        <div className="flex gap-2" role="group" aria-label="What to search for">
          <ModeButton active={mode === "query"} onClick={() => setMode("query")}>
            This material
          </ModeButton>
          <ModeButton active={mode === "estimate"} onClick={() => setMode("estimate")}>
            Everything for this estimate
          </ModeButton>
        </div>

        {aiConfigured ? (
          <form action={searchAction} className="space-y-2">
            {mode === "query" ? (
              <input name="query" placeholder="What material? (e.g. 2x4x8 studs)" className={inputClass} />
            ) : (
              <p className="text-sm text-neutral-500">
                Finds a few sourced options for each material this estimate needs.
              </p>
            )}
            <input
              name="location"
              defaultValue={serviceArea}
              placeholder="Where to price it (city, state)"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={searching}
              className="w-full rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              {searching ? "Searching…" : "Search for materials"}
            </button>
            <Result state={searchState} />
          </form>
        ) : (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Connect AI to search the web for materials. You can still add one by hand below.
          </p>
        )}
      </div>

      {/* Hand-add — always available, no model */}
      <div className="space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <p className="text-sm font-medium">Add a material by hand</p>
        <form ref={addRef} action={addAction} className="space-y-2">
          <input name="name" placeholder="Material name" className={inputClass} />
          <div className="flex gap-2">
            <input name="price" inputMode="decimal" placeholder="Price ($)" className={inputClass} />
            <input name="unit" placeholder="Unit (each, box…)" className={inputClass} />
          </div>
          <input name="supplier" placeholder="Supplier (optional)" className={inputClass} />
          <button
            type="submit"
            disabled={adding}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base font-medium disabled:opacity-50 dark:border-neutral-700"
          >
            {adding ? "Adding…" : "Add material"}
          </button>
          <Result state={addState} />
        </form>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

function Result({ state }: { state: MaterialActionResult | null }) {
  if (!state) return null;
  return (
    <p className={`text-sm ${state.ok ? "text-green-700 dark:text-green-500" : "text-red-600"}`}>
      {state.ok ? state.message : state.error}
    </p>
  );
}
