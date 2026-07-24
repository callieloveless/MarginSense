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

- **An app-layer compose seam** (`app/_lib/compose.ts`): given a producer tool's completed
  `output`, it looks up any registered **compose edges**, maps that output into zero or more
  consumer inputs, and dispatches each consumer through the **single dispatch entry point** with
  `source: "compose"` at the next step. It is deliberately app-layer, not in the DB-free runner,
  because an edge's mapping may need tenant data the runner can't reach (Code Finder needs the
  business's service area). Every composed run therefore still flows through `dispatch`, so the
  "one dispatch entry point" invariant holds and every composed emission is a `pending`
  suggestion.
- **A compose-edge registry** (`COMPOSE_EDGES`), **empty for now** — the same dormant-seam pattern
  as `TRIGGERS`. An edge names a producer tool, a consumer tool, and a mapping
  `(producerOutput, ctx) => consumerInput[]` that may read tenant-scoped data through the handle
  `ctx` carries. 9b adds the `photo-advisor → code-finder` edge (one consumer input per finding);
  #12's graph editor will later make this registry user-editable.
- **The step budget bounds the chain.** A composed run is dispatched at `producerStep + 1`, and
  `dispatch` already refuses a non-user run at or beyond `MAX_TOOL_STEPS` — so a future edge that
  loops (A composes B composes A) is stopped by the platform, not by hope. Nothing here raises the
  budget.
- **Composition is wired after a producer run, in one place.** The app-layer flow that runs a tool
  and can have consumers (today: `advisePhoto`, which runs Photo Advisor) calls the compose seam
  with the run's output and step. With no edge registered this is a no-op; the call site exists so
  9b is one registry entry, not a rewiring.
- **Proven with a reference consumer.** Unit tests register a throwaway edge (a producer's output
  fanned to a reference consumer) and assert the fan-out count, the `compose` source on each run,
  the step increment, that composed output stays `pending`, and that the step budget refuses a
  run past `MAX_TOOL_STEPS`. No real tool is added.

## Capabilities

### Modified Capabilities
- `tool-platform`: the existing *"Composed tool output cannot bypass user confirmation"* and
  *"Single dispatch entry point"* requirements are made real — composition is implemented as a
  step-bounded fan-out through `dispatch` with source `compose`, a producer's `output` mapping to
  zero or more consumer inputs, every composed run tenant-scoped and every emission `pending`.

## Impact

- **New code:** `app/_lib/compose.ts` (the seam + the `COMPOSE_EDGES` registry, empty); the
  compose call after `advisePhoto`; unit tests over the seam with a reference producer/consumer.
- **No new dependency, no migration, no schema change.** `dispatch(source: "compose")` and the
  step budget already exist (P1); this uses them.
- **Depends on:** `tool-platform` (#6 contract, P1 dispatch + `compose` source + `MAX_TOOL_STEPS`),
  and the app-layer `advisePhoto` flow (#8b) as the first place a producer run can fan out.
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
