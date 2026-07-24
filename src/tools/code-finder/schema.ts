/**
 * Code Finder's schemas (add-code-finder). Like Material Finder, three shapes so the tool, the
 * port call, and the panel action validate against one definition — but for **codes, not prices**,
 * and with no estimate mode: a code is a fact about the job, never a line item.
 *
 * The result schema's important properties: `sourceUrl` is optional at the schema (so a model that
 * can't source one code doesn't fail the whole run — the tool drops that option, §7), and there is
 * a `complianceNote` field so the model can state a permit/inspection consequence the post frames
 * as the job's cost and hours.
 */

import { z } from "zod";

/** A Code Finder run's input: the question, an optional jurisdiction override (pre-filled from the
 * service area), and — on a composed run — the photo the query came from, for traceability. */
export const inputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  location: z.string().trim().min(1).max(120).optional(),
  /** Set when composed off a Photo Advisor finding; carried onto each `code_ref` proposed. */
  photoStorageKey: z.string().min(1).optional(),
});
export type CodeFinderInput = z.infer<typeof inputSchema>;

/** One code the search found. `sourceUrl` optional here (see file header); the tool drops any code
 * without one. `complianceNote` is the plain-language consequence — a permit, an inspection. */
export const codeResultItemSchema = z.object({
  code: z.string().min(1),
  requirement: z.string().min(1),
  jurisdiction: z.string().optional(),
  sourceUrl: z.string().optional(),
  complianceNote: z.string().optional(),
});
export type CodeResultItem = z.infer<typeof codeResultItemSchema>;

/** The port `resultSchema`: an object (not a bare array) so it is a valid strict-tool input shape,
 * how #7a builds the result-tool. */
export const codeResultSchema = z.object({
  codes: z.array(codeResultItemSchema),
});
export type CodeResult = z.infer<typeof codeResultSchema>;

/** The tool's typed read-only output: the sourced codes actually proposed (post-drop, post-cap). */
export const outputSchema = z.object({
  codes: z.array(codeResultItemSchema),
});
export type CodeFinderOutput = z.infer<typeof outputSchema>;
