# Tasks — add-structured-result-port

## 1. Port surface (`src/ai/port.ts`)

- [x] 1.1 Add optional `resultSchema` (Zod) to `ModelRequest` and optional `result` (validated
      value) to `ModelResponse`; keep `citations`. Document that `result` comes via a strict
      result-tool (not `output_config.format`) so it composes with web search + citations.
- [x] 1.2 A small helper to parse/narrow `response.result` with the caller's `resultSchema`
      (typed at the call site).

## 2. Mock (`src/ai/mock.ts`)

- [x] 2.1 When `resultSchema` is present, return a canned value validated through the schema +
      a couple of citations; deterministic, offline. Keep the `result`/`usage` mock options.
- [x] 2.2 Unit tests: mock returns a schema-valid `result` + citations; a scripted `result`
      round-trips; no network.

## 3. Real Anthropic impl (`src/ai/anthropic.ts`)

- [x] 3.1 Install `@anthropic-ai/sdk`.
- [x] 3.2 `createAnthropicModelPort`: messages call with `web_search_20260209` (when declared) +
      a strict result-tool built from `resultSchema` + citations; validate the model's result-
      tool input against `resultSchema`; return `{ text, content, usage, citations, result }`.
      Server-only, import-guarded; model/effort from `src/ai/config.ts`. **Consult the
      `claude-api` skill before writing this** (tool-use blocks, `web_search_20260209`, citation
      blocks, forced `tool_choice` interaction with server tools). Constructed only behind the
      key; the #6 resolver is unchanged.
- [x] 3.3 Unit tests: resolver still reports `unconfigured` without a key and does not construct
      the real client; the real impl is not exercised live in tests.

## 4. Verification

- [x] 4.1 `npm run typecheck`, full Vitest suite, and `npm run build` green.
- [x] 4.2 `src/tools/`/`src/engine/`/`src/context/` stay free of `@anthropic-ai/sdk`; only the
      real `src/ai/` impl imports it; the mock path builds without exercising it; `src/` relative
      imports extensionless.
- [x] 4.3 `openspec validate add-structured-result-port --strict` passes.

## Deferred to live infra (owner provisions `ANTHROPIC_API_KEY`)

- [ ] Prove the real port end-to-end: a call with `web_search_20260209` + a `resultSchema`
      returns a validated structured result **and** citations in one response, and `tool_run`
      cost logging records live token usage (proven via #7b Material Finder; relevant_notes §5).
