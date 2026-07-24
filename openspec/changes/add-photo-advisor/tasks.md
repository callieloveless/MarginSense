## 1. Stage A — shared disclaimer, finding severity, and reading a stored photo

- [ ] 1.1 Add `src/tools/disclaimer.ts`: one exported `PHYSICAL_WORK_DISCLAIMER` constant
      (licensed-professional, non-authoritative — constitution §5, §7) with a comment naming its
      consumers (Photo Advisor now, Code Finder next); export it from `src/tools/index.ts`.
- [ ] 1.2 Extend the `finding` payload in `src/context/context.ts`: a required `severity`
      (`safety` | `attention` | `note`) and an optional `photoStorageKey` (additive JSON, no
      migration). Keep the module framework/DB-free.
- [ ] 1.3 Decide and document the back-compat rule for `finding` payloads written before this
      change (default to `note` on read rather than failing validation), so existing entries and
      any pending suggestion still parse.
- [ ] 1.4 Unit-test the payload change: each severity validates, an unknown severity is rejected,
      the photo reference is optional, a pre-existing payload without severity still reads, and
      an accepted finding keeps both fields.
- [ ] 1.5 Render severity as **text paired with colour** (never colour alone) in
      `app/_components/suggestion-card.tsx` and the job context list — driven by the payload, with
      no branch on which tool produced the suggestion.
- [ ] 1.6 Add `getObject(businessId, key)` to `PhotoStorageBackend` (`src/db/tenant.ts`): the same
      prefix refusal as its siblings, returning bytes + content type or null. Memory impl in
      `tenant.ts`, Supabase impl in `photo-storage.ts` (`download`), and `TenantDb.readPhoto`.
- [ ] 1.7 Extend `src/db/photos.test.ts`: business A cannot read business B's object bytes, a key
      outside the caller's prefix returns null, and a stored photo round-trips.

## 2. Stage B — the tool

- [ ] 2.1 Add `src/tools/photo-advisor/schema.ts`: `inputSchema` (`photoId`, `mediaType`,
      `imageBase64`, optional `caption`, optional `question`), the port `resultSchema`
      (`findings[]` with severity + what materials the repair needs, `labor[]` with description +
      minutes — and **no cost field anywhere**), and `outputSchema` (what was actually proposed).
- [ ] 2.2 Add `src/tools/photo-advisor/suggestions.ts`: the one place a result becomes proposals —
      a finding → a `finding` context-entry suggestion carrying severity and the photo reference;
      a labor candidate → an `estimate_line_item` (category `labor`, its minutes) when there is an
      active estimate. **No material line item is ever built here.**
- [ ] 2.3 Add `IMPLAUSIBLE_LABOR_MINUTES` as one named constant; a candidate beyond it is still
      proposed with its real minutes and is collected for the post's warning (design §3) — never
      dropped, never silently capped.
- [ ] 2.4 Add `src/tools/photo-advisor/photo-advisor.ts`: the system prompt (diagnose, estimate
      repair time, name materials, **never price anything**), the port call with `images` +
      `resultSchema`, the mapping, and a conversation `message` that summarizes the findings,
      names the materials and hands pricing to Material Finder, flags any implausible estimate,
      and carries `disclaimer: PHYSICAL_WORK_DISCLAIMER`.
- [ ] 2.5 Handle the no-active-estimate path: findings only, no line-item suggestions, and a post
      that says candidate work needs an estimate to be added to.
- [ ] 2.6 Register the tool in `src/tools/registry.ts` and export it from `src/tools/index.ts`.
- [ ] 2.7 Unit-test against the mock port with a canned vision result: findings carry severity and
      the photo reference; labor lines carry the model's minutes unchanged; **no material line is
      ever proposed** and no payload carries a cost; an over-range estimate is proposed *and*
      flagged in the post; no active estimate → findings only; every run's message carries the
      disclaimer; the tool receives nothing it could write with.

## 3. Stage C — the panel and its action

- [ ] 3.1 Add the Photo Advisor server action under `app/(app)/projects/[id]/tools/`: resolve the
      session, read the chosen photo's bytes tenant-scoped, dispatch through the runner with the
      resolved live port, revalidate. Never trust a client `business_id`.
- [ ] 3.2 Add a capture-and-run path: reuse 8a's client-side prepare (downscale, EXIF strip,
      thumbnail) and upload path so the photo joins the job normally, then run on it in the same
      step — no separate upload screen.
- [ ] 3.3 Add the Photo Advisor panel (client component, mirroring `material-finder-form.tsx`):
      take a photo *or* choose one of the job's (batch-signed thumbnails from 8a), an optional
      question, and a run button; results land in the existing "Waiting on you" list.
- [ ] 3.4 Render `PHYSICAL_WORK_DISCLAIMER` as a standing notice on the panel, above the run
      control — visible before any run.
- [ ] 3.5 Render the "connect AI" state when `resolveModelPort()` is unconfigured, the "connect
      storage" state when photo storage isn't wired, and an offer to take one when the job has no
      photos yet (never an empty picker).
- [ ] 3.6 Check the panel at phone width first; colour always paired with text.

## 4. Verification and close-out

- [ ] 4.1 `npm run typecheck`, `npx vitest run`, and `npm run build` green after each stage (the
      build is the only check that catches Turbopack/App-Router issues; relative imports in
      `src/` stay extensionless).
- [ ] 4.2 Add the live-AI proof item to `relevant_notes.md` §5: with a key set, run a real photo
      through vision and confirm typed findings with sane severities, labor minutes that survive
      unchanged, no priced material anywhere, and `tool_run` token usage against a live call.
- [ ] 4.3 Update `PROGRESS.md`: 8b done, #9 next.
- [ ] 4.4 `openspec validate add-photo-advisor --strict`, then archive on its own commit.
