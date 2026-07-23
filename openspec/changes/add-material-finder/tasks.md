# Tasks — add-material-finder

## 1. Structured-result AI port (`src/ai/`)

- [ ] 1.1 Extend `ModelRequest` with an optional `resultSchema` (Zod) and `ModelResponse` with an
      optional validated `result`; keep `citations` on the response. Document that the result is
      obtained via a strict result-tool (not `output_config.format`), so it composes with web
      search + citations.
- [ ] 1.2 Mock port: when `resultSchema` is given, return a canned `result` (a few materials,
      each with a `sourceUrl`) + citations, deterministic and offline.
- [ ] 1.3 Real `createAnthropicModelPort` (`@anthropic-ai/sdk`, installed): wire
      `web_search_20260209` + a strict result-tool built from `resultSchema` + citations; the
      model searches then returns typed data via the tool; validate its input against
      `resultSchema`. Server-only, import-guarded; constructed only behind `ANTHROPIC_API_KEY`.
- [ ] 1.4 Unit tests: mock returns a schema-valid `result` + citations; the request shape carries
      `resultSchema`; no live call in tests. (Consult the `claude-api` skill before writing the
      real impl.)

## 2. Snapshot active estimate id

- [ ] 2.1 Add `activeEstimateId: string | null` to `ProjectSnapshot` (`src/context`,
      `buildProjectSnapshot`); the app snapshot assembler sets it from the active estimate.
- [ ] 2.2 Unit test: snapshot carries the active estimate id (and null when none).

## 3. Material Finder tool (`src/tools/material-finder/`)

- [ ] 3.1 `inputSchema` (`{ query }`), `outputSchema` (the materials list); a `materialsSchema`
      for the port's `resultSchema` (name, priceCents, unit, supplier?, sourceUrl required).
- [ ] 3.2 `run(ctx)`: build the search prompt from query + read-only context; call the port with
      `serverTools: [web_search]` + `resultSchema`; map each material → a `material` context-entry
      suggestion + (when `activeEstimateId`) an `estimate_line_item` suggestion targeting it;
      `message` = summary with source links + a verify-with-supplier note. Drop any material
      without a `sourceUrl` (no unsourced price).
- [ ] 3.3 Register Material Finder in the tool registry.
- [ ] 3.4 Unit tests: materials → sourced `material` + `estimate_line_item` suggestions; no active
      estimate → context entries only; unsourced material dropped; dedup across repeat searches;
      nothing commits (pending only).

## 4. UI (phone-first, per-tool input pattern)

- [ ] 4.1 A Material Finder surface with its own query form (the reusable per-tool input pattern,
      e.g. `/projects/[id]/tools/[toolName]` or a registry-keyed form); seed the query from the
      estimate scope where present.
- [ ] 4.2 Run via a server action through `dispatch` (source `user`); results surface in place
      via P2's `SuggestionCard` + profit preview (line-item suggestions light up the EPH delta);
      render citations as source links; a "connect AI" state when the model is unconfigured.
- [ ] 4.3 Generalize the reference tool's one-off form into the shared per-tool pattern; phone-
      first; every number via the engine (`formatCents`); no color-only cues.

## 5. Verification

- [ ] 5.1 `npm run typecheck`, full Vitest suite, and `npm run build` green.
- [ ] 5.2 `src/tools/` depends only on the `ModelPort` interface (mock in tests); only the real
      `src/ai/` impl imports `@anthropic-ai/sdk`; `src/engine/`/`src/context/` stay SDK-free;
      `src/` relative imports extensionless.
- [ ] 5.3 No unsourced price becomes a suggestion; suggestions stay `pending` until accept; the
      profit preview renders for Material Finder's line items (asserted via the existing card path).
- [ ] 5.4 `openspec validate add-material-finder --strict` passes.

## Deferred to live infra (owner provisions Supabase + `ANTHROPIC_API_KEY`)

- [ ] Apply nothing new (no migration). Set `ANTHROPIC_API_KEY`; prove real `web_search_20260209`
      returns real prices + citations end-to-end through Material Finder, and that `tool_run`
      records live token/latency usage (relevant_notes.md §5).
- [ ] Walk it live at phone width: search → sourced material + line-item suggestions appear in
      place with the profit preview → accept a line → the signal header moves.
