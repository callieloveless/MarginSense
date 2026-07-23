# Design — Material Finder (first real tool) + structured-result AI port

## Context

Material Finder is the first tool that leaves the mock behind in spirit: it web-searches for
materials, prices, and suppliers and proposes them into the job. Building it forces the shape
decisions the platform deferred — how the model returns **structured data**, how **citations**
travel, and how a tool proposes a line at the **active estimate**. It is scoped so #8–#10 copy
its patterns rather than re-invent them. Live model calls remain **key-gated and deferred**;
acceptance runs on a mock that returns canned structured materials + citations.

## Goals / Non-Goals

**Goals**
- A `src/ai/` capability to return a **validated, typed result** from a model call, working
  **together with** server-side web search and citations.
- The Material Finder tool: query → sourced materials → `material` context-entry +
  `estimate_line_item` suggestions + a cited conversation post.
- The **per-tool input UI** pattern; the **citation-as-data** rule; the snapshot exposing the
  **active estimate id** so a tool can target a line at it (lighting up P2's preview).
- The real `createAnthropicModelPort` written (SDK installed), exercised only behind the key.

**Non-Goals**
- No live calls in acceptance; no vision/photo/auto-trigger; no `document` target; no new math.

## Decisions

### Structured result via a strict result-tool — NOT `output_config.format`
The Anthropic API rejects `output_config.format` (JSON schema output) **together with
citations** (400). Material Finder needs both: typed materials *and* sourced prices. So the
port's structured-result mechanism is a **strict "result tool"** the model is made to call:
the request declares a `resultSchema` (Zod), the port turns it into a strict client tool (e.g.
`record_materials`) alongside the `web_search_20260209` server tool, the model searches then
calls the result tool with the typed list, and the port validates that tool call's input
against `resultSchema` and returns it as `response.result`. This composes cleanly with web
search and with citations (which arrive as `web_search_tool_result` blocks and as each
material's `sourceUrl`). *Alternative rejected:* `output_config.format` — simpler, but can't
carry citations, so a sourced price list is impossible in one call.

Port surface (extends #6's `ModelPort`, additive):
- `ModelRequest.resultSchema?: ZodType<T>` — when present, the model must return a value of
  this shape via the result tool.
- `ModelResponse.result?: T` — the validated structured value (undefined when no `resultSchema`).
- `citations` (already on the response from #6) carry the web-search sources.

The **mock** returns a canned `result` (a few materials, each with a `sourceUrl`) + citations,
deterministically, ignoring the network. The **real impl** (`createAnthropicModelPort`,
`@anthropic-ai/sdk`) wires `web_search_20260209` + the strict result tool + `citations`;
it is constructed only when `ANTHROPIC_API_KEY` is set (resolver unchanged from #6).

### The snapshot exposes the active estimate id (so a tool can target a line)
A tool proposes an `estimate_line_item` suggestion against a specific estimate
(`targetEstimateId`), but #6's `ProjectSnapshot` exposes the active estimate only as an engine
roll-up (no id). This change adds **`activeEstimateId: string | null`** to the snapshot (the
assembler already loads the active estimate — it's a field, not a new query). Material Finder
targets its line suggestions at `snapshot.activeEstimateId`; when it is null (no active
estimate), it emits only the `material` context-entry suggestions. This is what makes P2's
profit preview render for Material Finder's lines. It is a small MODIFIED `project-context`
snapshot requirement, reused by every future line-proposing tool.

### The Material Finder tool
`src/tools/material-finder/`:
- **`inputSchema`**: `{ query: string }` — the material to find, seeded in the UI from the
  estimate's scope/description where present.
- **`run(ctx)`**: builds a search prompt from the query + read-only context, calls
  `ctx.ai.complete({ system, messages, serverTools: [web_search], resultSchema: materialsSchema })`,
  and gets back `{ materials: [{ name, priceCents, unit, supplier?, sourceUrl }] }` + citations.
- **Returns**: `output` = the materials; `suggestions` = for each material, a **`material`
  `context_entry`** (name/price/unit/supplier/sourceUrl — the #5 payload) **and**, when
  `activeEstimateId` is set, an **`estimate_line_item`** (`category: "material"`, description =
  name, quantity 1, unitCostCents = priceCents, `targetEstimateId: activeEstimateId`); `message`
  = a plain summary listing the finds **with their source links**, plus a light "prices are
  live estimates — confirm with the supplier" note (§7: never a price without a source).
- Registered in the tool registry; dedup (P1) keeps repeat searches from stacking identical
  pending suggestions.

### Per-tool input UI
Material Finder gets its own surface — a `/projects/[id]/tools/[toolName]` route (or a
per-tool form component keyed off the registry) with a query field — establishing the pattern
#8–#10 use. The reference tool's one-off form is generalized into this shape. Results still
surface in place (P2's "Waiting on you" + card + profit preview).

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
