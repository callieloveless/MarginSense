# Tasks — revamp-project-hub (R4-hub)

Presentation-only, additive. No schema, no engine, no new tenant backend. Reuse existing
loaders, components, and server actions. Verify with typecheck + vitest + **build** (the build is
the only check that catches Turbopack / App-Router issues on this reshaped server page).

## Stage A — hub composition (server page + small helpers)

- [x] A1. Pure sub-line builder `jobSubline` in `app/_lib/job-summary.ts` (address · job type · crew ·
  start window from only the set fields; null when none).
- [x] A2. Pure badge selectors `photoBadge` / `documentBadge` in `app/_lib/job-summary.ts` (photo count
  when storage ready & > 0; document Shared/Draft/none; no fabricated counts).
- [x] A3. Extracted the context-entry one-liner + kind labels to `app/_lib/context-entry-summary.ts`;
  the job-memory page now imports it, so the hub feed and the memory page can't drift.
- [x] A4. Reshaped `app/(app)/projects/[id]/page.tsx` into the hub: one `Promise.all` (project,
  `loadJobProfit`, estimates, pending, entries+messages, photos, documents); identity +
  `ProfitHeader` hero + "Waiting on you" (`SuggestionCard` + `previewForSuggestion`, binding the
  existing accept/dismiss) + tools grid + activity feed + Estimates section.
- [x] A5. Calm empty states wired (no active estimate → existing hero state; nothing waiting; no
  activity; no estimates).
- [x] A6. Added `app/(app)/projects/[id]/hub-sections.tsx` (ToolsGrid + ActivityFeed, server-renderable).
- [x] A7. Unit tests for the sub-line + badges (9). typecheck + full vitest (353) green.
- [x] A8. Also revalidate the hub path on dismiss so a dismiss on the hub clears the card; the
  "Active" version marker is a neutral chip, not a green SignalBadge (signal palette stays for the
  profit signal alone).

## Stage B — surface + build

- [x] B1. Tiles resolve to existing routes (context / tools / documents all present in the build's
  route table); the hero's "build one" lands on the hub whose Estimates form is in view.
- [x] B2. Phone-first: 2-up tools grid, stacked hero/queue/feed on tokens; color always paired with text.
- [x] B3. `npm run build` (Turbopack) green — `/projects/[id]` compiles as a dynamic server route.
- [ ] B4. Manual dev check (user) — a job with an active estimate + a pending line-item suggestion
  shows the signal, the before→after preview, and accepting clears the card; a new job renders calm.

## Stage C — self-review + code-review + land

- [x] C1. Self-reviewed against the spec deltas + critique lenses (tenant reads only; signal palette
  reserved; badges/tiles honest; calm empty states; no drift via the shared entry helper). Verified
  the seed `fact` renders as a real feed line, the documents backend is always wired, and
  `--brand-soft` has contrast in both themes.
- [x] C2. `/code-review` is user-triggered only (can't be model-invoked); ran a high-effort
  adversarial inline pass instead — no correctness findings. Non-blocking notes: the pending queue
  intentionally shows on both hub + memory page (one durable queue, Decision 2), a minor double
  `listEstimates` read (design-accepted).
- [x] C3. `PROGRESS.md` updated (R4-hub → done).
- [x] C4. Commit the implementation, then archive (`openspec archive revamp-project-hub --yes`) as
  its own commit, then push.

## Deferred (not this change)

- Chain teaser / auto-run rules editor (L2); client answers (L1); branding "!" badge (R9).
- Reshaping the tools' own surfaces (Photo Advisor R6, Material Finder R7, Code & Permits R8,
  Client document R9) — the grid opens today's surfaces as they are.
