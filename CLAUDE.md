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
4. **Apply** — `/opsx:apply`; implement the tasks, flipping `- [ ]` → `- [x]` as you go.
   Keep code changes scoped to the change.
5. **Archive** — when done and merged, `/opsx:archive`: sync the delta into the living
   specs and move the change into `changes/archive/`.

**What needs a proposal:** new capability/tool, changes to the financial model or its
thresholds, schema/migration changes, tenant-isolation rules, the tool contract, or any
user-visible behavior change. **Skip it** for typos, formatting, comments, and dependency
bumps with no behavioral delta. When in doubt, write the proposal.

Keep `openspec/config.yaml` (the `context:` and `rules:` the AI sees when authoring
artifacts) in sync with the constitution and techstack.

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
