## Why

A contractor needs to see **which lines drag a job down**, not just whether the whole bid clears
the bar. Today the engine signals only at the whole-estimate and portfolio level, so a red job
gives no clue where the bleed is — the exact thing the prototype's per-line red/yellow/green
answers. But a per-line signal only carries information when lines are **priced individually**:
under a single estimate-wide margin-solve, every labor line is mathematically the *same*
profit/hour (its price, cost, and overhead all scale with its hours), so a per-line color would be
uniform and useless. This change activates per-line pricing — already anticipated by the schema's
reserved `line_items.priceCents` and the engine spec's `revenue = Σ line price` — and computes a
real per-line profit/hour on top of it, so the signal reflects the contractor's actual per-line
pricing (finish carpentry vs. haul-off) rather than an invented number.

## What Changes

- **Per-line pricing (engine + estimates).** Each line MAY carry its own client price; the estimate
  total is the **sum of effective line prices**. The target-margin solve *derives* a per-line
  **baseline** by allocating the total proportional to cost — the same allocation already
  implemented in `client-projection.ts`, extracted into the pure engine so there is **one** method
  in the codebase (and no inverted module boundary). Baselines are **derived values, never
  persisted** — only a price the user *enters* is stored (`priceCents`), so a later cost change
  still re-solves the estimate (store inputs, recompute derived). An entered price replaces its
  line's baseline (other lines are untouched — no cross-talk), makes margin an outcome, and
  **supersedes a total-price override**. Legacy/unedited estimates (no entered prices) roll up
  exactly as before.
- **Per-line profit-per-hour signal (engine, labor-only).** For each labor line,
  `lineProfitPerHour = (linePrice − burdenedLaborCost − lineOverheadAllocated − lineContingencyShare)
  / lineHours`, classified by the **same** thresholds as the whole-estimate signal. Non-labor lines
  carry no per-hour signal (they have no hours).
- **Reconciliation invariant.** Per-line nets SHALL sum exactly to the estimate's `netProfit`, so the
  whole-estimate profit/hour stays the hour-weighted blend of the lines — nothing is invented, and
  every per-line number drills to price / cost / overhead / hours (constitution §6.6).
- **No schema change.** `line_items.priceCents` already exists (reserved) → **no migration**.

## Financial-model interaction (called out per the rules)

This **is** a change to the canonical financial model: it adds a per-line pricing direction and a
per-line profit-per-hour view. It is **additive** — the whole-estimate roll-up, EPH, and the
absolute/comparative signals are unchanged (the engine already defines `revenue = Σ line price`),
and the per-line nets reconcile to the existing estimate net. It is recorded in **constitution §3 in
its own commit**. It touches **no** tenant-isolation surface and **no** tools-suggest-users-confirm
rule — the estimate builder is an outer-layer user action; tools still only suggest.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `profit-engine`: activate per-line price with proportional-allocation fallback; add a per-line
  labor profit-per-hour signal on the same thresholds; add the per-line-nets-reconcile-to-estimate-net
  invariant. (Margin-driven pricing requirement modified to state it seeds per-line prices and the
  total is their sum.)
- `estimates`: the pricing direction supports each line carrying its own price, the estimate total
  as the sum of line prices, and allocation fallback for lines left unpriced.

## Impact

- **Code:** `src/engine/estimate.ts` (per-line price + allocation fallback in the roll-up; per-line
  net), `src/engine/signal.ts` (per-line labor signal), `src/engine/index.ts` (exports);
  `src/estimate/estimate.ts` (line price plumbing through `computeEstimate`);
  `src/estimate/client-projection.ts` (delegates to the engine's extracted allocation — no behavior
  change, guarded by its existing tests).
- **Tests:** per-line signal threshold boundaries (0.79/0.80/0.99/1.00), the reconciliation
  invariant, legacy/unpriced fallback equals the old allocation, zero-hour line (no signal),
  override line, negative line net.
- **Docs:** `constitution.md` §3 amendment (own commit); `openspec/config.yaml` context if needed.
- **No touch:** schema/migrations, `src/db/`, RLS, `src/tools/`, `src/ai/`. UI (per-line chips +
  editing) is **R5**, not here.

## Non-goals

- **No UI** — the estimate editor's per-line chips, per-line price entry, and calm "worst-draggers"
  treatment are **R5**.
- **No client-document realignment now** — `client-projection` keeps allocating the total for the
  client doc; making it *prefer* explicit line prices (so the client per-line split matches the
  internal one) is **R7**. Until then, internal and client per-line splits may differ while summing to
  the same total (the client sees a consistent, prices-only total either way).
- **No portfolio/dashboard aggregate** — that's the sibling change `add-portfolio-pulse`.
- No per-line markup UX or new tax handling beyond what exists.
