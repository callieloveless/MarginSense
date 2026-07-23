# Tasks — add-suggestion-preview

## 1. Profit-impact preview (pure, tool-agnostic)

- [ ] 1.1 App-layer helper beside `app/_lib/estimate-compute.ts`:
      `previewWithProposedLine(active, lines, proposedLine, rates)` → current vs hypothetical
      `EstimateComputation` (append the proposed line, recompute via `computeEstimate`). No new
      math; not-applicable degrades to "no delta".
- [ ] 1.2 Map an `estimate_line_item` suggestion payload → the engine's line shape (reuse the
      estimate module's `toEngineLine` / stored-line shape); key only on `target`/`payload`.
- [ ] 1.3 Unit test: previewed EPH/signal for a proposed line equals the roll-up after that line
      is actually added (preview == post-accept); not-applicable cases return no delta.

## 2. Tool-agnostic SuggestionCard

- [ ] 2.1 Shared `SuggestionCard` component: renders any suggestion from `target` + `payload`
      (line item shows the profit preview; context entry shows what it would pin); Accept /
      Dismiss bound to the change #5 server actions; phone-first; color paired with text
      (`SignalBadge`). No branch on tool name.
- [ ] 2.2 Replace the `describeSuggestion` switch in the context page with `SuggestionCard`.
- [ ] 2.3 Remove the `if (toolName === "reference")` messaging branch in the tools action
      (surface behavior flows from suggestion/message shape, not tool identity).

## 3. Run-in-place + persistent signal header

- [ ] 3.1 Persistent profit-signal header (EPH + red/yellow/green via `estimate-signal` /
      `SignalBadge`) shared across the project's context and Tools surfaces; null-safe with a
      "no active estimate yet" state.
- [ ] 3.2 Tools surface: after a run, show the run's resulting `SuggestionCard`(s) + the
      conversation post in place, with a "running…" state from P1's run lifecycle (degrade to
      the action's `pending` state if not observed via the lifecycle); accept/dismiss revalidate.
- [ ] 3.3 Phone-first; plain language; every number via the engine (`formatCents`); no
      color-only cues.

## 4. Verification

- [ ] 4.1 `npm run typecheck`, full Vitest suite, and `npm run build` green.
- [ ] 4.2 Preview == post-accept EPH (asserted); the card renders identically for the same
      target/payload regardless of tool; no tool-name branch remains in the suggestion surface.
- [ ] 4.3 `src/engine/` unchanged (the preview only calls it); no schema change.
- [ ] 4.4 `openspec validate add-suggestion-preview --strict` passes.

## Deferred to live infra (owner provisions Supabase)

- [ ] Walk it live at phone width: run the reference tool → its card appears in place with the
      profit preview → accept → the signal header updates → the fact/line lands in context.
