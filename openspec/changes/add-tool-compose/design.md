## Context

P1 (`add-tool-dispatch`) built dispatch as the single entry point and gave it a `compose` source
and a `MAX_TOOL_STEPS` budget — but nothing composes. The tool-platform spec has described
composition since #6, and 8b's `advisePhoto` now produces a Photo Advisor `output` full of
findings that a code tool wants. This change turns the described capability into a working one.

The one real constraint shapes the whole design: **the runner is DB-free** (`src/tools/` imports
no Drizzle, holds no handle), because that is what keeps a tool unable to write. But the first
real composition — Code Finder off a finding — needs the business's **service area**, which lives
in settings. So the fan-out cannot live in the runner; it lives one layer up, in the app, where a
`TenantDb` is already in hand. Dispatch stays the single entry point; composition just calls it.

## Goals / Non-Goals

**Goals:**
- Implement composition as a step-bounded fan-out through `dispatch(source: "compose")`, with a
  producer's `output` mapping to zero or more consumer inputs.
- Ship it dormant (no edge) and proven on its own, so 9b is one registry entry.
- Keep the runner DB-free and the snapshot unchanged.

**Non-Goals:**
- Any real tool, any live edge, any snapshot or platform-registry change (see the proposal).
- Raising the step budget; changing how events (`photo.uploaded`) work.

## Decisions

### 1. One app-layer dispatch entry, so composition is uniform — not a per-tool add-on
`dispatchAndCompose(request, { tenantDb, port })` in `app/_lib/compose.ts` is the single app-layer
way to run a tool: it builds the tenant-bound `dispatchDeps`, calls the platform's `dispatch`,
and on success fans the tool's `output` out to `COMPOSE_EDGES[request.toolName]`. For each edge it
`await`s `edge.map(output, ctx)` to get consumer inputs and dispatches each. `ctx` carries
`{ tenantDb, projectId, step }`, so an edge's mapper reads whatever tenant data it needs (Code
Finder's mapper reads `tenantDb.getSettings().serviceArea`) **inside the app layer**, never inside
the runner. The mapper is `async` for exactly this reason.

The reason it is *one entry* and not a `composeAfterRun` call dropped into `advisePhoto`: composition
is a property of the platform, not of Photo Advisor. If only the Photo Advisor action called the
seam, a later `material-finder → X` edge would silently do nothing, because Material Finder's action
never called it — a special case layered on shared infrastructure, and a latent bug. Making every
app-layer tool run go through `dispatchAndCompose` means a registered edge fires regardless of which
tool produced the output, which is what "the platform supports composition" should mean.

*Alternative considered:* a platform compose registry in `src/tools/` plus `service_area` on the
read-only snapshot, so the DB-free runner could pass jurisdiction to a consumer. Rejected for 9a:
it modifies `project-context` (the snapshot) and the platform seam to serve a single edge, and it
puts tenant data into the runner the DB-free rule exists to keep out. The app-layer entry is the
smaller change and keeps the invariant; #12 can generalize later.

### 2. The entry owns the step arithmetic
Because `dispatchAndCompose` dispatched the producer, it already holds `request.step` — so it
dispatches each composed run at `(request.step ?? 0) + 1` with no caller passing a step and no
reading it back off `ToolRunOutcome` (which doesn't carry it). A user-initiated Photo Advisor run
is step 0, so its composed Code Finder runs are step 1; a hop that composed again would be step 2,
and so on until `dispatch` refuses at `MAX_TOOL_STEPS`. The budget is the platform's existing
guardrail (`dispatch` refuses a non-user run whose step is `>= MAX_TOOL_STEPS`); 9a only feeds it
the right step and never widens it.

### 3. A failing or empty composition never breaks the producer
The fan-out runs **after** the producer's `dispatch` has already returned `ok` and its suggestions
are on the queue. A consumer that throws, an unknown consumer name, a mapper that throws, or a
composed run the **step budget refuses** must not turn the producer's success into a failure — so
the fan-out catches and logs per-consumer errors and never re-throws (`dispatchAndCompose` returns
the producer's `ToolRunOutcome` unchanged, so its callers don't change how they read the result).
This mirrors how `emitPhotoUploaded` swallows a subscriber failure: composition is additive, and
its failure degrades to "the follow-up didn't run," never "your photo advice failed." If the
producer's own `dispatch` throws, `dispatchAndCompose` lets it propagate and composes nothing.

### 4. Dedup and pending-only come for free
Because every composed run goes through `dispatch`, it inherits the runner's existing behavior:
each proposed suggestion is validated, de-duplicated against the pending queue, created `pending`,
and linked to its own `tool_run`. 9a adds no commit path and no new emission rule — it only
arranges for `dispatch` to be called again with a mapped input and the `compose` source.

### 5. The registry is a typed map, empty now
`COMPOSE_EDGES: Record<string, ComposeEdge[]>` keyed by producer tool name, `{}` for now — the
same "seam exists before a subscriber" shape as `TRIGGERS`. An edge is
`{ consumer: string; map(output, ctx): Promise<unknown[]> }`. 9b adds
`COMPOSE_EDGES["photo-advisor"] = [{ consumer: "code-finder", map: findingsToCodeQueries }]`. The
type is generic (`unknown` output/input) at the registry boundary, like `AnyTool`; the mapper is
where each edge's real types live.

## Risks / Trade-offs

- **The composition edge is coded, not declarative** → that is the deliberate 9a/9b scope; the
  guardrail for #12 is only "keep tool I/O typed and side-effect-free," which holds. When the
  graph editor lands, `COMPOSE_EDGES` becomes the data it edits.
- **A composed run costs a model call the user didn't directly ask for** → 9a spends nothing (no
  edge); 9b's edge will, and the proposal for 9b owns that cost decision (one run per finding, each
  a `tool_run` with observable tokens). 9a's job is only to make the budget-bounded plumbing exist.
- **App-layer orchestration could drift from "dispatch is the only entry point"** → it does not:
  `dispatchAndCompose` *calls* `dispatch`; it is not a second way to run a tool. A test asserts
  every composed run produced a `tool_run` through the normal path.
- **The step could be computed wrong** → `dispatchAndCompose` owns it (`(request.step ?? 0) + 1`),
  so no caller can pass a stale value; a test covers that a composed run is `producerStep + 1` and
  that a producer at `MAX_TOOL_STEPS - 1` has its composed run refused at the ceiling.

## Open Questions

- Should the compose seam eventually live in the platform once the snapshot carries the small,
  read-only bits an edge needs (service area, address)? Plausible at #12; out of scope now.
- Should a composed run be visible as "triggered by Photo Advisor" in the conversation, beyond its
  `tool_run` source? Deferred to 9b, where there is a real producer to attribute.
