# Tasks — add-material-finder

## 1. Structured-result AI port (`src/ai/`)

- [ ] 1.1 Extend `ModelRequest` with an optional `resultSchema` (Zod) and `ModelResponse` with an
      optional validated `result`; keep `citations`. Document: obtained via a strict result-tool
      (not `output_config.format`), so it composes with web search + citations.
- [ ] 1.2 Mock port: when `resultSchema` is given, return a canned schema-valid `result` (a few
      needs, each with 2–3 options carrying a `sourceUrl`) + citations, deterministic and offline.
- [ ] 1.3 Real `createAnthropicModelPort` (`@anthropic-ai/sdk`, installed): wire
      `web_search_20260209` + a strict result-tool from `resultSchema` + citations; validate the
      tool-call input against `resultSchema`. Server-only, import-guarded; only behind the key.
      (Consult the `claude-api` skill before writing this.)
- [ ] 1.4 Unit tests: mock returns a schema-valid `result` + citations; request carries
      `resultSchema`; no live call.

## 2. Snapshot active estimate id + service area on settings

- [ ] 2.1 Add `activeEstimateId: string | null` to `ProjectSnapshot` (`src/context`,
      `buildProjectSnapshot`); the app assembler sets it. Unit test: snapshot carries it (null
      when none).
- [ ] 2.2 Add nullable `service_area` to `business_settings` (schema + row types);
      `npm run db:generate` → migration `0006` (`ADD COLUMN`, additive; no RLS change). Thread
      through `SettingsInput` / `saveSettings` / `parseSettingsForm` as an optional input (stored
      only, never derived).
- [ ] 2.3 Settings form: a service-area field, saved and read back; tenant-isolated with the rest
      of settings. Update the settings isolation/parse tests for the new optional field.

## 3. Material Finder tool (`src/tools/material-finder/`)

- [ ] 3.1 Schemas: `inputSchema` (`{ mode, query?, location? }`), `outputSchema` (needs+options),
      `resultSchema` for the port (per need, options of `{ name, priceCents, unit, supplier?,
      sourceUrl (required) }`).
- [ ] 3.2 `run(ctx)`: build the prompt from mode (query vs active-estimate needs) + read-only
      context + `location`; call the port with `serverTools: [web_search]` + `resultSchema`; map
      each option → an `estimate_line_item` suggestion (when `activeEstimateId`) else a `material`
      context-entry, dropping any option without a `sourceUrl`; `message` = summary grouped by
      need with source links + verify-with-supplier note.
- [ ] 3.3 Register Material Finder in the tool registry.
- [ ] 3.4 Unit tests: query + estimate modes; options → sourced suggestions; line items when
      active estimate, context entries when not; unsourced option dropped; dedup across repeat
      searches; nothing commits (pending only).

## 4. Manual add (no model)

- [ ] 4.1 A tenant-scoped server action that creates the same suggestions (`material` context
      entry + `estimate_line_item` when there's an active estimate) from typed values, **without**
      a model call or a `tool_run` — a plain user-authored pending suggestion.
- [ ] 4.2 Unit/integration coverage that manual add needs no `ANTHROPIC_API_KEY` and produces
      pending suggestions that flow through the existing accept path.

## 5. UI (phone-first, per-tool input pattern)

- [ ] 5.1 Material Finder surface (per-tool pattern, e.g. `/projects/[id]/tools/[toolName]` or a
      registry-keyed form): query field + **mode toggle** ("this material" / "everything for this
      estimate") + **location field** pre-filled from the service area (overridable) + the
      **manual-add form**.
- [ ] 5.2 Search runs via a server action through `dispatch` (source `user`); manual add via its
      own action (§4). Results surface in place via P2's `SuggestionCard` + profit preview
      (options compared by EPH impact); citations render as source links; a "connect AI" state
      when the model is unconfigured (manual add still works).
- [ ] 5.3 Generalize the reference tool's one-off form into the shared per-tool pattern;
      phone-first; every number via the engine (`formatCents`); no color-only cues.

## 6. Verification

- [ ] 6.1 `npm run typecheck`, full Vitest suite, and `npm run build` green.
- [ ] 6.2 `src/tools/` depends only on the `ModelPort` interface (mock in tests); only the real
      `src/ai/` impl imports `@anthropic-ai/sdk`; `src/engine/`/`src/context/` stay SDK-free;
      `src/` relative imports extensionless.
- [ ] 6.3 No unsourced price becomes a suggestion; proposals stay `pending` until accept; the
      profit preview renders for line-item options (via the existing card path); manual add
      works with no key.
- [ ] 6.4 `openspec validate add-material-finder --strict` passes.

## Deferred to live infra (owner provisions Supabase + `ANTHROPIC_API_KEY`)

- [ ] Apply migration `0006` (`npm run db:migrate`).
- [ ] Set `ANTHROPIC_API_KEY`; prove real `web_search_20260209` returns real, local, sourced
      prices end-to-end through Material Finder (both modes), and that `tool_run` records live
      token/latency usage (relevant_notes.md §5).
- [ ] Walk it live at phone width: set a service area → search → comparable sourced options appear
      in place with profit previews → accept one → the signal header moves; and hand-add a
      material with the key unset.
