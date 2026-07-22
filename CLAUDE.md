# CLAUDE.md

Operating instructions for working in the MarginSense codebase. Read the documents below
**first** — they define the product, how it's built, and how change flows through the
repo. This file is the short version plus workflow rules.

## Read these first (in order)

1. **[`constitution.md`](./constitution.md)** — what MarginSense is, the domain model, the
   canonical financial math (including the red/yellow/green "pull-their-weight" spec), the
   Tool system, and the non-negotiable engineering rules. **When in doubt, this wins.**
2. **[`techstack.md`](./techstack.md)** — the concrete stack, repo layout, coding
   conventions, and the spec-driven development process (§8).
3. **[`openspec/`](./openspec/)** — the living specs (`specs/`) and in-flight change
   proposals (`changes/`). Before touching a capability, read its spec. The OpenSpec
   workflow skills live in `.claude/skills/openspec-*` and the slash commands in
   `.claude/commands/opsx/`.

If a request conflicts with the constitution, say so and propose an amendment rather than
quietly working around it.

**Also skim [`relevant_notes.md`](./relevant_notes.md) at the start of a task** — a living
scratchpad of deferred work (e.g. everything waiting on a live Supabase project: applying
migrations, proving RLS end-to-end), gotchas, and conventions worth remembering. Add to it
when you learn something the next person would want to know.

## The 60-second mental model

- **MarginSense** helps trade contractors (starting with general contractors) run their
  business and see if each estimate is worth the crew hours it takes.
- Hierarchy: **Business → Project (one client job) → Estimate(s) → Line Items.** A project
  owns a **shared context** and **one conversation** that all tools use.
- **Outer layer (not tools):** the Profit Tracker dashboard, business settings/onboarding,
  and creating/editing estimates. *Making an estimate seeds the job's cost/hour data.*
- **Tools (AI-powered, openable):** Material Finder, Photo Advisor, Code Finder, Client
  Estimate Doc. They **read the shared context and suggest changes — they never write to
  an estimate without the user confirming.** Some (Code Finder) auto-trigger on events
  (photo upload) but still only suggest.
- **The point of the whole app:** *Effective Profit per Hour (EPH) = net profit ÷ labor
  hours*, shown as red / yellow / green. The internal estimate (true costs, overhead, EPH)
  is different from the client-facing estimate document.

## Hard rules (from the constitution — do not violate)

- **Money = integer cents. Time = integer minutes. Percentages = basis points.** No floats
  for money.
- **All financial math lives in the pure `src/engine/` module** and is unit-tested. UI/DB
  call it; never re-implement totals or color logic elsewhere.
- **Tenant isolation is enforced in the database** (every business-owned row has
  `business_id`; row-level security on). A missing tenant filter is a security bug.
- **Tools suggest; users confirm.** No AI tool mutates an estimate or commits a context
  fact on its own.
- **Every number is traceable** — no magic totals; the user can always see the inputs.
- **Migrations are versioned and forward-only** in production.
- **Non-trivial change is specified before it is built** — see the spec-driven workflow
  below (constitution §6.7).
- Physical-work / code advice (Photo Advisor, Code Finder) carries a
  licensed-professional, non-authoritative disclaimer.

## Spec-driven workflow (OpenSpec)

We use **OpenSpec** so change is specified before it's built (constitution §6.7,
techstack §8). Specs and proposals are plain Markdown under `openspec/`.

**Before implementing a non-trivial change:**

1. **Read the relevant spec** in `openspec/specs/<capability>/spec.md` (browse with
   `openspec list --specs` / `openspec show`).
2. **Propose the change** — run `/opsx:propose "<what you want to build>"` (or
   `openspec new change "<kebab-name>"`) to scaffold `proposal.md`, `design.md`,
   `tasks.md`, and the spec delta under `changes/<id>/specs/<capability>/spec.md`. Write
   requirements as `#### Scenario:` blocks (`WHEN` / `THEN`).
3. **Validate** — `openspec validate <change> --strict` (or `--all`). Do this before you
   write code.
4. **STOP — show the proposal and wait for the user's confirmation.** After the proposal
   artifacts (`proposal.md`, `design.md`, `tasks.md`, spec delta) are written and validated,
   present them and **do not implement until the user explicitly approves.** Writing/committing
   the proposal is fine; touching `src/`, `app/`, migrations, or any code is gated on a yes.
5. **Apply** — only after approval: `/opsx:apply`; implement the tasks, flipping `- [ ]` →
   `- [x]` as you go. Keep code changes scoped to the change.
6. **Archive** — when done and merged, `/opsx:archive`: sync the delta into the living
   specs and move the change into `changes/archive/`.

**What needs a proposal:** new capability/tool, changes to the financial model or its
thresholds, schema/migration changes, tenant-isolation rules, the tool contract, or any
user-visible behavior change. **Skip it** for typos, formatting, comments, and dependency
bumps with no behavioral delta. When in doubt, write the proposal.

Keep `openspec/config.yaml` (the `context:` and `rules:` the AI sees when authoring
artifacts) in sync with the constitution and techstack.

## Execution playbook (how changes #1–#5 actually got built — reuse it)

The repeatable recipe. Each change followed this; the next one should too.

1. **Propose + validate** (above) — `/opsx:propose`, then `openspec validate <id> --strict`.
   **Then stop and show the user the proposal; get an explicit go-ahead before writing any
   code.** The proposal may be committed while waiting; implementation may not begin.
2. **Read before writing** — the constitution section it implements, the change's spec delta,
   and the existing code you'll mirror: `src/engine/`, `src/db/{schema,tenant,drizzle-backend,
   session,validation}.ts`, and the closest prior change's files. Also skim
   [`relevant_notes.md`](./relevant_notes.md).
3. **Implement in committed stages.** Stage A = persistence + pure domain module(s) +
   unit/isolation tests. Stage B = UI under `app/` + a real build. Commit each stage with a
   descriptive message; keep code scoped to the change.
4. **Verify every stage** — `npm run typecheck`, `npx vitest run`, and **`npm run build`**.
   The build is the *only* check that catches Turbopack / App-Router issues, so always run it
   after touching `app/` or `src/` imports. Flip `tasks.md` `- [ ]` → `- [x]` as you go.
5. **Archive + push when the in-code work is done** (the live-Supabase tasks stay deferred, not
   a blocker): `openspec archive <id> --yes`, update `PROGRESS.md` status and the
   `relevant_notes.md` deferred list, commit the archive **on its own**, then `git push`.
   Confirm before pushing unless told to.

## Patterns to mirror (don't reinvent)

- **Tenant data access = the `TenantDb` seam** (`src/db/tenant.ts`). Each capability adds an
  `XBackend` port with a **memory impl** (in `tenant.ts`, powers isolation tests) and a
  **Drizzle impl** (`drizzle-backend.ts`, runs inside `withAuthenticatedTx` so RLS applies),
  wired in `session.ts`. Backends are optional on `TenantBackends`; a private `#xBackend`
  getter throws if unwired. Every method takes `businessId`; `TenantDb` always passes its own
  bound id — feature code never sees an unscoped handle.
- **New business-owned table**: non-null `business_id` (+ `project_id` where relevant). Run
  `npm run db:generate`, then **hand-append the RLS block** to the generated SQL — enable RLS,
  a per-business policy keyed on `public.current_business_id()`, and `GRANT … TO authenticated`
  (mirror migration `0000`). Add an in-memory tenant-isolation test (cross-tenant read/write
  blocked; `business_id` stamped from the handle, never input).
- **Domain modules, one per surface, engine-only for math**: `src/engine/` (sacred — no
  framework/DB imports), `src/estimate/`, `src/profit/`, `src/context/`. They exchange only
  the engine's typed roll-up / typed values and **never import each other**. Keep them
  framework/DB-free: import schema **types only** (type-only imports don't pull Drizzle at
  runtime; guard any local vocabulary array with `satisfies readonly XName[]`).
- **Money/percent at the boundary**: convert human strings → integer cents/bp with plain,
  unit-tested helpers in `src/db/validation.ts` — *not* transform-heavy Zod (chained
  `z.union().transform()` OOMs `tsc`). Store inputs only; recompute derived values via the
  engine every render.
- **UI**: server components by default; phone-first; `formatCents` for money; color always
  paired with text (`SignalBadge`). Forms post to **server actions** that resolve the business
  from the session and never trust a client `business_id`. Shared field inputs live in
  `app/_components/fields.tsx`; private helpers/components in `app/_lib/` and `app/_components/`
  (an underscore folder is not a route).

## Environment & tooling (full list in relevant_notes.md)

- **OpenSpec CLI** is `@fission-ai/openspec` (installed globally). Run it through **PowerShell**
  — the Bash tool's PATH lags and won't find `openspec`. Its "- Validating…" stderr line shows
  as a PowerShell error even on success; trust the `Totals:` line.
- **`next build` uses Turbopack**: relative imports in `src/` must be **extensionless**
  (`./x`, not `./x.js`) or the build fails — and `tsc`/`vitest` don't catch it. The build needs
  a few hundred MB free on `C:` (the drive has hit 100%; clear the regenerable `.next/` if a
  write fails with ENOSPC).
- **`tsconfig.json` is Next-owned** — `next build` rewrites `jsx`/`include` every run; commit it
  as-is, don't fight it.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Working conventions

- TypeScript strict; validate boundaries with Zod, not `any`.
- Phone-first: build and check at phone width first.
- Server components by default; client components only inside interactive tool UIs.
- Centralize model IDs, default thresholds, and AI config — no scattered magic constants.
- Color signals always paired with text (never color alone).

## Git workflow

- Develop on branch **`claude/contractor-app-architecture-nfjkd1`**; create it from the
  latest default branch if needed.
- Commit in clear, focused units with descriptive messages. Push with
  `git push -u origin <branch>`.
- Do **not** open a pull request unless explicitly asked.
- Amend the constitution only in its own deliberate commit that states what changed and
  why.
- OpenSpec artifacts are committed with the code they describe. Archiving a change (spec
  sync + move to `changes/archive/`) is its own clear commit.
