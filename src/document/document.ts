/**
 * The client-facing document payload (add-client-document) — the one thing in MarginSense a
 * *client* ever sees, so it is the exact inverse of everything else: a clean price sheet with
 * **none of the internal machinery on it**.
 *
 * Two structural guarantees live in this schema, so the render never has to remember them:
 *
 * 1. **No internal number can be stored.** The shape is closed (`.strict()`), so a stray
 *    `costCents`, `eph`, `laborMinutes`, `margin`, or `signal` key is a validation *error*, not a
 *    silently-dropped field. The sensitive figures aren't hidden — there is nowhere on a document
 *    to put them. (The limit: free text — `intro`, `terms`, a line `description` — is a string, so
 *    its *content* is not constrained here. Keeping that prose clean when the AI writes it is 10b's
 *    job; this module guards the typed shape, not English.)
 * 2. **The numbers add up.** A refinement enforces `subtotal = Σ line prices` and
 *    `total = subtotal + tax`, so a client money document is arithmetically consistent — a
 *    malformed one is rejected rather than shown.
 *
 * Framework/DB-free: the render (`app/share/`), the tenant seam, and 10b's generator all validate
 * against this one definition. Money is integer cents (constitution §3.1); formatting is at the
 * display edge.
 */

import { z } from "zod";

/** One line the client sees: what it is, and what it costs *them*. No cost, no category-internal
 * data, no hours — the client price only. */
export const documentLineSchema = z
  .object({
    description: z.string().min(1).max(500),
    priceCents: z.number().int().nonnegative(),
  })
  .strict();
export type DocumentLine = z.infer<typeof documentLineSchema>;

/**
 * The whole client-safe document. `.strict()` at every level so no internal field can ride along;
 * `.superRefine` enforces the arithmetic. Optional fields are omitted, never null, to keep the
 * stored JSON tight (matches the app's `exactOptionalPropertyTypes` style).
 */
export const clientDocumentSchema = z
  .object({
    // Who it's from.
    businessName: z.string().min(1).max(200),
    tradeType: z.string().min(1).max(120).optional(),
    serviceArea: z.string().min(1).max(200).optional(),
    license: z.string().min(1).max(120).optional(),
    // Who it's for.
    clientName: z.string().min(1).max(200),
    clientAddress: z.string().min(1).max(500).optional(),
    // What it is.
    title: z.string().min(1).max(200),
    preparedOn: z.string().min(1).max(40), // display date string, formatted upstream
    intro: z.string().max(4000).optional(), // the scope narrative (10b/AI); plain prose
    lines: z.array(documentLineSchema).min(1),
    subtotalCents: z.number().int().nonnegative(),
    taxCents: z.number().int().nonnegative().optional(),
    totalCents: z.number().int().nonnegative(),
    terms: z.string().max(4000).optional(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const lineSum = doc.lines.reduce((acc, l) => acc + l.priceCents, 0);
    if (lineSum !== doc.subtotalCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Subtotal must equal the sum of the line prices.",
        path: ["subtotalCents"],
      });
    }
    if (doc.subtotalCents + (doc.taxCents ?? 0) !== doc.totalCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Total must equal subtotal plus tax.",
        path: ["totalCents"],
      });
    }
  });
export type ClientDocument = z.infer<typeof clientDocumentSchema>;

export type ParseClientDocumentResult =
  | { ok: true; value: ClientDocument }
  | { ok: false; error: string };

/**
 * Validate a client-document payload at the boundary — before it is stored, and before it is
 * rendered. A failure carries the first issue's message (a leaked internal field, or numbers that
 * don't add up), so a bad document is refused rather than shown to a client.
 */
export function parseClientDocument(payload: unknown): ParseClientDocumentResult {
  const result = clientDocumentSchema.safeParse(payload);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error.issues[0]?.message ?? "Invalid client document." };
}
