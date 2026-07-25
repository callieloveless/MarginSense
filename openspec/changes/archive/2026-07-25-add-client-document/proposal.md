# Add the client document + share link (Client Estimate Doc, stage 10a)

## Why

Every other surface in MarginSense is internal — true costs, overhead, EPH, the red/yellow/green
signal. The one thing the **client** ever sees is the proposal, and it must be the opposite: a
clean price sheet with **none of the internal machinery on it**. Before the Client Estimate Doc
tool (10b) can generate that proposal, the app needs a place to put it, a safe way to show it to
someone who isn't a tenant user, and a guarantee that the internal numbers can't leak into it.
That is this change, and it is deliberately the security-sensitive half done on its own: a
**document** is the first thing MarginSense ever exposes outside the login wall.

## What Changes

- **A `documents` table** (migration `0009`): non-null `business_id` + `project_id`, the estimate
  version it was generated from, a **client-safe payload** (see below), an unguessable **share
  token**, `shared_at` / `revoked_at`, timestamps — **RLS on**, per-business policy, `GRANT … TO
  authenticated`, mirroring migration `0000`. The owner's access is tenant-scoped like every other
  table.
- **The document is a snapshot of only client-safe fields.** A `src/document/` module (pure,
  framework/DB-free) defines the client-facing payload schema — business identity, client, a title
  and date, an optional scope narrative, **line items with client prices only**, subtotal/tax/
  total, and terms. It **has no typed field for** cost, overhead, contingency, margin, EPH, the
  signal colour, or labor minutes, and the schema is `.strict()`, so any such field is a validation
  error rather than a stored value — an internal *number* is unrepresentable on a document. (Free
  text — the scope narrative, terms — is the one place words could still say too much; keeping that
  prose clean is 10b's job when the AI writes it, and its prompt is told never to mention costs or
  margins.) The payload must also **add up** — subtotal equals the sum of the line prices and total
  equals subtotal plus tax — so a client money document is arithmetically sound by construction.
  Because it's a stored snapshot, a later edit to the estimate never silently changes what a client
  was already sent.
- **A public share link, revocable, behind a token.** A document is minted with a high-entropy,
  URL-safe **share token** at creation; sharing sets `shared_at` and the client opens
  `/share/<token>` — **no login** — seeing only the stored payload. The token is **stable across
  re-shares**, but **revoking is permanent for that token**: a revoked document that is shared
  again is issued a **fresh** token, so a link the client was told is dead never comes back to
  life. The read runs through a `SECURITY DEFINER` function (`public.get_shared_document(token)`)
  that returns the payload **only** when the token matches a document that is shared and not
  revoked — the single deliberate public capability (constitution §7: sharing is a deliberate,
  user-initiated action), with the table's RLS unchanged for every authenticated path.
- **A phone- and print-friendly client render.** `/share/<token>` is a clean server-rendered page
  a contractor can print-to-PDF from the browser or send as a link — no PDF library, no heavy
  render path. It shows the business, the client, the scope, the priced line items, and the total,
  and nothing else. It is served **`noindex, nofollow`** so a leaked link never lands in a search
  engine.
- **The `DocumentBackend` seam** on `TenantDb` (memory impl for isolation tests; Drizzle impl
  inside `withAuthenticatedTx`) — `createDocument`, `listDocuments`, `getDocument`, `shareDocument`,
  `revokeDocument`, all `business_id`-scoped. Documents are created from a **validated client-safe
  payload**; building that payload from an estimate is 10b's job. The owner-facing **share/revoke
  server actions and any document UI arrive with 10b**, where there is a flow that creates a
  document to act on — 10a ships the seam these call, plus its tests.
- **No tool, no AI, no estimate transform, no owner UI.** 10a ships the table, the sharing
  security, the render, the payload schema, and the seam — proven from a hand-built payload. 10b
  adds the Client Estimate Doc **tool** that projects an estimate into the payload, (optionally)
  writes a scope narrative with the model, and the owner surface to generate / share / revoke.

## Capabilities

### New Capabilities
- `client-document`: a stored, client-safe **document** and its revocable public share link — the
  `documents` table + RLS, the client-safe payload schema (no costs/EPH/hours by construction), the
  token-gated public read (`SECURITY DEFINER`), and the print-friendly `/share/<token>` render.

## Impact

- **New code:** `src/document/` (the pure client-safe payload schema + validation + display
  helpers); `documents` in `src/db/schema.ts`; migration `0009_*` with the hand-appended RLS block
  **and** the `get_shared_document` `SECURITY DEFINER` function (+ `GRANT EXECUTE` to `anon` so the
  public page can call it via the Supabase anon client); a `DocumentBackend` port + memory impl in
  `src/db/tenant.ts`, its Drizzle impl in `drizzle-backend.ts`, wired in `session.ts`; the public
  `app/share/[token]/page.tsx` render (outside the auth-gated `(app)` group, served `noindex`);
  unit tests (payload validation rejects any non-safe field and any payload that doesn't add up;
  in-memory tenant isolation: cross-tenant read/share/revoke blocked, `business_id` and token
  stamped from the handle; the share→revoke→re-share token lifecycle; the shareable-access
  predicate resolves only when shared and not revoked). The owner share/revoke **actions** and UI
  land in 10b.
- **No new dependency** — the browser prints the PDF; `@supabase/supabase-js` (already installed)
  makes the anon token call.
- **Migration `0009`** — new `documents` table, RLS in the same migration, plus the token function
  and its grant.
- **Depends on:** `tenancy-foundation` (the `TenantDb` seam + RLS pattern, the `SECURITY DEFINER`
  precedent from `create_business`), `estimates` (the `estimate_id` a document references),
  `project-context` (the project a document belongs to).
- **Feeds:** **10b Client Estimate Doc** (the tool that builds the payload from an estimate and
  adds an AI scope narrative), and #12's tool graph (a document is a routable tool output).

## Non-goals

- **No tool, no AI, no estimate → payload transform.** The Client Estimate Doc tool, the
  deterministic projection of an estimate's client prices, and the optional AI scope prose are all
  10b. 10a is provable from a hand-built payload.
- **No server-side PDF generation.** The client render is an HTML page; the browser's print-to-PDF
  is the PDF path. A generated-PDF artifact (react-pdf/puppeteer) is out of scope, maybe never.
- **No editing a shared snapshot in place.** A change to the numbers means generating a **new**
  document (10b); a shared document is frozen so "what the client was sent" is always knowable.
- **No email/SMS delivery.** The contractor copies the link and sends it themselves; deliberate,
  user-initiated sharing (§7). Built-in delivery is a later change.
- **No client interaction** — no accept/sign/pay on the shared page. It is read-only in v1.
- **Nothing internal on the client page**, ever: no cost, overhead, contingency, margin, EPH, the
  signal colour, or labor minutes.
