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
- [x] Create a Supabase project (Postgres + Auth). *(done 2026-07-24)*
- [x] Fill `.env.local` from [`.env.example`](./.env.example): `DATABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Until these are set the
      app renders "connect Supabase" skeletons and `getServerSession()` returns
      `unconfigured` — by design.

### 1. Apply migrations (forward-only, `npm run db:migrate`) — **ALL APPLIED 2026-07-24**
All 12 tables exist with RLS enabled, `create_business` + `current_business_id` are installed, the
private `job-photos` bucket exists, and `0008`'s `storage.objects` policy applied (the migration
role had the privilege, so the dashboard fallback wasn't needed).
- [x] `0000_tenant_spine` — `businesses`, `users`, `projects` + RLS + grants.
- [x] `0001_brave_spot` — `business_settings`, `overhead_items` + RLS + grants.
- [x] `0002_fair_lethal_legion` — `estimates`, `line_items` + RLS + grants + the
      one-active-version-per-project partial unique index.
- [x] `0003_chunky_sumo` — `context_entries`, `conversation_messages`, `suggestions` + RLS +
      grants.
- [x] `0004_careful_scarlet_spider` — `tool_runs` + RLS + grants, and the nullable
      `tool_run_id` columns added to `suggestions` / `conversation_messages` (add-tool-platform).
- [x] `0005_*` — `tool_runs.status` made **nullable** (null = running) + `completed_at`
      (add-tool-dispatch; nullable instead of an enum value to dodge the in-transaction
      `ALTER TYPE … ADD VALUE` footgun).
- [x] `0006_lyrical_catseye` — `business_settings.service_area` (nullable text; additive, no
      RLS change — the table's per-business policy already covers it) (add-material-finder).
- [x] `0007_burly_quicksilver` — `project_photos` + RLS + grants (add-photo-capture).
- [x] `0008_job_photos_bucket` — the private `job-photos` bucket + the `storage.objects` policy
      keyed on `(storage.foldername(name))[1] = public.current_business_id()::text`. **Its own
      migration on purpose**: `storage` is Supabase-provided, so on a plain Postgres (the
      `test:rls` target) it doesn't exist, and a hosted project may refuse `storage.objects` to
      the migration role — bundled with `0007` either would roll the table back. Both blocks
      **self-skip with a NOTICE** instead of raising, so they can never block the chain.
      **If you see those NOTICEs, the DB half of object isolation is not in place** — run the
      file's statements once from the Supabase SQL editor and confirm with
      `select * from pg_policies where tablename = 'objects';`.
- [ ] `0009_powerful_fixer` — `documents` + RLS + grants, **and** the `get_shared_document(token)`
      `SECURITY DEFINER` function (the one deliberate public capability, §5/§7) granted to `anon`.
      **Not yet applied** (added after the 2026-07-24 batch). After `db:migrate`, prove: a shared
      document's token returns its payload via the anon client; a wrong / unshared / revoked token
      returns nothing; re-sharing a revoked doc issues a new token and the old one stays dead; and
      there is **no authenticated cross-tenant path** to `documents`. The app-layer rules are
      unit-proven (`documents.test.ts`); the live function + anon `rpc` are the deferred half
      (add-client-document).

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
- [x] Create the **private** `job-photos` bucket (or apply `0008`) and confirm `public = false` *(done 2026-07-24: bucket exists, `public = false`, policy `job_photos_objects_same_business` present)*
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
- [ ] **#10b Client Estimate Doc** (`add-client-estimate-doc`): with a key set, generate a client
      document and confirm the AI **scope narrative reads well and states no cost/margin/profit/hour
      figure** (the one free-text path — the owner review is the guard), and that generation records
      a `tool_run`. The projection/allocation math is fully proven offline (`client-projection.test`);
      only the narrative's live wording is deferred.
- [ ] **#9b Code Finder** (`add-code-finder`): with a key set, prove a real `web_search` returns
      **sourced local codes** (not a generic model code) + citations, that a Photo Advisor run
      **composes Code Finder per `safety`/`attention` finding** (a `note` composes nothing) with
      live token usage on each composed `tool_run`, that **no unsourced code** is proposed, and
      that the compose fan-out latency is tolerable on a phone (it's synchronous — a background
      queue is the deferred #11 fix if it isn't).
- [ ] **#8b Photo Advisor** (`add-photo-advisor`): with a key set and the photo bucket live, run a
      real job photo through vision and confirm — typed findings with **sane severities** (a
      genuinely dangerous defect comes back `safety`, not `note`); **labor minutes that are
      plausible** for the repair, since those minutes are the EPH denominator and the one
      quantitative claim the model makes about the business; **no price anywhere** in any
      suggestion (the result schema has no cost field, but confirm the model doesn't smuggle one
      into a description); the licensed-professional disclaimer on the post; and `tool_run` token
      usage recorded against a live vision call (vision costs more per run than text — watch the
      first few).
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

- **"New job then click → 404" is (almost always) a wrong-account view, not a bug** *(2026-07-27,
  show-active-workspace)*. Each Supabase auth identity maps to exactly one business
  (`users.auth_id → business_id`), and `current_business_id()` resolves it server-side; a job created
  under account A is *invisible* to account B by design (RLS). If a freshly-made job 404s on click,
  the session is on a different account than the one that created it — the write wasn't lost. The
  create→read path is pinned by `src/db/create-read-consistency.test.ts` (a new job is instantly
  readable by its own account; cross-account is the *only* legit 404). The fix was legibility, not
  logic: the shell header now shows the active workspace via `getBusiness()` and the empty jobs list
  names it ("No jobs yet in <workspace>"). If a *single* auth_id ever gets two `users` rows,
  `current_business_id()` (no `LIMIT`/`ORDER BY`) could flip businesses — a latent footgun, deferred
  (the user chose the UI-only fix); harden with `ORDER BY created_at, id LIMIT 1` if it ever bites.
- **Photos are SETS now, analyzed as a whole** *(2026-07-27, R6)*. `photo_sets` holds one caption per
  set; `project_photos.set_id` + `suggestions.set_id` tie photos/recommendations to a set (the
  per-photo caption is retired, not dropped). Photo Advisor's tool input is a **set** (`{ setId,
  images[], caption?, question? }`, bounded by `MAX_ADVISOR_IMAGES`) — one model call across all
  images. **Posting a set never calls the model** (`postPhotoSetForProject`); analysis is a separate
  **best-effort** `analyzeSetAction` the set-detail client **auto-kicks once** when status is
  `analyzing`, and Retry re-runs (idempotent — dispatch dedups suggestions). A set's review badge is
  derived (`photoSetBadge`): analyzing / N to review / no action / retry. The old per-photo tools
  surface + the Job-memory gallery are retired; photos live on `/projects/[id]/photos`. **Migration
  0011 applied live 2026-07-27** (`npm run db:migrate`) — the hub calls `listPhotoSets`, so the table
  must exist or the job page throws `relation "photo_sets" does not exist`; the live `photo_sets` RLS
  *proof* (`test:rls`) is still deferred (no DATABASE_URL in the vitest env). Residuals:
  concurrent opens double-spend tokens (suggestions still single); the photo→code compose edge now
  carries `setId` (code UI reshape is R8); AI-unconfigured shows a "connect AI" set state.
- **Per-line signal is degenerate unless the line is priced** *(2026-07-26, R5)*. With no entered
  per-line price the engine allocates each line's price cost-proportionally and overhead by hours, so
  **every baseline labor line's profit-per-hour is identical by construction** (worked example: 10 h vs
  5 h → net and hours both 2:1 → same $/hr). So the editor shows a per-line red/yellow/green **only on
  an *entered-price* labor line** (`EstimateLineDTO.signalColor`/`ephCents` are null otherwise); the DTO
  carries a `priced` flag to gate it. This is *why* per-line pricing exists — don't "helpfully" colour
  baseline lines.
- **Live estimate numbers: preview-DTO pattern, save is the floor** *(2026-07-26, R5)*. The editor never
  re-implements engine math client-side. A read-only `previewEstimateAction` recomputes from the
  in-progress form via the engine and returns a plain `EstimateDTO`; the same `EstimatePanel` renders
  the server first paint and the debounced live preview. Liveness is a **progressive enhancement** —
  save always yields engine-true numbers and works offline; the preview degrades to "numbers update on
  save." Per-line UI matches economics to the editor line by **key**, not index (survives reorder).
- **Full-replace save + concurrency:** `saveLineItems` replaces all lines, so a tool suggestion accepted
  while the editor is open would be dropped. R5 sends the loaded `baseLineIds` and `lineSetChanged`
  blocks the save if the server's set changed (the floor). **Residual:** it's change-detection, not a
  3-way merge; the true fix is an id-keyed upsert (`line_items.id` exists) — do it if this bites. The
  draft cache can still re-hide a concurrent line after a reload.
- **Magic links get prefetched → "email link is invalid or has expired"; use the 6-digit code**
  *(2026-07-24)*. A clickable magic link carries a one-time token that some mail providers —
  **Proton**, many corporate scanners — *prefetch* (the scanner opens the link before the human),
  which consumes the token, so the real click fails with `otp_expired` / "Email link is invalid or
  has expired." Magic links are also PKCE, so they only work in the browser that requested them.
  The robust path is `signInWithOtp` → **`verifyOtp({ email, token, type: "email" })`** with the
  **6-digit code** the user types (`app/(auth)` sign-in is a two-step email→code form). The link
  still works when not prefetched (`/auth/callback`). **Manual dashboard step:** the code only
  appears in the email if the **Magic Link** email template (Authentication → Email Templates)
  renders `{{ .Token }}` — the default template only has `{{ .ConfirmationURL }}`. Add a line like
  `Your code: {{ .Token }}`. Also confirm the redirect allowlist below.
- **Sign-in needs `/auth/callback` — and Supabase must allowlist it** *(2026-07-24)*. `@supabase/ssr`
  uses the **PKCE flow**: `signInWithOtp` stores a code verifier cookie and the emailed link returns
  with `?code=…`, which is worthless until something calls `exchangeCodeForSession`. Only a **Route
  Handler** can write the session cookies — a server component can't, and the middleware only
  refreshes an existing session. The app shipped for three changes with no route handler at all
  (`app/api/` was empty), so every magic link bounced back to `/sign-in` and the app looked like it
  had no way in. Fixed by `app/auth/callback/route.ts` + `emailRedirectTo` on the sign-in action.
  **Manual step that is not in the repo:** the Supabase dashboard (Authentication → URL
  Configuration) must list the redirect URL — `http://localhost:3000/**` for dev, the deployed
  origin for production — or Supabase ignores `emailRedirectTo` and falls back to the Site URL.
- **drizzle-kit does not read `.env.local`** *(2026-07-24)*. Next loads it automatically; the CLI
  doesn't, so `npm run db:migrate` failed with `url: ''` on a perfectly configured project.
  `drizzle.config.ts` now parses `.env.local` itself when `DATABASE_URL` isn't already exported (no
  dotenv dependency for one variable).

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
