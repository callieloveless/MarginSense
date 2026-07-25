/**
 * Estimate → client-document projection (add-client-estimate-doc). Turns a *finished* estimate —
 * the engine's single solved total price and the lines' costs — into the client-safe document
 * payload `src/document/` stores. Pure and engine-only: no framework, no DB, no `Date.now()` (the
 * prepared date arrives already formatted, so a document never recomputes it).
 *
 * The whole job of this module is one money-critical operation: **distribute the single solved
 * total across the lines**, proportional to each line's cost, exact to the cent — the estimate is
 * priced to one target margin, so spreading that one margin by cost is the faithful client view.
 * Nothing internal crosses over: a client line is a **description and a price**, never a cost,
 * labor minutes, or quantity. The result is validated through the client-document schema before it
 * is returned, so a projection bug is caught here, not shown to a client.
 *
 * It **refuses** rather than produce a misleading document (v1 scope): a per-line price override
 * (which proportional allocation would contradict), an estimate with no cost to allocate, or one
 * left empty after zero-cost lines are dropped. A *total*-price override is fine — it is simply the
 * total that gets allocated.
 */

import { roundHalfUp, applyBp, type BasisPoints, type Cents } from "../engine";
import { clientDocumentSchema, type ClientDocument } from "../document";

/** One estimate line as the projection sees it: what it is, what it costs, and whether the
 * contractor set an explicit per-line price (which we refuse to override). */
export interface ProjectionLine {
  readonly description: string;
  /** The line's internal cost in cents (labor at the burdened rate, or quantity × unit cost). */
  readonly costCents: Cents;
  /** True when the line carries an explicit per-line price override. */
  readonly hasPriceOverride: boolean;
}

/** Everything the projection needs, assembled by the caller from the estimate + settings + the
 * business + the project. `preparedOn` is a display date the caller has already formatted. */
export interface ClientProjectionInput {
  readonly businessName: string;
  readonly tradeType?: string | undefined;
  readonly serviceArea?: string | undefined;
  readonly license?: string | undefined;
  readonly clientName: string;
  readonly clientAddress?: string | undefined;
  readonly title: string;
  readonly preparedOn: string;
  readonly intro?: string | undefined;
  readonly terms?: string | undefined;
  readonly lines: readonly ProjectionLine[];
  /** The estimate's solved (or total-overridden) client price, pre-tax. */
  readonly totalPriceCents: Cents;
  /** The business's sales/use tax rate; when set, a tax line is added on top of the subtotal. */
  readonly taxRateBp?: BasisPoints | undefined;
}

export type ClientProjectionResult =
  | { ok: true; value: ClientDocument }
  | { ok: false; error: string };

/** Only optional string fields present (avoids setting keys to `undefined` under
 * exactOptionalPropertyTypes). */
function withOptional<T extends Record<string, unknown>>(
  base: T,
  extras: Record<string, string | undefined>,
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(extras)) if (v !== undefined && v !== "") out[k] = v;
  return out as T;
}

/**
 * Project a finished estimate into a client-safe document, or refuse with a reason. Allocation:
 * drop zero-cost lines, split the total proportional to remaining cost, and put the rounding
 * remainder on the largest line so the prices sum **exactly** to the subtotal (the document
 * schema's arithmetic check would otherwise reject it).
 */
export function projectClientDocument(input: ClientProjectionInput): ClientProjectionResult {
  // A per-line override would be contradicted by proportional allocation — refuse, don't override.
  if (input.lines.some((l) => l.hasPriceOverride)) {
    return { ok: false, error: "This estimate has per-line prices set — resolve line pricing before generating a client document." };
  }
  if (input.totalPriceCents <= 0) {
    return { ok: false, error: "This estimate isn't priced yet, so there's nothing to put on a client document." };
  }

  // Drop zero-cost lines: they'd get a $0 share that reads as a mistake. They stay on the estimate.
  const costed = input.lines.filter((l) => l.costCents > 0);
  const totalCost = costed.reduce((acc, l) => acc + l.costCents, 0);
  if (costed.length === 0 || totalCost <= 0) {
    return { ok: false, error: "This estimate has no priced work to show a client." };
  }

  // Allocate proportional to cost, then push the rounding remainder onto the largest line so the
  // line prices sum exactly to the total.
  const prices = costed.map((l) => roundHalfUp((input.totalPriceCents * l.costCents) / totalCost));
  const allocated = prices.reduce((a, b) => a + b, 0);
  const remainder = input.totalPriceCents - allocated;
  if (remainder !== 0) {
    let largest = 0;
    for (let i = 1; i < costed.length; i++) if (costed[i]!.costCents > costed[largest]!.costCents) largest = i;
    prices[largest]! += remainder;
  }

  const lines = costed.map((l, i) => ({ description: l.description, priceCents: prices[i]! }));
  const subtotalCents = input.totalPriceCents;
  const taxCents = input.taxRateBp ? applyBp(subtotalCents, input.taxRateBp) : undefined;
  const totalCents = subtotalCents + (taxCents ?? 0);

  const payload = withOptional(
    {
      businessName: input.businessName,
      clientName: input.clientName,
      title: input.title,
      preparedOn: input.preparedOn,
      lines,
      subtotalCents,
      totalCents,
      ...(taxCents !== undefined ? { taxCents } : {}),
    },
    {
      tradeType: input.tradeType,
      serviceArea: input.serviceArea,
      license: input.license,
      clientAddress: input.clientAddress,
      intro: input.intro,
      terms: input.terms,
    },
  );

  // Validate the finished payload — catches a projection bug (a leaked field, numbers that don't
  // add up) here rather than at the store boundary or, worse, on the client's page.
  const parsed = clientDocumentSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "The client document couldn't be built." };
  }
  return { ok: true, value: parsed.data };
}
