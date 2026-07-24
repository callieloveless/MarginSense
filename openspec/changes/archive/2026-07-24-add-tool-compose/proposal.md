# Implement tool composition — a producer's output fans out to consumer runs (stage 9a)

## Why

The tool-platform spec already promises composition — *"a tool's typed `output` routed as another
tool's input"* (constitution §5, "Composing tools") — and P1 built the pieces for it: `dispatch`
accepts a `compose` source and enforces a step budget. But nothing has ever routed one tool's
output into another. Change #9 needs exactly that: when Photo Advisor diagnoses a job photo, Code
Finder should look up the local codes for **what it found**, without the user re-typing the
finding into a second tool.

This change builds that mechanism on its own, and ships it **dormant** — no producer→consumer
edge is registered yet — so the live app is unchanged. 9b (Code Finder) registers the first edge
and turns it on. Splitting the mechanism from its first consumer is the same shape as P1 (the
dispatch seam before any auto-trigger) and 7a (the structured-result port before Material Finder):
the risky, reusable plumbing lands and is proven by itself.

## What Changes

- **One app-layer dispatch entry, `dispatchAndCompose`** (`app/_lib/compose.ts`): it runs a tool
  through the platform's `dispatch`, and then, on success, fans the tool's `output` out to any
  registered consumers. **Composition is a property of this one entry, not of any single tool's
  action** — so every app-layer tool run gets the same behavior and a registered edge fires no
  matter which tool produced the output. It is deliberately app-layer, not in the DB-free runner,
  because an edge's mapping may need tenant data the runner can't reach (Code Finder needs the
  business's service area). Every composed run still flows through `dispatch`, so the "one dispatch
  entry point" invariant holds and every composed emission is a `pending` suggestion.
- **A compose-edge registry** (`COMPOSE_EDGES`), **empty for now** — the same dormant-seam pattern
  as `TRIGGERS`. An edge names a producer tool, a consumer tool, and a mapping
  `(producerOutput, ctx) => consumerInput[]` that may read tenant-scoped data through the handle
  `ctx` carries. 9b adds the `photo-advisor → code-finder` edge (one consumer input per finding);
  #12's graph editor will later make this registry user-editable.
- **The step budget bounds the chain, and the entry owns the arithmetic.** `dispatchAndCompose`
  dispatched the producer, so it knows the producer's step and dispatches each composed run at
  `producerStep + 1` — no caller passes a step. `dispatch` already refuses a non-user run at or
  beyond `MAX_TOOL_STEPS`, so a future edge that loops (A composes B composes A) is stopped by the
  platform, not by hope. Nothing here raises the budget.
- **The existing tool actions route through it, with no behavior change.** Material Finder's search
  action, the reference tool's action, and `advisePhoto` swap their raw `dispatch(...)` call for
  `dispatchAndCompose(...)`. With `COMPOSE_EDGES` empty the wrapper is `dispatch` plus a no-op, so
  nothing a user sees changes — but composition is now uniform, and 9b is one registry entry rather
  than a new call site in the right action.
- **Proven with a reference producer and consumer.** Unit tests register a throwaway edge and run
  it through `dispatchAndCompose`, asserting the fan-out count, the `compose` source on each run,
  the step increment, that composed output stays `pending`, that a producer at the budget ceiling
  has its composed run refused, and that a failing consumer never breaks the producer. No real tool
  is added.

## Capabilities

### Modified Capabilities
- `tool-platform`: the existing *"Composed tool output cannot bypass user confirmation"* and
  *"Single dispatch entry point"* requirements are made real — composition is implemented as a
  step-bounded fan-out through `dispatch` with source `compose`, a producer's `output` mapping to
  zero or more consumer inputs, every composed run tenant-scoped and every emission `pending`.

## Impact

- **New code:** `app/_lib/compose.ts` (`dispatchAndCompose` + the internal fan-out + the
  `COMPOSE_EDGES` registry, empty); unit tests over it with a reference producer/consumer.
- **Changed call sites (no behavior change):** the app-layer tool actions — Material Finder's
  search, the reference tool, and `advisePhoto` — route their `dispatch(...)` through
  `dispatchAndCompose(...)`. The manual-add path (no model, no dispatch) is untouched.
- **No new dependency, no migration, no schema change.** `dispatch(source: "compose")` and the
  step budget already exist (P1); this uses them.
- **Depends on:** `tool-platform` (#6 contract, P1 dispatch + `compose` source + `MAX_TOOL_STEPS`),
  and the app-layer tool actions (#7b, #8b) that dispatch a tool run.
- **Feeds:** 9b Code Finder registers the first edge; #12's tool-graph editor turns the coded
  registry into a drawn one.

## Non-goals

- **No real tool and no live edge.** `COMPOSE_EDGES` stays empty; Code Finder and the
  `photo-advisor → code-finder` edge are 9b. Today this changes nothing a user sees.
- **No platform/runner change and no snapshot change.** The seam is app-layer precisely so the
  runner stays DB-free and the read-only snapshot doesn't have to carry settings data; the
  alternative (a platform compose registry + service area on the snapshot) is deliberately not
  taken here.
- **No raising the step budget** and no new event. `photo.uploaded` keeps emitting with no
  subscriber; composition off a producer's output is a separate path from event triggers.
- **No auto-commit.** Composition never accepts a suggestion; every hop's output is `pending`
  until the user accepts, exactly as a direct run's is.
