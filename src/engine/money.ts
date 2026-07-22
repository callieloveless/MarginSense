/**
 * Money & time primitives for the profit engine.
 *
 * The sacred rule (constitution §3.1): money is integer **cents**, labor time is integer
 * **minutes**, percentages are integer **basis points** (1% = 100 bp). No floating-point
 * dollars — rounding happens only at a computed boundary, via the single {@link roundHalfUp}
 * helper here. Everything downstream (rates, roll-up, signal) builds on these types.
 */

/** Integer number of cents. The canonical money representation. */
export type Cents = number;
/** Integer number of minutes. The canonical labor-time representation. */
export type Minutes = number;
/** Integer basis points, where 1% = 100 bp (so 15% is 1500 bp). */
export type BasisPoints = number;
/**
 * A dimensionless decimal (e.g. a signal ratio or a portfolio percentage-as-fraction).
 * This is the single documented "decimal" convention allowed by §3.1 for values that are
 * not money — money never uses it.
 */
export type Ratio = number;
/** Cents per hour. A derived rate; may carry a sub-cent fraction as an intermediate. */
export type CentsPerHour = number;

/**
 * The result of a computation that may not be defined for the given inputs — a division
 * whose denominator is zero (EPH with no hours, a margin with no revenue, a rate with no
 * billable capacity). These are normal states the UI must render calmly, so the engine
 * models "not applicable" explicitly instead of throwing or returning `NaN`.
 */
export type Computed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

/** Wrap a defined result. */
export function defined<T>(value: T): Computed<T> {
  return { ok: true, value };
}

/** A not-applicable result carrying a human-readable reason. */
export function notApplicable<T = never>(reason: string): Computed<T> {
  return { ok: false, reason };
}

/** Type guard: narrows a {@link Computed} to its defined branch. */
export function isApplicable<T>(
  c: Computed<T>,
): c is { readonly ok: true; readonly value: T } {
  return c.ok;
}

/** Read a defined value or a fallback if the result is not applicable. */
export function valueOr<T>(c: Computed<T>, fallback: T): T {
  return c.ok ? c.value : fallback;
}

/**
 * Safe division: returns a not-applicable result when the denominator is zero, so callers
 * (EPH, margins, rates, shares) never divide by zero or produce `NaN`/`Infinity`.
 */
export function safeDivide(
  numerator: number,
  denominator: number,
  reason = "denominator is zero",
): Computed<number> {
  if (denominator === 0) return notApplicable(reason);
  return defined(numerator / denominator);
}

/**
 * Round half-up to the nearest integer (ties break toward +∞), the single rounding rule for
 * money. Used only at a computed boundary — core arithmetic stays in exact integers.
 */
export function roundHalfUp(value: number): number {
  return Math.round(value);
}

/** Sum a list of integer-cent values. Integer addition stays exact. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const c of values) total += c;
  return total;
}

/** Add integer-cent values. */
export function addCents(...values: Cents[]): Cents {
  return sumCents(values);
}

/** Subtract integer-cent values (`a − b`). */
export function subtractCents(a: Cents, b: Cents): Cents {
  return a - b;
}

/**
 * Multiply integer cents by a scalar factor and round the result to whole cents (half-up).
 * The factor may be fractional (e.g. hours = minutes/60); the product is rounded once here.
 */
export function multiplyCents(cents: Cents, factor: number): Cents {
  return roundHalfUp(cents * factor);
}

/** Convert basis points to their decimal ratio (1500 bp → 0.15). */
export function bpToRatio(bp: BasisPoints): Ratio {
  return bp / 10_000;
}

/** Convert a decimal ratio to basis points, rounded to the nearest bp (0.15 → 1500). */
export function ratioToBp(ratio: Ratio): BasisPoints {
  return roundHalfUp(ratio * 10_000);
}

/**
 * Apply a basis-point rate to a cents amount, rounded to whole cents (half-up). Uses an
 * integer product before the single divide to keep precision (e.g. 5% of 1,557,000¢ =
 * 77,850¢ exactly).
 */
export function applyBp(cents: Cents, bp: BasisPoints): Cents {
  return roundHalfUp((cents * bp) / 10_000);
}

/** Insert thousands separators into a non-negative integer string ("1234" → "1,234"). */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format integer cents as a display dollar string ("$1,234.56"). Rounding for display only;
 * the underlying cents value is unchanged. Negative amounts render as "-$1,234.56".
 */
export function formatCents(cents: Cents): string {
  const rounded = roundHalfUp(cents);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const dollars = Math.trunc(abs / 100);
  const remainder = abs % 100;
  const body = `$${groupThousands(String(dollars))}.${String(remainder).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}
