## Context

`src/profit`'s `buildPortfolio` ranks a business's projects worst-first with "% of your year / % of
your profit goal", but the dashboard has no aggregate headline. The prototype leads with a "This
month" aggregate profit-per-hour + shortfall + plain verdict, and each ranked card shows the job's
own profit-per-hour + signal chip. The aggregate is financial math → it belongs in the engine
(§6.8). This depends on the R1 primitives (card, signal chip, stat row, progress) and reads the same
active-estimate set the dashboard already loads.

## Goals / Non-Goals

**Goals:** an engine portfolio aggregate (profit/hr + shortfall + signal, NA-safe); the dashboard
pulse headline; ranked cards that each carry the job's profit/hr + signal chip.

**Non-Goals:** true calendar-month scoping; the rich job hub (R4); the per-line editor (R5); trend
charts or any new data.

## Decisions

- **Aggregate lives in the engine** (`Σ netProfit / Σ laborHours`, `shortfall = max(0, target −
  aggregate)`, signal on the same thresholds, `Computed` NA on zero hours), consumed by `src/profit`
  and the dashboard. *Why:* math home (§6.8); one thresholds source; NA safety.
- **"Month" = the active priced jobs the dashboard already loads** (`listActiveEstimatesWithLines`);
  no time filter in v1. *Why:* honest and simple with today's data; calendar scoping is a noted
  non-goal. Verdict copy says "across your active jobs", not a literal month claim.
- **Per-card profit/hr reuses the existing job-level absolute signal** (already computed per active
  estimate). *Why:* no new per-job math.
- **Pulse + cards are server-rendered on the R1 primitives**; drill-down via stat rows.
- **Draft/no-estimate jobs are excluded from the aggregate denominator** and rendered calmly (the
  dashboard silently skips unpriced jobs today; now they get a calm card). *Why:* `Computed` NA.
- **Quick capture routes to existing surfaces** — the camera entry opens the R1 job-picker sheet
  and navigates to the chosen job's photo section (today's context-page photos; R6 replaces it
  with the Photos surface at the same destination). *Why:* honors the prototype's promise now with
  zero new capability, gives the R1 sheet a real consumer, and leaves R6 a stable route to grow.

## Risks / Trade-offs

- **Depends on R1 primitives** → sequenced after R1 (plan order R1 → R2); the pulse uses the shared
  card/chip/stat-row rather than bespoke styles.
- **"Month" wording implies a calendar** → copy says "across your active jobs"; calendar scoping is a
  documented non-goal.
- **An aggregate can mask one bad job** → the worst-first cards below the pulse remain the drill-in;
  pulse + ranking are shown together, never the aggregate alone.

## Migration Plan

Additive engine function + dashboard render; no DB. **Verify:** engine unit tests (aggregate,
boundaries, NA), `npm run typecheck`, `npx vitest run`, `npm run build`, and a phone-width dashboard
pass (pulse, cards, empty state). **Rollback:** revert; the dashboard returns to ranking-only.

## Open Questions

- Exact verdict phrasing — settle at apply; keep it plain and encouraging, never "EPH".
