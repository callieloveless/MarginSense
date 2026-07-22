/**
 * Zod boundary schemas (techstack §6). Validate all input at the edge; never let `any`
 * or unchecked shapes into the data layer. Money/time/bp conversions belong to the
 * changes that introduce them (`add-onboarding`); this foundation carries only the
 * text/enum inputs of the tenant spine.
 */

import { z } from "zod";
import { PROJECT_STATUSES } from "./schema.js";

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
