# Relevant notes

> A living scratchpad of things worth remembering while working in this repo — deferred
> work, gotchas, and conventions that aren't obvious from the code. **Skim this at the
> start of a task and add to it as you learn something worth carrying forward.** It is not
> a spec (specs live in `openspec/`) and not the roadmap ([`PROGRESS.md`](./PROGRESS.md)) —
> it's the "stuff you'd tell the next person" file.
>
> **Started:** 2026-07-22. Newest notes near the top of each section; date new entries.

## Deferred to live infrastructure

Work that is **built and tested in code** but can't be *proven* or *run* until a live
Supabase project + secrets exist. Nothing here happens until the database is provisioned.

### 0. Provision Supabase (the blocker — do first)
- [ ] Create a Supabase project (Postgres + Auth).
- [ ] Fill `.env.local` from [`.env.example`](./.env.example): `DATABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Until these are set the
      app renders "connect Supabase" skeletons and `getServerSession()` returns
      `unconfigured` — by design.

### 1. Apply migrations (forward-only, `npm run db:migrate`)
- [ ] `0000_tenant_spine` — `businesses`, `users`, `projects` + RLS + grants.
- [ ] `0001_brave_spot` — `business_settings`, `overhead_items` + RLS + grants.
- [ ] `0002_fair_lethal_legion` — `estimates`, `line_items` + RLS + grants + the
      one-active-version-per-project partial unique index.
- [ ] `0003_chunky_sumo` — `context_entries`, `conversation_messages`, `suggestions` + RLS +
      grants.
- [ ] `0004_careful_scarlet_spider` — `tool_runs` + RLS + grants, and the nullable
      `tool_run_id` columns added to `suggestions` / `conversation_messages` (add-tool-platform).
- [ ] `0005_*` — `tool_runs.status` made **nullable** (null = running) + `completed_at`
      (add-tool-dispatch; nullable instead of an enum value to dodge the in-transaction
      `ALTER TYPE … ADD VALUE` footgun).
- [ ] `0006_lyrical_catseye` — `business_settings.service_area` (nullable text; additive, no
      RLS change — the table's per-business policy already covers it) (add-material-finder).
- [ ] `0007_burly_quicksilver` — `project_photos` + RLS + grants (add-photo-capture).
- [ ] `0008_job_photos_bucket` — the private `job-photos` bucket + the `storage.objects` policy
      keyed on `(storage.foldername(name))[1] = public.current_business_id()::text`. **Its own
      migration on purpose**: `storage` is Supabase-provided, so on a plain Postgres (the
      `test:rls` target) it doesn't exist, and a hosted project may refuse `storage.objects` to
      the migration role — bundled with `0007` either would roll the table back. Both blocks
      **self-skip with a NOTICE** instead of raising, so they can never block the chain.
      **If you see those NOTICEs, the DB half of object isolation is not in place** — run the
      file's statements once from the Supabase SQL editor and confirm with
      `select * from pg_policies where tablename = 'objects';`.

### 2. Prove Row-Level Security end-to-end
App-layer tenant isolation is already proven by in-memory tests (`tenant.test.ts`,
`settings.test.ts`). The **RLS layer** (the Postgres policies themselves) needs a real DB.
- [ ] `npm run test:rls` (opt-in; skipped without `DATABASE_URL`) — the cross-tenant
      read/write contracts in `src/db/tenant.rls.test.ts` against two seeded businesses.
- [ ] **Known gap:** the `test:rls` suite only covers `projects`. Extend it to
      `business_settings` / `overhead_items` (onboarding) and `estimates` / `line_items`
      (add-estimate-dashboard) and `context_entries` / `conversation_messages` / `suggestions`
      (add-project-context) and `tool_runs` (add-tool-platform) and `project_photos`
      (add-photo-capture) before trusting those tables in production. Each has app-layer
      isolation tests, but the DB policies themselves are unproven end-to-end.

### 2b. Prove **object** storage isolation (new with add-photo-capture) *(2026-07-23)*
Photo bytes live in Supabase Storage — **outside Postgres and outside table RLS**. Three layers
guard them (keys derived only by `src/photos/photoObjectKey()` from the tenant handle; every
`PhotoStorageBackend` method refusing a key outside the caller's prefix; the `storage.objects`
policy in `0007`). The first two are unit-tested; the third needs a live bucket.
- [ ] Create the **private** `job-photos` bucket (or apply `0008`) and confirm `public = false`
      — the app never mints a public URL. The bucket name is fixed in `src/photos/`
      (`PHOTO_BUCKET`) because the policy names one bucket; don't parameterize it.
- [ ] Prove business A cannot sign or read an object under business B's prefix, and that a
      direct Storage call with B's key is refused by the policy (not just by app code).
- [ ] Confirm signed URLs expire (`SIGNED_URL_TTL_SECONDS`, 60s) and that an expired URL 400s.
- [ ] Walk the flow on a phone: take a photo → it uploads downscaled with **no EXIF/GPS**
      (check the stored object's metadata) → caption it → delete it and confirm **both** the
      full-size and thumbnail objects are gone.

### 3. Walk the money-critical flows live (phone width)
- [ ] Tenancy: sign-in → create-business → add a project; list is business-scoped.
- [ ] Onboarding: create-business → 3-step wizard → Review shows derived rates → edit in
      Settings and confirm the rates recompute.
- [ ] Reference-business check: $60k overhead, $35/hr wage, 25% burden, 200 days × 6
      billable hrs/day, $90k income, $15k profit → Review shows $50.00/hr recovery,
      $43.75/hr burdened, $93.75/hr loaded, $562.50 break-even day, $165,000 gross-profit
      goal, $87.50/hr target profit/hr. (Conversion math is unit-tested; this confirms the
      live render.)
- [ ] Estimate + dashboard: open a project → new estimate → add labor + material lines →
      margin-solve to 45% → green signal → mark active → dashboard shows the job's % of
      year and % of profit goal, worst-first.

### 4. Production hosting (later — roadmap launch pass)
- [ ] Vercel project + env vars.
- [ ] Production Supabase (separate from dev); apply all migrations there.
- [ ] Confirm middleware session refresh + auth redirects on the deployed domain.

### 5. Live AI — model calls + web search (opt-in, deferred) *(2026-07-22)*
The tool platform (change #6) builds `src/ai/` as a **mockable model port**: unit tests run
against an in-memory/mock impl; the real Anthropic impl sits behind `ANTHROPIC_API_KEY` and
is never exercised in tests. Same shape as the Supabase/RLS deferral — everything is
buildable and typed now, live calls wait on a key.
- [ ] Set `ANTHROPIC_API_KEY` in `.env.local` (add to `.env.example`). Until set, `src/ai/`
      reports `unconfigured` and tools that need the model render a "connect AI" state.
- [ ] Prove one real model call end-to-end (the reference/echo tool), then Material Finder's
      **server-side `web_search`** (`web_search_20260209`, model `claude-opus-4-8`) returning
      real prices + citations.
- [ ] Confirm `tool_run` cost logging (tokens, latency) records against live usage.
- Each tool change (#7 Material Finder, #8 Photo Advisor, #9 Code Finder) adds its own
  live-AI proof item here when built — mirror this entry.
- [ ] **#7a structured-result port** (`add-structured-result-port`): prove the real port returns
      a validated `result` **and** citations in one `messages.create` — a strict `record_result`
      tool (built from a Zod schema via `z.toJSONSchema`) declared alongside `web_search_20260209`
      with `tool_choice` auto (forcing it would pre-empt the search). `output_config.format` is
      **incompatible with citations** (400) — that's why we use the result-tool. Everything is
      proven offline via the mock's canned result; only the live wire is deferred.
- [ ] **#7b Material Finder** (`add-material-finder`): after applying `0006` and setting the key,
      set a service area in Settings → search both modes → comparable **sourced** options appear
      in place with profit-per-hour previews → accept one → the signal header moves; and hand-add
      a material with the key unset (no model, no `tool_run`). No option without a `sourceUrl` may
      become a suggestion.

## Future direction (north-star)

- **Visual tool-graph editor** *(2026-07-22)* — a later feature: a canvas where tools are
  nodes and connections are edges, so one tool's output feeds another's input and auto-triggers
  (photo upload → Code Finder) are drawn, not coded. Meta/admin surface first, power-user
  contractors later; lands **after the v1 tools ship**. It changes none of the tool rules
  (read-only snapshot in, suggestions out). **Guardrail for whoever builds the tool platform
  (#6):** keep every tool's `inputSchema`/`outputSchema` typed and side-effect-free (suggestions
  only, no hidden writes) so tools stay wirable later — but don't build the graph now. See
  constitution §5 "Composing tools", techstack §4, PROGRESS #10.

## Gotchas & lessons

- **OpenSpec CLI package** — the CLI is `@fission-ai/openspec` (`npm i -g @fission-ai/openspec`,
  provides the `openspec` bin). The bare `openspec` on npm is a dead 0.0.0 placeholder with
  no bin — don't install it. *(2026-07-22)*
- **`tsconfig.json` is Next-owned** — `next build` **mandates** `jsx: react-jsx`, adds
  `.next/dev/types/**/*.ts` to `include`, and sets `exclude: ["node_modules"]`, rewriting the
  file every build. These are committed as-is; don't fight them (an earlier note said to
  revert — that was wrong; the build just re-applies them). Everything typechecks under either
  `jsx` setting. *(updated 2026-07-22)*
- **No `.js` extensions on relative imports in `src/`** — the project uses
  `moduleResolution: "Bundler"`, where extensionless imports are idiomatic and Turbopack (the
  Next 16 build) resolves `./x` → `./x.ts` natively. Explicit `./x.js` specifiers (a NodeNext
  habit) make `next build` fail with "Module not found". Write `from "./x"`, not `"./x.js"`.
  tsc and vitest resolve both, so only a build catches it — run `npm run build` when touching
  imports under `src/`. *(2026-07-22)*
- **Zod + `tsc` OOM** — deeply-chained `z.union([...]).transform(...)` composed across many
  object fields (then a second object-level `.transform`) blew up `tsc --noEmit` (out of
  memory). Prefer plain, unit-tested converter functions for money/percent parsing over
  transform-heavy Zod schemas; validate shape with Zod, convert with helpers. See
  `src/db/validation.ts` (`parseSettingsForm`). *(2026-07-22)*

## Conventions worth remembering

- Money = integer cents (`*_cents`, stored `bigint` mode number), time = integer minutes,
  percentages = basis points. Convert human input at the Zod/parse boundary; never store a
  derived value — recompute via `src/engine/` (constitution §3.1, §6.8).
- Every business-owned table: non-null `business_id` + RLS enabled in the **same** migration
  + an in-memory tenant-isolation test + (eventually) a `test:rls` contract.
- New OpenSpec change that defers work to live infra: add its items to the
  "Deferred to live infrastructure" section above.
