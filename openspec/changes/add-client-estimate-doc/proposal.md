# Add the Client Estimate Doc tool — estimate → proposal (stage 10b)

## Why

10a built where a client proposal lives and how it's shared safely. This is the tool that
**fills it**: it turns a finished internal estimate — true costs, overhead, EPH, colours — into
the clean, client-facing proposal, with none of that on it. It is the last of the v1 tools
(constitution §5), and the one that finally makes MarginSense produce the artifact a contractor
actually hands a client. It closes the loop the whole product is built around: build the estimate,
see if it pulls its weight, then send the client a proposal that shows only the price.

## What Changes

- **A pure estimate → client-document projection** (`src/estimate/`): given a computed estimate
  (the engine's solved total price) and its lines, it produces the client-safe payload 10a stores —
  **allocating the single solved total across the lines proportional to each line's cost**, exact
  to the cent so the document adds up (subtotal = Σ line prices; total = subtotal + tax). Line
  descriptions carry over; **costs, labor minutes, and quantities never do** — a client line is a
  description and a price. Optional tax comes from the business's `default_tax_rate_bp`. No math is
  re-implemented; the total and costs come from `src/engine/` and this only distributes and shapes.
- **The Client Estimate Doc tool** (`src/tools/client-estimate-doc/`) on the platform contract. It
  receives the estimate material as **input** (the action reads it tenant-scoped; the tool holds no
  DB handle), runs the pure projection for the numbers, and returns the finished `ClientDocument`
  as its typed **`output`** — a document, not a suggestion (a proposal isn't accept/dismiss). When
  AI is configured it optionally writes the **scope narrative** (`intro`) via the model; when it
  isn't, the document generates deterministically with no narrative. Registered in the registry, so
  it appears on the Tools surface and is a node in the future graph (§5, #12).
- **Generate produces an unshared draft the owner reviews before sending.** The action dispatches
  the tool, takes its `output`, and creates the document via 10a's seam **unshared**. The owner
  previews it — the priced lines, the total, and the AI scope narrative — and can **remove or edit
  the narrative** before sharing. That review step is the real guard for the one leak 10a can't
  close structurally: free-text prose. The AI prompt is told never to mention cost, margin, profit,
  or hours, and the owner sees the draft before any client does, so a slip is caught before it is
  sent. Sharing is a separate, deliberate action (§7).
- **The owner surface** (deferred from 10a): a project's **Documents** list, a **Generate client
  document** action from the active estimate, the draft preview with the editable narrative, and
  **share / copy-link / revoke** (calling 10a's `shareDocument` / `revokeDocument`). Sharing yields
  the `/share/<token>` link to copy; revoking kills it.
- **Nothing internal reaches the document, ever** — enforced twice: the projection only ever
  writes client-safe fields, and 10a's `.strict()` payload rejects any internal field at the store
  boundary. The AI narrative is the sole free-text path, mitigated by the owner review.
- **Live AI stays deferred.** The projection and the document generate deterministically and are
  unit-tested with no key; the AI scope narrative is proven against the mock and its real call
  joins `relevant_notes.md` §5.

## Capabilities

### New Capabilities
- `client-estimate-doc`: the Client Estimate Doc tool — the deterministic estimate → client-safe
  document projection (client prices allocated from the solved total, no costs/hours), the optional
  AI scope narrative, generation into an unshared draft, and the owner surface to preview, edit the
  narrative, share, copy, and revoke.

## Impact

- **New code:** `src/estimate/client-projection.ts` (the pure allocation + payload projection);
  `src/tools/client-estimate-doc/` (the tool, its input/output schemas, the optional narrative
  call); the generate + share/revoke server actions and a **Documents** surface under
  `app/(app)/projects/[id]/`; a small addition to the project page linking it; unit tests
  (allocation is exact and sums to the total across rounding; a client line carries no cost/hours;
  the projection refuses an unpriceable estimate; the tool returns a valid `ClientDocument` output
  and no suggestion; the narrative is present with AI and absent without; generate creates an
  **unshared** draft).
- **No new dependency, no migration** — 10a's table, seam, and payload schema already exist; the
  projection uses the existing engine.
- **Depends on:** `client-document` (10a — the table, payload, share seam, public render),
  `estimates` (the estimate + lines + the solved price), `onboarding` (business identity + tax
  rate), `tool-platform` (the contract + dispatch), `project-context` (the project's client).
- **Feeds:** #11 hardening (the money-critical e2e ends at "generate client doc"), #12 the graph
  (the document is a routable tool output).

## Non-goals

- **No change to 10a's sharing security or the public render.** This change only *produces*
  documents; how they're stored and shown is unchanged.
- **No per-line margin control or per-category markup.** v1 allocates the single solved margin
  across lines proportional to cost; differentiated markup (materials vs labor) is a later change.
- **No rich document editor.** The owner can edit/remove the scope narrative and terms on an
  unshared draft; full layout/line editing on the document is out of scope (edit the estimate and
  regenerate).
- **No client interaction, email delivery, or PDF generation** — all still deferred (10a
  non-goals): the owner copies the link, the client views/prints it.
- **No editing a shared document** — a shared snapshot is frozen (10a); a change means a new draft.
- **No new financial math** — the total, costs, and margin come from `src/engine/`; the projection
  only distributes and formats.
