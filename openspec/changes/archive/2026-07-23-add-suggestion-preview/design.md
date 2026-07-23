# Design — suggestion profit preview + in-place tool results

## Context

The suggestion is where a tool's work becomes a decision, but today that decision is made
blind and on a different screen than where the tool ran. This change brings the decision
together: preview the profit impact of accepting, render every suggestion the same way
regardless of tool, and show a run's result in place. It is UI + one pure preview computation
— no schema, no new math, no change to how accepting commits.

The guiding constraint (the user will rewrite the tools a lot): **nothing downstream of the
tool contract may branch on tool identity.** The card, the preview, and the surface read the
suggestion's `target` + `payload` only, so tools churn without touching any of them.

## Goals / Non-Goals

**Goals**
- A read-only profit-impact preview for `estimate_line_item` suggestions (EPH + red/yellow/green
  now → after), computed through the pure engine.
- One tool-agnostic `SuggestionCard` reused by the context view and the tools surface.
- Run-in-place: a tool's resulting card(s) + post appear on the screen the run was started from,
  with a "running…" state.
- A persistent profit-signal header on the job routes.

**Non-Goals**
- No conversation-as-spine rebuild; no new suggestion target; no change to accept-to-commit; no
  new financial math.

## Decisions

### The preview is a hypothetical roll-up, tool-agnostic by construction
For an `estimate_line_item` suggestion, the preview is: take the project's active estimate
lines, append the suggestion's proposed line, and recompute through `computeEstimate` — the
exact function the estimate screen uses. Diff the resulting EPH/signal against the current
active roll-up and render both. This lives in a small app-layer helper beside
`app/_lib/estimate-compute.ts` (e.g. `previewWithProposedLine(active, lines, proposedLine,
rates)`), pure over the engine. Because it keys on the suggestion's `target`/`payload`, *any*
tool's line-item suggestion previews identically — the tool is irrelevant.

Not-applicable cases degrade gracefully (constitution "every number traceable"): no active
estimate, or a business without billable capacity yet → show the proposed change without a
profit delta and a short "no active estimate to measure against" note, never a broken number.

### One SuggestionCard, driven by shape
A shared component takes a suggestion row and renders by `target`:

```
 estimate_line_item → "add {category} {desc} → EPH $92 🟢 → $88 🟢 (−$4)"  [Accept][Dismiss]
 context_entry      → "pin {kind}: {summary}"                              [Accept][Dismiss]
 (document, later)  → handled by #10                                       …
```

It replaces the inline `describeSuggestion` switch in the context page and is reused verbatim
on the tools surface. The rule it encodes — render from shape, never tool name — also removes
the `if (toolName === "reference")` branch from the tools action's messaging (that branch was
already flagged in #6's review as the anti-pattern; this generalizes the fix).

### Run-in-place
The tools surface, after dispatching a tool (P1's `dispatch`), shows the run's resulting
suggestion card(s) and the conversation post right there, with a "running…" state sourced from
P1's run lifecycle (a run is observable as running before it finalizes). The context view stays
the durable home of the full queue + conversation; the tools surface just surfaces *this run's*
output so the user acts without navigating. Accept/dismiss on the in-place card call the same
change #5 server actions and revalidate.

### Persistent profit-signal header
The job routes render a shared header showing the active estimate's EPH and red/yellow/green
signal (reusing `SignalBadge` / `estimate-signal`), so the color the product turns on is always
visible while running tools and triaging suggestions. Color is always paired with text
(constitution / techstack §6). Null when there's no active estimate.

### Depends on P1 for "running…", but the card/preview don't
The preview and the card are independent of P1 — they work on the current synchronous model
(the run form's `pending` state already covers the user-initiated wait). P1's run lifecycle is
what makes "running…" observable for runs the user didn't personally start (auto-triggers). So
this change *reads* P1's lifecycle for the running state but degrades to `pending`-only if a
run wasn't observed through the lifecycle.

## Risks / Trade-offs

- [Preview drift from the real accept result] → the preview calls the *same* `computeEstimate`
  the accept path's roll-up uses, with the same proposed line, so the previewed EPH equals the
  post-accept EPH (rounding included). A test asserts preview == recompute-after-accept.
- [A tool-specific branch sneaks back in] → the card and surface take a suggestion row, not a
  tool; a review rule (and the removed reference branch) keep it shape-driven. 
- [Preview cost on a long queue] → each line-item preview is one engine roll-up (cheap, pure);
  computed server-side per suggestion when the queue renders. If a queue is large, memoize the
  active roll-up once and reuse it across previews.
- [Header implies an estimate exists] → header is null-safe; shows "no active estimate yet" with
  a link to build one, never a broken signal.

## Migration Plan

None — no schema change. Pure UI + a pure preview helper over the engine.

## Open Questions

- **Where the in-place result lives after navigation away** — this change shows it transiently
  on the tools surface post-run; the durable record is the context queue. Whether the tools
  surface should also show *recent* runs' results (not just the just-run one) is a small later
  refinement, not needed now.
- **Conversation-as-spine** — deferred; revisit once #7/#8 show what a real tool's output stream
  feels like, as explored.
