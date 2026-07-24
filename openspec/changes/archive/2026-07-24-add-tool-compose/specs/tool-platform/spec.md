## MODIFIED Requirements

### Requirement: Composed tool output cannot bypass user confirmation
The system SHALL allow a tool's typed `output` to be routed as another tool's input, and SHALL
implement that routing as a **fan-out through the single dispatch entry point**: after a producer
tool's run completes, its `output` MAY be mapped to zero or more consumer inputs, and each
consumer SHALL be invoked through `dispatch` with source `compose`. The routing SHALL carry only
validated, read-only data and SHALL NOT be a path to change an estimate or context fact. Across
any composition of tools, an estimate or context change SHALL occur only when the user accepts a
suggestion, and every hop SHALL be scoped to one business and project. A composed run SHALL be
dispatched at the next step after its producer, so the platform's step budget bounds any chain.

#### Scenario: Routed output is validated read-only data
- **WHEN** one tool's `output` is routed into another tool's input
- **THEN** it is validated against the consuming tool's `inputSchema` at dispatch, and it grants
  no ability to write to the estimate or context

#### Scenario: One producer output fans out to many consumer runs
- **WHEN** a producer's `output` maps to several consumer inputs
- **THEN** each is dispatched as its own `compose` run, and each produces only `pending`
  suggestions

#### Scenario: A composition still requires user acceptance to commit
- **WHEN** a chain of tools runs and proposes changes
- **THEN** nothing is committed to the estimate or context until the user accepts the resulting
  suggestions

#### Scenario: A composed run stays within one tenant
- **WHEN** tools are composed within a project
- **THEN** every hop is scoped to that business and project, with `business_id` stamped from
  the tenant handle rather than input

#### Scenario: A composed run is marked as composed
- **WHEN** a consumer runs as a hop of a composition
- **THEN** its `tool_run` records source `compose`, so a composed run is distinguishable from a
  user-initiated or event-triggered one

### Requirement: Single dispatch entry point for tool runs
Every tool invocation — user-initiated, event-triggered, or from a composed tool — SHALL flow
through one dispatch entry point that resolves the tool from the registry, starts its run,
executes it, and finalizes it. Dispatch SHALL route by source (`user`, `auto`, or `compose`) and
SHALL reject an unknown tool name without starting a run. Composed runs SHALL be dispatched at a
step greater than their producer's, and dispatch SHALL refuse a non-user run at or beyond the step
budget, so a composition (or a chain of triggers) cannot run without limit. There SHALL be no
other path that invokes a tool.

#### Scenario: All invocations go through dispatch
- **WHEN** a tool is invoked from any source
- **THEN** it runs through the single dispatch entry point, which starts and finalizes its
  `tool_run` and applies the same dedup and emission rules regardless of source

#### Scenario: An unknown tool is rejected before any run
- **WHEN** dispatch is asked to run a tool name that is not registered
- **THEN** it is rejected and no `tool_run` is started

#### Scenario: A composed chain is bounded by the step budget
- **WHEN** composed runs would exceed the step budget
- **THEN** further composed dispatch is refused rather than looping without limit
