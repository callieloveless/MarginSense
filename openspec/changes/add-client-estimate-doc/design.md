## Context

10a shipped the document: the `documents` table, the client-safe payload schema (`src/document/`,
`.strict()` + arithmetic refinement), the revocable token share, and the public `/share/<token>`
render. It deliberately included no way to *make* a document from an estimate. This change is that
maker — the last v1 tool (§5).

The one fact that shapes everything: the engine solves a **single total price** for an estimate
(margin-solve to `target_margin_bp`, or a total override), not a price per line. And the tool
contract hands a tool a read-only snapshot whose `activeEstimate` is the **roll-up**, not the
lines. So the tool cannot itemize a client document from the snapshot alone — it needs the lines
(descriptions + costs), which the app layer reads and passes in as input. That mirrors Photo
Advisor (bytes via input) and keeps the tool DB-free.

## Goals / Non-Goals

**Goals:**
- Turn a finished estimate into a client-safe, itemized proposal whose numbers **add up exactly**.
- Keep every internal figure off it — by projection *and* by 10a's store-boundary schema.
- Make the AI narrative useful but safe: optional, prompt-constrained, and owner-reviewed before
  any client sees it.
- Close the product loop (estimate → signal → client proposal) as the last v1 tool.

**Non-Goals:**
- Per-category markup, a rich document editor, delivery/PDF, client interaction (see the proposal).
  No new financial math.

## Decisions

### 1. A pure projection allocates the solved total across lines, exact to the cent
`src/estimate/client-projection.ts` (pure, engine-only) takes the computed total price and the
lines' costs and returns the client-safe payload. Each line's client price is
`round(total × lineCost / Σ lineCost)`; the **rounding remainder is assigned to the largest line**
so `Σ line prices === subtotal` exactly — the money-exactness the client document's `.superRefine`
(10a) will otherwise reject. `subtotal = total`, `tax = round(subtotal × taxRateBp / 10000)` when a
rate is set, `total = subtotal + tax`. This is the one genuinely money-critical piece and gets the
engine's exactness treatment: unit tests over uneven splits, a single line, all-equal lines, and a
zero-total (refused). It re-implements no engine math — the total and per-line costs come from
`src/engine/`/`src/estimate/`; this only distributes and formats.

*Why proportional-to-cost:* the estimate is priced to a single target margin across the whole job,
so spreading that one margin across the lines by cost is the faithful client view. Differentiated
markup (materials vs labor) would be a different pricing model, and it's a non-goal.

*Edge — a zero-cost line* (unusual: a $0 line): it gets a $0 client price, and the remainder logic
still lands the total on the priced lines. An estimate with **zero total cost** can't be allocated
proportionally, so the projection refuses it (there's nothing to price).

### 2. The tool takes estimate material as input and returns a document as output
`run(ctx)` input is the assembled material — business identity, client, title, `preparedOn`, the
lines (`description`, `costCents`), the solved `totalPriceCents`, optional `taxRateBp`, optional
`terms`, and a `writeNarrative` flag. The tool calls the projection for the numbers, optionally
calls the model for the `intro`, and returns the finished `ClientDocument` as its typed **`output`**
— **no suggestions** (a proposal isn't accept/dismiss) and a short conversation `message` noting a
document was generated. This uses the contract's `output` channel (typed, routable for #12)
exactly as intended, and keeps the tool free of any DB/storage handle. The **action** reads the
estimate tenant-scoped, builds the input, dispatches, takes `output`, and persists via 10a's
`createDocument` — tools compute, the app persists.

*Why a tool and not a plain action:* the constitution lists Client Estimate Doc as a v1 Tool, and
routing it through the registry + dispatch gives it a `tool_run` (observability), a Tools-surface
presence, and a graph node (#12) for free — with the document as its routable output.

### 3. Generate → unshared draft → owner review → share: the guard for the free-text gap
10a made internal *numbers* unrepresentable, but the scope narrative is free text an AI writes, so
it could say too much. Two mitigations, layered: the narrative **prompt** forbids mentioning cost,
margin, profit, or hours; and — because a prompt is a request, not a guarantee — the generated
document is created **unshared**, the owner **previews** it (lines, total, and the narrative), and
can **edit or remove** the narrative before sharing. Sharing is a separate, deliberate action (§7).
So even a disobedient model is caught by a human before any client sees it. Editing the narrative
on an *unshared* draft is fine; once shared, the snapshot is frozen (10a) and a change means a new
draft.

### 4. Business identity and client come from data already in hand
Business name/trade/service-area/license from `businesses` + `business_settings`; the client name
(and address, when the project has one) from the `projects` row; the tax rate from
`default_tax_rate_bp`. All read app-side by the action; no capability's spec changes (these are
reads), and the snapshot doesn't need to grow.

## Risks / Trade-offs

- **A rounding bug would make a client money document not add up** → the allocation is pure and
  unit-tested for exact summation across uneven splits, and 10a's `.superRefine` is a second gate
  that refuses a non-adding-up payload at the store boundary. Belt and suspenders on the one thing
  that must be right.
- **The AI narrative could still state something internal** → prompt-constrained, and the
  unshared-draft-then-review flow means the owner sees it before any client; the narrative is also
  removable in one tap. It is the only free-text path, and it never auto-shares.
- **Proportional-to-cost surprises a contractor who marks materials up differently** → v1 is the
  single-margin model the estimate is already priced under; per-category markup is a named later
  change, not a silent default.
- **Live AI unproven until a key exists** → the projection and document are deterministic and fully
  tested offline; the narrative is proven against the mock, with the real call deferred like every
  prior tool's.

## Open Questions

- Should the owner be able to edit line *descriptions* on the draft (vs only the narrative/terms)?
  v1 keeps descriptions from the estimate; editing them is a small follow-up if contractors want
  client-friendlier wording without changing the estimate.
- Should generating auto-share for a contractor who just wants the link fast? No — the review step
  is the free-text guard; auto-share would remove it. Revisit only if it proves a friction point.
