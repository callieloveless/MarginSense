# Design — Material Finder (first real tool)

## Context

Material Finder is the first tool that leaves the mock behind in spirit: it web-searches for
materials, prices, and suppliers and proposes them into the job. It builds on
**`add-structured-result-port` (#7a)** — the port capability to return typed data + citations
in one call — so this change is the tool, its two modes, its comparable options, localization,
and manual add. It is scoped so #8–#10 copy its patterns. Live model calls remain **key-gated
and deferred**; acceptance runs on #7a's mock returning canned structured materials + citations.

## Goals / Non-Goals

**Goals**
- The Material Finder tool: query-or-whole-estimate search → **comparable, sourced options** →
  `material` / `estimate_line_item` suggestions + a cited conversation post.
- **Localization** via the business service area; **manual add** with no model.
- The **per-tool input UI** pattern; the **citation-as-data** rule; the snapshot exposing the
  **active estimate id** so a tool can target a line at it (lighting up P2's preview).

**Non-Goals**
- No port work (that's #7a); no live calls in acceptance; no vision/photo/auto-trigger; no
  `document` target; no exclusive pick-one affordance; no inferred quantities; no new math.

## Decisions

### The structured result comes from #7a
Material Finder passes a `resultSchema` (the material/option shape) and declares
`web_search_20260209` on the call; #7a's port returns the validated result + citations. This
change defines the **schema** (`{ need, options: [{ name, priceCents, unit, supplier?, sourceUrl
}] }[]`), not the mechanism. Everything below is tool logic over that typed result.

### The snapshot exposes the active estimate id (so a tool can target a line)
A tool proposes an `estimate_line_item` suggestion against a specific estimate
(`targetEstimateId`), but #6's `ProjectSnapshot` exposes the active estimate only as an engine
roll-up (no id). This change adds **`activeEstimateId: string | null`** to the snapshot (the
assembler already loads the active estimate — it's a field, not a new query). Material Finder
targets its line suggestions at `snapshot.activeEstimateId`; when it is null (no active
estimate), it emits only the `material` context-entry suggestions. This is what makes P2's
profit preview render for Material Finder's lines. It is a small MODIFIED `project-context`
snapshot requirement, reused by every future line-proposing tool.

### The Material Finder tool — two modes, comparable options
`src/tools/material-finder/`:
- **`inputSchema`** covers both modes and localization:
  `{ mode: "query" | "estimate", query?: string, location?: string }`. `mode: "query"` searches
  one need; `mode: "estimate"` derives needs from the active estimate's scope + lines. `location`
  is pre-filled from the service area and overridable.
- **`run(ctx)`**: builds the search prompt from the mode's target + the read-only context +
  `location`, calls `ctx.ai.complete({ system, messages, serverTools: [web_search], resultSchema })`.
  For each need the model returns **a few options** — `{ need, options: [{ name, priceCents,
  unit, supplier?, sourceUrl }] }[]` — plus citations.
- **Options → suggestions (the comparison).** For each option (dropping any without a
  `sourceUrl`): when `activeEstimateId` is set, an **`estimate_line_item`** (`category:
  "material"`, description = name, quantity 1, unitCostCents = priceCents, `targetEstimateId:
  activeEstimateId`) — so each option renders through P2's card **with its own profit preview**,
  and comparing options *is* comparing their EPH impact; otherwise a **`material` `context_entry`**
  (the #5 payload, carrying `sourceUrl`). `output` = the structured needs+options; `message` = a
  summary grouped by need **with source links** + a "prices are live estimates — confirm with the
  supplier" note. Dedup (P1) keeps repeat searches from restacking identical options.

  *Why options-as-suggestions:* it reuses P2's card + profit preview for the comparison with zero
  new comparison UI — John sees each option's price *and* EPH impact and accepts one. Accepting
  one doesn't auto-dismiss its siblings (he dismisses the rest); an exclusive "pick one of a
  group" affordance is a later refinement, not v1.

### Localization via the service area
`business_settings` gains a nullable `service_area` (migration `0006`, additive; edited in
Settings — an onboarding-capability change). Material Finder's UI reads it via `getSettings()` to
**pre-fill** the search `location`, which the user can override per search; a blank service area
→ a non-local search. The service area reaches the tool as tool **input** (the action supplies
it), so the tool stays snapshot-only and business-config lives on the app side.

### Manual add — no model
A "add a material yourself" form (name, price, unit, supplier) posts a server action that creates
the same suggestions (`material` context entry + `estimate_line_item` when there's an active
estimate) **without any model call** — so the tool is useful before `ANTHROPIC_API_KEY` is set
and when a search can't source a price. It flows through the same tenant-scoped suggestion
creation and the same accept path; it does **not** go through `dispatch`/a `tool_run` (there is no
model run to meter) — it is a plain user-authored suggestion, distinct from a tool run.

### Per-tool input UI
Material Finder gets its own surface — a `/projects/[id]/tools/[toolName]` route (or a per-tool
form component keyed off the registry) with a **query field, a mode toggle** ("this material" vs
"everything for this estimate"), a **location field** (pre-filled), and the **manual-add form** —
establishing the pattern #8–#10 use. The reference tool's one-off form is generalized into this
shape. Results surface in place (P2's "Waiting on you" + card + profit preview).

### Disclaimers vs citations
Material advice is not physical-work/code advice, so it does **not** carry the licensed-
professional disclaimer (that is #8 Photo Advisor / #9 Code Finder, via `message.disclaimer`).
It carries **citations** and a verify-with-supplier note — §7's "never fabricate a price it
cannot source" is met by every price riding with its `sourceUrl`.

## Risks / Trade-offs

- [Model returns a price with no source] → the result tool's schema requires `sourceUrl` per
  material; a material missing one is dropped (or the run surfaces an error) — no unsourced
  price becomes a suggestion.
- [Structured result + web search + citations interaction] → proven shape (strict tool + web
  search + citations compose); the mock encodes the contract, unit tests assert it, and the
  real impl is validated live in the deferred key-gated stage.
- [SDK install on a constrained disk] → `@anthropic-ai/sdk` is server-only, imported solely by
  the real impl; the mock path builds without exercising it.
- [Snapshot id leaks write power] → `activeEstimateId` is a plain string on a frozen snapshot;
  it targets a suggestion, which still only commits on accept (§5) through the tenant path.
- [Duplicate materials across searches] → dedup (P1) by target + payload; identical pending
  material suggestions aren't restacked.

## Migration Plan

None required for the tool itself. The snapshot `activeEstimateId` is a code/type change, no
schema. (`material` entries and `estimate_line_item` suggestions already exist from #5.)

## Open Questions

- **Query seeding** — v1 takes a free-text query (optionally pre-filled from the estimate
  scope); richer "find everything for this estimate" batch search is a later refinement.
- **Unit/quantity inference** — v1 proposes quantity 1 at the found unit price; smarter quantity
  from the scope is deferred.
- **Live proof** — real `web_search` returning real prices + citations, and `tool_run` live
  token usage, are the key-gated deferred tasks (relevant_notes.md §5).
