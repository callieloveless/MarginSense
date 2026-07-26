# MarginSense — Progress & Roadmap

> Working tracker: what is **done**, what is **in flight**, and what comes **next**.
> The foundation (§ below) is derived from [`constitution.md`](./constitution.md); the
> **UI Revamp** (the current body of work) is derived from the interactive UI prototype —
> *the prototype is the behavior spec* — reconciled against the constitution, which still
> wins where they disagree. Specs are the source of truth ([`openspec/`](./openspec/));
> this file is the at-a-glance view.

**Last updated:** 2026-07-25

---

## Status at a glance

### Foundation — changes #1–#10 ✅ complete

The domain spine, profit engine, tenancy/RLS, the four v1 tools, and the client document all
exist, are unit-tested (~306 tests), and typecheck + build green. This is the ground the
revamp stands on — **the revamp reshapes and extends these, it does not rebuild them.**

| # | Change | Capability | Status |
|---|--------|-----------|--------|
| 1 | `add-profit-engine` | `profit-engine` | ✅ archived 2026-07-22 |
| 2 | `add-tenancy-foundation` | `tenancy-foundation` | ✅ archived 2026-07-22 |
| 3 | `add-onboarding` | `onboarding` | ✅ archived 2026-07-22 |
| 4 | `add-estimate-dashboard` | `estimates`, `profit-dashboard` | ✅ archived 2026-07-22 |
| 5 | `add-project-context` | `project-context` | ✅ archived 2026-07-22 |
| 6–9 | tool platform + Material Finder + Photo Advisor + Code Finder (+ compose) | `tool-platform`, `material-finder`, `job-photos`, `photo-advisor`, `code-finder` | ✅ archived 2026-07-23/24 |
| 10 | `add-client-document`, `add-client-estimate-doc` | `client-document`, `client-estimate-doc` | ✅ archived 2026-07-25 |

> Live Supabase **exists** (migrations `0000`–`0008` applied 2026-07-24; `0009` pending).
> What's deferred is *proving* it end-to-end (RLS/object isolation, the share-token fn) and
> live-AI proofs. See [`relevant_notes.md`](./relevant_notes.md). **The revamp applies each
> new migration and proves isolation per phase — it does not re-defer everything to R10.**

### UI Revamp — replaces the old "#11 hardening" ⏳ planned (this document)

**Core revamp — each main tool is its own feature:**

| Phase | Name | OpenSpec change(s) | Financial model / schema |
|---|---|---|---|
| **R1** | App shell, navigation & design system | `revamp-app-shell` | — |
| **R2** | Estimate pricing & signal core + dashboard home | `add-per-line-pricing-signal`, `add-portfolio-pulse` | **§3 amendment** (per-line pricing) |
| **R3** | Onboarding + settings reshape | `revamp-onboarding` | — |
| **R4** | Project lifecycle: setup wizard + rich job hub | `revamp-project-setup`, `revamp-project-hub` | schema (project fields) |
| **R5** | Estimate editor: per-line chips + traceable roll-up | `revamp-estimate-editor` | — (consumes R2) |
| **R6** | **Photo Advisor** — gallery/captions, per-photo saved read, confirm/dismiss | `revamp-photo-advisor` | — |
| **R7** | **Material Finder** — running per-job list, search, add-as-suggestion | `revamp-material-finder` | — |
| **R8** | **Code & Permits** — code finder reshape + permits/inspections | `add-code-permits` | schema (permits) |
| **R9** | **Client document** — branding · tiers · templates/tones · send | `add-business-branding`, `add-document-tiers`, `revamp-client-estimate-doc` | schema (branding, doc payload) |
| **R10** | Hardening & launch | `harden-and-launch` | — |

**Later features** — valuable, but parked *after* the core revamp (not sequenced into R1–R10):

| Feature | Name | OpenSpec change(s) | Schema |
|---|---|---|---|
| **L1** | One memory: activity-feed deepening + **client answers** (Q&A log) | `add-activity-feed`, `add-client-answers` | schema (Q&A) |
| **L2** | Composition: **auto-run rules** + **"the chain"** (provenance/replay) | `add-autorun-rules`, `add-tool-chain` | schema (rules, provenance) |
| **L3** | Tool-graph editor (meta) — the visual node/edge canvas | — | 🌟 north-star |

Legend: ✅ done · 🔨 in progress · 📝 proposal written, not started · ⏳ planned · 🌟 north-star, later

> **Every change runs the full OpenSpec pipeline:** `/opsx:propose` → `openspec validate <id>
> --strict` → **STOP, show Callie, wait for explicit approval** → `/opsx:apply` → verify
> (`npm run typecheck`, `npx vitest run`, `npm run build`, + apply migration & prove isolation
> where the live project is reachable) → `/code-review`, fix findings → `/opsx:archive` on its
> own commit → `git push`. No `src/`/`app/`/migration code is touched before the change's
> proposal is approved. **Big changes stage A/B** like the foundation did (engine+tests, then
> UI). A phase is "done" only when its last change is archived, reviewed, and pushed.

**Decisions locked (2026-07-25):** ①per-line = **Option A** (own price per line, proportional
allocation as the fallback) + **§3 amendment**; ②onboarding keeps all goal inputs so target/hr
stays derived; ③Good·Better·Best from real **scope** options; ④auto-runs stay **synchronous**
(analyzing-state + 3-step cap) for v1, background queue deferred to R10; ⑤~10 phases.

---

## The revamp, in one paragraph

The app's *capabilities* are largely built; the prototype asks for a different **shape and
depth of use**: a dashboard-first home with a plain-language month signal, a rich per-job hub
that composes pieces we scatter across sub-pages, **per-line red/yellow/green** so a contractor
sees which lines drag a job down, guided friendly flows, and three tools grown into real
working surfaces (a per-job material list, per-photo saved reads, code **and** permits). Then
the connective tissue the prototype makes visible: one activity feed per job, a client-answers
log, user-toggleable auto-run rules, and "the chain" that shows how a photo became money. Almost
none of this is a rebuild — it's reshaping real screens and adding a small number of
**money-critical engine** and **schema** capabilities, each specced first.

### Reshape vs new (from the current-state audit)

**Mostly reshape (behavior already real):** the 3-tab nav (add active state, rename
Projects→Jobs), onboarding's guided feel (the 3 profit steps + review already exist), the
estimate roll-up's drillable "why", suggestion accept/dismiss with before→after profit/hr,
the context feed + single conversation, photo capture/gallery, Material/Code/Photo tool runs,
the client-doc generate/edit/share/revoke + public prices-only page, Settings' full inputs.

**Genuinely new:** per-line pricing + per-line profit/hr signal (engine + §3); the dashboard
**month pulse** (aggregate profit/hr + shortfall); business **branding/letterhead** (logo in
Storage + fields); project setup fields (type, crew, start window); **Good·Better·Best tiers** +
templates/tones + real **send** options; **permits & inspections**; **client answers**;
user-configurable **auto-run rules** + **the chain** (provenance).

---

## Cross-cutting design principles (the durable output of the critique)

These bind every phase. They are as load-bearing as the phase list.

1. **Server-first, client islands.** The prototype is a single client-side SPA; the app stays
   server-rendered with *small* client islands (toggles, sheets, editors, tool forms). Do **not**
   SPA-ify the app to match the mock (techstack §6).
2. **Engine owns all money math.** Per-line pricing, per-line signal, and the portfolio pulse
   live in `src/engine`/`src/profit`; UI only renders. Module boundaries (§6.8) preserved.
3. **Signals are constructive, never just a verdict.** Every red/yellow pairs with a next step
   ("reprice this line", "cut hours", "rescope") and a one-tap "why". Color always with text.
4. **Three levels of one metric, kept distinct.** Portfolio ("your month") vs job ("this job")
   vs line ("this line") profit/hour get distinct framing so they never blur — and per-line
   color avoids a *sea of red*: surface the worst 1–2 draggers, keep the rest quiet.
5. **Chips & defaults over typing.** Phone-first, dirty hands: pickers, chips, prefilled
   defaults, pull-from-prior. Free text only where unavoidable.
6. **Just-in-time setup, short onboarding.** Only what's needed to compute a signal is required
   up front; heavier setup (branding/letterhead) is prompted *when first needed* (first client
   doc), exactly as the prototype does — not front-loaded.
7. **Minimize new tables.** Prefer a column or a context-entry kind over a new table unless the
   data has its own lifecycle: permits, client-Q&A, auto-run-rules → tables; branding → 1:1
   settings columns; provenance → a link on `tool_runs`. Each new table still gets `business_id`
   + RLS + an isolation test in the same migration.
8. **Provenance kept minimal.** "The chain" reconstructs from links that mostly exist already
   (`tool_runs.source`, `toolRunId` on suggestions/messages) + **one** trigger link — not a
   general provenance graph.
9. **Low-connectivity posture.** Capture (photos, notes) queues/works offline; reads are cached;
   AI tools clearly state they need connectivity. Full offline is post-v1 (constitution
   principle 5: a phone at a job site with one bar).
10. **Trades stay data-driven.** Job types, trades, and jurisdictions are data, not code, so the
    electrical/plumbing expansion needs no rearchitecture.
11. **Prove isolation per phase.** Apply each new migration to the live project and prove
    RLS/object isolation as the phase lands (live DB exists); don't grow an unvalidated pile.
12. **No dead buttons, no mock data.** Anything visible must be real or honestly labeled
    ("Copy link / Print PDF" if a send provider isn't wired). The prototype is the behavior spec.

---

## Phase detail

Per-phase **Definition of Done** = the pipeline above + engine math and its tests land before
dependent UI/DB + isolation test per new table + colors paired with text + phone-width first.

### R1 — App shell, navigation & design system
Establish the prototype's calm look and the frame every screen sits in: active-state bottom tabs
(Dashboard · **Jobs** · Settings, `aria-current`), paper/green theme tokens + signal palette as
shared tokens, shared primitives (section header, card, signal chip extending `SignalBadge`,
stat row, stepped progress, **bottom sheet**), teaching empty states. Reorganize routes into the
shell **without** changing behavior — R1 owns the *frame/tokens/primitives*, each later phase
owns its *screen content* (no double-restyle). Keep the responsive `max-w-md` column — do **not**
hardcode the prototype's literal device frame (that's mock scaffolding; the app is a PWA).
- **Change:** `revamp-app-shell`. **Constitution:** none.

### R2 — Estimate pricing & signal core + dashboard home  ⚠ money-critical
**`add-per-line-pricing-signal`** (engine; §3 amendment). **Option A:** each line can carry its
**own price** (`line_items.priceCents`, reserved today); when a line's price is unset the engine
**derives a baseline from the proportional-to-cost allocation already in `client-projection.ts`**
(so legacy/unedited estimates still render, and there is one allocation method in the codebase).
Baselines are **derived, never persisted** — only user-entered prices are stored, so cost changes
keep re-solving; an entered line price supersedes a total override; the estimate total is the sum
of effective line prices; margin is the outcome. Per-line profit/hr is then meaningful and **labor-only**:
```
lineProfitPerHour = ( linePrice − hours×burdenedRate − hours×overheadRecovery − contingencyShare ) / hours
color: ratio = lineProfitPerHour / targetProfitPerHour   (≥1 green · 0.80–0.99 yellow · <0.80 red)
```
Non-labor lines carry no hours → no per-hour signal (as the prototype shows). **Invariant tested:**
per-line nets sum to the estimate net. Also updates `client-projection.ts` to *use a line's price
when present, else allocate* — which **simplifies** the client doc downstream. Exhaustive tests:
zero-hour line, unpriced/legacy line (fallback), override estimate, boundaries 0.79/0.80/0.99/1.00,
negative line net. *Why A won:* it's the only model that carries information (a single global price
makes every labor line the same color — proven degenerate), it handles legacy via the fallback,
it simplifies the client doc, and it gives Good·Better·Best a natural home.

**`add-portfolio-pulse`** (`src/profit` summing engine outputs — engine stays pure) **+ dashboard
home reshape.** `aggregateProfitPerHour = Σ netProfit / Σ laborHours` over active jobs;
`shortfallPerHour = max(0, target − aggregate)`; signal + plain verdict. Reshapes the dashboard
into the prototype's home: the "This month" headline card (profit/hr, verdict, progress,
drill-down to net/hours/target/shortfall) + worst-first job cards with per-job profit/hr + signal
chip + note. Draft/no-estimate jobs render calmly as `Computed` NA.
- **Constitution.** **Amend §3** (its own commit) to define the per-line view (labor-only, own
  price with allocation fallback, same thresholds, nets sum to estimate net) and per-line pricing
  as an allowed pricing direction alongside the global solve. Keep `targetProfitPerHour` derived
  (never the prototype's hardcoded 92). **Non-goal:** true calendar-month scoping (v1 = active jobs).

### R3 — Onboarding + settings reshape
`revamp-onboarding` — welcome + "Skip for now", the guided profit setup (already **Overhead →
Time & pay → Goals** in code; keep *all* goal inputs so target/hr stays derived) with friendlier
copy/progress + the "Here are your numbers" review, and fold **identity** (name/trade/service
area) into the flow. **Onboarding stays short** — branding/logo is *not* here (moved to **R9**,
prompted at first client doc). `revamp-settings` (folded into `revamp-onboarding`) — the "Your
numbers" playback (exists) + "Replay setup" (automation entry → **L2**, letterhead → **R9**).
- **Constitution.** No amendment (reconcile, don't diverge): keep §3.2 inputs, derive target/hr.

### R4 — Project lifecycle: setup wizard + rich job hub
`revamp-project-setup` (📝 proposed) — the 2-step new-job wizard: *Who & where* (client,
address→jurisdiction, job-type chips, scope) and *Money & schedule* (target margin, contingency,
crew, start window, an **informational** auto-run panel — only what runs today, no rules-screen
link). Adds nullable `projects.job_type`, `crew_size`, `start_window`, **`default_target_margin_bp`,
`default_contingency_bp`**; those margin/contingency defaults **seed a new estimate** when it's
created (a **seed, not a link** — editing a default never mutates an existing estimate; falls back
to the business default). `revamp-project-hub` — replaces the thin 3-link page with the prototype
hub: profit-per-hour hero (→ estimate), tools grid with live badges (only for what exists), a
**"Waiting on you"** queue (reusing the built before→after preview), and the **basic job activity
feed** (real events only). Migration + isolation test. *(The chain teaser + auto-run rules are
**L2**; client-answers deepening is **L1** — not R4.)*
- **Constitution.** Per-job margin/contingency is consistent with §3.4 (a default that seeds; the
  estimate stays the source of truth for its own value).

### R5 — Estimate editor: per-line chips + traceable roll-up
Wire R2 into the editor: "v_ · Active" + the "private, never the client's" note; the profit hero
with the **existing** drillable roll-up; **per-line editing incl. an optional own price**, each
labor line showing its own signal with a plain note + **a constructive nudge** ("reprice — well
under target"); calm treatment (surface the worst draggers, quiet the rest); price/your-profit
summary; "Turn into the client estimate." Non-labor lines legibly show *no* per-hour signal.
- **Change:** `revamp-estimate-editor`. **Constitution.** Traceability extends to per-line inputs.

### R6 — Photo Advisor (its own feature)
`revamp-photo-advisor` — gallery/camera import, captions, per-photo **tags** (to review / reviewed /
no action), the analyzing state, and the photo-detail **single saved-recommendation reveal** +
confirm/dismiss + standing disclaimer. Reshape of the built 8a/8b to the prototype's per-photo
saved-read model.
- **Constitution.** Tools suggest → user confirms; Photo Advisor never prices; disclaimer (§5,§7).

### R7 — Material Finder (its own feature)
`revamp-material-finder` — a **running per-job material list** ("On this job", from `material`
context entries) distinct from estimate suggestions; results with "Suggest for this job"; a
subtotal; "View estimate" (no double-write when also adding to an estimate). Reshape of 7b to the
list-first model.
- **Constitution.** Tools suggest → user confirms; an option without a `sourceUrl` never becomes a
  suggestion (§7).

### R8 — Code & Permits (its own feature)
`add-code-permits` — Code Finder reshape (per-code "priced-in / not in estimate / not triggered"
status, cited sources, suggested chips) **+ a `project_permits` table** (name, dates, status, fee;
total) — permits scoped to what feeds the estimate + a simple status, **not** a scheduler.
- **Schema.** New business-owned `project_permits` table: non-null `business_id` + RLS + isolation
  test in the same migration. **Constitution.** Codes framed as job cost/hours; disclaimer (§5,§7);
  never authoritative.

### R9 — Client document: branding · tiers · templates/tones · send
`add-business-branding` — the **just-in-time** letterhead setup (logo in a private Storage bucket
mirroring `job-photos`: tenant-prefixed key, object policy, signed URLs; + license/phone/email/
address/trade-shown/default-terms as 1:1 settings columns), prompted at the first client doc and
editable from Settings. `add-document-tiers` — extend `clientDocumentSchema` for **Good·Better·Best**
tiers (`{name, priceCents, description}`), still `.strict()`, still prices-only, still
self-consistent; tiers derived from real **scope** option sets (not markups). `revamp-client-estimate-doc`
— the setup (template picker incl. tiers, tone chips, prompt chips, guardrail, generating state) →
proposal preview (letterhead, tone-varied narrative, lines **or** tier cards, terms) → **real send**
(link / email / text / download, or honestly-labeled copy-link/print-PDF). Fixes the **dead "Client
Estimate Doc" card** on the Tools page.
- **Constitution.** Document stays prices-only (§5) — tiers don't weaken `.strict()`; owner reviews
  the draft before share (the free-text guard).

### R10 — Hardening & launch
Money-critical e2e (onboarding → estimate → per-line + portfolio signal → accept a suggestion →
generate/share the client doc), tenant-isolation audit **extended to every new table** via
`test:rls`, accessibility pass (color+text, `aria-current`, ≥44px targets), AI cost-observability
review, Vercel + production Supabase, and the remaining deferred live-infra / live-AI proofs walked
end-to-end.
- **Change:** `harden-and-launch`.

---

## Later features — parked after the core revamp

Real and valuable, but deliberately **outside** the R1–R10 core: they layer onto the finished
tools and can be picked up once the core ships. Each still runs the full OpenSpec pipeline. Moved
here (from the old R8/R9) so the core revamp stays a tight, tool-by-tool line.

### L1 — One memory: activity-feed deepening + client answers (Q&A)
`add-activity-feed` — the calm per-job timeline every tool posts into (the single conversation +
typed entries already exist; **R4's hub shows the basic feed** — this deepens it). `add-client-answers`
— a searchable Q&A log (`client_qa` table: question, answer?, status answered/waiting, impact?,
timestamps) so "a decision never lives in your texts", captured low-friction from the conversation.
Migration + isolation test.
- **Constitution.** Client answers are shared-context job facts (§4); a preference that locks a line
  is still committed only by the user.

### L2 — Composition: auto-run rules + "the chain"
`add-autorun-rules` — a persisted `autorun_rules` config (per business/project) with toggles +
guardrail copy; **each rule mapped to its real mechanism** — trigger / compose-edge / dashboard
behavior / pre-send validation — and only genuinely-optional automations get a toggle. The
`photo-advisor → code-finder` edge is **already live** — this *governs* composition, doesn't switch
it on. `add-tool-chain` — a **minimal** provenance link (`tool_runs.triggered_by_run_id` + the
existing source/`toolRunId` links) to reconstruct + render "the chain" and each step's figure.
- **Constitution.** Read-only snapshot in, **pending** suggestions out; the chain **stops after 3
  auto steps** (`MAX_TOOL_STEPS`); nothing writes/spends without a Confirm. Includes the
  compose-latency + AI-cost review (a background queue if phone fan-out proves rough).

### L3 — Tool-graph editor (meta) 🌟 north-star
The visual canvas where tools are nodes and connections are edges. L2's governed composition +
minimal provenance is the stepping-stone. Changes none of the tool rules (read-only snapshot in,
suggestions out).

---

## Self-critique

### Round 1 — initial draft (structure/ordering/method)
1. **Per-line method was degenerate** → pinned the real method + made it a §3 amendment (see R2).
2. **Target/hr must stay derived** (prototype hardcodes 92) → kept derived, called out.
3. **Onboarding looked like a conflict; it isn't** → reshape, not amendment (R3).
4. **Don't hardcode the phone frame** → responsive column + tokens (R1).
5. **Double-restyle risk** → R1 owns frame only; screens owned by their phase.
6. **Composition mis-scoped as "activate from zero"** → `photo→code` is live; R9 governs it.
7. **"Auto-run rules" conflates 4 mechanisms** → map each rule to its mechanism (R9).
8. **Draft/no-estimate jobs** → render as `Computed` NA (R2/R4).
9. **Dead buttons forbidden** → fix the dead doc card; real/labeled send (R7).
10. **New-data homes vague** → each phase states a leaning (principle 7).
11. **Ordering** → engine before its consumers; branding before the doc; tools before the chain.

### Round 2 — the 5-lens critique (feasibility · UI/UX · CX · contracting-fit · architecture)
1. **Per-line pricing ripples past R2 (architecture/feasibility).** It changes the estimate model,
   which R5 and R7 consume. *Revised:* treated as the foundational engine change it is; R5/R7
   depend on it explicitly; the **allocation-fallback** means legacy/unedited estimates keep
   working (no destructive data migration).
2. **Per-line pricing actually *simplifies* the client doc (architecture).** The projection's job
   is splitting a global total into line prices — if lines already have prices, that mostly
   disappears, and Good·Better·Best gets a clean home. *Revised:* R2 updates `client-projection`
   to prefer line price else allocate; noted as a win for Option A.
3. **Branding-in-onboarding hurts time-to-value (UX/CX).** The prototype prompts letterhead
   just-in-time at the first client doc; front-loading it lengthens the highest-abandonment flow.
   *Revised:* branding **moved R3 → R7** (JIT + editable in Settings); onboarding stays short
   (principle 6).
4. **Three profit numbers can blur; per-line risks a "sea of red" (UI/UX/CX).** *Revised:*
   principle 4 (distinct framing per level; surface worst draggers, quiet the rest) + principle 3
   (every signal carries a constructive next step), wired into R2/R5.
5. **Signals must be constructive, not judgmental (CX/trust).** A red bid without "what to do"
   erodes trust. *Revised:* principle 3; the "why" drill-down is one tap from any signal.
6. **Live infra already exists — stop deferring everything (feasibility).** *Revised:* principle 11
   (apply migrations + prove isolation per phase); R10 shrinks to true launch items.
7. **New-table proliferation (architecture).** 5 candidate tables. *Revised:* principle 7 — branding
   → settings columns; provenance → a `tool_runs` link; only lifecycle data (permits, Q&A, rules)
   becomes a table.
8. **Provenance risks over-modeling (architecture).** *Revised:* principle 8 — one trigger link +
   existing links, not a provenance graph.
9. **Chips-over-typing + low-connectivity for a job-site tool (CX/contracting-fit).** *Revised:*
   principles 5 and 9.
10. **Scope creep in permits toward project-management (contracting-fit).** *Revised:* R6 scopes
    permits to estimate-feeding cost + simple status, explicitly not a scheduler.
11. **Trades beyond GC (contracting-fit).** *Revised:* principle 10 — job types/trades/jurisdictions
    stay data-driven so expansion needs no rearchitecture. Change-orders/invoicing noted
    out-of-scope-but-anticipated; the per-line model leaves room.
12. **Server-first discipline vs an SPA prototype (architecture).** *Revised:* principle 1.

**Residual risks tracked to their phase:** contingency-share treatment in the per-line net (R2
design.md), Good·Better·Best scope-tier derivation (**R9** design.md), compose latency (**L2**),
legacy-estimate rendering under the fallback (R2 tests).

### Round 3 — proposal-level critique (`/critique`, 2026-07-25, on the three pending changes)
1. **"Solve *seeds* line prices" would persist derived values** — freezing estimates against later
   cost changes and violating store-inputs-only. *Revised:* baselines are derived, never written;
   only user-entered prices persist (spec scenario + test).
2. **Partial pricing / override precedence was unspecified** — circular allocation and a
   `Σ price ≠ override` contradiction were possible. *Revised:* baseline = allocation of the
   solved/overridden total across all lines; an entered price replaces only its own baseline; any
   entered price ⇒ total = Σ effective prices, total override not applied.
3. **Tab bar visibility on job pages contradicted the prototype** (hidden there, not merely
   inactive). *Revised:* app-shell spec/tasks hide the bar on drill-ins, back affordance instead.
4. **Contingency share now allocated on the constitutional base** (`cost+overhead`, not cost
   alone) + zero-direct-cost / zero-base guards (no divide-by-zero). *Revised:* R2 design/spec.
5. **Negative aggregate** renders honestly (red, progress clamped) — pulse spec scenario added.
6. **Dashboard camera → job-picker sheet** was a dropped prototype promise. *Revised:* added to
   `add-portfolio-pulse` (lands on the job's existing photo surface; R1 sheet's first consumer).
7. Smaller: "month" claim removed from the pulse spec (scope stated honestly); Jobs relabel covers
   the list title; deterministic allocation tie-breaks; sheet scroll-lock.

### Round 4 — R1 implementation review (multi-agent workflow, verified, 2026-07-25)
`revamp-app-shell` built (tokens, primitives, nav island, relabel); typecheck + 306 tests + build
green. A 3-dimension adversarial review workflow (correctness/a11y · architecture/tokens ·
constitution-fidelity) raised 11 findings; adversarial verification confirmed **6** and rejected
5 as false-positive/out-of-scope (empty focus-trap, nav exact-match, "← Projects" transient label,
unused `EmptyState` — all correctly deferred to their phases). Fixed all 6:
- `--muted` failed WCAG AA in light mode (3.73:1) → darkened to `#6f665f` (≈5.1:1).
- BottomSheet: no accessible name when `title` omitted → `useId` + `aria-labelledby`/`aria-label`
  fallback; focus not returned on close → capture + restore invoker; no SSR/mounted guard → added.
- Unconfigured banner consumed `signal-amber` tokens raw (violating the token rule this change
  wrote) → new non-threshold `--notice-*` tokens; signal palette reserved for `SignalBadge`.
- globals.css comment named a non-existent `SignalChip` → corrected to `SignalBadge`/`SignalUnknown`.

**R1 `revamp-app-shell` ✅ implemented · reviewed · archived (2026-07-25).**

### Round 5 — R2a per-line engine review (`/code-review`, high, 2026-07-25)
`add-per-line-pricing-signal` built (allocateByWeight + lineBreakdowns in the engine;
computeEstimate reworked; client-projection delegates; targetProfitPerHour wired); constitution
§3.4a committed alone; typecheck + 326 tests green (15 new). Inline 8-angle `/code-review` raised
5 findings → **4 fixed, 1 skipped**:
- **allocateByWeight silently zeroed the total when all weights were 0** → a zero-cost estimate
  (or a total override on cost-less lines) lost its revenue. Fixed: equal-split fallback so the
  parts always sum to the total; test updated (it had asserted the buggy behaviour).
- **A fully line-priced estimate went not-applicable under an unreachable target margin** (it
  solved needlessly) → fixed: skip the solve when every line is priced; also dedups the two
  identical solve branches.
- Added tests for both edges + the mixed entered/unpriced reconciliation.
- Skipped: lineBreakdowns recomputes per-line costs (O(lines), trivial; passing an aligned array
  into the shared engine helper would add a footgun for no real saving).

**R2a `add-per-line-pricing-signal` ✅ implemented · reviewed · archived (2026-07-25).** Build
deferred (disk); last green build covered the import graph, fixes since are body/test-only.

### Round 6 — R3 onboarding review (multi-agent workflow, verified, 2026-07-26)
`revamp-onboarding` built; typecheck + 337 tests + build green. A 3-dimension adversarial review
(engine-correctness · onboarding-flow · tokens/scope/a11y) raised 3 findings, verified **2**:
- **Data-loss (medium):** the new "Replay setup" link let a configured business silently wipe its
  advanced defaults (`defaultMarkupBp`/`defaultTaxRateBp`) — the wizard doesn't submit them and
  `saveSettingsFromForm` upserted `null` unconditionally (unlike overhead items). Fixed: guard —
  a form that omits both advanced fields preserves the stored values; the settings form (always
  submits them) can still clear them.
- **Token discipline (medium):** form error/success messages used the reserved `signal-red/green`
  palette on non-threshold states. Fixed: added dedicated non-signal `--danger-fg`/`--ok-fg`
  tokens and switched the wizard + settings messages to them, keeping red/yellow/green 1:1 with
  the profit signal.

**R3 `revamp-onboarding` ✅ implemented · reviewed · archived (2026-07-26).** Guided welcome +
skip; service-area capture; the expanded grouped "Here are your numbers" (+ annual billable
hours, monthly overhead, and the bill-rate-to-pull-its-weight = loaded + target, the per-line
green threshold); settings restyled + Replay setup. Engine gained `monthlyOverheadCents` +
`targetBillRatePerHour` (derived, tested). Consolidated the plan's revamp-onboarding + revamp-
settings (shared capability + `DerivedRates` component).

**R2b `add-portfolio-pulse` ✅ implemented · self-reviewed · archived (2026-07-26).** Engine
`signalAggregate` (Σnet/Σhours + shortfall + signal, NA-safe, negative-safe) + `portfolioPulse`;
dashboard reshaped to lead with the "This month" pulse card (aggregate profit/hr, plain verdict,
progress, drillable inputs) + per-job cards showing each job's own profit/hr + signal chip +
"% of year / % of goal"; business-name header + camera quick-capture (BottomSheet job-picker →
the job's photo surface, teaches when no jobs). typecheck + **334 tests** (+8) + build green.
**R2 (profit core) complete — per-line signal + portfolio pulse both landed.**

---

## Constitution reconciliation (before any code)

- **Amendment (R2), its own commit:** add the **per-line profit-per-hour view** and **per-line
  pricing** to §3 — labor-only signal; a line carries its own price, else the proportional
  allocation applies; same thresholds; per-line nets sum to the estimate net; the target-margin
  solve is a helper. An *extension* of the canonical model (whole-estimate EPH unchanged), which is
  why it's recorded in the constitution rather than added silently.
- **Reconcile, no amendment (R3):** onboarding keeps §3.2's full inputs (goals included) and
  **derives** target/hr; we adopt the prototype's friendlier presentation, not its dropped goals or
  hardcoded target.
- **Additive, new specs, no amendment:** branding/letterhead (R7), per-job margin/contingency (R4,
  allowed by §3.4), document tiers + templates/tones (R7, still prices-only under §5), permits &
  inspections (R6), client answers (R8), user-toggleable auto-run rules (R9, §5 already allows
  auto-triggers), the chain/provenance (R9). `openspec/config.yaml` context stays in sync.
- **No prototype behavior violates the hard rules:** integer cents/minutes/bp, engine-owns-math,
  tenant isolation + RLS, tools-suggest-users-confirm, prices-only client doc, forward-only
  migrations. Confirmed against both the domain map and the UI audit.

---

## After the core revamp

The **Later features** (L1 client answers, L2 composition/auto-run rules + "the chain", L3 the
tool-graph editor north-star) are detailed in their section above. They layer onto the finished
tools once R1–R10 ship; none change the tool rules (read-only snapshot in, suggestions out).

---

## Standing rules (apply to every phase)

- Non-trivial change starts as an OpenSpec proposal, validated `--strict`, **shown to Callie and
  approved before any `src/`/`app/`/migration edit** (constitution §6.7).
- Money = integer cents; time = integer minutes; percentages = basis points. No floats for money.
- All financial math in `src/engine/`; UI/DB never re-derive it. `targetProfitPerHour` is derived.
- Every business-owned table: non-null `business_id` + RLS + isolation test (+ prove RLS live per
  phase, per principle 11).
- Tools suggest; users confirm. No tool write-path to estimates or context.
- Every displayed number traceable; colors always paired with text; phone-first; server-first with
  client islands.
- The **UI prototype is the behavior spec** — no dead buttons, no mock data; adapt where the domain
  requires, don't silently drop what the UI promises.
