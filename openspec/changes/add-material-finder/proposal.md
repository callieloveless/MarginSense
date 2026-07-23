# Add Material Finder — the first real tool

## Why

The platform (#6), the dispatch/lifecycle seam (P1), and the suggestion surface with profit
preview (P2) are all in place, but **no real tool exists** — the reference tool only proves the
wire. Material Finder is the first tool that does the job the product exists for: it
**web-searches materials, prices, and suppliers** and proposes them as material **line items**
and **context entries**, posting findings **with citations** — never a price it can't source
(§7). It also **locks the shape decisions we deferred**: how the `src/ai/` port returns
**structured data** (typed materials, not parsed prose), how **citations** travel as data, and
the **per-tool input UI** #8–#10 copy. And because it emits `estimate_line_item` suggestions, it
is what finally makes P2's **profit preview render in the app** — you see a proposed material
move the job's red/yellow/green before you accept.

## What Changes

- **`src/ai/` gains a structured-result capability, compatible with web search + citations.**
  A model call can now return a **validated structured result** (a Zod-typed value), obtained
  via a **strict "result tool"** the model must call — deliberately *not* `output_config.format`,
  which the API rejects alongside citations. So a single call can run **server-side web search**
  (`web_search_20260209`), cite its sources, *and* hand back a typed material list where each
  material carries its own `sourceUrl`. The mock returns canned structured materials + citations
  (offline, deterministic); the **real Anthropic implementation is written** here
  (`createAnthropicModelPort`, `@anthropic-ai/sdk`) but its live calls stay **key-gated and
  deferred** — acceptance runs on the mock.
- **The Material Finder tool** (`src/tools/material-finder/`): `inputSchema` = a search query
  (seeded from the estimate's scope where available); `run(ctx)` reads the read-only snapshot,
  calls the port to search + extract, and returns `output` = the typed materials (with sources),
  `suggestions` = one **material `context_entry`** per material **and** an optional
  **`estimate_line_item`** (the material as a costed line) each, and a **conversation `message`**
  summarizing the finds **with citations**. Registered in the tool registry.
- **Citations are data, not prose.** Each material's `sourceUrl` rides on the `material` context
  entry (change #5 already has the field) and the proposed line; the conversation post renders
  them as links. Nothing a tool asserts about a price exists without a source (§7).
- **Per-tool input UI.** A Material Finder screen with its own query form — the reusable
  pattern (`/tools/[toolName]` or a per-tool form component) that #8–#10 adopt, replacing the
  reference tool's one-off form.
- **P2's profit preview lights up.** Material Finder's `estimate_line_item` suggestions flow
  through the existing tool-agnostic `SuggestionCard`, so each proposed material shows
  "profit per hour $X → $Y" before accept — no new UI, inherited from P2.
- **Live AI stays deferred.** Everything is built, typed, and unit-tested against the mock
  port; the tasks end with the key-gated stage to prove real `web_search` returns real prices +
  citations and that `tool_run` records live token usage (relevant_notes.md §5).

## Capabilities

### New Capabilities
- `material-finder` — the Material Finder tool on the platform contract: query in → web-search +
  structured extraction via the port → `material` context-entry and `estimate_line_item`
  suggestions (each sourced) + a cited conversation post; its per-tool input surface.

### Modified Capabilities
- `tool-platform` — the AI model port gains a **structured-result** capability (a validated,
  Zod-typed result via a strict result-tool, compatible with server-side web search and
  citations), and its real Anthropic implementation is wired behind `ANTHROPIC_API_KEY`. The
  contract, runner, dispatch, dedup, and tool-run requirements are unchanged.

## Impact

- **New code:** `src/tools/material-finder/` (the tool + its I/O schemas); `src/ai/` structured-
  result extension (request `resultSchema`, response `result`) with mock + real impls; the real
  `createAnthropicModelPort` (web search + result tool + citations) behind the key; a
  Material Finder UI surface + input form under `app/(app)/projects/[id]/tools/`; unit tests
  (tool maps materials → sourced suggestions; the port's mock returns typed results + citations;
  dedup across repeat searches).
- **New dependency:** `@anthropic-ai/sdk` (installed now; used only inside the real port impl).
- **Depends on:** `tool-platform` (#6 contract, P1 dispatch/lifecycle), `project-context` (#5
  `material` entries + suggestions; P2 preview + card), `estimates` (the line the preview
  measures against).
- **Feeds:** #8 Photo Advisor and #9 Code Finder reuse the per-tool input pattern, the citation-
  as-data rule, and (for #9) the dormant trigger seam; the structured-result port capability is
  now the template for every extraction tool.

## Non-goals

- **No live model calls in acceptance** — proven on the mock; the real `web_search` proof is a
  deferred, key-gated stage.
- **No photo upload, vision, or auto-triggers** — those are #8/#9.
- **No new financial math and no new commit path** — line prices/margins come from `src/engine/`
  on accept; suggestions stay `pending` until the user accepts (change #5, unchanged).
- **No `document` target and no tool-graph editor** — still deferred to #10 / #12.
