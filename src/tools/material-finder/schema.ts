/**
 * Material Finder's schemas (add-material-finder). Three shapes live here so the tool, the
 * port call, and the manual-add action all validate against one definition:
 *
 * - `inputSchema` — what a search run takes (both modes + localization).
 * - `materialResultSchema` — the **port `resultSchema`**: what the model returns from its web
 *   search (needs, each with a few comparable options). `sourceUrl` is deliberately *optional*
 *   at the schema so a model that can't source a price doesn't fail the whole run — the tool
 *   drops any option missing one (§7: never propose a price it cannot source).
 * - `outputSchema` — the tool's typed read-only `output` (the same needs+options, post-filter).
 * - `manualMaterialSchema` — one hand-entered material (the no-model path).
 */

import { z } from "zod";

/** How a search is scoped: one free-text need, or everything for the active estimate. */
export const MATERIAL_FINDER_MODES = ["query", "estimate"] as const;
export type MaterialFinderMode = (typeof MATERIAL_FINDER_MODES)[number];

/** A Material Finder run's input: the mode, an optional query (required in `query` mode), and an
 * optional search `location` (pre-filled from the business service area, overridable). */
export const inputSchema = z
  .object({
    mode: z.enum(MATERIAL_FINDER_MODES),
    query: z.string().trim().min(1).max(200).optional(),
    location: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => v.mode !== "query" || (v.query ?? "") !== "", {
    message: "A query is required when searching for a specific material.",
    path: ["query"],
  });
export type MaterialFinderInput = z.infer<typeof inputSchema>;

/** One comparable product option for a need. `sourceUrl` is optional here (see file header);
 * the tool drops options without one so no unsourced price becomes a suggestion. */
export const materialOptionSchema = z.object({
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  unit: z.string().min(1),
  supplier: z.string().optional(),
  sourceUrl: z.string().optional(),
});
export type MaterialOption = z.infer<typeof materialOptionSchema>;

/** A material need plus the few options found for it. */
export const materialNeedSchema = z.object({
  need: z.string().min(1),
  options: z.array(materialOptionSchema),
});
export type MaterialNeed = z.infer<typeof materialNeedSchema>;

/** The port `resultSchema`: the whole structured search result. An object (not a bare array) so
 * it is a valid strict-tool input shape (#7a builds the result-tool from this). */
export const materialResultSchema = z.object({
  needs: z.array(materialNeedSchema),
});
export type MaterialResult = z.infer<typeof materialResultSchema>;

/** The tool's typed read-only output — the needs+options after unsourced options are dropped. */
export const outputSchema = materialResultSchema;
export type MaterialFinderOutput = MaterialResult;

/** One hand-added material (the no-model path): a required source is *not* demanded — the user
 * is the source. Mirrors the `material` context payload plus optional supplier. */
export const manualMaterialSchema = z.object({
  name: z.string().trim().min(1).max(200),
  priceCents: z.number().int().nonnegative(),
  unit: z.string().trim().min(1).max(40),
  supplier: z.string().trim().min(1).max(200).optional(),
});
export type ManualMaterial = z.infer<typeof manualMaterialSchema>;
