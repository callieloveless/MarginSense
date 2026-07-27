# Tasks — revamp-estimate-editor (R5)

No schema, no engine change. Inputs-only persistence; all math via `src/engine/`. Verify every stage
with `npm run typecheck`, `npx vitest run`, and **`npm run build`** (the only check that catches
Turbopack / App-Router issues on the rebuilt client editor).

## Stage A — per-line pricing seam + preview DTO (persistence + pure)

- [x] A1. `parseLineItems` (`src/db/validation.ts`) reads an optional per-line `price` → `priceCents`
  via `dollarsToCents` (blank → null; bad value → plain error); labor and non-labor both. The column,
  `LineItemInput.priceCents`, and `saveLineItems` already persist it — no schema, no backend change.
- [x] A2. Add a shared mapper `estimateComputationToDTO(computation, signal, targetProfitPerHour)` →
  a plain serializable `{ signalColor|null, ephCents|null, priceCents, directCostCents,
  overheadCents, contingencyCents, netProfitCents, netMarginBp|null, priceSource, lines: [{category,
  priceCents, costCents, netCents, laborHours, ephCents|null, signalColor|null, markupBp|null,
  priced }] }`. `priced` is true only when the user entered that line's price; `signalColor` is
  populated only for a priced labor line (Critique #1 — no colour on baseline-allocated lines). Used
  by both the page's first paint and the preview action so they can't drift.
- [x] A3. Add a pure **markup** helper: `(price − cost)/cost` → basis points from integer cents; 0-cost
  → NA (no divide-by-zero, no fabricated %). Unit-tested; used by the DTO mapper.
- [x] A4. `previewEstimateAction(estimateId, formData)` — read-only server action: same parsing as
  save, load settings/rates, `computeFromRows`, return the DTO. Persists nothing; tenant-scoped from
  the session. Returns a plain "can't price yet" state instead of throwing on half-typed input.
- [x] A5. Unit tests: `parseLineItems` price parsing (value/blank/bad/legacy); the DTO mapper equals
  the engine's numbers, carries `priceSource`, sets `priced`/`signalColor` correctly (colour only on
  entered-price labor lines), and maps NA → null (never 0); the markup helper reconciles + NA on 0 cost.
  typecheck + vitest green.

## Stage B — phone-first editor + per-line economics (UI)

- [x] B1. Rebuild `estimate-editor.tsx` on the token system + R1 primitives: one **line card** each —
  category **chip**, description, cost inputs (labor hours, or qty + unit cost), and an optional
  **price** field with a ghost baseline hint; delete + **duplicate** icons; **up/down reorder**.
- [x] B2. Per-line **economics row** from the DTO: price · cost · net · hours · **markup %**. A
  `SignalBadge` profit-per-hour signal **only on entered-price labor lines** (DTO `priced` + labor),
  with the **target it's measured against** and a plain "below/above your target" phrase; a
  baseline labor line shows a "shares your blended labor rate — price it to judge it" note (no colour);
  non-labor lines show "labor is what the signal measures" (Critique #1, #6).
- [x] B3. **Category subtotals** (display-only sum of the per-line DTO by category).
- [x] B4. Rebuild the profit panel (`estimate-signal.tsx`) on tokens; keep it **in view** (sticky or
  top) while editing; price-source line reads *solved / your override / set on lines* in plain words;
  include the "your numbers" context (target profit-per-hour).
- [x] B5. **Live recompute as a progressive enhancement** (Critique #2): debounce (~400 ms / on blur) +
  cancel-in-flight → `previewEstimateAction` → render the DTO; keep last-good numbers dimmed with an
  `aria-live` "updating…" note while in flight; on slow/failed/offline, show "numbers update on save"
  and keep the editor fully usable. **Save** stays explicit and is the guaranteed engine-true path.
- [x] B6. **Unsaved-work protection** (Critique #3): mirror in-progress inputs to a local **draft**
  keyed by estimate id, restore on reload with a "restored unsaved changes / discard" affordance,
  clear on successful save; a dirty-flag **`beforeunload` + in-app navigation guard**.
- [x] B7. **Accessibility** (Critique #5): real `<label>`s (placeholder is only an example),
  `aria-live` on the panel/recompute, `aria-label`s on delete/duplicate/reorder, keyboard-reachable
  drill-downs, colour always paired with text.
- [x] B8. Phone-width pass at 360px (tap targets, `inputMode="decimal"`, `formatCents`). `npm run
  build` green.

## Stage C — on-surface version management

- [x] C1. `duplicateEstimateAction(projectId, estimateId)` — new **inactive** version copying margin,
  contingency, override, and all lines incl. entered `priceCents`; label "Copy of <label>"; does not
  change the active flag or re-seed context; tenant-scoped; redirects to the copy.
- [x] C2. **Versions strip** on the estimate page: each version as a chip with its **signal +
  profit-per-hour** (one `computeFromRows` per version on load), active marked, tap to switch; buttons
  for **set active**, **new version**, **duplicate**.
- [x] C3. **Save reconciliation** (Critique #4): the editor loads a snapshot of the server's line ids;
  `saveEstimateAction` (or the editor) detects when the server's current line set differs since load
  (a concurrently-accepted suggestion line) and surfaces it for review instead of silently replacing.
  No schema (`line_items.id` exists).
- [x] C4. Unit tests: `duplicateEstimateAction` (copies inputs + lines incl. price; inactive; no
  re-seed; cross-tenant blocked); save reconciliation flags a changed line set and passes an unchanged
  one. typecheck + vitest + build green.

## Stage D — self-review, code-review, archive

- [x] D1. Self-review vs the spec deltas + critique lenses (store-inputs-only / show-derived-only;
  signal honesty — per-line colour only on entered-price labor lines, never uniform-by-construction;
  job-site reality — usable offline, save is the guaranteed path; user access — unsaved-work guard +
  a11y; tenant reads/writes only; no client-side engine math; no dead/fabricated numbers).
- [x] D2. `/code-review` (user-triggered) or a high-effort adversarial inline pass; address findings;
  re-verify typecheck + vitest + build.
- [x] D3. Update `PROGRESS.md` (R5 → done) and `relevant_notes.md` (per-line pricing now reachable;
  the preview-DTO pattern; unit-of-measure still deferred).
- [x] D4. Commit the implementation stages, then archive (`openspec archive revamp-estimate-editor
  --yes`) as its own commit, then push.

## Deferred (explicit non-goals — not this change)

- Unit of measure column (SF/LF/EA) — tiny additive migration, small follow-up.
- Saved-line / assemblies / templates library; cross-job copy.
- Custom phase/section grouping (category grouping is display-only and included).
- Allowance flags (client document, R9); tax (client document); per-line labor-rate overrides.
- Tool-produced line suggestions — the tools (R6–R9) create them via the existing suggestion queue.
