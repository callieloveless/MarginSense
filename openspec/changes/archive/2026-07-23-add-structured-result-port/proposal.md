# Add a structured-result capability to the AI model port

## Why

The `src/ai/` model port (#6) returns text, usage, and citations — enough for the reference
tool, but not for a real extraction tool. Material Finder (#7b) needs the model to hand back a
**typed list of materials with prices and sources**, not prose to parse. The obvious approach,
`output_config.format` (JSON-schema output), is a dead end here: the Anthropic API **rejects it
alongside citations** (400), and a material price is worthless without its source (§7). So the
port needs a **structured-result mechanism that composes with server-side web search and
citations**. This change adds exactly that — small, self-contained, and the template every
future extraction tool (Material Finder, and later tools) builds on. It also writes the **real
Anthropic implementation** of the port (behind `ANTHROPIC_API_KEY`), which #6 deliberately left
as a deferred stub.

Splitting this out from Material Finder keeps the load-bearing API decision (how the model
returns validated structured data) in its own small review, and lets the tool land on a settled
port.

## What Changes

- **A validated structured result on the port.** `ModelRequest` gains an optional `resultSchema`
  (Zod); `ModelResponse` gains an optional `result` (validated against it). When a `resultSchema`
  is present, the model MUST return a value of that shape, obtained via a **strict "result tool"**
  the port declares (e.g. `record_result`) — *not* `output_config.format`. This composes with the
  `web_search_20260209` server tool and with citations in the same call, so a single request can
  search the web, cite its sources, and return typed data. The response's `citations` (already
  present from #6) carry the sources.
- **The mock returns structured data.** When `resultSchema` is given, `createMockModelPort`
  returns a canned, schema-valid `result` + citations — deterministic and offline — so tools
  unit-test their extraction without a key.
- **The real Anthropic implementation is written.** `createAnthropicModelPort`
  (`@anthropic-ai/sdk`) wires the messages call with `web_search_20260209`, the strict result
  tool built from `resultSchema`, and citations; it validates the model's tool-call input against
  `resultSchema` and returns it as `result`. Server-only, import-guarded, constructed only when
  `ANTHROPIC_API_KEY` is set (the resolver from #6 is unchanged). **Live calls remain deferred** —
  acceptance runs on the mock; the real path is proven in the key-gated stage (relevant_notes §5).

## Capabilities

### Modified Capabilities
- `tool-platform` — the AI model port's requirement gains a **structured-result** capability: a
  request may carry a result schema and the response returns a validated value of that shape,
  obtainable together with server-side web search and citations. The contract, runner, dispatch,
  dedup, and tool-run requirements are unchanged.

## Impact

- **Changed code:** `src/ai/port.ts` (request `resultSchema`, response `result`, the result-tool
  contract), `src/ai/mock.ts` (canned structured result), `src/ai/anthropic.ts`
  (`createAnthropicModelPort` real impl), tests.
- **New dependency:** `@anthropic-ai/sdk` (installed now; imported only by the real impl, behind
  the key; the mock path builds without exercising it).
- **Depends on:** `tool-platform` (#6 port + resolver).
- **Feeds:** `add-material-finder` (#7b) and every later extraction tool (Photo Advisor, Code
  Finder) — they request a `resultSchema` and get typed data + citations.

## Non-goals

- **No tool and no UI** — this is the port capability only; Material Finder (#7b) is the first
  consumer.
- **No live model calls in acceptance** — proven on the mock; the real `web_search` +
  result-tool path is a deferred, key-gated proof.
- **No `output_config.format`** — deliberately avoided; it can't carry citations, which sourced
  prices require.
