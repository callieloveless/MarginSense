# Add the suggestion profit preview + in-place tool results

## Why

A job is split across routes and a tool's output lands on a *different* screen than where you
ran it: run a tool under `/tools`, navigate to `/context` for the suggestion, accept, then open
the estimate to see whether the signal moved. For the primary user — on a ladder, one bar of
signal — that's too much navigation for one decision, and the decision is blind: accepting a
line-item suggestion gives no sense of what it does to the job's profit, though red/yellow/green
profit-per-hour is the whole point. This change makes the suggestion the place the decision
happens: a **tool-agnostic card** that **previews the profit impact of accepting** (EPH + color,
now → after), shown **in place where the tool ran**, under a persistent profit-signal header. It
wires tools to the profit spine and survives heavy tool churn, because the card is driven by the
suggestion's shape, never by which tool produced it.

## What Changes

- **Profit-impact preview on line-item suggestions.** For an `estimate_line_item` suggestion,
  compute the **hypothetical roll-up** — the project's active estimate plus the proposed line —
  through the pure engine, and show the resulting EPH and red/yellow/green signal alongside the
  current one (e.g. "$92/hr 🟢 → $88/hr 🟢"). No new math: it reuses `src/engine/` and the same
  roll-up glue the estimate screen uses; it just recomputes with the proposed line added. A
  `context_entry` suggestion (a fact/material/code_ref) shows what it would pin, with no profit
  preview.
- **A tool-agnostic suggestion card.** One shared component renders every suggestion from its
  `target` + `payload` — never from the tool's name. This kills the `if (toolName ===
  "reference")` branch and establishes the rule that **surface behavior flows from suggestion
  shape, not tool identity**, so tools can be rewritten freely without touching the card.
- **Run-in-place.** Running a tool shows its resulting suggestion(s) and conversation post
  **on the same screen**, with a "running…" state while it works (from the run lifecycle in
  P1, `add-tool-dispatch`), so you never navigate away to see or act on what a tool produced.
- **A persistent profit-signal header** on the job surface, so the EPH color the whole product
  turns on is always in view while running tools and reviewing suggestions.

## Capabilities

### Modified Capabilities
- `project-context` — the suggestions-queue requirement gains a **profit-impact preview** for
  line-item suggestions and a **tool-agnostic rendering** rule (the card reads suggestion shape,
  not tool identity). Adds a requirement that a **tool's result surfaces where it was run** and
  that the **job surface keeps the profit signal in view**. The accept/dismiss guarantee, the
  one-conversation rule, and tenant isolation are unchanged — accepting still commits exactly as
  before; only the presentation changes.

## Impact

- **Changed/new code:** an app-layer preview helper (sibling of `app/_lib/estimate-compute.ts`)
  that recomputes the roll-up with a proposed line; a shared `SuggestionCard` component (with the
  preview and in-place accept/dismiss) reused by the context view and the tools surface; the
  Tools surface renders the run's resulting card(s) in place with a running state; a persistent
  EPH header on the job routes. Removes the tool-specific branch in the tools action's success
  message.
- **No schema change. No new dependency.** Pure UI + a pure preview computation over the engine.
- **Depends on:** `add-tool-dispatch` (P1) for the run lifecycle behind "running…";
  `project-context` (#5) for suggestions/conversation; `estimates` + `profit-engine` for the
  roll-up and signal; `tool-platform` (#6) for the run path.
- **Feeds:** every tool (#7–#10) — they inherit the preview, the tool-agnostic card, and
  run-in-place for free; the reference tool exercises all of it now.

## Non-goals

- **No conversation-as-spine rebuild.** This keeps the current routes and improves the
  suggestion surface + adds a persistent header; collapsing the whole job into one chat-style
  thread is a deliberately deferred, larger bet best shaped once a real tool exists.
- **No new suggestion target.** The `document` target (#10) and its preview arrive with the tool
  that needs it; here the preview covers `estimate_line_item` and the display covers
  `context_entry`.
- **No change to accept-to-commit.** The preview is read-only; accepting runs the exact same
  server-side, tenant-scoped accept path (change #5), unchanged.
- **No new financial math** — the hypothetical roll-up is the existing engine, called with the
  proposed line added.
