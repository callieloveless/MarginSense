# MarginSense — Progress & Roadmap

> Working tracker: what is **done**, what is **in flight**, and what comes **next**.
> The plan below is derived from [`constitution.md`](./constitution.md) (domain model §2,
> financial model §3, tool system §5, non-negotiables §6) and sequenced so every change
> stands on ground that already exists. Specs are the source of truth
> ([`openspec/`](./openspec/)); this file is the at-a-glance view.

**Last updated:** 2026-07-22

---

## Status at a glance

| # | Change | Capability(ies) | Status |
|---|--------|-----------------|--------|
| 1 | `add-profit-engine` | `profit-engine` | ✅ **Done** (archived 2026-07-22) |
| 2 | `add-tenancy-foundation` | `tenancy-foundation` | ✅ **Done** (archived 2026-07-22; live-infra tasks deferred) |
| 3 | `add-onboarding` | `onboarding` | ✅ **Done** (archived 2026-07-22; live-infra proof deferred) |
| 4 | `add-estimate-dashboard` | `estimates`, `profit-dashboard` | ✅ **Built** (code + tests + build green; live-infra proof deferred) |
| 5 | Shared context + suggestions queue | `project-context` | ⏳ Planned |
| 6 | Tool platform + first tool (Material Finder) | `tool-platform`, `material-finder` | ⏳ Planned |
| 7 | Photo Advisor + Code Finder (auto-trigger) | `photo-advisor`, `code-finder` | ⏳ Planned |
| 8 | Client Estimate Doc | `client-estimate-doc` | ⏳ Planned |
| 9 | Hardening & launch pass | — | ⏳ Planned |

Legend: ✅ done · 🔨 in progress · 📝 proposal written, not started · ⏳ planned, not yet proposed

> Work that's coded but waiting on a live Supabase project (apply migrations, prove RLS
> end-to-end, walk the flows), plus gotchas and conventions worth remembering, live in
> [`relevant_notes.md`](./relevant_notes.md) — skim it at the start of a task.

---

## Phase detail

### 1. ✅ Profit engine (`src/engine/`) — DONE
The pure financial core (constitution §3, §6.1): money/minutes/bp primitives, derived
annual rates, estimate roll-up with contingency, margin-solve pricing, EPH, and the
red/yellow/green signal (absolute + comparative views). Unit-tested, no framework imports.
Spec: [`openspec/specs/profit-engine/spec.md`](./openspec/specs/profit-engine/spec.md).

### 2. ✅ Tenancy & app foundation — DONE (archived 2026-07-22)
All in-code work is complete, validated, and archived; the spec is synced into
[`openspec/specs/tenancy-foundation/`](./openspec/specs/tenancy-foundation/spec.md). The
only open items are **deferred to live infra** (owner provisions Supabase): apply migration
`0000`, prove RLS end-to-end via `npm run test:rls`, and walk the flow live.

Everything downstream presumes the domain spine **Business → Project → Estimate** and
DB-enforced tenant isolation (constitution §2, §6.3) — none of which existed yet. This
change lays it down:

- Next.js (App Router) skeleton: `(auth)` and `(app)` shells, phone-first.
- Drizzle + Postgres (Supabase) wiring; forward-only migration setup.
- Core tables: `businesses`, `users`, `projects` — every business-owned row
  with non-null `business_id`, **RLS on**.
- Tenant-scoped query helpers in `src/db/` that require a `business_id`.
- Supabase Auth integration points (sessions scoped to one business).
- **RLS made real over Drizzle**: every tenant query runs in an authenticated
  request-context transaction (`src/db/rls.ts`) that sets `auth.uid()` from the verified
  session and drops to the `authenticated` role, so the policies actually enforce.
- Tenant-isolation tests (one business can never read/write another's rows).

**Needs from Callie:** a Supabase project + env secrets to run against live infra.
Everything else (schema, migrations, helpers, policies, tests, app skeleton) is
buildable now and wired up when the keys land.

### 3. 🔨 Onboarding (wizard + Review) — CURRENT
Captures the §3.2 solo-operator inputs (overhead, wage+burden, capacity, goals) in a
3-step phone-first wizard; Review screen plays back the derived rates via the engine.
Stores **inputs only** — rates are always recomputed. Proposal:
[`openspec/changes/add-onboarding/`](./openspec/changes/add-onboarding/).

### 4. 📝 Estimate builder + profit dashboard
The two core surfaces, in **separate modules** (constitution §6.8): `src/estimate/`
(line items, versions, margin-solve pricing) and `src/profit/` (signal rendering,
portfolio "against your year" dashboard). Proposal:
[`openspec/changes/add-estimate-dashboard/`](./openspec/changes/add-estimate-dashboard/).

### 5. ⏳ Shared project context + suggestions queue
"One job, one memory" (constitution §4): typed context entries (`finding`, `material`,
`code_ref`, `photo`, `fact`), the **single** project conversation, and the suggestions
queue with accept/dismiss. This is the substrate every Tool depends on — it ships
before any tool. Estimate creation seeds the context (wired here).

### 6. ⏳ Tool platform + Material Finder
The tool contract (techstack §4): uniform `inputSchema`/`outputSchema`/`run(ctx)` shape,
**read-only** context/estimate snapshots in, suggestions out, posts to the one
conversation, `tool_run` cost logging via `src/ai/`. Material Finder proves the platform
(web search → `material` entries + suggested line items).

### 7. ⏳ Photo Advisor + Code Finder
Photo upload + storage (tenant-scoped Supabase Storage), vision-based findings, and the
first **auto-trigger**: photo upload event → Code Finder runs → still only suggests.
Both carry the licensed-professional disclaimer (constitution §5, §7).

### 8. ⏳ Client Estimate Doc
The client-facing document tool — separate from the internal estimate (true costs,
overhead, EPH never leak into it). Generates the polished proposal as a `document`.

### 9. ⏳ Hardening & launch pass
Money-critical e2e suite (onboarding → estimate → signal → accept suggestion → client
doc), tenant-isolation audit, AI cost observability review, accessibility pass
(colors always paired with text), Vercel + production Supabase setup.

---

## Standing rules (apply to every phase)

- Non-trivial change starts as an OpenSpec proposal (`/opsx:propose`) and is validated
  before code (constitution §6.7).
- Money = integer cents; time = integer minutes; percentages = basis points.
- All math in `src/engine/`; UI/DB never re-derive it.
- Every business-owned table: non-null `business_id` + RLS + tenant-isolation test.
- Tools suggest; users confirm. No tool write-path to estimates or context.
- Phone-first; colors always paired with text.
