## Why

Making an estimate is where the whole product earns its keep — it's the moment a contractor
decides whether a job is worth the crew hours. The engine already knows how to answer that in full:
change #R2a put **per-line pricing, per-line profit-per-hour, and a per-line red/yellow/green
signal** into `src/engine/` and the `estimates` spec. But the editor UI never caught up. Today the
builder is a cramped, neutral-grey form that lets you type costs, a whole-estimate margin, and an
optional total override — and nothing else. It **cannot enter a per-line price**, so the save path
even drops `priceCents`; it **shows no per-line economics**, so you can't see which lines lose
money; it has **no reorder, no duplicate, no version management on the surface**, and it only shows
you the signal *after* you save and the page reloads.

This change makes the estimate editor a real, phone-first estimating tool for a contractor:
enter a price on any line or let it solve, **see each line's cost, price, profit-per-hour and
signal as you build**, watch the whole-estimate signal move live (computed by the engine, never
re-implemented), reorder and duplicate lines, and manage versions (duplicate "Option A" into
"Option B", see each version's signal, set the active one) — all without a schema change, because
the persistence layer already supports it.

## What Changes

- **Phone-first rebuild** of the estimate editor and its profit panel on the revamp's token system
  and shared primitives (Card, SectionHeader, StatRow, SignalBadge, Chip), replacing the neutral-grey
  form. Built and checked at 360px first.
- **Per-line pricing, exposed and wired.** Each line gets an optional **price** field; leave it blank
  and the engine derives the cost-proportional baseline (today's behavior), fill it and that line's
  price is fixed and margin becomes an outcome (the R2a semantics, finally reachable from the UI).
  `parseLineItems` learns to read the per-line price; the column, the `LineItemInput`, and
  `saveLineItems` already persist it — **no migration**.
- **Per-line economics, in view — and honestly.** Under each line: its effective **price**, **cost**,
  **net**, **labor hours**, and a per-line **markup %**. A per-line **profit-per-hour red/yellow/green
  signal** (from the engine's `LineBreakdown`) is shown **only where it is real** — on a line that
  carries an *entered* price, so its rate is a genuine per-line decision. A purely **baseline-allocated**
  labor line shows its numbers **without a per-line colour**, with a plain note ("shares your blended
  labor rate — set a price to judge this line on its own"), because cost-proportional allocation makes
  every baseline labor line's profit-per-hour identical by construction — a colour there would be a
  degenerate, misleading signal (this is exactly why per-line pricing exists; see Critique #1). Category
  **subtotals** summarize the mix. Every figure comes from the engine; nothing is re-derived in the UI.
- **Numbers on save, guaranteed; live recompute as an enhancement.** Saving always yields the
  engine-true signal, roll-up, and per-line economics — that is the guaranteed path and works on one bar
  of signal. On top of that, a debounced, read-only **live preview** updates the numbers as the user
  edits (computed **server-side by the engine**, **persisting nothing**; no client-side re-implementation
  of the math, constitution §6). The live preview is a **progressive enhancement**: if the connection is
  slow or drops, the editor stays fully usable — enter, save, see the real numbers — and the panel says
  "numbers update on save" rather than lying or stalling.
- **Your work is protected.** The editor guards against losing a half-built estimate on a phone: it keeps
  an in-progress **local draft** and **warns before you navigate away with unsaved changes**, so a
  backgrounded app or a dropped call doesn't cost twenty minutes of line entry.
- **Accessible by construction.** Real field **labels** (not placeholder-only), **aria-live** so a
  screen reader announces the signal changing, **aria-labels** on the delete/duplicate/reorder controls,
  and keyboard-reachable drill-downs — the estimator is usable by voice and keyboard, not sight alone.
- **Real line management:** add, edit, delete, **duplicate a line**, and **reorder** (persisted via
  the existing `sort_order`). Category is a chip, not a dropdown. **Save reconciles** with lines added
  since the editor loaded (e.g. a tool suggestion accepted meanwhile), so a full-replace save never
  silently drops them (see Critique #4).
- **On-surface version management:** a versions strip showing **each version's signal and
  profit-per-hour**, **set active**, **create a new version**, and **duplicate this version** (copies
  its inputs and lines — including entered prices — into a new inactive version, for fast Option A/B).
- **Price-source clarity:** the panel always says plainly how the price was reached — *solved to your
  target margin*, *your total override*, or *set on lines* — so margin-as-outcome is never a mystery.

## Financial-model interaction (called out per the rules)

No formula, threshold, or unit change. Every number — line and total price, cost, overhead,
contingency, net, margin, profit-per-hour, and both the estimate and per-line signals — is produced
by `src/engine/` via the existing `computeEstimate` / `lineBreakdowns` (the profit surface reads the
typed roll-up). The editor only **stores inputs**: entered costs, an optional entered price per line,
target margin, contingency, and an optional total override. Solved and baseline prices remain derived
and are never persisted (spec: "Derived prices are never stored"). Money is integer cents, time
integer minutes, percentages basis points.

## Critique → revisions (fully-featured-for-a-contractor · user-access lenses)

The first draft was critiqued against the project lenses and the two the user named; the revisions
above came out of it. On the record:

1. **[signal honesty · high] Per-line signal is degenerate by construction in the default case.** With
   no entered prices, the engine allocates each line's price cost-proportionally and overhead by hours,
   so **every baseline labor line shows the identical profit-per-hour** — a worked example (10 h and 5 h
   labor lines: price 2:1, cost 2:1, hours 2:1 → net/hour equal) proves it. Painting per-line colours
   there implies insight that doesn't exist. **Revision:** a per-line colour is shown **only** on lines
   with an *entered* price; baseline lines show their numbers with a "shares your blended labor rate —
   price it to judge it" note. This is why per-line pricing exists; the editor now teaches it.
2. **[job-site reality · med-high] Live recompute assumed connectivity.** The user is "on a ladder with
   one bar of signal." A per-keystroke server round-trip degrades badly there. **Revision:** save is the
   **guaranteed** engine-true path; live preview is a **progressive enhancement** that degrades to
   "numbers update on save" without breaking the editor.
3. **[user access · med-high] Unsaved work lived only in client state.** A backgrounded phone or dropped
   call would lose a long estimate. **Revision:** a local in-progress **draft** + an **unsaved-changes
   guard** on navigate-away.
4. **[correctness · med] Full-replace save could drop a concurrently-accepted tool line.** A Material
   Finder suggestion accepted while the editor is open would be wiped by the next save. **Revision:**
   save **reconciles** with the server's current line set (keyed by line id / change-detected) rather
   than blindly replacing; residual risk tracked in design.
5. **[user access · med] Accessibility wasn't first-class.** The old form is placeholder-only.
   **Revision:** real labels, `aria-live` on the signal, `aria-label`s on icon/reorder controls,
   keyboard-reachable drill-downs — an explicit requirement, not a polish task.
6. **[trust voice · med] A per-line red gave no legible frame.** **Revision:** each line's economics show
   the **target it's measured against** and a plain "below/above your target" phrase, so a colour is
   actionable, not a bare dot.
7. **[money math · low-med] Markup % was an ad-hoc ratio.** **Revision:** a pure, unit-tested display
   helper over integer cents (not a floaty inline calc).

**Checked, no finding:** MarginSense is single-user-per-business, so R5 introduces no role/permission
gap; the live preview returns internal figures only to the owner's own browser (no client-facing or
shared surface), so the client boundary holds; nothing derived is persisted.

## Capabilities

### Modified Capabilities
- `estimates`: the line-item editor gains **per-line price entry**, **user-controlled persisted
  ordering**, and **line duplication**; new requirements add **honest per-line economics display**
  (per-line colour only where a price makes it real), a **live engine-truthful recompute that degrades
  to save**, **unsaved-work protection**, **accessibility**, **save reconciliation** with lines added
  since load, **version duplication**, and **on-surface version management** (switch, signal-per-version,
  set active). The pricing/rounding semantics themselves are unchanged — this change makes them
  reachable, honest, and legible.

## Impact

- **Schema:** none. `line_items.price_cents` and `sort_order` already exist and `saveLineItems`
  persists both; the only persistence change is teaching `parseLineItems` (`src/db/validation.ts`) to
  read a per-line price.
- **Engine:** none (consumes `computeEstimate` / `LineBreakdown` as-is).
- **Code:** `app/(app)/projects/[id]/estimates/[estimateId]/estimate-editor.tsx` (rebuilt, with the
  draft cache + unsaved-changes guard + a11y), `.../page.tsx` (profit panel on tokens + per-line
  economics + versions strip), `app/_components/estimate-signal.tsx` (token rebuild; expose per-line
  rows), `app/(app)/projects/[id]/estimates/actions.ts` (read-only `previewEstimateAction`;
  `duplicateEstimateAction`; `saveEstimateAction` reconciles by line id), `src/db/validation.ts`
  (`parseLineItems` reads the price), plus a pure markup helper. Reuses the existing
  `computeFromRows`/`businessRates`, `estimateSignal`, `signalAbsolute`, `SignalBadge`, and the R1
  primitives. (Save reconciliation may add an id-keyed `saveLineItems` path in `src/db/`; no schema.)
- **No touch:** `src/engine/`, migrations, the tools, the client document, the dashboard math.

## Non-goals

- **Unit of measure** on non-labor lines (SF/LF/EA) — a tiny additive column, deferred to a small
  follow-up so R5 stays schema-free.
- **A saved-line / assemblies / templates library** (reusable presets, cross-job copy) — its own
  future change.
- **Custom phase/section grouping** — category grouping is display-only and included; user-named
  phases (schema) are deferred.
- **Allowance flags** (client picks a finish later) — belongs to the client document (R9).
- **Tax** — a client-facing pass-through that lives on the client document, not the internal EPH view.
- **Per-line labor-rate overrides / multiple crews** — advanced; the business burdened rate stands.
- **Tool-produced line suggestions** — the tools (R6–R9) create them; the editor renders lines that
  are accepted through the existing suggestion queue, unchanged.
