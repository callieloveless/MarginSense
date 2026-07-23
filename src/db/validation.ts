/**
 * Zod boundary schemas (techstack §6). Validate all input at the edge; never let `any`
 * or unchecked shapes into the data layer. This foundation carries the tenant spine's
 * text/enum inputs; `add-onboarding` adds the §3.2 financial input model, converting
 * human dollars and percentages to integer cents/bp here at the boundary so no float
 * ever reaches the store (constitution §3.1, §6.8).
 */

import { z } from "zod";
import { LINE_CATEGORIES, PROJECT_STATUSES } from "./schema";
import type { LineItemInput, OverheadItemInput, SettingsInput } from "./tenant";

/** Input for creating a business (the minimal create-business step). */
export const createBusinessSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(200),
  tradeType: z.string().trim().min(1, "Trade type is required").max(80),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

/** Input for creating a project. `business_id` is never accepted from input — it is
 * stamped from the tenant-bound handle (see `tenant.ts`). */
export const projectInputSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required").max(200),
  address: z.string().trim().max(500).nullish(),
  scope: z.string().trim().max(2000).nullish(),
});
export type ProjectInputParsed = z.infer<typeof projectInputSchema>;

/** A project status, constrained to the schema's enum. */
export const projectStatusSchema = z.enum(PROJECT_STATUSES);

// --- Onboarding: the §3.2 financial input model ------------------------------------
//
// Forms submit human strings ("$60,000", "45%", "6"); these converters normalize them to
// the engine's integer units (cents/minutes/bp) at the boundary, half-up, rejecting
// non-numeric or out-of-range values with clear messages. The store only ever sees ints.

/**
 * Human dollars → integer cents, rounded half-up. Accepts `$`, commas, and whitespace.
 * Returns null for a non-numeric or negative amount (e.g. `dollarsToCents("$60,000")` →
 * `6000000`, `dollarsToCents("35")` → `3500`).
 */
export function dollarsToCents(input: string | number): number | null {
  if (typeof input === "string" && input.trim() === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Human percent → integer basis points, rounded half-up. Accepts a trailing `%` and
 * whitespace (e.g. `percentToBp("45")` → `4500`, `percentToBp("12.5%")` → `1250`).
 * Returns null for a non-numeric or negative value.
 */
export function percentToBp(input: string | number): number | null {
  if (typeof input === "string" && input.trim() === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).replace(/[%\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Percent → integer bp within `[min, max]`, else null. */
function percentToBpInRange(input: string | number, min: number, max: number): number | null {
  const bp = percentToBp(input);
  if (bp === null || bp < min || bp > max) return null;
  return bp;
}

/** Parse a whole number in `[min, max]`, else null. */
function intInRange(input: string | number, min: number, max: number): number | null {
  const n = typeof input === "number" ? input : Number(String(input).trim());
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** Parse fractional hours in `(0, 24]` to integer minutes (half-up), else null. */
function hoursToMinutes(input: string | number): number | null {
  const n = typeof input === "number" ? input : Number(String(input).trim());
  if (!Number.isFinite(n) || n <= 0 || n > 24) return null;
  return Math.round(n * 60);
}

/** The raw settings form as submitted (all strings, before conversion). The advanced
 * markup/tax fields are optional — the 3-step wizard omits them. */
export const settingsFormRawSchema = z.object({
  annualOverhead: z.string(),
  ownerWage: z.string(),
  laborBurden: z.string(),
  workingDaysPerYear: z.string(),
  billableHoursPerDay: z.string(),
  incomeGoal: z.string(),
  profitTarget: z.string(),
  targetMargin: z.string(),
  defaultContingency: z.string(),
  defaultMarkup: z.string().optional(),
  defaultTaxRate: z.string().optional(),
  /** Free-text service area (e.g. "Austin, TX"); optional, stored as-is. */
  serviceArea: z.string().optional(),
});
export type SettingsFormRaw = z.infer<typeof settingsFormRawSchema>;

/** The result of parsing the settings form: the integer input model, or the first error. */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Parse and validate the §3.2 settings form: human dollars/percent/hours in, integer
 * {@link SettingsInput} out (the store only ever sees ints — constitution §3.1). Converts
 * at the boundary and range-checks each field, returning the first clear error.
 * `targetMargin` is capped below 100% (margin is profit/price, never ≥ price); the advanced
 * `defaultMarkup`/`defaultTaxRate` are optional and empty → null.
 */
export function parseSettingsForm(raw: unknown): ParseResult<SettingsInput> {
  const shape = settingsFormRawSchema.safeParse(raw);
  if (!shape.success) return { ok: false, error: "Please fill in every required field." };
  const r = shape.data;

  const annualOverheadCents = dollarsToCents(r.annualOverhead);
  if (annualOverheadCents === null) return err("Annual overhead must be a non-negative dollar amount.");

  const ownerWageCentsPerHour = dollarsToCents(r.ownerWage);
  if (ownerWageCentsPerHour === null) return err("Owner wage must be a non-negative dollar amount.");

  const laborBurdenBp = percentToBpInRange(r.laborBurden, 0, 100_000);
  if (laborBurdenBp === null) return err("Labor burden must be a percentage between 0 and 1000.");

  const workingDaysPerYear = intInRange(r.workingDaysPerYear, 1, 366);
  if (workingDaysPerYear === null) return err("Working days per year must be a whole number between 1 and 366.");

  const billableMinutesPerDay = hoursToMinutes(r.billableHoursPerDay);
  if (billableMinutesPerDay === null) return err("Billable hours per day must be between 0 and 24.");

  const incomeGoalCents = dollarsToCents(r.incomeGoal);
  if (incomeGoalCents === null) return err("Income goal must be a non-negative dollar amount.");

  const profitTargetCents = dollarsToCents(r.profitTarget);
  if (profitTargetCents === null) return err("Profit target must be a non-negative dollar amount.");

  const targetMarginBp = percentToBpInRange(r.targetMargin, 0, 9_999);
  if (targetMarginBp === null) return err("Target margin must be a percentage between 0 and 99.99.");

  const defaultContingencyBp = percentToBpInRange(r.defaultContingency, 0, 10_000);
  if (defaultContingencyBp === null) return err("Default contingency must be a percentage between 0 and 100.");

  const defaultMarkupBp = optionalBp(r.defaultMarkup, 1_000_000);
  if (defaultMarkupBp === INVALID) return err("Default markup must be a percentage between 0 and 10000.");

  const defaultTaxRateBp = optionalBp(r.defaultTaxRate, 10_000);
  if (defaultTaxRateBp === INVALID) return err("Default tax rate must be a percentage between 0 and 100.");

  // Free text, stored only (never derived-from): trim, cap length, empty → null.
  const serviceAreaRaw = (r.serviceArea ?? "").trim();
  if (serviceAreaRaw.length > 120) return err("Service area must be 120 characters or fewer.");
  const serviceArea = serviceAreaRaw === "" ? null : serviceAreaRaw;

  return {
    ok: true,
    data: {
      annualOverheadCents,
      ownerWageCentsPerHour,
      laborBurdenBp,
      workingDaysPerYear,
      billableMinutesPerDay,
      incomeGoalCents,
      profitTargetCents,
      targetMarginBp,
      defaultContingencyBp,
      defaultMarkupBp,
      defaultTaxRateBp,
      serviceArea,
    },
  };
}

/** Sentinel distinguishing "invalid optional value" from a valid null (absent). */
const INVALID = Symbol("invalid");
function optionalBp(input: string | undefined, max: number): number | null | typeof INVALID {
  if (input === undefined || input.trim() === "") return null;
  const bp = percentToBpInRange(input, 0, max);
  return bp === null ? INVALID : bp;
}

function err(message: string): ParseResult<never> {
  return { ok: false, error: message };
}

/** One raw overhead item (name + dollar amount + optional category) as submitted. */
export const overheadItemRawSchema = z.object({
  name: z.string().trim().min(1, "Item name is required").max(120),
  amount: z.union([z.string(), z.number()]),
  category: z.string().trim().max(80).nullish(),
});

/**
 * Parse optional overhead itemization to {@link OverheadItemInput} (integer cents). When
 * present these sum to the annual total, but the total on `business_settings` — not these
 * — is the source of truth for the math (constitution §6.8). Returns the first error.
 */
export function parseOverheadItems(raw: unknown): ParseResult<OverheadItemInput[]> {
  const shape = z.array(overheadItemRawSchema).max(100).safeParse(raw ?? []);
  if (!shape.success) return { ok: false, error: shape.error.issues[0]?.message ?? "Invalid overhead items." };

  const items: OverheadItemInput[] = [];
  for (const i of shape.data) {
    const amountCents = dollarsToCents(i.amount);
    if (amountCents === null) return err(`"${i.name}" must have a non-negative dollar amount.`);
    items.push({ name: i.name, amountCents, category: i.category ?? null });
  }
  return { ok: true, data: items };
}

// --- Estimate line items -----------------------------------------------------------

/** Parse a non-negative number (string or number), else null. */
function numberOrNull(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** One raw line item as submitted by the estimate editor (labor entered as hours). */
export const lineItemRawSchema = z.object({
  category: z.enum(LINE_CATEGORIES),
  description: z.string().trim().max(200).nullish(),
  /** Labor lines: hours on the tools (converted to integer minutes). */
  laborHours: z.union([z.string(), z.number()]).nullish(),
  /** Non-labor lines: count/measure. */
  quantity: z.union([z.string(), z.number()]).nullish(),
  /** Non-labor lines: unit cost in dollars (converted to cents). */
  unitCost: z.union([z.string(), z.number()]).nullish(),
});

/**
 * Parse the estimate editor's line items into {@link LineItemInput} with integer units
 * (labor hours → minutes, unit dollars → cents). Labor lines need hours; non-labor lines
 * need a quantity and unit cost. Returns the first clear error.
 */
export function parseLineItems(raw: unknown): ParseResult<LineItemInput[]> {
  const shape = z.array(lineItemRawSchema).max(200).safeParse(raw ?? []);
  if (!shape.success) {
    return { ok: false, error: shape.error.issues[0]?.message ?? "Invalid line items." };
  }

  const items: LineItemInput[] = [];
  for (const l of shape.data) {
    const description = l.description ?? null;
    if (l.category === "labor") {
      const hours = numberOrNull(l.laborHours);
      if (hours === null || hours > 24 * 366) {
        return err("Labor lines need hours (0 or more).");
      }
      items.push({ category: "labor", description, laborMinutes: Math.round(hours * 60) });
    } else {
      const quantity = numberOrNull(l.quantity);
      if (quantity === null) return err(`${l.category} lines need a quantity (0 or more).`);
      const unitCostCents = l.unitCost == null || l.unitCost === "" ? null : dollarsToCents(l.unitCost);
      if (unitCostCents === null) return err(`${l.category} lines need a unit cost.`);
      items.push({ category: l.category, description, quantity, unitCostCents });
    }
  }
  return { ok: true, data: items };
}
