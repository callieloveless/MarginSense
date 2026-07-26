## Context

Onboarding is three profit steps (`wizard.tsx`, one form, a hand-rolled progress bar, neutral
styling) gated behind create-business (name + trade). Service area lives only in Settings. The
Review screen and Settings both render `DerivedRates` — six rates in neutral styling. The engine
(`rates.ts`) already computes `annualBillableHours` (unshown), but neither monthly overhead nor the
"rate an hour must bill" is derived. `saveSettingsFromForm` already reads `serviceArea` (optional),
so capturing it in onboarding needs no action or validation change and no migration (the column
exists).

## Goals / Non-Goals

**Goals:** a guided welcome + skip; service area captured during onboarding; an expanded, grouped,
drillable "Here are your numbers" (adding annual billable hours, monthly overhead, and the bill
rate an hour must fetch); Settings restyled to the shell; the engine exposing the two new derived
display figures.

**Non-Goals:** branding/logo/letterhead (R7), the automation settings entry (R9), any schema change,
any new profit formula or threshold.

## Decisions

- **Two new derived display figures live in the engine** — `monthlyOverheadCents =
  roundHalfUp(annual_overhead / 12)` and `targetBillRatePerHour = loadedCostPerHour +
  targetProfitPerHour` (`Computed`, not-applicable if either input is). *Why in the engine, not the
  UI:* all money math belongs in `src/engine` (§6.8), even display derivations; and the bill rate is
  genuinely load-bearing (it's the per-line green threshold from §3.4a), so it deserves a
  first-class, unit-tested derivation, not an ad-hoc `+` in a component.
- **`DerivedRates` grouped + tokenized:** three sections — *Your capacity · What an hour costs you ·
  Your targets* — each a `Card` of drillable rows (keep the `<details>` inputs drill-down, restyle to
  shell tokens). Target profit/hr and the bill rate are emphasized. One component, reused by Review
  and Settings, so both get the expansion.
- **Welcome + skip as wizard state:** the client wizard gains a `started` gate; the welcome states
  the value and offers *Get started* and *Skip for now* (`useRouter` → `/dashboard`). One component,
  no new route.
- **Service area as a first "Your business" step:** name + trade shown read-only (set at
  create-business), a `serviceArea` input with the jurisdiction hint, prefilled; the three profit
  steps follow. `SteppedProgress` (the R1 primitive) spans the steps.
- **Settings restyle only:** same inputs + advanced defaults + service area on the shell tokens, plus
  a *Replay setup* entry. No behavior change.

## Risks / Trade-offs

- **Step count grows to four** → each step is short (identity is one input + a read-only confirm),
  and the welcome's skip keeps it optional — principle 6 (short onboarding) respected.
- **The bill rate ignores contingency** → it is loaded cost + target (the pricing north-star);
  contingency is an estimate-level reserve, noted in the drill-down, not folded into a per-hour
  constant. An honest simplification that matches the per-line green threshold.
- **Monthly overhead rounding** → `roundHalfUp(annual/12)`; the annual total stays the source of
  truth, monthly rounds only at display.

## Migration Plan

Additive engine fields + a UI restyle; no DB. **Verify:** engine rates tests (the two new figures +
their not-applicable case), `npm run typecheck`, `npx vitest run`, `npm run build`, and a phone-width
walk of welcome → steps → review and Settings. **Rollback:** revert; the two engine fields go unused
and the UI returns to prior styling.

## Open Questions

- Final welcome copy — settle at apply (plain, encouraging).
- Name/trade editable in onboarding vs. read-only confirm — lean read-only (they were set at
  create-business; editing them lives in Settings / branding, R7).
