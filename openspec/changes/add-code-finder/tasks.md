## 1. Stage A — the `code_ref` payload and Photo Advisor's output key

- [ ] 1.1 Extend the `code_ref` payload in `src/context/context.ts` with optional `sourceUrl`,
      `complianceNote`, and `photoStorageKey` (additive; `jsonb`, no migration). Keep the module
      framework/DB-free.
- [ ] 1.2 Unit-test the payload change: a minimal `code_ref` (`code` + `citation`) still validates,
      each new field is accepted when present, and an accepted entry keeps them.
- [ ] 1.3 Add `photoStorageKey` to Photo Advisor's `outputSchema` and populate it from the run's
      input in `photo-advisor.ts` (the one photo every finding in the run shares). Update the
      Photo Advisor tests that assert on `output`.

## 2. Stage B — the Code Finder tool

- [ ] 2.1 Add `src/tools/code-finder/schema.ts`: `inputSchema` (`query`, optional `location`,
      optional `photoStorageKey`), the port `resultSchema` (`codes[]` with `code`, `requirement`,
      optional `jurisdiction`, optional `sourceUrl`, optional `complianceNote`), and `outputSchema`
      (the sourced codes actually proposed).
- [ ] 2.2 Add `src/tools/code-finder/suggestions.ts`: a code → a `code_ref` context-entry
      suggestion carrying code, citation, jurisdiction, `sourceUrl`, `complianceNote`, and the
      `photoStorageKey` from the input when present. Reuse the `isSourceUrl` rule — a code with no
      real source URL yields nothing (§7).
- [ ] 2.3 Add `src/tools/code-finder/code-finder.ts`: the system prompt (find LOCAL code, cite the
      source, state permit/inspection consequences, never present as authoritative), the port call
      with `WEB_SEARCH_TOOL` + `resultSchema`, the mapping, and a conversation `message` that
      summarizes the codes with their sources and compliance notes and carries
      `disclaimer: PHYSICAL_WORK_DISCLAIMER`. Localize the search from `input.location`.
- [ ] 2.4 Handle the empty/no-jurisdiction cases: no sourced code → a post that says none was
      found; no location → search without a local bias and say the jurisdiction wasn't narrowed.
- [ ] 2.5 Register the tool in `src/tools/registry.ts` and export it from `src/tools/index.ts`.
- [ ] 2.6 Unit-test against the mock port with a canned code result: sourced codes become `pending`
      `code_ref` suggestions carrying source + compliance note; an unsourced code is dropped; the
      `photoStorageKey` rides through when set; every run's message carries the disclaimer; the
      tool receives no handle it could write with.

## 3. Stage C — light up the compose edge

- [ ] 3.1 Register `COMPOSE_EDGES["photo-advisor"] = [{ consumer: "code-finder", map }]` in
      `app/_lib/compose.ts`; the mapper reads `tenantDb.getSettings()?.serviceArea` once and
      returns one Code Finder input per finding — query from the finding summary + its materials,
      `location` from the service area, `photoStorageKey` from the output.
- [ ] 3.2 Integration-test the edge through `dispatchAndCompose` against the memory backends + mock
      port: a Photo Advisor run with N findings composes N Code Finder runs (source `compose`),
      each proposing `pending` `code_ref` suggestions that carry the photo key; a composed-run
      failure leaves Photo Advisor's own suggestions intact (9a's isolation, now with a real edge).
- [ ] 3.3 Confirm the standalone path is unaffected and dedup still holds (a re-run doesn't stack
      duplicate `code_ref` suggestions).

## 4. Stage D — the panel and its action

- [ ] 4.1 Add the Code Finder server action under `app/(app)/projects/[id]/tools/`: resolve the
      session, gate on a configured model, run the query through `dispatchAndCompose`, revalidate.
      Never trust a client `business_id`; pre-fill the location from `service_area`.
- [ ] 4.2 Add the Code Finder query panel (client component, mirroring `material-finder-form.tsx`):
      a question field + an overridable location + a run button; results land in the existing
      "Waiting on you" list.
- [ ] 4.3 Render `PHYSICAL_WORK_DISCLAIMER` as a standing notice on the panel, above the run
      control, and the "connect AI" state when the model is unconfigured.
- [ ] 4.4 Render a `code_ref` suggestion's source link and compliance note on the suggestion card
      and the context list — driven by the payload, no branch on the producing tool.
- [ ] 4.5 Check the panel at phone width first; colour always paired with text.

## 5. Verification and close-out

- [ ] 5.1 `npm run typecheck`, `npx vitest run`, and `npm run build` green after each stage (the
      build is the only check that catches Turbopack/App-Router issues; relative imports in `src/`
      stay extensionless).
- [ ] 5.2 Add the live-AI proof item to `relevant_notes.md` §5: with a key set, prove a real
      `web_search` returns sourced local codes + citations, that a Photo Advisor run composes Code
      Finder per finding with live token usage on each `tool_run`, and that no unsourced code is
      proposed.
- [ ] 5.3 Update `PROGRESS.md`: 9b done; the v1 tool set (#7–#9) complete; #10 Client Estimate Doc
      next.
- [ ] 5.4 `openspec validate add-code-finder --strict`, then archive on its own commit.
