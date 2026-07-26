## Why

Onboarding is where trust in the whole product is won or lost — a contractor decides in the first
minute whether these numbers are believable. Today's wizard is functional but utilitarian (neutral
styling, no welcome, straight into overhead), and the "Here are your numbers" review plays back six
rates but omits several a contractor actually wants — most importantly the one number that ties
*setup* to *pricing*: the rate an hour of work must bill to pull its weight. This change gives
onboarding the calm, guided feel of the new shell, folds the service area (code jurisdiction) into
setup, and expands the review to the full, grouped set of derived numbers — while keeping **every
goal input** so the target profit-per-hour stays derived, never a magic constant.

## What Changes

- **Guided onboarding:** a friendly welcome ("Let's find out what your jobs really pay") with *Get
  started* and **Skip for now**; the steps restyled to the shell tokens and the shared
  stepped-progress primitive; **service area** captured during setup (the jurisdiction for code
  lookups), prefilled and still editable in Settings.
- **Expanded "Here are your numbers"** (and the shared derived-rates playback), **grouped** into
  *Your capacity · What an hour costs you · Your targets*, each number drillable to its inputs.
  New numbers alongside the existing six:
  - **Annual billable hours** (already derived by the engine, now shown).
  - **Monthly overhead** (annual ÷ 12 — the §3.3-sanctioned display derivation).
  - **The bill rate an hour must fetch to pull its weight** = loaded cost/hr + target profit/hr —
    the *same* threshold a per-line signal uses (§3.4a), so setup and pricing speak one language.
- **Settings restyled** to the shell (the same inputs + advanced defaults + service area), with a
  **Replay setup** entry.
- **Engine:** `deriveRates` additionally returns `monthlyOverheadCents` and `targetBillRatePerHour`
  — both derived display figures, recomputed never stored.

## Financial-model interaction (called out per the rules)

Additive **display derivations only**: `monthlyOverheadCents` (§3.2's sanctioned `/12`) and
`targetBillRatePerHour` (`loadedCostPerHour + targetProfitPerHour`). No change to any total,
threshold, EPH, or the target-profit formula; both new figures are `Computed` and not stored. Every
goal input stays captured, so target profit-per-hour remains **derived** (never the prototype's
hardcoded number). No tenant-isolation or tools-suggest surface is touched.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `onboarding`: a guided welcome with skip; service-area capture during onboarding; an expanded,
  grouped derived-number review; the settings surface restyled to the shell.
- `profit-engine`: `deriveRates` also exposes monthly overhead and the target bill-rate per hour as
  derived display figures.

## Impact

- **Code:** `app/(auth)/onboarding/{wizard,page,review/page}.tsx`, `app/_components/derived-rates.tsx`,
  `app/(app)/settings/{page,settings-form}.tsx`; `src/engine/rates.ts` (+2 derived fields) and its
  tests.
- **No touch:** schema/migrations (the `service_area` column already exists; no new inputs),
  `src/db/`, RLS, `src/tools/`, thresholds, the target-profit formula.
- **Consolidation note:** this single change covers both the onboarding and settings surfaces (the
  plan's R3 "revamp-onboarding" + "revamp-settings") because they share the `onboarding` capability
  and the one `DerivedRates` component; splitting them would only add ceremony.

## Non-goals

- Business **branding / logo / letterhead** — deferred to **R7** (prompted just-in-time at the
  first client document), per the plan.
- The **automation / auto-run-rules** settings entry — **R9**.
- No new onboarding inputs beyond service area; no change to the profit formula or thresholds.
