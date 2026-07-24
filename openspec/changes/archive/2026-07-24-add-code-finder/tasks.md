## 1. Stage A — the `code_ref` payload and Photo Advisor's output key

- [x] 1.1 Extend the `code_ref` payload in `src/context/context.ts` with optional `sourceUrl`,
      `complianceNote`, and `photoStorageKey` (additive; `jsonb`, no migration). Keep the module
      framework/DB-free.
- [x] 1.2 Unit-test the payload change: a minimal `code_ref` (`code` + `citation`) still validates,
      each new field is accepted when present, and an accepted entry keeps them.
- [x] 1.3 Add `photoStorageKey` to Photo Advisor's `outputSchema` and populate it from the run's
      input in `photo-advisor.ts` (the one photo every finding in the run shares). Update the
      Photo Advisor tests that assert on `output`.
- [x] 1.4 Tighten Photo Advisor's system prompt: anything with a permit, code, or inspection angle
      is marked at least `attention` (never `note`), so severity is a reliable proxy for "worth a
      code lookup." Add/adjust a test asserting a permit-implicating finding isn't `note`.

## 2. Stage B — the Code Finder tool

- [x] 2.1 Add `src/tools/code-finder/schema.ts`: `inputSchema` (`query`, optional `location`,
      optional `photoStorageKey`), the port `resultSchema` (`codes[]` with `code`, `requirement`,
      optional `jurisdiction`, optional `sourceUrl`, optional `complianceNote`), and `outputSchema`
      (the sourced codes actually proposed).
- [x] 2.2 Add `src/tools/code-finder/suggestions.ts`: a code → a `code_ref` context-entry
      suggestion carrying code, citation, jurisdiction, `sourceUrl`, `complianceNote`, and the
      `photoStorageKey` from the input when present. Reuse the `isSourceUrl` rule — a code with no
      real source URL yields nothing (§7). Cap the proposals to the few most relevant via one named
      constant (`MAX_CODE_RESULTS`).
- [x] 2.3 Add `src/tools/code-finder/code-finder.ts`: the system prompt (find LOCAL code, return
      the most important requirements not a survey, cite the source, state permit/inspection
      consequences **as cost and crew-hour impact**, never present as authoritative), the port call
      with `WEB_SEARCH_TOOL` + `resultSchema`, the mapping, and a conversation `message` that
      frames each compliance note as what it adds to the job's cost/hours (and points at Material
      Finder to price it) and carries `disclaimer: PHYSICAL_WORK_DISCLAIMER`. Localize from
      `input.location`. **Propose no line item** for a permit/inspection.
- [x] 2.4 Handle the empty/no-jurisdiction cases: no sourced code → a post that says none was
      found; no location → search without a local bias and say the jurisdiction wasn't narrowed.
- [x] 2.5 Register the tool in `src/tools/registry.ts` and export it from `src/tools/index.ts`.
- [x] 2.6 Unit-test against the mock port with a canned code result: sourced codes become `pending`
      `code_ref` suggestions carrying source + compliance note; an unsourced code is dropped; the
      result set is capped at `MAX_CODE_RESULTS`; **no `estimate_line_item` is ever proposed**; the
      post frames compliance as cost/hour impact; the `photoStorageKey` rides through when set;
      every run's message carries the disclaimer; the tool receives no handle it could write with.

## 3. Stage C — light up the compose edge

- [x] 3.1 Register `COMPOSE_EDGES["photo-advisor"] = [{ consumer: "code-finder", map }]` in
      `app/_lib/compose.ts`; the mapper reads `tenantDb.getSettings()?.serviceArea` once and
      returns one Code Finder input **per `safety`/`attention` finding** (skipping `note`s) — query
      from the finding summary + its materials, `location` from the service area, `photoStorageKey`
      from the output.
- [x] 3.2 Integration-test the edge through `dispatchAndCompose` against the memory backends + mock
      port: a Photo Advisor run with M code-relevant findings + K `note`s composes exactly M Code
      Finder runs (source `compose`), each proposing `pending` `code_ref` suggestions that carry
      the photo key; the `note`s compose nothing; a composed-run failure leaves Photo Advisor's own
      suggestions intact (9a's isolation, now with a real edge).
- [x] 3.3 Confirm the standalone path is unaffected and dedup still holds (a re-run doesn't stack
      duplicate `code_ref` suggestions).

## 4. Stage D — the panel and its action

- [x] 4.1 Add the Code Finder server action under `app/(app)/projects/[id]/tools/`: resolve the
      session, gate on a configured model, run the query through `dispatchAndCompose`, revalidate.
      Never trust a client `business_id`; pre-fill the location from `service_area`.
- [x] 4.2 Add the Code Finder query panel (client component, mirroring `material-finder-form.tsx`):
      a question field + an overridable location + a run button; results land in the existing
      "Waiting on you" list.
- [x] 4.3 Render `PHYSICAL_WORK_DISCLAIMER` as a standing notice on the panel, above the run
      control, and the "connect AI" state when the model is unconfigured.
- [x] 4.4 Render a `code_ref` suggestion's source link and compliance note on the suggestion card
      and the context list — driven by the payload, no branch on the producing tool.
- [x] 4.5 Check the panel at phone width first; colour always paired with text.

## 5. Verification and close-out

- [x] 5.1 `npm run typecheck`, `npx vitest run`, and `npm run build` green after each stage (the
      build is the only check that catches Turbopack/App-Router issues; relative imports in `src/`
      stay extensionless).
- [x] 5.2 Add the live-AI proof item to `relevant_notes.md` §5: with a key set, prove a real
      `web_search` returns sourced local codes + citations, that a Photo Advisor run composes Code
      Finder per finding with live token usage on each `tool_run`, and that no unsourced code is
      proposed.
- [x] 5.3 Update `PROGRESS.md`: 9b done; the v1 tool set (#7–#9) complete; #10 Client Estimate Doc
      next.
- [x] 5.4 `openspec validate add-code-finder --strict`, then archive on its own commit.
