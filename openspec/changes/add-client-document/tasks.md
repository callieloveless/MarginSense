## 1. Stage A — the client-safe payload module (pure, no framework/DB)

- [x] 1.1 Add `src/document/document.ts`: the Zod client-safe payload schema — `businessName`,
      optional `tradeType`/`serviceArea`/`license`, `clientName`, optional `clientAddress`,
      `title`, `preparedOn`, optional `intro`, `lines: [{ description, priceCents }]`,
      `subtotalCents`, optional `taxCents`, `totalCents`, optional `terms`. Use `.strict()` so any
      unknown key (a cost/EPH/labor-minutes field) is a validation error.
- [x] 1.2 Add a `.refine` enforcing the arithmetic: `subtotalCents === Σ line.priceCents` and
      `totalCents === subtotalCents + (taxCents ?? 0)`, so a document that doesn't add up is
      rejected.
- [x] 1.3 Add `parseClientDocument(payload)` returning a typed ok/error result, and small display
      helpers (money via `formatCents`). Keep the module free of Next/Drizzle/Supabase imports.
- [x] 1.4 Export from `src/document/index.ts`.
- [x] 1.5 Unit-test `src/document/document.test.ts`: a valid payload parses; a payload with a
      `costCents`/`eph`/`laborMinutes`/`signal` key is rejected; a payload whose subtotal ≠ Σ lines
      or total ≠ subtotal + tax is rejected; a minimal payload (no optional fields) is valid; totals
      are integer cents.

## 2. Stage B — persistence: table, migration, RLS, token function

- [x] 2.1 Add `documents` to `src/db/schema.ts`: non-null `business_id` + `project_id`, nullable
      `estimate_id` (set null on delete), `title`, `payload` (jsonb), `share_token` (unique),
      `shared_at`, `revoked_at`, timestamps; export `DocumentRow` / `NewDocumentRow`.
- [x] 2.2 `npm run db:generate` → migration `0009_*`; **hand-append the RLS block** mirroring
      `0000`: enable RLS, a per-business `FOR ALL` policy on `public.current_business_id()`, and
      `GRANT … TO authenticated`.
- [x] 2.3 Hand-append the `SECURITY DEFINER` `public.get_shared_document(p_token text)` returning
      the payload `jsonb` only when `share_token = p_token AND shared_at IS NOT NULL AND revoked_at
      IS NULL`; `SET search_path = public`; `GRANT EXECUTE ON FUNCTION … TO anon, authenticated`.
      Comment it as the one deliberate public capability (§7), mirroring `create_business`.
- [x] 2.4 Add the `DocumentBackend` port to `src/db/tenant.ts` (`createDocument`, `listDocuments`,
      `getDocument`, `shareDocument`, `revokeDocument`, each taking `businessId`) as an optional
      entry on `TenantBackends` with a private getter that throws when unwired.
- [x] 2.5 Add the `TenantDb` methods that pass the bound business id and stamp `business_id` + a
      fresh high-entropy `share_token` (`crypto`, ≥128 bits) from the handle (never from input); the
      payload is validated by `src/document/` before insert. `shareDocument` sets `shared_at`
      (token unchanged); `revokeDocument` sets `revoked_at`; **re-sharing a revoked document mints a
      new token and clears `revoked_at`**.
- [x] 2.6 Add `createMemoryDocumentBackend` in `tenant.ts` over a shared cross-tenant array
      (mirroring the other memory backends), including a `getShareable(token)` mirror of the SQL
      access rule (payload only when `shared_at` set and `revoked_at` null) so the rule is unit-
      testable without the live function.
- [x] 2.7 Add the Drizzle `DocumentBackend` impl in `src/db/drizzle-backend.ts` inside
      `withAuthenticatedTx`; wire it in `src/db/session.ts`.
- [x] 2.8 Tenant-isolation + lifecycle tests in `src/db/documents.test.ts`: business A cannot read,
      share, or revoke business B's document; `business_id` and `share_token` are stamped from the
      handle; an invalid (non-safe or non-adding-up) payload is refused; **share → revoke →
      re-share** issues a new token and the old token no longer resolves via `getShareable`; a
      revoked or never-shared token resolves to nothing.

## 3. Stage C — the public read and the client render

- [x] 3.1 Add `getSharedDocument(token)` in `src/db/` (or a small `src/db/share.ts`): calls the
      `get_shared_document` RPC via the **Supabase anon client** (no cookies), returning the
      validated client-safe payload or null. Report `unconfigured` gracefully when Supabase env is
      absent.
- [x] 3.2 Add the public `app/share/[token]/page.tsx` (top-level, outside `(app)`): read the token
      → fetch the payload → render it, or a plain "this document isn't available" when null. Export
      `metadata`/`robots` as `{ index: false, follow: false }` so a leaked link isn't indexed.
- [x] 3.3 The render is phone- and print-friendly: business header, client block, scope/intro,
      priced line items, subtotal/tax/total, terms — and **nothing internal**. Read-only (no
      accept/sign/pay controls).
- [x] 3.4 Confirm the middleware does not gate `/share` (its matcher guards the app prefixes only),
      the `(app)` session gate never runs for it, and the **root layout does no `getServerSession`**
      (the public page must not trigger a session/tenant lookup).

## 4. Verification and close-out

- [x] 4.1 `npm run typecheck`, `npx vitest run`, and `npm run build` green after each stage (the
      build catches Turbopack/App-Router issues; relative imports in `src/` stay extensionless).
- [ ] 4.2 Add the deferred live-infra items to `relevant_notes.md`: apply `0009`, prove the
      `get_shared_document` function returns a shared doc's payload and nothing for a wrong/unshared/
      revoked token from the anon client, and confirm no authenticated cross-tenant path to
      `documents`.
- [ ] 4.3 Update `PROGRESS.md`: #10 split into 10a (this change) and 10b (the Client Estimate Doc
      tool), with 10a's status.
- [ ] 4.4 `openspec validate add-client-document --strict`, then archive on its own commit.
