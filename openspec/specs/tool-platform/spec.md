# tool-platform Specification

## Purpose
TBD - created by archiving change add-tool-platform. Update Purpose after archive.
## Requirements
### Requirement: Uniform tool contract
Every tool SHALL be defined by the same shape: a name, a Zod `inputSchema`, a Zod
`outputSchema`, and a `run(ctx)` function that receives a read-only project snapshot plus
validated input and returns a result with three separated parts — a typed `output` (validated
against `outputSchema`), zero or more proposed suggestions, and an optional conversation
message. A tool SHALL be typed and side-effect-free — it SHALL NOT receive a database handle
or any write path — so it can be wired into a future tool graph without redesign
(constitution §5, "Composing tools").

#### Scenario: A tool declares typed input and output
- **WHEN** a tool is defined
- **THEN** it exposes an `inputSchema`, an `outputSchema`, and a `run(ctx)`, and its input and
  its `output` are validated against those schemas at the boundary

#### Scenario: A tool has no write path
- **WHEN** a tool's `run(ctx)` executes
- **THEN** the context it receives exposes no method that mutates the estimate or context, and
  the only changes it can propose leave the run as pending suggestions

#### Scenario: Output, suggestions, and message are distinct
- **WHEN** a tool returns its result
- **THEN** its typed `output` is validated read-only data, its suggestions are the only
  changes that can be committed (on user accept), and its message is posted to the one
  conversation

### Requirement: Tools are registered and enumerable
The system SHALL keep a registry of the available tools keyed by name, and the tool surface,
event-driven invocations, and any composition SHALL resolve a tool from that registry rather
than a hard-coded list.

#### Scenario: The surface lists registered tools
- **WHEN** the project Tools surface is shown
- **THEN** it lists the tools from the registry and can open any one of them

#### Scenario: A tool is resolved by name
- **WHEN** a tool is invoked by name that is not in the registry
- **THEN** the invocation is rejected and no run occurs

### Requirement: Tool runner turns output into suggestions and a conversation post
The system SHALL provide a single tool runner that validates a tool's input, assembles the
read-only snapshot, calls `run(ctx)`, validates the output, creates each proposed change as a
`pending` suggestion in the project's suggestions queue, and posts one message to the single
project conversation attributed to the tool. The runner SHALL be the only code path that
invokes a tool, and it SHALL have no path that commits an estimate or context change directly.

#### Scenario: A run produces pending suggestions and a conversation post
- **WHEN** a tool runs against a project and returns a proposed context entry
- **THEN** a `pending` suggestion for that entry appears in the project's suggestions queue and
  one message attributed to the tool is posted to the project's single conversation

#### Scenario: A run never commits directly
- **WHEN** a tool run completes
- **THEN** nothing in the estimate or context is changed until the user accepts a resulting
  suggestion through the existing accept path

#### Scenario: Invalid input is rejected at the boundary
- **WHEN** a tool is invoked with input that fails its `inputSchema`
- **THEN** the runner rejects the invocation and the tool's `run` is never called

### Requirement: Identical pending suggestions are de-duplicated
When creating a run's proposed suggestions, the runner SHALL NOT create a suggestion identical
(same target, target estimate, and payload) to one already `pending` for the project, so that
repeated or auto-triggered runs do not fill the queue with duplicates.

#### Scenario: A repeated run does not duplicate a pending suggestion
- **WHEN** a tool proposes a suggestion identical to one already pending for the project
- **THEN** no second pending suggestion is created and the existing one remains

#### Scenario: A dismissed proposal is not recreated as pending
- **WHEN** a tool re-proposes a suggestion the user previously dismissed
- **THEN** it is not resurfaced as a new pending suggestion

### Requirement: Composed tool output cannot bypass user confirmation
The system SHALL allow a tool's typed `output` to be routed as another tool's input, but that
routing SHALL carry only validated, read-only data and SHALL NOT be a path to change an
estimate or context fact. Across any composition of tools, an estimate or context change SHALL
occur only when the user accepts a suggestion, and every hop SHALL be scoped to one business
and project.

#### Scenario: Routed output is validated read-only data
- **WHEN** one tool's `output` is routed into another tool's input
- **THEN** it is validated against the producing tool's `outputSchema` and the consuming tool's
  `inputSchema`, and it grants no ability to write to the estimate or context

#### Scenario: A composition still requires user acceptance to commit
- **WHEN** a chain of tools runs and proposes changes
- **THEN** nothing is committed to the estimate or context until the user accepts the resulting
  suggestions

#### Scenario: A composed run stays within one tenant
- **WHEN** tools are composed within a project
- **THEN** every hop is scoped to that business and project, with `business_id` stamped from
  the tenant handle rather than input

### Requirement: Mockable AI model port with centralized config
The system SHALL provide a model port in `src/ai/` that centralizes model IDs and AI
configuration in one place (no scattered magic constants) and that tools call instead of the
Anthropic SDK directly. The port's request SHALL accommodate a system prompt, a message list,
optional image input, optional server-tool declarations, and an optional **structured-result
schema**; and its response SHALL report content, token usage, optional citations, and — when a
result schema was requested — a **validated structured result of that shape**. The structured
result SHALL be obtainable together with server-side web search and citations (i.e. not via a
mechanism the API forbids alongside citations), so a single call can search the web, cite its
sources, and return typed data. The port SHALL have a mock implementation used by unit tests
and a real Anthropic implementation gated behind `ANTHROPIC_API_KEY`; when the key is absent the
system SHALL report the AI layer as unconfigured and SHALL NOT construct the real client.

#### Scenario: Tools run against the mock port in tests
- **WHEN** a tool is unit-tested
- **THEN** it calls the mock model port and no real Anthropic request is made

#### Scenario: AI is unconfigured without a key
- **WHEN** no `ANTHROPIC_API_KEY` is set
- **THEN** the AI layer reports `unconfigured`, the real Anthropic client is not constructed, and
  tools depending on live models render a "connect AI" state

#### Scenario: Model IDs come from one config
- **WHEN** a tool selects a model
- **THEN** it reads the id from the centralized AI config, and the default judgment-heavy model is
  `claude-opus-4-8`

#### Scenario: A call returns a validated structured result
- **WHEN** a tool requests a call with a structured-result schema
- **THEN** the response carries a value validated against that schema, and this composes with
  server-side web search and citations in the same call

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

### Requirement: Project-page Tools surface with a reference tool
Tools SHALL open from the project page (the unit that owns the shared context and conversation).
This capability SHALL ship a Tools surface that lists available tools and opens one, plus a
reference tool that proves the platform end-to-end using the mock model port: input validated,
snapshot read, a typed output produced, a pending suggestion emitted, a conversation post made,
and a `tool_run` logged and linked — with no external dependency.

#### Scenario: The reference tool proves the whole path
- **WHEN** the reference tool is run for a project from its Tools surface
- **THEN** its input is validated, it reads the read-only snapshot, its typed output is
  validated, a `pending` suggestion is created, one message attributed to the tool is posted to
  the conversation, and a `tool_run` is logged and referenced by both

#### Scenario: Running a tool resolves the tenant server-side
- **WHEN** a tool is run from the project page
- **THEN** the business is resolved from the session server-side and no client-supplied
  `business_id` is trusted

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

