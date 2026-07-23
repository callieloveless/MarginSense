# Design — structured-result AI port + real Anthropic impl

## Context

The port (#6) is text-in/typed-response-out with usage + citations, but the mock is the only
implementation and there's no way to get validated structured data back. Material Finder (#7b)
needs both structured data *and* citations in one call. This change adds the structured-result
mechanism and writes the real Anthropic implementation, keeping the API decision in its own
small review.

## Goals / Non-Goals

**Goals**
- A validated, Zod-typed structured result from a model call, composable with web search +
  citations.
- The real `createAnthropicModelPort` written (SDK installed), exercised only behind the key.
- The mock returns canned structured results so tools test offline.

**Non-Goals**
- No tool, no UI (that's #7b); no live calls in acceptance; no `output_config.format`.

## Decisions

### Structured result via a strict result-tool — NOT `output_config.format`
The API rejects `output_config.format` **together with citations** (400). Material Finder needs
typed materials *and* sourced prices, so structured output must come a different way: a **strict
"result tool"** the model is required to call. The port turns `resultSchema` into a strict client
tool (e.g. `record_result`) with `input_schema` derived from the Zod schema, declares it
alongside the `web_search_20260209` server tool, and forces/So-expects the model to call it with
the structured value. The port validates that tool call's input against `resultSchema` and
returns it as `response.result`. Citations arrive as `web_search_tool_result` blocks and are
surfaced on `response.citations` (from #6). *Alternative rejected:* `output_config.format` —
simpler but incompatible with citations, so a sourced price list is impossible in one call.

### Port surface (additive over #6)
- `ModelRequest.resultSchema?: z.ZodType<T>` — when present, the response must carry a `result` of
  this shape.
- `ModelResponse.result?: unknown` — the validated structured value (typed at the call site via
  the caller's schema; `undefined` when no `resultSchema` was requested).
- `citations` on the response is unchanged (#6).
The `ServerToolSpec` mechanism from #6 already lets a request declare `web_search_20260209`; this
change makes the result tool the vehicle for typed output alongside it.

### Mock
When `resultSchema` is present, `createMockModelPort` returns a canned value that satisfies the
schema (validated through it so tests fail loudly if the shape drifts) plus a couple of citations,
deterministically (no network, no `Date.now`/random). Callers pass a canned `result` via the
existing mock options for specific tests.

### Real Anthropic implementation
`createAnthropicModelPort` (from `@anthropic-ai/sdk`, server-only, import-guarded) issues the
messages call with: the system/messages, `web_search_20260209` (when the request declares it),
and the strict result tool built from `resultSchema`; it reads the model's result-tool call,
validates its input against `resultSchema`, and returns `{ text, content, usage, citations,
result }`. Model id + effort come from `src/ai/config.ts`. It is constructed only when
`ANTHROPIC_API_KEY` is set (the #6 resolver is unchanged); **live calls are not exercised in this
change's acceptance**. Exact SDK bindings (tool-use blocks, `web_search_20260209`, citation
blocks) will be taken from the `claude-api` skill at implementation — not guessed.

## Risks / Trade-offs

- [Result tool + web search + citations interaction] → the mock encodes the contract and unit
  tests assert it; the real path is validated in the deferred key-gated proof. If the API shape
  differs, only `anthropic.ts` changes — the port interface and every tool are insulated.
- [SDK install on a constrained disk] → server-only, imported solely by the real impl; the mock
  path builds without it.
- [`result` typed as `unknown`] → the port can't be generic over every tool's schema at the
  interface; callers validate/narrow via their own `resultSchema` (the same schema they passed),
  so it's typed at the call site. A small helper can parse `result` with the caller's schema.

## Migration Plan

None — no schema change.

## Open Questions

- **Forcing the result tool** — whether to force `tool_choice` to the result tool or rely on
  strong instruction + the model's tendency; decided at implementation against the `claude-api`
  guidance (forced `tool_choice` interacts with server tools, so this needs care).
- **Multiple result-tool calls** — v1 expects one; if the model calls it more than once, take the
  last valid one (finalized at implementation).
