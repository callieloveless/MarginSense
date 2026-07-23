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
- **The Material Finder tool** (`src/tools/material-finder/`) with the full initial feature set:
  - **Two search modes** — a **free-text query** (one material need) and **"find everything for
    this estimate"** (derives the needs from the active estimate's scope + lines and searches
    each).
  - **Comparable options** — for a need it returns **a few options** (across suppliers / prices /
    grades), each proposed as its **own suggestion** so John picks the best value. With an active
    estimate each option is an `estimate_line_item` (profit-previewed); otherwise a `material`
    context entry. An option with no source is dropped (§7).
  - **Localized to the service area** — the search is biased to the business's **service area**,
    pre-filled and overridable per search (see the new settings field below).
  - **Manual add** — a "add a material yourself" form (name, price, unit, supplier) that proposes
    the same suggestions **with no model call**, so the tool works before a key is set and when a
    price can't be found.
  - `run(ctx)` returns `output` = the typed options, `suggestions` = the option suggestions, and
    a conversation `message` summarizing the finds **with citations**. Registered in the registry.
- **Service area on business settings.** `business_settings` gains an optional `service_area`,
  edited in **Settings** and read by Material Finder (`getSettings()`) to localize — an
  onboarding-capability addition (migration `0006`, additive).
- **Citations are data, not prose.** Each option's `sourceUrl` rides on its `material` entry
  (change #5 already has the field) and its proposed line; the conversation post renders them as
  links. Nothing a tool asserts about a price exists without a source (§7).
- **Per-tool input UI.** A Material Finder screen with its query form + mode toggle + manual-add
  form — the reusable per-tool pattern (`/tools/[toolName]` or a registry-keyed component) that
  #8–#10 adopt, replacing the reference tool's one-off form.
- **P2's profit preview lights up.** Each option's `estimate_line_item` suggestion flows through
  the existing tool-agnostic `SuggestionCard`, so comparing options *is* comparing their
  "profit per hour $X → $Y" before accept — no new UI, inherited from P2.
- **Live AI stays deferred.** Everything is built, typed, and unit-tested against the mock
  port; the tasks end with the key-gated stage to prove real `web_search` returns real prices +
  citations and that `tool_run` records live token usage (relevant_notes.md §5).

## Capabilities

### New Capabilities
- `material-finder` — the Material Finder tool on the platform contract: query-or-whole-estimate
  search → web-search + structured extraction via the port → comparable, sourced options as
  `material` / `estimate_line_item` suggestions + a cited conversation post; manual add; its
  per-tool input surface.

### Modified Capabilities
- `tool-platform` — the AI model port gains a **structured-result** capability (a validated,
  Zod-typed result via a strict result-tool, compatible with server-side web search and
  citations), and its real Anthropic implementation is wired behind `ANTHROPIC_API_KEY`. Contract,
  runner, dispatch, dedup, and tool-run requirements are unchanged.
- `project-context` — the read-only project snapshot gains the **active estimate's id** so a
  tool can target a line-item suggestion at it. Accept/dismiss and isolation are unchanged.
- `onboarding` — business settings gain an **editable service area** (optional input), edited in
  Settings and read by tools to localize. The financial capture model is unchanged.

## Impact

- **New code:** `src/tools/material-finder/` (the tool, its I/O schemas, both search modes);
  `src/ai/` structured-result extension (request `resultSchema`, response `result`) with mock +
  real impls; the real `createAnthropicModelPort` (web search + result tool + citations) behind
  the key; `ProjectSnapshot.activeEstimateId`; migration `0006` adding `business_settings.
  service_area` + a Settings field to edit it; a Material Finder UI surface (query + mode toggle
  + manual-add form) under `app/(app)/projects/[id]/tools/`; unit tests (options mapped to
  sourced suggestions; mock returns typed results + citations; manual add with no model; dedup
  across repeat searches; snapshot carries the active estimate id).
- **New dependency:** `@anthropic-ai/sdk` (installed now; used only inside the real port impl).
- **Migration `0006`** — additive: `business_settings.service_area` (nullable text); no RLS
  change (the table's per-business policy already covers it).
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
- **No exclusive "pick one of a group" affordance** — options are independent suggestions; John
  accepts one and dismisses the rest. Auto-dismissing siblings is a later refinement.
- **No inferred quantities** — options propose quantity 1 at the found unit price; the user
  edits quantity on accept. Smarter quantity from scope is deferred.
- **No new financial math and no new commit path** — line prices/margins come from `src/engine/`
  on accept; suggestions stay `pending` until the user accepts (change #5, unchanged).
- **No `document` target and no tool-graph editor** — still deferred to #10 / #12.
