# MarginSense — Tech Stack & Conventions

> *How* we build MarginSense. This is the concrete, changeable layer. For *what* we're
> building and the rules that never bend, see [`constitution.md`](./constitution.md).
>
> When a specific version or library here conflicts with the constitution's principles,
> the constitution wins and this file gets updated.

---

## 1. Stack at a glance

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | One language across UI, server, and the profit engine. |
| Framework | **Next.js** (App Router) + **React** | Phone-first web/PWA today, one codebase, server actions for tool orchestration. |
| Styling / UI | **Tailwind CSS** + **shadcn/ui** | Fast, accessible, mobile-first components. |
| Database | **Postgres** via **Supabase** | Relational data + row-level security for tenant isolation. |
| ORM / migrations | **Drizzle ORM** | Typed schema, versioned forward-only migrations (constitution §6.4). |
| Auth | **Supabase Auth** | Managed sessions scoped to a business. |
| File storage | **Supabase Storage** | Job photos and generated documents, access-controlled per tenant. |
| AI | **Anthropic API (Claude)** | The tools. Vision (Photo Advisor) + web search (Material Finder). |
| Client data/state | **TanStack Query** for interactive tool UIs; server components elsewhere | Keep server components as the default; reach for client state only inside tools. |
| Validation | **Zod** | Validate all tool I/O and form input at the boundary. |
| Testing | **Vitest** (unit) + **Playwright** (e2e) | Heavy unit coverage on the profit engine; e2e on the money-critical flows. |
| Spec process | **OpenSpec** (`@fission-ai/openspec`) | Spec-driven development: proposals → specs → tasks, versioned in-repo (§8, constitution §6.7). |
| Hosting | **Vercel** | First-class Next.js deploys; Supabase as the data plane. |

### Models
- Default tool model: **`claude-opus-4-8`** for judgment-heavy tools (Photo Advisor, Code
  Finder). Use a cheaper/faster Claude model for lightweight extraction/formatting where
  quality allows. Model IDs are centralized in one config constant, never hardcoded across
  the codebase.
- Vision for Photo Advisor; web search for Material Finder (Anthropic web search tool or a
  pluggable search provider behind our own interface).

---

## 2. Repository layout

```
/
├── constitution.md            # the stable core (what & rules)
├── techstack.md               # this file (how)
├── CLAUDE.md                  # operating instructions; points to the two above
├── openspec/                  # ⭐ spec-driven change process (see §8)
│   ├── config.yaml            # schema + project context shown to AI
│   ├── specs/                 # the living specs — what IS built (source of truth)
│   │   └── <capability>/spec.md
│   └── changes/               # in-flight change proposals — what SHOULD change
│       ├── <change-id>/       # proposal.md, design.md, tasks.md, specs/ deltas
│       └── archive/           # completed, archived changes
├── .claude/                   # Claude Code integration
│   ├── commands/opsx/         # /opsx:propose, apply, archive, explore, sync, update
│   └── skills/openspec-*/     # OpenSpec workflow skills
├── app/                       # Next.js App Router
│   ├── (auth)/                # sign-in / onboarding
│   ├── (app)/                 # authenticated shell — the Profit Tracker outer layer
│   │   ├── dashboard/         # portfolio red/yellow/green
│   │   ├── projects/[id]/     # a job: context, conversation, estimates, tools
│   │   └── settings/          # business + financial settings
│   └── api/                   # route handlers where needed
├── src/
│   ├── engine/                # ⭐ pure profit MATH only — NO framework/DB imports
│   │   ├── money.ts           # cents/minutes/bp helpers + display rounding
│   │   ├── config.ts          # thresholds, target-profit/hr formula, contingency base
│   │   ├── rates.ts           # annual rates: recovery, burdened, loaded, break-even, goals
│   │   ├── estimate.ts        # roll-up + margin-solve: revenue, cost, contingency, EPH
│   │   ├── signal.ts          # red/yellow/green (ratio, weight, % of year / profit goal)
│   │   └── *.test.ts          # exhaustive unit tests
│   ├── estimate/              # estimate feature: line items, editing, versions (calls engine)
│   ├── profit/                # profitability + dashboard: EPH signal, portfolio (calls engine)
│   ├── tools/                 # AI tools (read-only category); each: schema, run(), suggestions
│   │   ├── material-finder/
│   │   ├── photo-advisor/
│   │   ├── code-finder/
│   │   └── client-estimate-doc/
│   ├── context/               # shared project context: read/write, suggestions queue
│   ├── db/                    # Drizzle schema, migrations, tenant-scoped queries
│   ├── ai/                    # Anthropic client, model config, web search, cost logging
│   └── ui/                    # shared components
└── tests/e2e/                 # Playwright
```

**The `src/engine/` boundary is sacred.** It owns the **math only** and imports nothing
from Next, React, Drizzle, or Anthropic. It takes plain data in and returns plain data out.
This is what makes the financial math testable and trustworthy (constitution §6.1).

**Estimate, profit, and tools are separate modules (constitution §6.8).** `src/estimate/`
(building/storing line items and versions) and `src/profit/` (EPH, colors, dashboard,
portfolio) are **different** modules — connected, but never merged: both consume
`src/engine/` through typed data, and neither reaches into the other's internals.
`src/tools/` is a third, distinct category that reads context/estimate **read-only** and
returns suggestions; it has no write path to an estimate (§4).

---

## 3. Data & multi-tenancy conventions

- Every business-owned table has a non-null `business_id`. **Row-Level Security is on**;
  policies restrict every row to its business. This is the enforcement layer for tenant
  isolation — the UI filtering it too, but the DB is the guarantee (constitution §6.3).
- All tenant-scoped DB access goes through helpers in `src/db/` that require a
  `business_id`. Never write a raw query that could span tenants.
- **Money columns are integer cents; time columns are integer minutes; percentages are
  basis points.** Column names make the unit explicit (`*_cents`, `*_minutes`, `*_bp`).
- Timestamps in UTC; monetary rounding only at the presentation layer.
- Migrations: forward-only, one reviewed file per change, generated and applied through
  Drizzle. No editing production schema by hand.

---

## 4. Tool implementation contract

Every tool in `src/tools/*` exports the same shape so tools stay uniform and composable:

- **`inputSchema` / `outputSchema`** — Zod schemas validated at the boundary.
- **`run(ctx)`** — receives the project's shared context (read-only snapshot) + tool
  input; calls Claude via `src/ai/`; returns structured output.
- **Suggestions, not writes** — a tool receives a **read-only** context/estimate snapshot
  and has **no write path** to an estimate or context fact. Anything it wants to change is
  returned as a `Suggestion` (status `pending`) into the suggestions queue, per constitution
  §5; the estimate changes only when the user accepts. This holds for every tool, including
  any that revises an estimate — it reads the estimate and proposes the revision.
- **Posts to the one conversation** — results are appended to the single project
  conversation, attributed to the tool.
- **Auto-triggers** — Code Finder subscribes to the photo-upload event; auto-runs still
  only produce suggestions.
- **Cost logging** — every run records a `tool_run` (tokens, latency) via `src/ai/`.
- **Disclaimers** — Photo Advisor and Code Finder attach the licensed-professional /
  non-authoritative disclaimer to their output (constitution §5, §7).

---

## 5. Testing expectations

Because this handles real money for real customers:

- **Profit engine: near-exhaustive unit tests.** Cover rounding, zero-hour and zero-revenue
  estimates, overhead allocation, EPH, and each color threshold boundary (0.79 / 0.80 /
  0.99 / 1.00).
- **Tenant isolation: explicit tests** proving one business cannot read/write another's
  rows.
- **Money-critical e2e**: onboarding → create estimate → see EPH & color → accept a tool
  suggestion → generate client doc.
- Tools' AI calls are mocked in unit tests; live-model checks are separate and opt-in.

---

## 6. Coding conventions

- TypeScript `strict`; no `any` at module boundaries — validate with Zod instead.
- Server components by default; client components only where interactivity needs them
  (the tool UIs).
- Business math **only** in `src/engine/`. UI and DB call it; they never re-derive totals.
- Centralize model IDs, thresholds defaults, and AI config — no magic constants scattered
  around.
- Mobile-first: design and test at phone width first, then scale up.
- Accessible by default (shadcn/Radix primitives); color signals always paired with text
  so red/yellow/green is never the only cue.

---

## 7. Environment & secrets

- Secrets (Supabase keys, Anthropic API key) live in environment variables, never in the
  repo.
- Local dev uses a Supabase project (or local stack); production is a separate Supabase
  project. Never point dev tooling at production data.
- The Anthropic API key is server-side only; tools run on the server, never exposing the
  key to the browser.

---

## 8. Spec-driven development with OpenSpec

This is the concrete mechanism behind the constitution's spec-first rule (§6.7):
**non-trivial change is specified before it is built.** We use
[OpenSpec](https://github.com/Fission-AI/OpenSpec) to keep proposals, specs, and tasks in
the repo as plain Markdown, next to the code they govern.

### The two homes

- **`openspec/specs/<capability>/spec.md`** — the **living specs**: what IS built, the
  durable source of truth. A *capability* is a coherent slice of behavior (e.g.
  `profit-engine`, `estimates`, `tenant-isolation`, `material-finder`).
- **`openspec/changes/<change-id>/`** — an **in-flight change proposal**: what SHOULD
  change. Each change folder holds:
  - `proposal.md` — why and what (the problem and the change at a high level).
  - `design.md` — how (technical approach, trade-offs) — for anything non-obvious.
  - `tasks.md` — the implementation checklist (`- [ ]` → `- [x]`).
  - `specs/<capability>/spec.md` — the **delta**: `## ADDED Requirements`,
    `## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`, each
    requirement carrying one or more `#### Scenario:` blocks (`WHEN` / `THEN`).

Requirements are written as testable behavior:

```markdown
## ADDED Requirements

### Requirement: Effective Profit per Hour
The engine SHALL compute EPH as netProfit / laborHours in integer cents per hour.

#### Scenario: Zero labor hours
- **WHEN** an estimate has zero labor minutes
- **THEN** EPH is reported as not-applicable (never a divide-by-zero)
```

### The lifecycle

```
explore → propose → apply → archive
```

1. **Explore** (optional) — think through the problem before committing to a shape.
2. **Propose** — create a change with `proposal.md`, `design.md`, `tasks.md`, and spec
   deltas. Validate it.
3. **Apply** — implement the tasks, checking them off as you go; keep code changes scoped
   to the change.
4. **Archive** — when the work is done and merged, sync the deltas into
   `openspec/specs/` (the living specs) and move the change into `changes/archive/`.

### Commands

The OpenSpec CLI (`npx @fission-ai/openspec`) and the Claude Code slash commands in
`.claude/commands/opsx/` drive the flow:

| Slash command | CLI | Does |
|---|---|---|
| `/opsx:explore` | — | Think through a problem before proposing (no code). |
| `/opsx:propose "<idea>"` | `openspec new change`, `openspec instructions`, `openspec status` | Scaffold a change and author its artifacts. |
| `/opsx:apply` | `openspec status`, `openspec instructions apply` | Implement the change's tasks. |
| `/opsx:sync` | — | Fold delta specs into the living specs without archiving. |
| `/opsx:archive` | `openspec archive` | Sync specs and move the change to `archive/`. |
| — | `openspec list` / `show` / `view` | Browse changes and specs. |
| — | `openspec validate --all --strict` | Check that specs/changes are well-formed. |

**Always `openspec validate` a change before implementing, and again before archiving.**
Project context shown to the AI when authoring artifacts lives in `openspec/config.yaml`
(the `context:` and `rules:` keys) — keep it in sync with this file and the constitution.

### When a change needs a spec

- **Needs a proposal:** new capability, new tool, a change to the financial model or its
  thresholds, schema/migration changes, tenant-isolation rules, the tool contract, or
  anything that alters user-visible behavior.
- **Skip the ceremony:** typo fixes, formatting, dependency bumps, comments, and other
  changes with no behavioral delta. Use judgment; when in doubt, write the proposal.
