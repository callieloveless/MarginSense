# MarginSense — Constitution

> The stable core. This file changes rarely. It defines **what MarginSense is**, the
> **domain model**, the **financial math**, and the **non-negotiable rules** every
> feature must respect. When a decision conflicts with this document, this document wins —
> or the document gets amended deliberately, in its own commit.
>
> For *how* we build (frameworks, libraries, file layout, and the spec-driven change
> process), see [`techstack.md`](./techstack.md).

---

## 1. Product vision

MarginSense is a **business operating system for trade contractors** — starting with
general/remodeling contractors, expanding later to electricians, plumbers, HVAC, etc.

It exists because contractors like our first user (John) already run their business
through a chat assistant: they find materials online, photograph a job and ask for
advice, look up code, and write up estimates for clients. Those tasks live in scattered
chat threads with no memory of the job and no connection to whether the work is actually
profitable.

MarginSense turns those tasks into **Tools** that share one memory per job and feed a
**profit engine** that answers the only question that matters:

> **"Is this estimate pulling its weight — does the profit it earns justify the crew
> hours it eats?"** — shown as a plain **red / yellow / green** signal.

### Principles

1. **Hours are the scarce resource, not dollars.** A contractor cannot buy back crew
   time. Every profit judgment is ultimately *profit per labor hour*. This is the spine
   of the product.
2. **Trust through transparency.** Every number can be traced to its inputs. Colors are
   never a black box — the user can always see the math behind red/yellow/green.
3. **Tools suggest; the user decides.** Nothing an AI tool produces mutates the estimate
   or the job record without an explicit human confirmation. (See §5.)
4. **One job, one memory.** All tools working on a job read and write the same shared
   project context. Insight found in one tool is available to all the others.
5. **Phone-first, on the ladder.** The primary user is holding a phone at a job site with
   dirty hands and one bar of signal. Design for that first; desktop is the comfortable
   case, not the design target.
6. **Real money, real customers.** This is not a toy. Financial correctness, tenant data
   isolation, and migration safety are treated as load-bearing from day one.

---

## 2. Domain model

The hierarchy is fixed:

```
Business (tenant)
  └── Project                 → one client job; the unit of shared context
        ├── Shared Context     → facts, findings, materials, code refs, photos
        ├── Conversation       → ONE thread all tools contribute to
        ├── Suggestions        → pending tool output awaiting user confirmation
        └── Estimate(s)        → one or many versions per project
              └── Line Items
```

### Core entities

| Entity | Meaning |
|---|---|
| **Business** | The tenant. Owns all data. Has a trade type and financial settings. |
| **User** | A person who logs in. Belongs to one business. (Solo today; modeled for crews.) |
| **Project** | One client job. The boundary of shared context. Has a client, address, scope, status. |
| **Estimate** | A costed proposal for a project. A project may have **multiple** (v1, revised, Option A/B). |
| **Line Item** | A row in an estimate: labor, material, subcontractor, equipment, permit, disposal, or other. |
| **Context Entry** | A typed fact in the project's shared memory (finding, material, code reference, photo annotation). |
| **Suggestion** | A proposed change (a line item, a fact) emitted by a Tool, `pending` until the user accepts or dismisses it. |
| **Message** | A turn in the single project conversation. |
| **Document** | A generated client-facing artifact (e.g. the Client Estimate PDF). |
| **Tool Run** | An audit record of one tool invocation (inputs, cost, latency). |

### The two layers

MarginSense has an **outer layer** (the app shell / Profit Tracker) and an inner set of
**Tools**. They are different things and must not be conflated:

- **Outer layer (not a Tool):** the Profit Tracker dashboard, business onboarding &
  settings, the projects list, and **creating/editing estimates**. Making a new estimate
  is a first-class app action — it **seeds the shared context** with the job's cost and
  hour data. It is not an AI tool.
- **Tools are their own category (see §5):** the openable, AI-powered workspaces that
  replace the ad-hoc chat tasks. They read the shared context, do focused work, and
  *suggest* changes back. **A Tool is never part of the estimate, the profit signal, or the
  dashboard — it is a distinct thing that sits alongside them and reads them.** New
  capabilities are Tools only when they match this shape; dashboard, onboarding, and
  estimate editing are outer-layer features, not Tools.

### Three concerns, kept apart

Even within the outer layer, three concerns stay conceptually and structurally separate so
they don't drift into one blob (their code separation is a non-negotiable — see §6.8):

1. **The estimate** — the costing instrument: line items, their true costs, editing, and
   versions. This is where the user *builds* a job.
2. **Profitability** — the judgment layer: EPH, the red/yellow/green signal, the
   break-even framing, and the portfolio "against your year" view. This is where the app
   *judges* a job.
3. **Tools** — the AI category above.

The estimate and profitability are **connected but not the same thing**: profitability
reads a finished estimate roll-up and judges it; the estimate does not know or care how it
is judged. All three concerns talk to each other only through the pure **profit engine**
(§3, §6.1) and typed data — never by sharing internals.

---

## 3. The financial model (canonical)

This is the single source of truth for every dollar and hour in the app. The
implementation lives in a **pure, deterministic, unit-tested module** (the *profit
engine*, see §6). No business math may live in UI components or database queries.

### 3.1 Money and time rules

- **Money is stored and computed as integer cents.** Never floating-point dollars.
  Rounding happens only at display.
- **Labor time is stored in minutes** (integer); displayed as hours.
- **Percentages are stored as basis points** (integer, 1% = 100 bp) or as decimals in a
  single documented convention — never as ambiguous "0.15 vs 15".

### 3.2 Business settings (captured in onboarding, editable anytime)

Onboarding is comprehensive because the profit math is only as honest as its inputs. The
**v1 canonical model is the solo owner-operator model** captured by a short wizard: one
person on the tools, a single annual overhead figure, one owner wage, and a small block of
goals. Multi-role crews are a deliberate **future expansion** — the schema leaves room for
them, but v1 does not surface them, and the math below is single-operator. This simplifies
only the *inputs*; the *mechanism* (hours-based overhead recovery, EPH, red/yellow/green)
is unchanged.

All money is stored as integer cents, time as integer minutes, percentages as basis
points (§3.1).

**Identity & trade**
- Business name, trade type, service area, license #.

**Overhead**
- **Annual overhead** (`annual_overhead_cents`) — a single figure for all recurring
  indirect costs that exist whether or not a specific job runs (vehicles, insurance, tools,
  office & admin, marketing, licenses, warranty reserve, etc.). This total is the **source
  of truth** for the math; the monthly figure is a display derivation (`/12`).
- **Optional itemization** — the user may break the annual number down into named items
  (name, amount, category) for their own recall and editing. When present, the items
  **sum to** the annual total; the total, not the breakdown, drives the math.

**Labor (single owner-operator for v1)**
- `owner_wage_cents_per_hour` — the owner's hourly wage on the tools.
- `labor_burden_bp` — payroll taxes, workers' comp, benefits as a percentage of wage. In
  v1 the burden is applied to the owner wage only. The **burdened labor rate** is derived
  (§3.3), never entered directly.

**Time / capacity**
- `working_days_per_year` (integer) and `billable_minutes_per_day` (integer). Annual
  billable time is **derived** from these, not entered directly. Non-billable time
  (driving, quoting, admin) is excluded from billable capacity — counting it is a major
  reason estimates secretly lose money.

**Goals**
- `income_goal_cents` — target owner pay for the year.
- `profit_target_cents` — target business profit for the year, on top of owner pay.
- `target_margin_bp` — the net-margin target a job is *priced* to hit.
- `default_contingency_bp` — the default cost reserve applied to a job (§3.4).

**Optional advanced settings (not in the 3-step wizard; in full settings)**
- `default_markup_bp` — default markup on materials/subs/equipment, when pricing per line
  rather than to target margin.
- `default_tax_rate_bp` — default sales/use tax rate.

> **Future expansion (not v1):** multiple labor roles each with their own burdened cost and
> bill rate, per-role billable capacity, and crew size. The engine and schema are built so
> these can be added without changing the *method*.

### 3.3 Derived business rates

All rates are derived on an **annual** basis from the §3.2 inputs (the monthly figures
some screens show are `/12` display derivations, never a separate source of truth). Example
numbers below use the reference business: $60,000 annual overhead, $35/hr owner wage, 25%
burden, 200 working days × 6 billable hrs/day (1,200 billable hrs/yr), $90k income goal,
$15k profit target.

- `annualBillableHours = working_days_per_year × (billable_minutes_per_day / 60)`
  — e.g. `200 × 6 = 1,200 hrs`.
- **Overhead recovery rate** `= annual_overhead / annualBillableHours` — dollars of
  overhead every billed labor hour must recover, loaded onto jobs proportional to the
  hours they consume. E.g. `$60,000 / 1,200 = $50.00/hr`.
- **Burdened labor rate** `= owner_wage × (1 + labor_burden)` — true cost of an owner hour.
  E.g. `$35 × 1.25 = $43.75/hr`.
- **Loaded cost per hour** `= overhead recovery rate + burdened labor rate` — the total
  cost of putting the owner on the tools for an hour. E.g. `$50 + $43.75 = $93.75/hr`.
  This is a **display / break-even framing only** — on a job, labor and overhead stay
  **separate** cost slices (§3.4); loaded cost is their sum, not a third cost line.
- **Break-even day rate** `= loaded cost per hour × billable hrs/day` — what a day must
  bill just to cover cost. E.g. `$93.75 × 6 = $562.50` (shown ≈ $563; rounding at display
  only).
- **Gross-profit goal** `= annual overhead + income goal + profit target` — the total
  gross profit the year's jobs must throw off to cover overhead, pay the owner, and hit the
  profit target. E.g. `$60k + $90k + $15k = $165,000`. (Owner pay counts toward this goal,
  not toward job COGS.)
- **Target profit per billable hour** `= (income goal + profit target) / annualBillableHours`
  — how much *every* crew hour must return toward pay + profit, above cost. E.g.
  `$105,000 / 1,200 = $87.50/hr`. This is the benchmark the estimate signal is judged
  against (§3.5).

### 3.4 Estimate roll-up

For each **line item**:
- `category ∈ {labor, material, subcontractor, equipment, permit, disposal, other}`. The
  categories stay granular in data; the UI may *group* them for display (e.g. "subs /
  equip / permits"), but grouping is presentation only.
- **Labor lines** carry `laborMinutes` and a role. `laborCost = minutes/60 × burdenedRate`.
- **Non-labor lines** carry `quantity × unitCost`, plus an optional markup.
- `price` = what the client pays for that line.

For the **estimate**:
```
revenue           = Σ line.price
directCost        = Σ line.cost                 (burdened labor + materials + subs + …)
laborHours        = Σ labor line hours
overheadAllocated = laborHours × overheadRecoveryRate    (the only place overhead enters a job)
contingency       = default_contingency_bp × (directCost + overheadAllocated)
netProfit         = revenue − directCost − overheadAllocated − contingency
grossMargin       = (revenue − directCost) / revenue
netMargin         = netProfit / revenue
```

**Contingency is a real reserved cost, not a phantom.** It is a slice of "where the money
goes" and therefore reduces net profit. Its base is `directCost + overheadAllocated` (the
job's full internal cost before profit). E.g. a 5% contingency on `$12,370 + $3,200 =
$15,570` is `$778.50`.

**Pricing direction — costs in, price solved to target margin.** By default the user enters
*costs*, and the engine **solves each line's `price` so the estimate hits `target_margin_bp`**;
margin is the driver, price is the outcome. The user may **override** any line or the total
price, after which `netMargin` is recomputed as an outcome rather than solved. When solving,
the final price is rounded to whole cents and margin absorbs the rounding. (Per-line
`default_markup_bp` is an optional advanced path when a user prices a line by markup instead
of by the single target margin.)

The crown-jewel metric:
```
Effective Profit per Hour (EPH) = netProfit / laborHours
```
EPH is what the whole product is oriented around. It answers: *for every hour of my
crew's life this job consumes, how much profit is left after everything?* EPH is an
**internal engine term** — the UI speaks plain language ("profit per hour: $X vs your $Y
target," "loaded cost," "% of your year") rather than the acronym.

### 3.5 "Pull-their-weight" — the red/yellow/green signal

There are two complementary views. Both use the same thresholds.

**A. Absolute view — a single estimate vs the business target.** This drives an
individual estimate's color:
```
ratio = EPH / targetProfitPerHour
```
E.g. an estimate with `$13,376.50` net profit over `64` labor hours has `EPH ≈ $209/hr`;
against a `$87.50/hr` target, `ratio ≈ 2.4` → deep green.

**B. Comparative view — a job's fair share within your book of work.** This drives the
portfolio ranking and the "against your year" sentence on a job. The generic form is
hour-share vs profit-share:
```
hourShare_i   = hours_i   / totalHours
profitShare_i = profit_i  / totalProfit
weight_i      = profitShare_i / hourShare_i
```
`weight ≥ 1` means the job returns at least its fair share of profit for the hours it eats.

Two portfolio figures make this concrete against the year's plan (§3.3):
```
percentOfYear       = laborHours / annualBillableHours
jobProfitContribution = netProfit + overheadAllocated      (= revenue − directCost − contingency)
percentOfProfitGoal = jobProfitContribution / grossProfitGoal
```
`percentOfYear` says how much of the year's billable capacity a job consumes (e.g. `64 /
1,200 = 5.3%`). `percentOfProfitGoal` says how much of the year's **gross-profit goal**
(§3.3) that same job delivers — measured by its contribution *before* overhead allocation,
because overhead is exactly what the goal exists to fund (e.g. `$16,576.50 / $165,000 =
10.05%`). A job pulls its weight when the profit share it delivers meets or beats the hour
share it costs.

**Thresholds (defaults — configurable per business):**

| Color | Meaning | Rule (`ratio` in view A, `weight` in view B) |
|---|---|---|
| 🟢 Green | Pulling its weight or better | `≥ 1.00` |
| 🟡 Yellow | Marginal — watch it | `0.80 – 0.99` |
| 🔴 Red | Losing you money on time | `< 0.80` |

Rationale for 0.80: below it, an estimate is earning less than 80% of your target return
on the hours it consumes — a clear signal to reprice, rescope, or walk. These numbers are
**defaults**, stored per business, and adjustable in settings; the *method* is fixed by
this constitution, the *numbers* are not.

**Every color must be explainable.** Tapping a signal reveals the EPH, the target, the
hour share, and the profit share that produced it.

---

## 4. Shared project context ("one job, one memory")

Every project has a shared context that all tools read from and write to. It has three
parts:

1. **Context entries** — typed, structured facts:
   - `finding` — a diagnosis/observation (usually from Photo Advisor)
   - `material` — a product found, with price, unit, supplier, source URL
   - `code_ref` — a relevant local building-code citation
   - `photo` — an image plus its AI annotations
   - `fact` — a plain job fact (dimensions, access notes, client preference)
2. **Conversation** — a **single** thread. All tools contribute to and read from the same
   conversation; there are not separate chat histories per tool. A tool's output is
   posted into this one thread, attributed to that tool.
3. **Suggestions** — the queue of proposed changes awaiting confirmation (see §5).

**Context flows one way into estimates by default.** Creating an estimate seeds cost/hour
data. Tools may *suggest* line items or facts, but the estimate is only mutated when the
user accepts a suggestion.

---

## 5. The Tool system

Tools are the openable, focused, AI-powered workspaces that replace John's scattered
chat tasks. They are a **distinct category** (§2): a Tool is never part of an estimate,
the profit signal, or the dashboard — it reads them and proposes changes back. Tools are
governed by three rules:

1. **Tools read the estimate; they can never write to it.** A tool receives a
   **read-only** snapshot of the shared context and estimate. It has no write path to an
   estimate or a context fact — anything it wants to change is emitted as a `Suggestion`
   (`pending`) into the Suggestions queue, and the estimate/context changes **only** when
   the user accepts. This is structural, not a convention: the tool interface (§techstack)
   hands tools read-only data and accepts only suggestions back, so "a tool wrote to the
   estimate" is not a state the code can reach. Dismissed suggestions are remembered so
   they don't nag. This holds for **every** tool — including any that revises an estimate:
   it reads the current estimate and proposes the revision; the user commits it.
2. **Tools share one context and one conversation.** A tool reads the whole project
   context on open and posts its results into the single project conversation.
3. **Some tools auto-trigger off events, but still only suggest.** Example: uploading a
   photo emits an event; the Code Finder may **run automatically** to surface relevant
   local codes — but its output is still a suggestion, not a committed change.

### v1 Tools

| Tool | Does | Emits (as suggestions) | Auto-trigger? |
|---|---|---|---|
| **Material Finder** | Web-searches for materials, current prices, suppliers. | `material` entries; material line items | No |
| **Photo Advisor** | Vision on job photos: diagnoses issues, gives advice. | `finding` entries; candidate line items | No |
| **Code Finder** | Surfaces relevant **local** building codes for the job/photo/location. | `code_ref` entries; compliance notes | **Yes** — on photo upload |
| **Client Estimate Doc** | Turns a finished estimate into a clean, client-facing document. | A `document` (PDF/shareable) | No |

Note: **the internal estimate and the client-facing estimate document are different
things.** The internal estimate is the costing/profit instrument (with your true costs,
overhead, EPH, and colors — never shown to the client). The Client Estimate Doc is a
separate output tool that produces the polished proposal the client sees.

The tool set is designed to grow (invoicing, scheduling, change orders, etc.). New tools
must obey the three rules above and speak the shared-context vocabulary.

### Tool safety (see also §7)
Because the product will expand to electrical/plumbing, any tool giving physical-work
advice (Photo Advisor, Code Finder) must include a clear disclaimer that MarginSense is
not a substitute for a licensed professional's judgment or an authoritative code
inspection, and must not present code lookups as legally authoritative.

---

## 6. Engineering non-negotiables

These are constitutional. Violating them is a bug, not a style choice.

1. **The profit engine is pure and tested.** All financial math lives in one deterministic
   module with no I/O, no framework imports, and thorough unit tests covering rounding,
   zero-hour estimates, and the color thresholds. UI and DB code call it; they never
   re-implement it.
2. **Money as integer cents, time as integer minutes.** No floats for money. Ever.
3. **Multi-tenant isolation is enforced at the database, not just the UI.** Every
   business-owned row carries `business_id`, and row-level security guarantees one tenant
   can never read or write another's data. A missing tenant filter is a security incident.
4. **Migrations are versioned and forward-only in production.** Schema changes ship as
   reviewed migration files. Real customer data is never at the mercy of an ad-hoc
   schema edit.
5. **Tools suggest, users confirm.** No code path lets an AI tool mutate an estimate or
   commit a context fact without explicit user acceptance.
6. **Every displayed number is traceable.** No magic totals; a user can always drill into
   the inputs of any figure or color.
7. **Non-trivial change is specified before it is built.** Every feature or behavior
   change of consequence begins as a written **change proposal** — the problem, the
   requirements expressed as testable scenarios, and the implementation tasks — reviewed
   before code is written and folded back into the living specs after. The financial
   model, tenant isolation, and the tool contract are exactly the kind of load-bearing
   behavior that must never drift through ad-hoc edits. The *principle* (spec before code,
   specs as the durable record of intent) is fixed here; the *mechanism* — OpenSpec, its
   directory layout and commands — is defined in [`techstack.md`](./techstack.md) and may
   change without amending this constitution.
8. **The estimate, profitability, and Tools are separate modules.** The pure engine (§6.1)
   owns the math; **estimate editing** (building/storing line items and versions) and
   **profit signaling** (EPH, colors, dashboard, portfolio) live in *different* modules
   that both consume the engine through typed data — they are connected, never merged into
   one blob. **Tools** are a third, distinct module that reads context/estimate read-only
   and returns suggestions (§5). No module reaches into another's internals; the engine is
   the shared vocabulary. The concrete directory layout is in
   [`techstack.md`](./techstack.md) §2.

---

## 7. Security, privacy & trust

- **Tenant isolation** is the top security priority (see §6.3). Test it explicitly.
- **Auth**: users authenticate via a managed auth provider; sessions are scoped to one
  business.
- **Client data is sensitive.** Addresses, photos of people's homes, and pricing are
  confidential. Storage is access-controlled per tenant; generated documents are shared
  only through deliberate, user-initiated actions.
- **AI honesty & liability.** AI output is assistive, not authoritative. Physical-work and
  code advice carries a licensed-professional disclaimer. The app never fabricates a price
  or a code citation it cannot source.
- **Cost transparency to us.** Tool runs are logged (tokens, latency) so AI spend is
  observable per tenant as the product scales.

---

## 8. Amending this document

This constitution is meant to be stable. Change it deliberately: a single, well-described
commit that states what changed and why. Feature work references this document; it does
not quietly outgrow it.

The relationship to the spec process (§6.7) is deliberate: **feature specs live in
OpenSpec (`openspec/`) and change often; this constitution holds the rules those specs
must respect and changes rarely.** A change proposal that would violate a rule here is not
a license to break the rule — it is a prompt to amend the constitution first, in its own
commit, or to reconsider the change.
