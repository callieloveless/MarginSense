# Design — revamp-estimate-editor (R5)

## Context

The estimate is the deepest surface of the revamp and the one the whole product exists for. The
domain and persistence are already done: `src/estimate/computeEstimate` returns the roll-up, the
`priceSource` (`solved` | `override` | `line`), and a per-line `LineBreakdown[]` (effective price,
cost, overhead + contingency share, net, labor hours, profit-per-hour, and a per-line signal);
`line_items` already has `price_cents` and `sort_order`; `LineItemInput` carries both and
`saveLineItems` writes them (`sortOrder ?? i`). The gaps are entirely in the **UI** and one
**validation** seam:

- `parseLineItems` doesn't read a per-line price, and the editor doesn't send one → `priceCents` is
  silently dropped even though everything downstream supports it.
- The editor is a cramped neutral-grey form; the profit panel and per-line economics are invisible.
- Liveness is "save → full page reload."

So R5 is a **presentation + one-seam** change: no schema, no engine, no new math. The design work is
about the phone-first editing model, how "live" numbers stay engine-truthful, and version management.

## Goals / non-goals

- **Goal:** a contractor can price a job line-by-line on a phone and see, live, whether it and each
  line pull their weight — with every number traceable to the engine.
- **Goal:** zero schema; inputs-only persistence; math stays in `src/engine/`.
- **Non-goal:** templates/assemblies library, unit-of-measure column, custom phases, allowances, tax,
  per-line labor rates (all listed in the proposal).

## Decision 1 — Liveness is a progressive enhancement; save is the guaranteed path (Critique #2)

The user is "on a ladder with one bar of signal." So the load-bearing guarantee is **not** the live
preview — it's that **saving always shows engine-true numbers**. `saveEstimateAction` persists the
inputs and the page re-renders `computeFromRows` server-side (today's behavior). That path is one round
trip and works on a bad connection. Everything below is sugar layered on top of it and must degrade to
it without breaking the editor.

The constitution also forbids re-deriving totals/margin/signal outside `src/engine/`, so the editor may
**not** compute the signal client-side. The live preview therefore stays server-truthful:

- A read-only server action **`previewEstimateAction(estimateId, rawInputs)`** parses the in-progress
  inputs (same `parseLineItems` + margin/contingency/override parsing as save), loads settings/rates,
  runs `computeFromRows`, and returns a **plain serializable DTO**: the roll-up numbers, `priceSource`,
  and a per-line array `{category, priceCents, costCents, netCents, laborHours, profitPerHourCents|null,
  signalColor|null, markupBp|null, priced}`. It **persists nothing**.
- The client debounces (~400 ms / on blur) and calls it with cancel-in-flight, then renders the DTO.
  While a request is in flight it shows the last good numbers dimmed with an `aria-live` "updating…"
  note — never a fabricated in-between number.
- **Degradation (the important part):** if the preview is slow, fails, or the app is offline, the panel
  shows the last good numbers with a plain "numbers update when you save" note, and **save still works**.
  The editor is fully usable — enter, save, read the real numbers — with the preview entirely dead.
- **Save** is explicit and separate; autosave is avoided (a costing document shouldn't mutate on every
  keystroke) — but see Decision 6 for not *losing* unsaved work.

Why a DTO and not the raw `EstimateComputation`: the engine types are branded (`Cents`, `Computed<T>`)
and not meant to cross the server-action boundary. A thin DTO keeps the wire simple and lets the same
panel component render both the server-rendered first paint (from `computeFromRows`) and the live
previews (from the action) — one renderer, two sources, identical output.

## Decision 2 — Per-line pricing is opt-in, baseline is the default

Each line shows a **price** field that is **empty by default**, with a ghost hint of the derived
baseline (e.g. "auto $1,240"). Empty → the engine allocates the cost-proportional baseline (today's
behavior, unchanged for every legacy estimate). Typing a value fixes that line's price and flips the
whole estimate to `priceSource: "line"` (entered prices supersede a total override, per the spec). A
small "clear" affordance returns the line to baseline. This makes the R2a semantics reachable without
forcing anyone to price line-by-line.

`parseLineItems` gains an optional `price` field parsed with the existing `dollarsToCents` (blank →
`priceCents: null`). Nothing else in the save path changes.

## Decision 3 — Per-line economics come from `LineBreakdown`, and per-line colour only where it's real (Critique #1)

The page already computes `EstimateComputation`; it carries `lines: LineBreakdown[]` aligned to the
estimate's lines. The editor renders, per line: **price**, **cost** (`directCost`), **net**, **labor
hours**, and a display-only **markup %**. So far, harmless.

The trap is the **per-line signal**. Walk the math: with no entered prices, the engine allocates each
line's price cost-proportionally and overhead by labor hours. Take two labor lines, 10 h and 5 h at the
same burdened rate — price allocates 2:1, cost is 2:1, overhead is 2:1, hours are 2:1, so each line's
`net / laborHours` is **identical**. Every baseline labor line lands on the **same profit-per-hour and
therefore the same colour, by construction**. Painting per-line red/yellow/green there is a degenerate
signal — it *looks* like per-line insight but is just the estimate's blended rate repeated. That is the
signal-honesty hard rule, and it is precisely the degeneracy that motivated per-line pricing in R2a.

So the rule the editor follows:

- A line with an **entered** price → show its real per-line **profit-per-hour + signal** (colour +
  text + the target it's measured against). Its rate reflects a genuine per-line decision.
- A **baseline-allocated** labor line → show its price/cost/net/hours **without a per-line colour**, and
  a plain note: *"shares your blended labor rate — set a price to judge this line on its own."* This is
  honest and it teaches the feature.
- A **non-labor** line → show price/cost/net, no profit-per-hour signal (the signal measures labor,
  §3.4a), with a one-line note — never a fabricated figure.

The DTO carries a `priced: boolean` per line (did the user enter this line's price) so the client can
gate the colour without re-deriving anything. **Category subtotals** are a display-only sum by category
so the labor/material mix is legible; no engine change.

Alignment: `LineBreakdown[]` is index-aligned to the stored lines. During live editing the client
renders the preview DTO's per-line array (same order it sent), so indices stay aligned; the first paint
uses the persisted order. Reordering is a client-state move that only affects persistence on save.

## Decision 4 — Version management on the surface

- A compact **versions strip** at the top: each version as a chip with its label, its signal color +
  profit-per-hour (computed by `computeFromRows` per version — a handful of engine calls on load), and
  the active one marked. Tapping switches to that version's editor.
- **Set active** stays (`setActiveEstimateAction`).
- **Create new version** stays (the hub's `NewEstimateForm`, also offered here).
- **Duplicate this version** — a new `duplicateEstimateAction(projectId, estimateId)` creates a new
  **inactive** estimate copying `targetMarginBp`, `contingencyBp`, `totalPriceOverrideCents`, and all
  line items **including any entered `priceCents`**, with a label like "Copy of v1"; it does **not**
  touch the active flag or seed context again (that only happens for a project's first estimate).
  Redirects to the copy. This is the Option A → tweak → Option B path.

## Decision 5 — Phone-first editing model

- One **line card** per line: category chip + description on the top row; the cost inputs (labor
  hours, or qty + unit cost) and the optional price on the next; the computed economics row beneath
  (price · net · profit-per-hour + signal). Delete and duplicate are small icon buttons; reorder is
  up/down controls (drag is unreliable on touch — up/down is honest and accessible).
- The profit panel is **sticky** (or immediately above the lines) so the signal stays in view while
  scrolling lines, honoring "the job surface keeps the profit signal in view."
- Money via `formatCents`; inputs use `inputMode="decimal"`; big tap targets; validated at the
  boundary (`parseLineItems`, `percentToBp`, `dollarsToCents`) with plain error text.

## Decision 6 — Don't lose a half-built estimate on a phone (Critique #3)

Explicit save (not autosave) means the in-progress inputs live in React state until the user saves — and
a phone backgrounds, a call comes in, the tab is reclaimed. Losing twenty minutes of line entry is the
kind of irreversible, trust-destroying failure the product can't afford. Two cheap guards:

- **Local draft cache.** The editor mirrors its in-progress inputs to `sessionStorage` (or
  `localStorage`) keyed by estimate id, restoring them if the surface reloads with unsaved work — with a
  visible "restored your unsaved changes" note and a way to discard back to the saved version. The cache
  is cleared on a successful save. It stores only the same inputs the user typed; nothing derived.
- **Unsaved-changes guard.** A dirty-state flag drives a `beforeunload` warning and an in-app
  navigation guard, so leaving with unsaved edits prompts rather than silently discards.

This is client-only convenience state; the server remains the source of truth, and a save is still the
only thing that persists.

## Decision 7 — Save reconciles instead of blindly replacing (Critique #4)

`saveEstimateAction` today calls `saveLineItems(estimateId, lines)`, a **full replace**. But a line can
appear on the server *after* the editor loaded — a Material Finder / Code Finder suggestion accepted
from the hub or the tools surface adds a line to this estimate. A naive full-replace save would silently
delete it. Options, cheapest-safe first:

- **Change-detection (chosen for R5):** the editor loads with a snapshot of the server's line ids; on
  save, if the server's current line set differs from that snapshot (a line was added/removed
  meanwhile), the save **surfaces it** — "N lines changed since you opened this; review before
  overwriting" — rather than clobbering. The common case (no concurrent change) saves normally.
- **Id-keyed upsert (stretch):** give editor lines stable ids and have `saveLineItems` upsert/delete by
  id so untouched concurrent lines survive a save. Bigger; deferred unless change-detection proves
  insufficient. No schema either way (`line_items.id` already exists).

Residual risk if neither lands in R5: documented here and in `relevant_notes.md`; the change-detection
guard is the floor, so no silent loss ships.

## Decision 8 — Accessibility is a requirement, not polish (Critique #5)

The old editor is placeholder-only (a placeholder is not a label). The rebuild:

- Every input has a real, associated **`<label>`**; the placeholder is only an example.
- The profit panel and each recompute use **`aria-live="polite"`** so a screen reader announces the
  signal and totals changing (the single most important thing on the surface).
- Icon-only controls (delete, duplicate, up/down reorder) carry **`aria-label`s**; drill-downs are
  native `<details>`/buttons, keyboard-reachable and focus-visible.
- Colour is never the only carrier — `SignalBadge` already pairs colour with text everywhere it's used.

## Risks

- **Chatty preview.** Debounce + cancel-in-flight; the action is a pure read (settings + lines +
  engine), cheap. If it ever bites, raise the debounce; correctness first.
- **Serialization drift** between the first-paint computation and the preview DTO. Mitigated by one
  shared mapper (`EstimateComputation → DTO`) used by both the page and the action, and a test that
  the DTO round-trips the engine's numbers.
- **Reorder vs live preview index alignment** — covered in Decision 3 (client sends its current
  order; DTO comes back in that order).
- **Degenerate per-line signal** (Critique #1) — mitigated in Decision 3: colour only on priced lines.
- **Lost unsaved work / connectivity** (Critiques #2, #3) — mitigated in Decisions 1 and 6.
- **Concurrent tool line dropped by save** (Critique #4) — mitigated in Decision 7 (change-detection).
- **Scope.** This is the largest single surface of the revamp. Land it in the committed stages below,
  each independently green (typecheck + vitest + build), so review stays tractable.

## Test plan

- Engine/estimate math is already unit-tested; no new engine tests.
- `parseLineItems`: a per-line price parses to `priceCents`; blank → null; a bad price is rejected
  with a plain message; legacy payloads (no price) unchanged.
- The `EstimateComputation → DTO` mapper: the DTO's totals and per-line numbers equal the engine's;
  `priceSource` and per-line signal colors survive; NA propagates as null (never a fabricated 0); the
  per-line `priced` flag is true only for lines with an entered price.
- The **markup** helper: `(price − cost)/cost` in basis points from integer cents; 0-cost → NA (no
  divide-by-zero, no fabricated %); a worked example reconciles.
- `duplicateEstimateAction`: the copy carries the same inputs and lines incl. entered prices, is
  inactive, is tenant-scoped (another business can't duplicate ours), and does not re-seed context.
- **Save reconciliation:** a save whose server line set changed since load is flagged, not silently
  applied; an unchanged set saves normally.
- Tenant scope inherited (all reads/writes via the bound `tenantDb`; the preview action resolves the
  business from the session and never trusts a client id).
- Build (Turbopack) after the UI rebuild — the only check that catches App-Router/import issues.
- **Manual (user):** on a throttled connection the editor still enters + saves + shows engine-true
  numbers; unsaved edits survive a reload (draft restore) and warn on navigate-away; keyboard-only and
  screen-reader pass on the line card + panel.

## Stages (each a commit, each green)

- **A — per-line pricing seam + DTO + helpers:** `parseLineItems` reads the price; the shared
  `EstimateComputation → DTO` mapper (with the per-line `priced` flag) + the markup helper +
  `previewEstimateAction`; unit tests. No UI yet.
- **B — phone-first editor + honest per-line economics:** rebuild `estimate-editor.tsx` and the profit
  panel on tokens; per-line price input, economics rows (per-line colour only where priced, with the
  target it's measured against), category subtotals, add/delete/duplicate/reorder; live preview as a
  progressive enhancement; the draft cache + unsaved-changes guard; accessibility (labels, aria-live,
  aria-labels). Real build.
- **C — version management + save reconciliation:** versions strip with per-version signal;
  `duplicateEstimateAction`; set-active/create/duplicate on the surface; save change-detection so a
  concurrently-added line isn't dropped. Real build.
- **D — self-review + `/code-review` + archive + push.**
