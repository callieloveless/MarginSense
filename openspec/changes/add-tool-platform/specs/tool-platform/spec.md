# tool-platform

## ADDED Requirements

### Requirement: Uniform tool contract
Every tool SHALL be defined by the same shape: a name, a Zod `inputSchema`, a Zod
`outputSchema`, and a `run(ctx)` function that receives a read-only project snapshot plus
validated input and returns structured output. A tool SHALL be typed and side-effect-free — it
SHALL NOT receive a database handle or any write path, so it can be wired into a future tool
graph without redesign (constitution §5, "Composing tools").

#### Scenario: A tool declares typed input and output
- **WHEN** a tool is defined
- **THEN** it exposes an `inputSchema`, an `outputSchema`, and a `run(ctx)`, and its input and
  output are validated against those schemas at the boundary

#### Scenario: A tool has no write path
- **WHEN** a tool's `run(ctx)` executes
- **THEN** the context it receives exposes no method that mutates the estimate or context, and
  the only value it can return is structured output the runner turns into pending suggestions

### Requirement: Tool runner turns output into suggestions and a conversation post
The system SHALL provide a single tool runner that validates a tool's input, assembles the
read-only snapshot, calls `run(ctx)`, validates the output, creates each proposed change as a
`pending` suggestion in the project's suggestions queue, and posts one message to the single
project conversation attributed to the tool. The runner SHALL be the only code path that invokes
a tool, and it SHALL have no path that commits an estimate or context change directly.

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

### Requirement: Mockable AI model port with centralized config
The system SHALL provide a model port in `src/ai/` that centralizes model IDs and AI
configuration in one place (no scattered magic constants) and that tools call instead of the
Anthropic SDK directly. The port SHALL have a mock implementation used by unit tests and a real
Anthropic implementation gated behind `ANTHROPIC_API_KEY`. When the key is absent the system
SHALL report the AI layer as unconfigured and SHALL NOT construct the real client.

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

### Requirement: Tool runs are logged for cost observability
Every tool invocation SHALL record a `tool_run` — its tool name, project, token usage, latency,
and status — through the tenant-scoped data layer, including runs that fail. Each `tool_run` row
SHALL carry a non-null `business_id` with Row-Level Security enforced.

#### Scenario: A successful run is logged
- **WHEN** a tool run completes successfully
- **THEN** a `tool_run` row records its tool name, project, token usage, latency, and a status of
  `ok`

#### Scenario: A failed run is still logged
- **WHEN** a tool's `run` throws or its output fails validation
- **THEN** a `tool_run` row is still recorded with status `error` and whatever usage and latency
  accrued

#### Scenario: Tool runs are tenant-isolated
- **WHEN** a user from business A requests business B's tool runs
- **THEN** Row-Level Security returns no rows and the `business_id` on every recorded run is
  stamped from the tenant handle, never from input

### Requirement: Project-page Tools surface with a reference tool
Tools SHALL open from the project page (the unit that owns the shared context and conversation).
This capability SHALL ship a Tools surface that lists available tools and opens one, plus a
reference tool that proves the platform end-to-end using the mock model port: input validated,
snapshot read, a pending suggestion emitted, a conversation post made, and a `tool_run` logged —
with no external dependency.

#### Scenario: The reference tool proves the whole path
- **WHEN** the reference tool is run for a project from its Tools surface
- **THEN** its input is validated, it reads the read-only snapshot, a `pending` suggestion is
  created, one message attributed to the tool is posted to the conversation, and a `tool_run` is
  logged

#### Scenario: Running a tool resolves the tenant server-side
- **WHEN** a tool is run from the project page
- **THEN** the business is resolved from the session server-side and no client-supplied
  `business_id` is trusted
