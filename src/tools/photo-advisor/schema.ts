/**
 * Photo Advisor's schemas (add-photo-advisor). Four shapes so the tool, the port call, the panel
 * action, and the tests all validate against one definition:
 *
 * - `inputSchema` — one photo (bytes carried in, because a tool gets no storage handle) plus an
 *   optional question.
 * - `visionResultSchema` — the **port `resultSchema`**: what the model returns from the image.
 * - `outputSchema` — the tool's typed read-only `output` (what it actually proposed).
 *
 * The single most important property of the result schema is what it **lacks**: there is no cost
 * or price field anywhere in it. Photo Advisor cannot search the web, so any price it produced
 * would be fabricated (constitution §7) — and a zero-cost material line accepted into an estimate
 * would silently overstate that job's profit. A prompt asking the model not to price things is a
 * request; a schema with nowhere to put a price is a guarantee.
 */

import { z } from "zod";
import { FINDING_SEVERITIES } from "../../context";

/** A Photo Advisor run: one stored photo (id for traceability, bytes for the model) and an
 * optional question to focus the diagnosis. The caller resolves the bytes tenant-scoped. */
export const inputSchema = z.object({
  photoId: z.string().min(1),
  /** The photo's storage key — rides along so a finding can name the photo it came from. */
  storageKey: z.string().min(1),
  mediaType: z.string().min(1),
  /** The image itself, base64. Transient: nothing persists a tool run's input. */
  imageBase64: z.string().min(1),
  /** The photo's caption, when it has one — cheap context for the model. */
  caption: z.string().trim().max(500).optional(),
  question: z.string().trim().max(500).optional(),
});
export type PhotoAdvisorInput = z.infer<typeof inputSchema>;

/**
 * One thing the advisor saw. `materials` names what the repair needs **in words** — never a
 * price, never a line item (see the file header); it becomes part of the job's memory and the
 * handoff to Material Finder.
 */
export const visionFindingSchema = z.object({
  summary: z.string().min(1),
  detail: z.string().optional(),
  severity: z.enum(FINDING_SEVERITIES),
  /** Materials the repair needs, e.g. "three sheets of ¾ ply". Unpriced, by design. */
  materials: z.array(z.string().min(1)).optional(),
});
export type VisionFinding = z.infer<typeof visionFindingSchema>;

/** A repair task and how long the model thinks it takes. Minutes only — the *cost* is the
 * engine's, computed from the business's own burdened labor rate (§3.4). */
export const visionLaborSchema = z.object({
  description: z.string().min(1),
  laborMinutes: z.number().int().positive(),
});
export type VisionLabor = z.infer<typeof visionLaborSchema>;

/** The port `resultSchema`: an object (not a bare array) so it is a valid strict-tool input
 * shape, which is how #7a builds the result-tool. */
export const visionResultSchema = z.object({
  findings: z.array(visionFindingSchema),
  labor: z.array(visionLaborSchema),
});
export type VisionResult = z.infer<typeof visionResultSchema>;

/** The tool's typed read-only output: what it proposed, plus the labor estimates it flagged as
 * implausibly large (surfaced, never dropped — see `photo-advisor.ts`). */
export const outputSchema = z.object({
  findings: z.array(visionFindingSchema),
  labor: z.array(visionLaborSchema),
  /** Descriptions of labor candidates beyond the plausibility bound, for the post's warning. */
  flaggedLabor: z.array(z.string()),
  /** Whether candidate work could be proposed at all (false with no active estimate). */
  proposedLineItems: z.boolean(),
});
export type PhotoAdvisorOutput = z.infer<typeof outputSchema>;
