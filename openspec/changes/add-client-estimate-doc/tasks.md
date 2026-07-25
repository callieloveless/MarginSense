## 1. Stage A — the pure estimate → client-document projection

- [ ] 1.1 Add `src/estimate/client-projection.ts`: `projectClientDocument(input)` where `input`
      carries the business identity, client, title, `preparedOn`, `lines: [{ description,
      costCents }]`, `totalPriceCents`, optional `taxRateBp`, optional `intro`, optional `terms`.
- [ ] 1.2 Allocate each line's client price as `round(total × lineCost / Σ lineCost)`, assigning
      the rounding remainder to the largest line so `Σ line prices === subtotal` exactly; set
      `subtotal = total`, `tax = round(subtotal × taxRateBp / 10000)` when a rate is given, and
      `total = subtotal + tax`. Refuse an estimate with zero total cost (nothing to allocate).
- [ ] 1.3 Build the client-safe payload and validate it through `src/document/parseClientDocument`
      before returning (so a projection bug is caught, not stored); return a typed ok/error.
- [ ] 1.4 Export from `src/estimate/index.ts`. Keep it engine-only (no framework/DB imports).
- [ ] 1.5 Unit-test `client-projection.test.ts`: allocation sums exactly to the subtotal for an
      uneven 3-line split; a single line gets the whole total; equal-cost lines split evenly with
      the remainder handled; tax computes and the total adds up; a client line carries no
      cost/minutes/quantity; a zero-total-cost estimate is refused.

## 2. Stage B — the Client Estimate Doc tool

- [ ] 2.1 Add `src/tools/client-estimate-doc/schema.ts`: `inputSchema` (business identity, client,
      title, `preparedOn`, `lines`, `totalPriceCents`, optional `taxRateBp`, optional `terms`,
      `writeNarrative` flag) and `outputSchema` = the `ClientDocument` shape.
- [ ] 2.2 Add `src/tools/client-estimate-doc/client-estimate-doc.ts`: run the projection for the
      numbers; when `writeNarrative`, call the model for a short scope `intro` with a system prompt
      that **forbids stating any cost, margin, profit, or hour figure**; assemble the final
      `ClientDocument`, return it as `output` with **no suggestions** and a brief conversation
      `message`. When the projection refuses (unpriceable), surface a clear tool error.
- [ ] 2.3 Register in `src/tools/registry.ts` and export from `src/tools/index.ts`.
- [ ] 2.4 Unit-test against the mock port: the tool returns a valid `ClientDocument` output that
      passes `parseClientDocument`; **no suggestion** is emitted; the narrative is present when
      `writeNarrative` and absent otherwise; a canned narrative that mentions a price still yields a
      structurally valid doc (documenting that prose is the reviewed gap, not a structural one); an
      unpriceable input errors.

## 3. Stage C — the generate + share/revoke actions

- [ ] 3.1 Add the generate action under `app/(app)/projects/[id]/`: resolve the session, read the
      active estimate + lines + settings + business + project tenant-scoped, compute the total via
      `computeFromRows`, assemble the tool input (gate `writeNarrative` on `resolveModelPort()`),
      dispatch through `dispatchAndCompose`, take `output`, and `createDocument` **unshared** via
      10a's seam. Never trust a client `business_id`.
- [ ] 3.2 Add the share / revoke / update-draft actions calling 10a's `shareDocument` /
      `revokeDocument` (and a narrow update for the unshared draft's `intro`/`terms`), all
      session-resolved and tenant-scoped; share returns the `/share/<token>` URL.
- [ ] 3.3 Test the generate + share flow against the memory backends: generate creates an unshared
      document from an estimate whose numbers add up; share yields a token and the public read
      resolves; revoke stops it; a cross-tenant generate/share is refused.

## 4. Stage D — the owner Documents surface

- [ ] 4.1 Add a **Documents** section/page under the project: list the project's documents (status:
      draft / shared / revoked), a **Generate client document** control from the active estimate,
      and per-document share / copy-link / revoke.
- [ ] 4.2 Add the draft **preview** with the priced lines, total, and the scope narrative, and let
      the owner **edit or remove** the narrative (and terms) before sharing — the free-text review
      step. A "connect AI" note when the narrative couldn't be generated; a plain "add/price an
      estimate first" state when there's nothing to generate from.
- [ ] 4.3 Link the Documents surface from the project page; phone-first; colour paired with text.

## 5. Verification and close-out

- [ ] 5.1 `npm run typecheck`, `npx vitest run`, and `npm run build` green after each stage
      (relative imports in `src/` stay extensionless).
- [ ] 5.2 Add the live-AI proof item to `relevant_notes.md` §5: with a key set, generate a document
      whose scope narrative reads well and states **no** cost/margin/hour figure, and confirm the
      generation records a `tool_run`.
- [ ] 5.3 Update `PROGRESS.md`: 10b done; the **v1 tool set and the core product loop complete**;
      #11 hardening next.
- [ ] 5.4 `openspec validate add-client-estimate-doc --strict`, then archive on its own commit.
