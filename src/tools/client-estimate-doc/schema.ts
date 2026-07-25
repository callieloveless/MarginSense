/**
 * Client Estimate Doc schemas (add-client-estimate-doc). The tool turns a finished estimate into a
 * client-facing document, so its **input** is the estimate material the action assembled
 * tenant-scoped (the tool holds no DB handle), and its **output** is the finished client-safe
 * document — a document, not a suggestion.
 *
 * The input mirrors the pure projection's input (business identity, client, the lines with costs,
 * the solved total, tax) plus `writeNarrative` (whether to ask the model for a scope paragraph).
 * There is **no cost/EPH/margin field on the output** — it is the client-document shape from
 * `src/document/`.
 */

import { z } from "zod";
import { clientDocumentSchema } from "../../document";

/** One estimate line handed to the tool: description, internal cost, and whether it's overridden. */
export const inputLineSchema = z.object({
  description: z.string().min(1).max(500),
  costCents: z.number().int().nonnegative(),
  hasPriceOverride: z.boolean(),
});

export const inputSchema = z.object({
  businessName: z.string().min(1).max(200),
  tradeType: z.string().min(1).max(120).optional(),
  serviceArea: z.string().min(1).max(200).optional(),
  license: z.string().min(1).max(120).optional(),
  clientName: z.string().min(1).max(200),
  clientAddress: z.string().min(1).max(500).optional(),
  title: z.string().min(1).max(200),
  preparedOn: z.string().min(1).max(40),
  terms: z.string().max(4000).optional(),
  lines: z.array(inputLineSchema),
  totalPriceCents: z.number().int().nonnegative(),
  taxRateBp: z.number().int().nonnegative().optional(),
  /** Ask the model for a scope narrative. The action sets this only when AI is configured. */
  writeNarrative: z.boolean(),
});
export type ClientEstimateDocInput = z.infer<typeof inputSchema>;

/** The tool's typed output: the finished client-safe document (`src/document/` shape). */
export const outputSchema = clientDocumentSchema;
export type ClientEstimateDocOutput = z.infer<typeof outputSchema>;
