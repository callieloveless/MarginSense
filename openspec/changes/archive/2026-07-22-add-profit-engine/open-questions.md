# Profit model — open questions (unified plan)

> **Purpose.** Lock the profit model once, across all three layers so they don't drift:
> the **constitution** (§3 financial math + §3.2 input model), the **engine proposal**
> ([add-profit-engine](./proposal.md)), and the **UI** you mocked up (onboarding wizard,
> Review screen, estimate/dashboard). Answering this doc produces one coherent spec.
>
> **How to use.** Answer by ID (e.g. "S1: b", "B3: annual"). Each question has a
> **_Default I'd propose_** — reply "defaults" to accept all of them, or override the ones
> you care about. Anything marked **⚖️ amendment** implies editing the constitution in its
> own commit.
>
> **Where the numbers came from.** Your mockups reconcile cleanly. Loaded cost
> `$93.75/hr` = overhead-per-hr `$50` + burdened-owner-labor-per-hr `$43.75`. Overhead on
> the deck `$3,200` = 64 labor hrs × `$50`. Break-even day `$563` = `$93.75 × 6`.
> Gross-profit goal `$165,000` = overhead `$60k` + income `$90k` + profit target `$15k`.
> These reconstructions are the basis for the defaults below — confirm or correct them.

---

## ✅ Resolved — 2026-07-22 (all defaults accepted)

**Every question below is answered by its _Default I'd propose_.** The three changes now
exist: [`add-profit-engine`](./proposal.md) (engine math), `add-onboarding` (wizard +
Review), and `add-estimate-dashboard` (estimate builder + profit dashboard). The
constitution was amended in §2, §3.2–§3.5, §5, and §6.8 to match; `techstack.md` §2/§4 and
`openspec/config.yaml` were synced. Notable specifics:

- **X1 (the one item with no default):** "% of your profit goal" numerator = the job's
  gross-profit contribution `netProfit + overheadAllocated` (= `revenue − directCost −
  contingency`); denominator = the annual **gross-profit goal** `overhead + income +
  profit` = `$165k`. This reconstructs the deck's **10.05%** exactly
  (`$16,576.50 / $165,000`) and reads as "how much of the money I need this year does this
  job deliver."
- **Tools are their own category** (constitution §2, §5): a tool receives a **read-only**
  snapshot and has **no write path** to an estimate or context fact — it only suggests. This
  holds for every tool, including any that revises an estimate.
- **Estimate ≠ profitability in code** (constitution §6.8, techstack §2): the pure engine
  owns the math; `src/estimate/` (editing) and `src/profit/` (signal/dashboard) are separate
  modules that consume it via typed data — connected, never merged.
- **`percentOfProfitGoal` is measured before overhead allocation**, because the gross-profit
  goal is exactly what overhead exists to fund (H4 / X1).

The original questions and their defaults are preserved below for provenance.

---

## Section S — The spine (answer these first; everything hangs on them)

- **S1. The one driving metric.** Your deck is green at 45% net margin vs a 45% target.
  What actually turns an estimate red/yellow/green?
  - (a) **EPH ÷ target profit-per-hour** (constitution's `ratio`)
  - (b) **net margin ÷ target margin**
  - (c) **profit-share ÷ hour-share weight**
  - (d) one drives the *estimate* signal, another drives the *portfolio* signal — specify
  _Default I'd propose:_ (a) for a single estimate (EPH is the spine), (c) for portfolio
  comparison. Margin is shown but not the color trigger. *(was Q3)*

- **S2. Input model — simplified vs rich.** Is the **solo wizard model** (single annual
  overhead, one owner wage + burden %, days × hrs/day) the **canonical v1 model**, with the
  constitution's roles / monthly-categorized-overhead / weekly-capacity model deferred?
  **⚖️ amendment** if yes. *(was Q2)*
  _Default I'd propose:_ Yes — wizard model is canonical for v1; §3.2 amended to match;
  multi-role/crew explicitly "modeled later." Constitution's *mechanism* (hours-based
  overhead recovery, EPH, RYG) is unchanged — only the *inputs* simplify.

- **S3. Scope / how many proposals.** Keep [add-profit-engine](./proposal.md) as the
  **pure engine only** and add separate proposals for onboarding and the estimate/dashboard
  UI? Or fold it all into one? *(was Q1)*
  _Default I'd propose:_ Three changes — `add-profit-engine` (pure, stays as-is),
  `add-onboarding` (wizard + Review), `add-estimate-dashboard`. Engine ships first; UI
  consumes it. Constitution amendment lands before/with the engine change.

- **S4. Terminology.** Does the UI ever say "EPH / Effective Profit per Hour," or is EPH an
  internal engine term while the UI speaks "loaded cost," "net profit," "% of your year"?
  *(was Q8)*
  _Default I'd propose:_ EPH is internal; UI uses plain language. The RYG explain-panel may
  show "profit per hour: $X vs your $Y target."

---

## Section A — Product & constitution (high level)

- **A1. v1 user.** Solo owner-operator GC only for v1 (the wizard assumes one person on the
  tools)? Crews modeled in the schema but not surfaced?
  _Default:_ Solo v1; schema leaves room for roles/crew; UI is single-operator.

- **A2. The two views' relationship.** Confirm the split: **absolute view** = one estimate
  vs the business target (the estimate's own color); **comparative view** = a job's
  profit-share vs hour-share within your book of work (the "against your year" sentence and
  the dashboard ranking). Same thresholds for both?
  _Default:_ Yes to the split; same thresholds. *(feeds S1, E-section, F-section)*

- **A3. What "profitable" is measured against.** Is the business target expressed primarily
  as **target profit-per-hour**, **target margin %**, or both kept and reconciled?
  _Default:_ Both stored; margin is how a job is *priced*, profit-per-hour is how it's
  *judged*. Wizard captures margin (45%) and derives target profit-per-hour (see C5/D4).

---

## Section B — Onboarding input model (§3.2) — confirm each field & unit

The wizard captures these. Confirm the field, the stored unit, and whether it's an input
or derived.

- **B1. Annual overhead.** Stored as a single integer-cents annual figure? **⚖️** (const.
  currently says monthly categorized items).
  _Default:_ Store annual `overhead_cents`; monthly is a display derivation (`/12`).

- **B2. "Break it down by line item."** Optional itemization — is it persisted as
  categorized items (name, amount, category) that **sum to** the annual number, or is only
  the sum stored and the breakdown a throwaway calculator?
  _Default:_ Persist optional items that sum to the total; total is the source of truth for
  math; items are for the user's own recall/editing.

- **B3. Time inputs.** Working days/yr (int) × billable hrs/day → billable hrs/yr. Store the
  two inputs and derive, or store hrs/yr directly? **⚖️** (const. says hrs/week × 4.33 ×
  crew).
  _Default:_ Store `working_days_per_year` + `billable_minutes_per_day`; derive annual
  billable minutes. Amend §3.3 to this basis.

- **B4. Owner wage + burden.** Store `owner_wage_cents_per_hour` (from $35) and
  `labor_burden_bp` (from ~25%)? Burden applied only to owner wage for v1?
  _Default:_ Yes. Burdened labor rate = wage × (1 + burden). Single role for v1.

- **B5. Goals block.** Income goal, profit target, target margin %, default contingency % —
  all inputs (not derived)? Units: cents, cents, bp, bp?
  _Default:_ Yes, all inputs. `income_goal_cents`, `profit_target_cents`,
  `target_margin_bp`, `default_contingency_bp`.

- **B6. Anything missing from the wizard** that the engine needs (e.g. default material/sub
  markup %, tax rate)? The const. §3.2 lists default markup + tax rate; your mockup didn't
  show them.
  _Default:_ Add `default_markup_bp` and `default_tax_rate_bp` as optional settings (not in
  the 3-step wizard; in full settings). Flag if you'd rather the wizard capture markup.

---

## Section C — Derived business rates (§3.3) — confirm formulas

- **C1. Overhead recovery rate.** `= annual overhead ÷ annual billable hours`
  (`$60,000 / 1,200 = $50/hr`). Annual basis (not monthly)? **⚖️**
  _Default:_ Annual basis; amend §3.3 formula from monthly to annual.

- **C2. Burdened labor rate.** `= owner wage × (1 + burden)` (`$35 × 1.25 = $43.75/hr`).
  _Default:_ Confirmed.

- **C3. Loaded cost / hr.** `= overhead recovery rate + burdened labor rate`
  (`$50 + $43.75 = $93.75`). Is "loaded cost" a *display* concept (break-even framing) or
  also a *costing input*? On the estimate, labor and overhead show as **separate** slices —
  so loaded cost is the sum, not a third thing. Confirm.
  _Default:_ Display/break-even concept only; the roll-up keeps labor and overhead separate.

- **C4. Break-even day rate.** `= loaded cost × billable hrs/day` (`$93.75 × 6 = $562.50`,
  shown $563). Rounding for display only?
  _Default:_ Confirmed; round at display.

- **C5. Gross-profit goal.** `= overhead + income goal + profit target`
  (`$60k + $90k + $15k = $165k`). Confirm this definition (owner pay counts toward the
  goal, not toward COGS).
  _Default:_ Confirmed as the annual gross-profit target line on Review.

- **C6. Target profit-per-hour.** Needed for S1(a). Formula from goals?
  - (i) `(income goal + profit target) ÷ billable hrs` = `$105k / 1,200 = $87.50/hr`
  - (ii) `profit target ÷ billable hrs` = `$15k / 1,200 = $12.50/hr`
  - (iii) derived from target margin
  _Default I'd propose:_ (i). It's the "every crew hour must return this much toward pay +
  profit" number and pairs naturally with loaded cost. *(was Q4)*

---

## Section D — Estimate roll-up & pricing (§3.4)

- **D1. Line-item categories.** Confirm the set: labor, material, subcontractor, equipment,
  permit, disposal, other. Your deck groups "subs / equip / permits" for display — grouping
  is UI-only, categories stay granular?
  _Default:_ Keep granular categories; group for display.

- **D2. Contingency — cost or price buffer?** It's a slice of "where the money goes," so it
  reduces net profit. Is it computed as `contingency_bp × direct cost`, or × total, or ×
  (direct + overhead)? On the deck, $778.50 — I couldn't pin the base; tell me. *(was Q6)*
  _Default I'd propose:_ Contingency = `contingency_bp × (directCost + overheadAllocated)`,
  treated as a cost line that reduces net profit. (Confirm the base so I can match $778.50.)

- **D3. Overhead on the estimate.** `overheadAllocated = laborHours × overheadRecoveryRate`
  (`64 × $50 = $3,200`). Confirm this is the only place overhead enters a job.
  _Default:_ Confirmed. *(consistent with const. §3.4)*

- **D4. Pricing direction — the big one.** The deck lands at *exactly* 45% net margin = the
  target. Is price **entered per line and margin computed** (margin is an outcome), or is
  price **derived to hit target margin** (margin is the driver, price is solved)?
  _Default I'd propose:_ Costs are entered; **price is solved to hit target margin** by
  default, but the user can override any line/price, after which margin is recomputed as an
  outcome. (This is why the deck reads 45.0% exactly.) Confirm — this shapes the engine API.

- **D5. Markup vs margin.** If D4 is margin-driven, do per-line material/sub markups still
  exist, or is everything priced by the single target margin?
  _Default:_ Target margin drives job pricing; per-line markup is an optional advanced
  override. Flag if markup should be primary.

- **D6. Net profit definition.** `revenue − directCost − overheadAllocated − contingency`
  (`29,725 − 12,370 − 3,200 − 778.50 ≈ 13,376`). Confirm contingency is subtracted (i.e.
  it's real reserved cost, not phantom).
  _Default:_ Confirmed.

---

## Section E — Red / yellow / green (§3.5)

- **E1. Thresholds.** Keep constitution defaults ≥1.00 green / 0.80–0.99 yellow / <0.80 red,
  configurable per business? Same for absolute (S1) and comparative (A2) views?
  _Default:_ Keep defaults; per-business overridable; same thresholds both views.

- **E2. Estimate signal input.** Given S1, the estimate ratio = `EPH ÷ targetProfitPerHour`.
  With C6(i): deck EPH = `$13,376 / 64 hrs = $209/hr`, target `$87.50` → ratio `2.4` → deep
  green. Does that feel right vs. the mockup's "green"?
  _Default:_ Yes — margin-and-hours-efficient job reads strongly green.

- **E3. Explain panel.** On tap, reveal which inputs? (EPH, target profit/hr, labor hours,
  net profit, and for portfolio: hour-share & profit-share.)
  _Default:_ Show all of the above; every color is drillable (const. §6.6).

---

## Section F — How the parts relate (architecture / the unified plan)

- **F1. Data flow.** Confirm the pipeline:
  `onboarding inputs → stored business settings → engine derives rates (C) → estimate
  line items → engine roll-up (D) → engine signal (E) → dashboard/portfolio (A2)`.
  _Default:_ This is the flow; the **engine is the only place** rates/roll-up/signal are
  computed; DB stores inputs, UI renders engine output.

- **F2. Pure vs impure boundary.** Business settings + estimates are stored in Postgres;
  `src/engine/` takes plain numbers in, returns plain numbers out, imports nothing. Confirm
  nothing derived (loaded cost, EPH, color) is ever persisted — always recomputed.
  _Default:_ Confirmed; persist inputs only, recompute the rest. (Optionally cache for
  dashboards later, never as source of truth.)

- **F3. Sequencing.** Order: (1) **constitution amendment** (§3.2/§3.3 to the wizard
  model), (2) **engine** change updated to match, (3) **onboarding** change, (4)
  **dashboard** change. Agree?
  _Default:_ Yes, in that order.

- **F4. Config home.** Threshold defaults, the target-profit-per-hour formula, contingency
  base, and rounding rules live in one config module (const. §6 / techstack §6 "no magic
  constants"). Confirm one home, e.g. `src/engine/config.ts`.
  _Default:_ Confirmed.

---

## Section G — Implementation details

- **G1. Units per field.** Confirm: all money `*_cents` (int), all time `*_minutes` (int),
  all percentages `*_bp` (int, 1% = 100bp). Labor entered as minutes, displayed as hours.
  _Default:_ Confirmed per const. §3.1 / techstack §3.

- **G2. Rounding.** Rounding only at display; internal math in integer cents/minutes/bp.
  Half-up at display? How to show sub-cent intermediates (overhead $50.00/hr is clean, but
  margin-solving can produce fractions)?
  _Default:_ Integer-cents internally, round half-up at display; solve-for-price rounds the
  final price to whole cents and lets margin absorb the rounding.

- **G3. Engine modules.** `money.ts` (cents/minutes/bp + rounding), `rates.ts` (C: recovery
  rate, burdened rate, loaded cost, break-even, goals, target profit/hr), `estimate.ts`
  (D: roll-up + margin-solve), `signal.ts` (E: ratio, weight, color + explain payload),
  `config.ts` (F4). Agree with this split? *(proposal currently lists money/estimate/
  signal/rates)*
  _Default:_ Add `config.ts`; otherwise as proposed.

- **G4. Edge cases to test.** Zero labor hours (EPH n/a, never divide-by-zero), zero
  revenue, zero overhead, contingency 0%, single-line estimate, threshold boundaries
  (0.79/0.80/0.99/1.00). Any others you want guaranteed?
  _Default:_ Cover all listed; add "negative net profit" (job loses money) → red + explain.

- **G5. Multiple estimate versions.** A project can have v1 / revised / Option A|B (const.
  §2). Does the signal/EPH compute per estimate version independently? Which version feeds
  the portfolio "% of your year"?
  _Default:_ Per version independently; the project's **active/accepted** version feeds the
  portfolio. Confirm which version is "active."

---

## Section H — Constitution amendments implied (checklist)

If defaults are accepted, these are the edits I'd make in one deliberate amendment commit:

- **H1. §3.2 Business settings** — replace the roles/monthly-categorized-overhead/weekly-
  capacity model with the solo wizard model (annual overhead + optional itemization; owner
  wage + burden %; working days/yr × billable hrs/day; income goal, profit target, target
  margin, default contingency). Note multi-role/crew as a future expansion.
- **H2. §3.3 Derived rates** — recovery rate on an **annual** basis; add **loaded cost/hr**,
  **break-even day rate**, **gross-profit goal**, and **target profit-per-hour** with their
  formulas (C1–C6).
- **H3. §3.4 Roll-up** — add **contingency** as a cost line and state the base (D2); add the
  **pricing direction** (margin-solve vs entered price, D4).
- **H4. §3.5 Signal** — clarify the estimate signal uses EPH ÷ target profit-per-hour (S1)
  and the portfolio "% of your year / % of profit goal" is the comparative weight; confirm
  the profit-goal denominator (Q7 below).

---

## Section — remaining loose thread

- **X1. "Against your year" denominators (was Q7).** "This job uses **5.3%** of your year"
  = 64 hrs ÷ 1,200 ✓. "delivers **10.05%** of your profit goal" — I can't cleanly back out
  the denominator. Candidates: annual net-profit target = income + profit = `$105k`
  (→ 12.7%, doesn't match) or something ≈ `$133k` (matches 10.05% but I can't source it).
  **What's the annual "profit goal" number this compares against?** Once I have it, H4 and
  the dashboard sentence are fully specified.
