# MarginSense — Progress & Roadmap

> Working tracker: what is **done**, what is **in flight**, and what comes **next**.
> The plan below is derived from [`constitution.md`](./constitution.md) (domain model §2,
> financial model §3, tool system §5, non-negotiables §6) and sequenced so every change
> stands on ground that already exists. Specs are the source of truth
> ([`openspec/`](./openspec/)); this file is the at-a-glance view.

**Last updated:** 2026-07-24

---

## Status at a glance

| # | Change | Capability(ies) | Status |
|---|--------|-----------------|--------|
| 1 | `add-profit-engine` | `profit-engine` | ✅ **Done** (archived 2026-07-22) |
| 2 | `add-tenancy-foundation` | `tenancy-foundation` | ✅ **Done** (archived 2026-07-22; live-infra tasks deferred) |
| 3 | `add-onboarding` | `onboarding` | ✅ **Done** (archived 2026-07-22; live-infra proof deferred) |
| 4 | `add-estimate-dashboard` | `estimates`, `profit-dashboard` | ✅ **Done** (archived 2026-07-22; live-infra proof deferred) |
| 5 | `add-project-context` | `project-context` | ✅ **Done** (archived 2026-07-22; live-infra proof deferred) |
| 6 | `add-tool-platform` (contract, `src/ai/`, `tool_run`) | `tool-platform` | ✅ **Done** (archived 2026-07-23; live-AI + live-infra proof deferred) |
| 7a | `add-structured-result-port` (port typed result + citations, real Anthropic impl) | `tool-platform` | ✅ **Done** (archived 2026-07-23; live-AI proof deferred) |
| 7b | `add-material-finder` (the first real tool) | `material-finder`, `project-context`, `onboarding` | ✅ **Done** (archived 2026-07-23; live-AI + live-infra proof deferred) |
| 8a | `add-photo-capture` (job photo upload + tenant-scoped storage) | `job-photos` | ✅ **Done** (archived 2026-07-23; live-storage proof deferred) |
| 8b | `add-photo-advisor` (the vision tool) | `photo-advisor`, `project-context` | ✅ **Done** (archived 2026-07-24; live-AI proof deferred) |
| 9a | `add-tool-compose` (composition seam, dormant) | `tool-platform` | ✅ **Done** (archived 2026-07-24) |
| 9b | `add-code-finder` (compose off findings + standalone query) | `code-finder`, `project-context` | ✅ **Done** (archived 2026-07-24; live-AI proof deferred) |
| 10 | Client Estimate Doc | `client-estimate-doc` | ⏳ Planned |
| 11 | Hardening & launch pass | — | ⏳ Planned |
| 12 | Tool graph editor (meta) | — | 🌟 North-star (after core tools ship) |

> **Tools each ship as their own change** (one capability per change, one tool per
> stage) — the platform (#6) lands first with no user-facing tool, then each tool (#7–#10)
> is a separate proposal on top of it. This is a change from the earlier plan that bundled
> the platform with Material Finder (#6) and Photo Advisor with Code Finder (#7).

Legend: ✅ done · 🔨 in progress · 📝 proposal written, not started · ⏳ planned, not yet proposed · 🌟 north-star, later

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

### 6. ✅ Tool platform — the tool contract & AI layer — DONE (archived 2026-07-23)
All in-code work is complete, reviewed, and archived; the spec is synced into
[`openspec/specs/tool-platform/`](./openspec/specs/tool-platform/spec.md). The uniform tool
contract (techstack §4): every tool in `src/tools/*` exports `inputSchema`/`outputSchema`/
`run(ctx)`, receives a **read-only** context + estimate snapshot, and returns a `ToolResult`
that separates a typed **`output`** (read-only, routable for the future graph editor #12)
from **`suggestions`** (the only commit path, into change #5's queue) and a **`message`**
(the single conversation, with an optional disclaimer). The runner de-duplicates identical
pending suggestions, records a `tool_run` (tokens, latency, status — failed runs too), and
links each emission back via `tool_run_id`. Adds `src/ai/` — a **mockable model port** shaped
for web search + vision (system/messages/images/server-tools → content/usage/citations),
memory/mock impl for tests, real Anthropic impl behind `ANTHROPIC_API_KEY`, model IDs/config
centralized. Ships a trivial reference/echo tool + the project-page **Tools** surface shell;
no real tool. **The only open items are deferred to live infra** (see
[`relevant_notes.md`](./relevant_notes.md) §5): apply migration `0004`, prove `tool_runs` RLS,
and prove one live model call through the reference tool once a key exists.

### 7a. ✅ Structured-result port
Split out of #7: the model port's structured-output capability. `ModelRequest.resultSchema`
(Zod) + `ModelResponse.result` (validated) + `readResult()`; the mock returns a canned,
schema-validated result + citations; the **real Anthropic impl** (`src/ai/anthropic.ts`) makes
one `messages.create` combining `web_search_20260209`, citations, and a strict `record_result`
tool built from the schema via `z.toJSONSchema` — deliberately not `output_config.format`
(incompatible with citations). SDK loaded lazily; resolver stays unconfigured without a key.
**Live end-to-end proof deferred** (relevant_notes.md §5).

### 7b. ✅ Material Finder
First real tool (constitution §5): web-searches materials, current prices, and suppliers via
`web_search` + #7a's structured result. Two modes (free-text query / everything-for-this-
estimate); returns **comparable, sourced options** — each an `estimate_line_item` suggestion
when there's an active estimate (so options compare by profit-per-hour via P2's card) else a
`material` context entry; an unsourced option is dropped (§7). Localizes to a new
`business_settings.service_area` (migration `0006`, edited in Settings); snapshot exposes
`activeEstimateId`; **manual add** proposes the same suggestions with no model/no `tool_run`.
Per-tool input UI (mode toggle + query + location + hand-add) sets the pattern for #8–#10.
**The only open items are deferred to live infra** (relevant_notes.md §5): apply migration
`0006`, and prove real `web_search` returns sourced prices + citations with live `tool_run`
token usage once a key exists.

### 8a. ✅ Job photo capture & storage
Split out of #8 (as #7 split into 7a/7b) so the storage slab stands alone — it involves **no
AI at all**. A job photo is a tenant-isolated asset: `project_photos` + RLS (migration `0007`),
a `PhotoStorageBackend` on the `TenantDb` seam (memory impl for isolation tests; Supabase
Storage over the **session-scoped** SSR client, never service-role), a private bucket with a
`storage.objects` policy on the same `business_id/project_id/…` key prefix the app derives, and
short-lived signed URLs. Uploading is an **outer-layer user action** — it commits a `photo`
context entry directly, never a suggestion — and the client downscales, re-encodes (dropping
**EXIF/GPS**, §7), and thumbnails on the device. Caption, delete, and a phone-first gallery on
the job context page. A successful upload emits **`photo.uploaded`** through P1's dormant
trigger seam (`TRIGGERS` still empty, so a no-op today) — #9 subscribes Code Finder with one
entry. **Open items are deferred to live infra** (relevant_notes.md §1, §2b): create the
private bucket, apply `0007`, and prove object isolation + signed-URL expiry end to end.

### 8b. ✅ Photo Advisor (the vision tool)
The tool on top of 8a: **one photo per run** — taken right there or chosen from the job — its
bytes passed in as tool **input** (tools get no storage handle) to the model port's existing
`images`, with #7a's structured result. It proposes `finding` entries carrying a **severity**
(`safety` / `attention` / `note`) and the photo behind them, plus **labor** line items whose
minutes flow into P2's preview, so you see what a repair does to the job's profit per hour before
accepting. It **never prices anything**: the result schema has no cost field, materials are named
in the finding, and the post hands pricing to Material Finder — an uncosted material line would
roll up as zero and quietly overstate the job's profit. An implausibly large estimate is proposed
*and* flagged, never dropped. Carries the shared licensed-professional disclaimer
(`src/tools/disclaimer.ts`) via `message.disclaimer` **and** as a standing panel notice (§5, §7).
**The only open item is deferred to live AI** (relevant_notes.md §5): prove a real vision call
returns sane severities, plausible minutes, and no smuggled price.

### 9a. ✅ Tool composition (the seam)
Implements the composition the tool-platform spec has described since #6: `dispatchAndCompose`
(`app/_lib/compose.ts`) is the one app-layer way to run a tool — it dispatches the tool, then fans
its typed `output` out to any registered consumers via `dispatch(source: "compose")`, bounded by
P1's step budget. **App-layer, not in the DB-free runner**, because an edge's mapper needs tenant
data (9b's Code Finder needs the service area). Ships **dormant** (`COMPOSE_EDGES` empty) — every
path is `dispatch` + a no-op — proven with a reference producer/consumer; the three existing tool
actions route through it with no behavior change.

### 9b. ✅ Code Finder (compose off findings + standalone query)
Surfaces relevant **local** building codes two ways: a **standalone query** (ask a code question →
`web_search` → sourced `code_ref` entries with citations, capped and posted to the one thread), and
**composed off Photo Advisor findings** — 9a's first live edge (`photo-advisor → code-finder`, one
run per **`safety`/`attention`** finding, not cosmetic `note`s), so codes are looked up for a
*known* defect without retyping. Jurisdiction comes from `business_settings.service_area`
(overridable). Drops any code it can't source (§7), proposes **no line item** (an unpriced permit
line would understate cost — 8b's trap), and frames each compliance note as the job's **added
cost/hours** so a codes tool stays on the EPH spine. Shared licensed-professional disclaimer (§5,
§7). `photo.uploaded` stays emitting for a future subscriber; the compose edge is the real trigger.
**Open item deferred to live AI** (relevant_notes.md §5): prove real `web_search` returns sourced
local codes and that composed runs record live token usage. **This completes the v1 tool set
(#7 Material Finder, #8 Photo Advisor, #9 Code Finder).**

### 10. ⏳ Client Estimate Doc
The client-facing document tool — separate from the internal estimate (true costs,
overhead, EPH never leak into it). Generates the polished proposal as a `document`.

### 11. ⏳ Hardening & launch pass
Money-critical e2e suite (onboarding → estimate → signal → accept suggestion → client
doc), tenant-isolation audit, AI cost observability review, accessibility pass
(colors always paired with text), Vercel + production Supabase setup.

### 12. 🌟 Tool graph editor (meta) — north-star, later
A **visual tool-graph editor** where tools are nodes and their connections are edges: one
tool's output feeds another's input, and auto-triggers (photo upload → Code Finder) are drawn
rather than coded (constitution §5, "Composing tools"). Starts as a **meta / admin** surface
for configuring how the tools connect, later opening to power-user contractors. Lands **after
the v1 tools ship** (#6–#8) and changes none of the tool rules — composed tools still read a
read-only snapshot and emit only suggestions. No redesign needed now; the only ask on earlier
phases is to keep tool `inputSchema`/`outputSchema` typed and side-effect-free (techstack §4)
so tools stay wirable.

---

## Standing rules (apply to every phase)

- Non-trivial change starts as an OpenSpec proposal (`/opsx:propose`) and is validated
  before code (constitution §6.7).
- Money = integer cents; time = integer minutes; percentages = basis points.
- All math in `src/engine/`; UI/DB never re-derive it.
- Every business-owned table: non-null `business_id` + RLS + tenant-isolation test.
- Tools suggest; users confirm. No tool write-path to estimates or context.
- Phone-first; colors always paired with text.
