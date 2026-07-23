# tool-platform

## MODIFIED Requirements

### Requirement: Tool runs are logged and traceable to what they produced
Every tool invocation SHALL create a `tool_run` when it starts and finalize it when it
completes: the run is recorded as running (no terminal status) at start, then finalized to
`ok` or `error` — with token usage, latency, tool name, project, and source — including runs
that fail. An in-flight run SHALL be observable through its record before it completes. Each
`tool_run` row SHALL carry a non-null `business_id` with Row-Level Security enforced, and the
suggestions and conversation message a run produces SHALL reference their `tool_run`, so any
proposed change is traceable to the run — and cost — that produced it.

#### Scenario: A run is observable while in flight
- **WHEN** a tool run has started but not yet completed
- **THEN** its `tool_run` record exists with a running (non-terminal) status and can be read

#### Scenario: A successful run is logged and linked
- **WHEN** a tool run completes successfully and emits a suggestion and a message
- **THEN** its `tool_run` is finalized with status `ok`, token usage, latency, and source, and
  the suggestion and message reference that `tool_run`

#### Scenario: A failed run is still logged
- **WHEN** a tool's `run` throws, its output fails validation, or its emissions fail to persist
- **THEN** the `tool_run` is finalized with status `error` and whatever usage and latency
  accrued, and it is never left showing `ok`

#### Scenario: Tool runs are tenant-isolated
- **WHEN** a user from business A requests business B's tool runs
- **THEN** Row-Level Security returns no rows and the `business_id` on every recorded run is
  stamped from the tenant handle, never from input

## ADDED Requirements

### Requirement: Single dispatch entry point for tool runs
Every tool invocation — user-initiated, event-triggered, or from a composed tool — SHALL flow
through one dispatch entry point that resolves the tool from the registry, starts its run,
executes it, and finalizes it. Dispatch SHALL route by source (`user`, `auto`, or `compose`)
and SHALL reject an unknown tool name without starting a run. There SHALL be no other path
that invokes a tool.

#### Scenario: All invocations go through dispatch
- **WHEN** a tool is invoked from any source
- **THEN** it runs through the single dispatch entry point, which starts and finalizes its
  `tool_run` and applies the same dedup and emission rules regardless of source

#### Scenario: An unknown tool is rejected before any run
- **WHEN** dispatch is asked to run a tool name that is not registered
- **THEN** it is rejected and no `tool_run` is started

### Requirement: Event-triggered tool runs
The system SHALL provide an event-emission seam that dispatches the tools subscribed to an
event, as recorded in a trigger registry, each with source `auto`. Emitting an event with no
subscribers SHALL be a no-op. Event-triggered and composed runs SHALL be bounded by a step
budget so a chain of triggers cannot run without limit, and every triggered run SHALL be
scoped to one business and project.

#### Scenario: Emitting an event with no subscribers does nothing
- **WHEN** an event is emitted and no tool is registered for it
- **THEN** no tool runs and nothing changes

#### Scenario: A subscribed tool is dispatched on its event
- **WHEN** a tool is registered for an event and that event is emitted for a project
- **THEN** the tool is dispatched with source `auto`, scoped to that business and project, and
  its output follows the normal suggestion/post path (nothing auto-commits)

#### Scenario: Trigger chains are bounded
- **WHEN** event-triggered or composed runs would exceed the step budget
- **THEN** further dispatch is refused rather than looping without limit
