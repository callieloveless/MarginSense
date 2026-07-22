/**
 * The shared-project-context domain module (constitution §4, §5). It owns the typed shapes
 * of the "one job, one memory" substrate — context-entry payloads, message authors, the
 * suggestion accept/dismiss state machine, and the **read-only** project snapshot a tool
 * consumes. It holds no DB connection and does no financial math (numbers come from
 * `src/engine/`); the tenant-scoped `src/db/` helpers persist what it describes, and the
 * server accept path performs the effect it computes.
 *
 * The safety rule is expressed here structurally: a snapshot exposes no write path, and the
 * only thing a tool can produce is a `pending` suggestion — resolved only by an explicit
 * user action through {@link nextStatus} + {@link suggestionEffect}.
 */

import { z } from "zod";
import type { EstimateRollUp } from "../engine/index";
// Type-only imports keep this module framework/DB-free (no Drizzle at runtime). The local
// vocabulary arrays below are tied to the schema's types via `satisfies`, so an invalid or
// mistyped value fails to compile — one source of truth without importing the ORM.
import type {
  ContextEntryKindName,
  LineCategoryName,
  SuggestionStatusName,
  SuggestionTargetName,
} from "../db/schema";

/** Context-entry kinds (constitution §4.1), matching the schema enum. */
const CONTEXT_ENTRY_KINDS = [
  "finding",
  "material",
  "code_ref",
  "photo",
  "fact",
] as const satisfies readonly ContextEntryKindName[];

/** Line-item categories, matching the schema enum (for proposed line items). */
const LINE_CATEGORIES = [
  "labor",
  "material",
  "subcontractor",
  "equipment",
  "permit",
  "disposal",
  "other",
] as const satisfies readonly LineCategoryName[];

// --- Author ------------------------------------------------------------------------

/** Who authored an entry/message/suggestion: the human owner, or a named tool (later). */
export type Author = "user" | { readonly tool: string };

/** A short display label for an author ("You" or the tool's name). */
export function authorLabel(a: Author): string {
  return a === "user" ? "You" : a.tool;
}

/** Split an {@link Author} into the two stored columns (`author` enum + `author_tool`). */
export function authorToRow(a: Author): { author: "user" | "tool"; authorTool: string | null } {
  return a === "user" ? { author: "user", authorTool: null } : { author: "tool", authorTool: a.tool };
}

/** Rebuild an {@link Author} from the stored columns. */
export function authorFromRow(author: "user" | "tool", authorTool: string | null): Author {
  return author === "tool" && authorTool ? { tool: authorTool } : "user";
}

// --- Typed context-entry payloads --------------------------------------------------

/** One Zod schema per entry kind (constitution §4.1). Payloads are validated in and out —
 * the JSON column never carries `any`. */
export const contextPayloadSchemas = {
  finding: z.object({ summary: z.string().min(1), detail: z.string().optional() }),
  material: z.object({
    name: z.string().min(1),
    priceCents: z.number().int().nonnegative(),
    unit: z.string().min(1),
    supplier: z.string().optional(),
    sourceUrl: z.string().optional(),
  }),
  code_ref: z.object({
    code: z.string().min(1),
    citation: z.string().min(1),
    jurisdiction: z.string().optional(),
  }),
  photo: z.object({ storageKey: z.string().min(1), annotations: z.array(z.string()).optional() }),
  fact: z.object({ label: z.string().min(1), value: z.string().min(1) }),
} satisfies Record<ContextEntryKindName, z.ZodType>;

export type ContextPayloadResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/** Validate a context-entry payload against its kind's schema. */
export function parseContextPayload(kind: ContextEntryKindName, payload: unknown): ContextPayloadResult {
  const result = contextPayloadSchemas[kind].safeParse(payload);
  return result.success ? { ok: true, value: result.data } : { ok: false, error: `Invalid ${kind} payload.` };
}

// --- Suggestion payloads + the accept/dismiss state machine ------------------------

/** A proposed estimate line item (matches the estimate builder's line-item input). */
export const proposedLineItemSchema = z.object({
  category: z.enum(LINE_CATEGORIES),
  description: z.string().optional(),
  laborMinutes: z.number().int().nonnegative().optional(),
  quantity: z.number().nonnegative().optional(),
  unitCostCents: z.number().int().nonnegative().optional(),
  priceCents: z.number().int().nonnegative().optional(),
});
export type ProposedLineItem = z.infer<typeof proposedLineItemSchema>;

/** A proposed context entry: a kind plus that kind's payload. */
export const proposedContextEntrySchema = z.object({
  kind: z.enum(CONTEXT_ENTRY_KINDS),
  payload: z.unknown(),
});

/** The concrete change accepting a suggestion performs (the server carries it out). */
export type SuggestionEffect =
  | { readonly kind: "commit_context_entry"; readonly entryKind: ContextEntryKindName; readonly payload: unknown }
  | { readonly kind: "add_estimate_line_item"; readonly estimateId: string; readonly line: ProposedLineItem };

export type SuggestionEffectResult =
  | { ok: true; effect: SuggestionEffect }
  | { ok: false; error: string };

/** Derive the effect a suggestion would perform on accept, validating its payload. */
export function suggestionEffect(s: {
  target: SuggestionTargetName;
  payload: unknown;
  targetEstimateId: string | null;
}): SuggestionEffectResult {
  if (s.target === "context_entry") {
    const outer = proposedContextEntrySchema.safeParse(s.payload);
    if (!outer.success) return { ok: false, error: "Invalid context-entry suggestion." };
    const inner = parseContextPayload(outer.data.kind, outer.data.payload);
    if (!inner.ok) return { ok: false, error: inner.error };
    return { ok: true, effect: { kind: "commit_context_entry", entryKind: outer.data.kind, payload: inner.value } };
  }
  if (!s.targetEstimateId) return { ok: false, error: "Line-item suggestion has no target estimate." };
  const line = proposedLineItemSchema.safeParse(s.payload);
  if (!line.success) return { ok: false, error: "Invalid line-item suggestion." };
  return { ok: true, effect: { kind: "add_estimate_line_item", estimateId: s.targetEstimateId, line: line.data } };
}

export type SuggestionAction = "accept" | "dismiss";

/**
 * The suggestion state machine (constitution §5). Only a `pending` suggestion transitions:
 * accept → `accepted`, dismiss → `dismissed`. Acting on an already-resolved suggestion is an
 * idempotent no-op (`changed: false`) — dismissed proposals never reappear, and a double
 * accept never commits twice.
 */
export function nextStatus(
  current: SuggestionStatusName,
  action: SuggestionAction,
): { status: SuggestionStatusName; changed: boolean } {
  if (current !== "pending") return { status: current, changed: false };
  return { status: action === "accept" ? "accepted" : "dismissed", changed: true };
}

// --- Read-only project snapshot (the tool seam) ------------------------------------

export interface ContextEntryView {
  readonly id: string;
  readonly kind: ContextEntryKindName;
  readonly payload: unknown;
  readonly author: Author;
}

export interface MessageView {
  readonly id: string;
  readonly author: Author;
  readonly body: string;
}

/**
 * A frozen, read-only view of a project (constitution §5 rule 1): its context entries, its
 * single conversation, and its active estimate's engine roll-up. There is deliberately no
 * method that mutates anything — the only value a tool can send back is a `Suggestion`.
 */
export interface ProjectSnapshot {
  readonly projectId: string;
  readonly entries: readonly ContextEntryView[];
  readonly conversation: readonly MessageView[];
  readonly activeEstimate: EstimateRollUp | null;
}

/** Assemble a read-only project snapshot. The active-estimate roll-up is the engine's. */
export function buildProjectSnapshot(input: {
  projectId: string;
  entries: readonly ContextEntryView[];
  conversation: readonly MessageView[];
  activeEstimate?: EstimateRollUp | null | undefined;
}): ProjectSnapshot {
  return Object.freeze({
    projectId: input.projectId,
    entries: Object.freeze([...input.entries]),
    conversation: Object.freeze([...input.conversation]),
    activeEstimate: input.activeEstimate ?? null,
  });
}
