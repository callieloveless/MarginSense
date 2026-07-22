# `src/ai/` — Anthropic client, model config, web search, cost logging

The single place the app talks to Claude. See [`techstack.md` §1/§4/§7](../../techstack.md).

- **Model IDs, default thresholds, and AI config are centralized here** — no magic
  constants scattered across the codebase. Default judgment-heavy tool model:
  `claude-opus-4-8`; a cheaper/faster Claude model for lightweight extraction/formatting
  where quality allows.
- Vision (Photo Advisor) and web search (Material Finder — Anthropic web search tool or a
  pluggable provider behind our own interface) live behind interfaces here.
- **The Anthropic API key is server-side only.** Tools run on the server; the key is never
  exposed to the browser.
- Every tool run records a `tool_run` (tokens, latency) so AI spend is observable per
  tenant.
