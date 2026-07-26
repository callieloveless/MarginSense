## Context

The engine spec already frames `revenue = Σ line price` and lines carrying a price, but the
implementation solves one estimate-wide total and leaves `line_items.priceCents` reserved; the
proportional-to-cost allocation currently lives in `src/estimate/client-projection.ts`. A per-line
signal is the prototype's headline, but it is **degenerate under a single global price** — every
labor line resolves to the same profit/hour because price, cost, and overhead all scale with hours
— so it requires per-line prices with a fallback for unpriced/legacy lines. Constraints: the engine
is pure and may not import `src/estimate` (constitution §6.8); money is integer cents; the
whole-estimate roll-up and signals must not change.

## Goals / Non-Goals

**Goals:** per-line price (explicit else allocated) in the pure engine; a per-line labor
profit-per-hour signal on the same thresholds; the per-line-nets-reconcile-to-estimate-net
invariant; one allocation method (extracted into the engine); the constitution §3 amendment.

**Non-Goals:** UI (R5); realigning the client document to prefer explicit line prices (R7); the
portfolio/dashboard pulse (`add-portfolio-pulse`); any schema/migration (the column exists).

## Decisions

- **Extract the proportional-cost allocation into the pure engine** — e.g.
  `allocatePriceToLines(totalPrice, lineCosts): Cents[]`, exact to the cent with the rounding
  remainder assigned to the largest-cost line. `client-projection.ts` **delegates** to it (no
  behavior change; its existing tests guard). *Why:* allocation is math → it belongs in the engine
  (§6.8); one method in the codebase; the engine can compute the per-line fallback without importing
  `src/estimate` (which would invert the module boundary).
- **Effective line price = entered `priceCents` if set, else the derived baseline.** `revenue = Σ`
  effective line price. **Baselines are never persisted** — solving/allocating writes nothing;
  only a user-entered price is stored. *Why:* persisting the solve would make every line
  "explicitly priced" after the first solve, freezing the estimate against later cost changes —
  and would violate the store-inputs-only convention.
- **Partial pricing & precedence:** the baseline is the allocation of the solved (or overridden)
  total across **all** lines; an entered price replaces only its own line's baseline, so other
  lines don't move (no cross-talk, no negative reallocation). When any entered line price exists,
  the total is Σ effective prices and the total override is **not** additionally applied (the two
  cannot both define revenue); margin is an outcome. *Why:* the only semantics that avoids
  circular allocation and a `Σ price ≠ override` contradiction.
- **Per-line net decomposition:** `lineNet = effectivePrice − lineDirectCost −
  lineOverheadAllocated − lineContingencyShare`, with `lineOverheadAllocated = lineHours ×
  overheadRecoveryRate` (labor lines only, §3.4's hours-based overhead) and `lineContingencyShare
  = contingency × (lineDirectCost + lineOverheadAllocated) / (directCost + overheadAllocated)` —
  proportional to the **contingency base itself**, matching the constitution's base, so a
  labor-heavy line carries the contingency its overhead generates. *Why:* `Σ lineNet = netProfit`
  holds by construction AND each share is traceable to the constitutional formula. When the base
  is zero, contingency is zero and every share is zero — no division.
- **Contingency share is included in the per-line net** (the flagged open question). *Why:*
  excluding it would make `Σ lineNet = netProfit + contingency` and break the invariant. Sub-cent
  remainders (price and contingency alike) are assigned to the largest-share line, ties broken by
  line order, so sums are exact and deterministic.
- **Zero-direct-cost estimates:** baseline allocation is `Computed` not-applicable (no division);
  entered prices still stand; per-line signals report not-applicable.
- **Per-line signal only for labor lines** (`lineHours > 0`): `lineProfitPerHour = lineNet /
  lineHours`, classified by the existing `signalAbsolute` thresholds; `Computed` not-applicable for a
  zero-hour labor line; non-labor lines return no signal. *Why:* a per-hour number needs hours;
  matches the prototype (only labor lines carry a chip).
- **Additive return shape:** the estimate computation returns an optional per-line array
  (`{lineId, price, cost, overhead, hours, net, profitPerHour: Computed, signal?}`) alongside the
  unchanged roll-up. Existing callers are unaffected.
- **No schema/migration:** `priceCents` already exists; it is read as the optional explicit price.

## Risks / Trade-offs

- **Rounding could break the invariant** (`Σ lineNet ≠ netProfit` by a cent) → allocate exact to the
  cent (remainder → largest-share line, ties by line order) for price and contingency alike; a
  property test asserts exact equality.
- **Accidentally persisting derived prices would freeze estimates** (every line "entered" after one
  solve; cost changes stop re-solving) → the derived-not-stored rule is a spec requirement with a
  test asserting a solve writes no `priceCents`.
- **`client-projection` refactor regression** → it delegates to the engine allocation with identical
  output; its existing tests are the guard.
- **Module-boundary violation** → the allocation moves *into* the engine; `src/estimate` imports the
  engine, never the reverse.
- **Degenerate signal on a freshly-solved estimate** (all labor lines uniform until priced) → this is
  truthful: flat pricing *does* mean uniform profit/hour. R5 surfaces per-line where it varies and
  explains the uniform case; not a bug to paper over.
- **Amendment sequencing** → the constitution §3 amendment lands in its **own commit**, before/with
  the engine change.

## Migration Plan

No DB migration. Additive engine surface + a no-behavior-change `client-projection` delegation +
the §3 amendment (own commit). **Verify:** engine unit tests (boundaries, reconciliation invariant,
unpriced fallback equals old allocation, zero-hour line, line override), `client-projection` tests
stay green, `npm run typecheck`, `npx vitest run`, `npm run build`. **Rollback:** revert the engine
+ estimate commits; `priceCents` returns to unused; whole-estimate behavior is unchanged throughout.

## Open Questions

- Whether `computeEstimate` returns per-line results always or on request — default **always**
  (cheap, deterministic); gate behind an option only if a hot path needs it.
- Final naming of the engine allocation + per-line result types — settle at apply, keep them in
  `src/engine/estimate.ts` next to the roll-up.
