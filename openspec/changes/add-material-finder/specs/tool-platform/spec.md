# tool-platform

## MODIFIED Requirements

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
