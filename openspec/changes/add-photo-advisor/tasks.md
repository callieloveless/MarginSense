## 1. Stage A — the shared disclaimer and the context/preview changes

- [ ] 1.1 Add `src/tools/disclaimer.ts`: one exported `PHYSICAL_WORK_DISCLAIMER` constant
      (licensed-professional, non-authoritative — constitution §5, §7) with a comment naming its
      consumers (Photo Advisor now, Code Finder next); export it from `src/tools/index.ts`.
- [ ] 1.2 Extend the `finding` payload in `src/context/context.ts` with an optional
      `photoStorageKey` (additive; `jsonb`, no migration), so a diagnosis names the photo behind
      it. Keep the module framework/DB-free.
- [ ] 1.3 Unit-test the payload change: a finding with and without the photo reference both
      validate, and a committed entry keeps the reference.
- [ ] 1.4 Add the **unpriced** case to `app/_lib/suggestion-preview.ts`: a line-item proposal with
      no `unitCostCents` and no `priceCents` yields a preview that reports the hour impact and a
      "not yet priced" note, and **no** profit-per-hour delta.
- [ ] 1.5 Test it in `app/_lib/suggestion-preview.test.ts`: an unpriced material line previews
      with the note and no delta; a priced line is unchanged; a labor line with minutes still
      previews its full impact (the existing cases must not regress).
- [ ] 1.6 Render the unpriced preview in `app/_components/suggestion-card.tsx` — text-paired, no
      colour-only signal, and no branch on which tool produced the suggestion.

## 2. Stage B — the tool

- [ ] 2.1 Add `src/tools/photo-advisor/schema.ts`: `inputSchema` (`photoId`, `mediaType`,
      `imageBase64`, optional `caption`, optional `question`), the port `resultSchema`
      (`findings[]`, `labor[]`, `materials[]` — materials deliberately have **no cost field**),
      and `outputSchema` (what was actually proposed).
- [ ] 2.2 Add `src/tools/photo-advisor/suggestions.ts`: the one place a result becomes proposals
      — a finding → a `finding` context-entry suggestion carrying the photo reference; a labor
      candidate → an `estimate_line_item` (category `labor`, its minutes) when there is an active
      estimate; a material candidate → an `estimate_line_item` (category `material`, description
      + quantity, **no price**) when there is an active estimate.
- [ ] 2.3 Clamp labor minutes to a sane bound in one named constant; a candidate outside it is
      dropped, not proposed (design §2), so a wild estimate can't wreck the signal.
- [ ] 2.4 Add `src/tools/photo-advisor/photo-advisor.ts`: the system prompt, the port call with
      `images` + `resultSchema`, the mapping, and a conversation `message` whose body summarizes
      the findings and names Material Finder for the unpriced materials — with
      `disclaimer: PHYSICAL_WORK_DISCLAIMER`.
- [ ] 2.5 Handle the no-active-estimate path: findings only, no line-item suggestions, and a post
      that says candidate work needs an estimate to be added to.
- [ ] 2.6 Register the tool in `src/tools/registry.ts` and export it from `src/tools/index.ts`.
- [ ] 2.7 Unit-test the tool against the mock port with a canned vision result: findings become
      pending suggestions carrying the photo reference; labor lines carry minutes; material lines
      carry **no** price; out-of-range minutes are dropped; no active estimate → findings only;
      every run's message carries the disclaimer; the tool receives no handle it could write with.

## 3. Stage C — the panel and its action

- [ ] 3.1 Add the Photo Advisor server action under `app/(app)/projects/[id]/tools/`: resolve the
      session, load the chosen photo tenant-scoped, read its bytes, dispatch through the runner
      with the resolved live port, and revalidate. Never trust a client `business_id`.
- [ ] 3.2 Add the Photo Advisor panel (client component, mirroring `material-finder-form.tsx`):
      pick from the job's photos (batch-signed thumbnails from 8a), an optional question, and a
      run button; results land in the existing "Waiting on you" list.
- [ ] 3.3 Render `PHYSICAL_WORK_DISCLAIMER` as a standing notice on the panel, above the run
      control — visible before any run.
- [ ] 3.4 Render the "connect AI" state when `resolveModelPort()` is unconfigured, and a plain
      "add a photo first" state when the job has none.
- [ ] 3.5 Check the panel at phone width first; colour always paired with text.

## 4. Verification and close-out

- [ ] 4.1 `npm run typecheck`, `npx vitest run`, and `npm run build` green after each stage (the
      build is the only check that catches Turbopack/App-Router issues; relative imports in
      `src/` stay extensionless).
- [ ] 4.2 Add the live-AI proof item to `relevant_notes.md` §5: with a key set, run a real photo
      through vision and confirm typed findings, sane labor minutes, unpriced materials, and
      `tool_run` token usage against a live call.
- [ ] 4.3 Update `PROGRESS.md`: 8b done, #9 next.
- [ ] 4.4 `openspec validate add-photo-advisor --strict`, then archive on its own commit.
