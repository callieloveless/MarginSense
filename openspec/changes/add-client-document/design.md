## Context

MarginSense has been entirely behind the login wall: every row is `business_id`-scoped and RLS
refuses anything cross-tenant. The Client Estimate Doc (constitution §5) breaks that on purpose —
the whole point of the tool is a proposal a **client**, who has no account, can open. That single
requirement (public read of one document, nothing else) is the hard part of #10, so it lands on its
own here, before the tool that fills the document exists.

Two precedents shape it: the `SECURITY DEFINER` `create_business` function (migration `0000`) is
the app's established pattern for a deliberate, tightly-scoped privileged path; and 8a's photo
storage showed the split shape — the security-sensitive foundation ships and is proven before the
tool on top of it.

## Goals / Non-Goals

**Goals:**
- Make it *structurally impossible* for an internal number to appear on a client document.
- Give a client a working, revocable link with no login, exposing exactly one document's payload.
- Keep every authenticated path tenant-isolated exactly as before.
- Ship provable from a hand-built payload — no tool, no AI, no estimate transform.

**Non-Goals:**
- The tool, the estimate → payload projection, AI scope prose (10b); server-side PDF; delivery;
  client interaction (see the proposal).

## Decisions

### 1. Safety by absence: the payload has no field for an internal number
`src/document/` defines the client-safe payload as a Zod schema with a **closed** shape — business
identity, client, title/date, optional intro, `lines: [{ description, priceCents }]`, `subtotalCents`,
optional `taxCents`, `totalCents`, optional `terms`. It uses `.strict()` so an unknown key (a
stray `costCents`, `eph`, `laborMinutes`) is a validation **error**, not silently dropped. The
document row stores this and only this. So "don't leak costs" isn't a rule the render has to
remember — the cost was never written, and there is nowhere on the document to put it. This is the
same move 8b made refusing a cost field on materials, applied to the one artifact a client sees.

*Alternative considered:* store a reference to the estimate and project the client view at read
time. Rejected twice over — it would recompute from live data (so a later edit changes what the
client sees, and a revoked link could still leak a newer number), and it would put the internal
roll-up one projection-bug away from the public page. A frozen, already-safe snapshot removes both
risks.

### 2. The public read is one `SECURITY DEFINER` function, keyed on the token
`public.get_shared_document(p_token text)` returns the payload `jsonb` for the row whose
`share_token = p_token` **and** `shared_at is not null` **and** `revoked_at is null`; otherwise it
returns null. `SECURITY DEFINER`, `SET search_path = public`, `GRANT EXECUTE TO anon, authenticated`.
The public page calls it with the **Supabase anon client** (`createClient(url, anonKey).rpc(...)`) —
no cookies, no session — so it never touches the tenant-scoped Drizzle path. The function returns
**only the payload**, never the row id, business, project, or token, so there is nothing to
enumerate and nothing cross-tenant to reach. RLS on `documents` is unchanged; this function is the
lone, auditable public capability, mirroring `create_business` as the lone privileged write.

*Why a function and not a public RLS policy:* a policy that let `anon` select `documents` by token
would expose the whole row shape and invite enumeration; a function returns a single computed value
for a single secret token and nothing else.

### 3. The token is a capability: high-entropy, opaque, revocable
The share token is a URL-safe random string (≥128 bits) generated server-side — not the row id, not
guessable, not sequential. Sharing sets `shared_at` and (re)issues the token; revoking sets
`revoked_at`. The token is the entire access credential, so it must be unguessable and the link is
only as private as wherever the contractor sends it — acceptable for a proposal, and the reason
revoke exists. `shared_at`/`revoked_at` as timestamps (not a status enum) keep the check simple and
dodge the in-transaction `ALTER TYPE` enum hazard the project already avoids.

### 4. The public page lives outside the auth group
`app/share/[token]/page.tsx` is a top-level route, not under `(app)`, so the layout's session gate
and the middleware's protected-prefix redirect never touch it (the matcher guards
`/dashboard|/projects|/settings|/onboarding`, not `/share`). It is a server component: read the
token → anon `rpc` → render the payload, or a plain "this document isn't available" when the read
returns null. No client JS required, so a client on any device/browser sees it, and print-to-PDF
works.

### 5. The `DocumentBackend` seam, like every other capability
`createDocument` (payload validated by `src/document/` first; `business_id` and a fresh token
stamped by the handle), `listDocuments(projectId)`, `getDocument(id)`, `shareDocument(id)`,
`revokeDocument(id)` — memory impl powers the isolation tests, Drizzle impl runs in
`withAuthenticatedTx`. Feature code never sees an unscoped handle; the public read is the *only*
non-seam path and it goes through the token function, not the backend.

## Risks / Trade-offs

- **A leaked link is readable by anyone who has it** → inherent to a no-login share; mitigated by a
  high-entropy token (unenumerable) and revoke, and bounded by the payload being only what the
  client was always going to see. No internal data is ever behind the link.
- **The `SECURITY DEFINER` function is a privileged path** → it is tiny, does one keyed lookup,
  returns one computed value, and is granted execute (not table access); reviewed like
  `create_business`. A test proves it returns nothing for wrong/unshared/revoked tokens.
- **The `anon` role can call the function** → that is the point (the client is anonymous); the
  function's `WHERE` is the whole authorization, and it exposes no row the caller didn't already
  hold the secret for.
- **A snapshot can go stale vs the current estimate** → intended: a document is a record of what
  was sent. 10b makes generating a fresh one one tap; staleness is a feature, not a bug.
- **Public-read live proof needs the bucket/DB** → the token function is proven in code against the
  memory backend's mirror of the same rule; the live `SECURITY DEFINER` + anon `rpc` join the
  deferred infra list, like every prior DB policy.

## Open Questions

- Should a revoked link say "ask the contractor for an updated copy" vs a bare "not available"?
  Copy detail for 10b; 10a renders a plain unavailable state.
- Should documents expire automatically after N days? Not in v1; revoke is manual. Revisit at the
  hardening pass (#11) if stale links become a support issue.
- Does the owner need a documents list surface in 10a, or does that arrive with the 10b tool? The
  seam supports listing; the owner-facing list UI is 10b, where there is a tool to create from.
