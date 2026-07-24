## Context

Everything Code Finder needs exists: the tool contract and dispatch (#6, P1), web search +
`resultSchema` on the port (#7a, first used by Material Finder), the compose seam (9a,
`dispatchAndCompose` + the empty `COMPOSE_EDGES`), the `code_ref` entry kind and the suggestion
queue (#5), the shared disclaimer (#8b), and `business_settings.service_area` (#7b). This change is
mostly assembly: a tool shaped like Material Finder, plus the first real compose edge.

Two shapes are settled by prior work and constrain the design. Material Finder set the pattern for
a **web-search tool that drops anything it can't source** (§7) — Code Finder copies it for
citations instead of prices. And 9a decided composition is an **app-layer fan-out**: the edge's
mapper runs where a `TenantDb` is in hand, which is exactly why the mapper can read the service
area the runner never could.

## Goals / Non-Goals

**Goals:**
- Answer a local-code question with sourced, jurisdiction-aware `code_ref` entries in the job's one
  memory, and make a code's *consequence* (permit, inspection) legible, not implicit.
- Light up 9a with the `photo-advisor → code-finder` edge: one code lookup per finding, no retyping.
- Keep a composed code traceable to the photo that prompted it.

**Non-Goals:**
- Line-item mutation, uploaded code PDFs, a per-tool chat thread, any authoritative determination
  (see the proposal). No migration; no new financial math.

## Decisions

### 1. The tool mirrors Material Finder, minus the modes and the estimate
`inputSchema` is `{ query, location?, photoStorageKey? }` — one question, an optional jurisdiction
override, and (on composed runs) the photo the query came from. The port `resultSchema` is
`{ codes: [{ code, requirement, jurisdiction?, sourceUrl?, complianceNote? }] }`; the tool drops
any code whose `sourceUrl` isn't a real URL (reusing the `isSourceUrl` rule Material Finder
already established) so no unsourced citation is ever proposed. Each surviving code becomes a
`code_ref` context-entry suggestion. There is **no `estimate` mode and no line item** — codes are
facts about the job, not costs, so Code Finder only ever writes to context.

### 2. `code_ref` gains optional source, compliance note, and photo — additive JSON
The `code_ref` payload is `{ code, citation, jurisdiction? }` today; it gains optional `sourceUrl`,
`complianceNote`, and `photoStorageKey`. All optional, so every existing `code_ref` still
validates and there is **no migration** (the payload is a `jsonb` column). This mirrors exactly how
8b added `severity`/`photoStorageKey` to `finding`. The card and the context list render the
compliance note as text and the source as a link.

### 3. The compose edge maps one finding to one query, and resolves jurisdiction app-side
`COMPOSE_EDGES["photo-advisor"] = [{ consumer: "code-finder", map }]`. The mapper receives Photo
Advisor's `output` and the `ComposeContext` (which carries the `TenantDb`), reads
`tenantDb.getSettings().serviceArea` **once**, and returns one Code Finder input per finding — the
query built from the finding's summary (and the materials it named), the location from the service
area, and `photoStorageKey` from the output. This is the app-layer tenant read 9a's design exists
to allow: the runner never sees settings. Each input dispatches as its own `compose` run at
step 1, so the codes for a three-finding photo are three composed runs, each a `tool_run` with
observable token cost.

*Why one run per finding, not one for all:* a `code_ref` that traces to a specific defect is worth
more than a pile of codes with no owner, and dispatch's dedup already stops a repeated run from
stacking duplicate `code_ref` suggestions. The cost (one web-search call per finding) is the
deliberate trade for that traceability, and it is bounded — one photo, a handful of findings.

### 4. Photo Advisor's output gains the run's photo key
The compose mapper needs the photo a finding came from, but Photo Advisor's `output.findings` are
the raw vision findings and don't carry it (the key is added when a finding becomes a *suggestion*,
not in the output). So Photo Advisor's `outputSchema` gains `photoStorageKey` — the one photo the
run was about, which every finding from that run shares. One additive field on an existing tool's
output; no behavior change to Photo Advisor itself beyond populating it.

### 5. Compliance notes live on the code and in the post — not on a line item
The user asked for "compliance notes on candidate line items." The honest v1: a line item proposed
by Photo Advisor is a *pending suggestion*, an independent row Code Finder can't mutate, and the
two tools' suggestions are deliberately independent (§5). So a compliance note is carried on the
`code_ref` (`complianceNote`) and surfaced in Code Finder's conversation post, naming the work it
concerns ("the joist-sistering work needs a permit — IRC …"). Badging an **accepted** line item
with its code is a real feature, but it needs a committed line to attach to and a link between the
two tools' outputs — deferred, and called out as such rather than half-built here.

### 6. Standalone requires the model; composed runs inherit the live port
The standalone query gates on `resolveModelPort()` being configured (like Material Finder's
search), because code lookup is the whole tool — there is no useful no-AI fallback. A composed run
needs no separate gate: it only happens because Photo Advisor just ran, which already required the
live port, and `dispatchAndCompose` reuses that same port for the consumer.

## Risks / Trade-offs

- **One web-search call per finding costs tokens the user didn't directly ask for** → bounded by
  one photo's findings, each a `tool_run` with recorded usage, and dedup prevents re-run stacking;
  the standalone path is the user's explicit ask. The live-AI proof item watches the first runs.
- **A wrong or stale code, confidently cited** → every result carries the non-authoritative
  disclaimer and drops anything unsourced, and a `code_ref` is a proposal the user accepts one at a
  time. This is the §5/§7 risk; mitigated, not removed.
- **Composed noise: a cosmetic `note` finding triggers a code lookup that finds nothing useful** →
  accepted trade for the simpler "one run per finding" rule the user chose; an empty result posts
  "no specific code found" and proposes nothing, and dedup keeps repeats quiet. A future refinement
  could skip `note`-severity findings.
- **Live code search is unproven until a key exists** → proven offline against the mock's canned
  result and a composed-run test; the real `web_search` proof is deferred like every prior tool's.

## Open Questions

- Should `note`-severity findings be excluded from the compose fan-out to cut cost/noise? Left in
  for v1 per the scoping choice; trivially added later as a filter in the mapper.
- Should an accepted `code_ref` composed from a finding, plus an accepted line item for the same
  repair, be visibly linked ("this line is permit-required")? The deferred line-item badge; wants a
  committed line and a cross-suggestion reference.
