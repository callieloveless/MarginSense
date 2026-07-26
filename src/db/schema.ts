/**
 * Drizzle schema — the tenant spine (constitution §2, §6.3).
 *
 * `businesses` is the tenant. `users` maps one Supabase Auth identity to exactly one
 * business. `projects` is one client job — the unit of shared context. Every
 * business-owned row carries a non-null `business_id`; Row-Level Security (added in the
 * migration alongside these tables) restricts each row to its business. Later changes
 * (`business_settings`, `estimates`, `line_items`, context tables) hang off this spine
 * and copy the same `business_id` + RLS pattern.
 *
 * This file is schema only — no queries, no connection. Tenant-scoped access lives in
 * `tenant.ts`; the live connection in `client.ts`.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";

/** A project's lifecycle status. Kept small and explicit for v1. */
export const projectStatus = pgEnum("project_status", [
  "active",
  "complete",
  "archived",
]);

/** The tenant. Owns all business data. */
export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Trade type (e.g. "general", "electrical"). Free text in v1; general contractors first. */
  tradeType: text("trade_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A person who logs in. Maps a Supabase Auth identity (`auth_id`) to exactly one
 * business. `auth_id` is unique — one user, one business (constitution §2; the schema
 * leaves room for crews later without changing this policy shape).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The Supabase Auth user id (`auth.uid()`). Unique: one login → one business. */
  authId: uuid("auth_id").notNull().unique(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One client job. The boundary of shared context (constitution §2, §4). */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  clientName: text("client_name").notNull(),
  /** Job-site address. Sensitive tenant data (constitution §7). Optional at creation. */
  address: text("address"),
  /** Short scope note; the detailed costing lives in estimates (a later change). */
  scope: text("scope"),
  status: projectStatus("status").notNull().default("active"),
  /** Job type (e.g. "Kitchen", "Bath"). Free text, chip-selected in setup; nullable. Data-driven
   * so new trades need no migration (revamp-project-setup). */
  jobType: text("job_type"),
  /** Crew on this job (e.g. "Just me", "2", "4+"). Free text, chip-selected; nullable. */
  crewSize: text("crew_size"),
  /** When the job starts (e.g. "Week of Oct 13"). Free text; nullable. */
  startWindow: text("start_window"),
  /** Default target margin (bp) that SEEDS a new estimate's `target_margin_bp` at creation — a
   * seed, not a link (editing it never mutates an existing estimate). Nullable → fall back to the
   * business default (revamp-project-setup). */
  defaultTargetMarginBp: integer("default_target_margin_bp"),
  /** Default contingency (bp) that seeds a new estimate's `contingency_bp`; nullable → business
   * default. */
  defaultContingencyBp: integer("default_contingency_bp"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The solo owner-operator financial inputs (constitution §3.2), one row per business.
 * **Inputs only** — every derived rate (overhead recovery, loaded cost, break-even,
 * target profit/hr) is recomputed by `src/engine/` and never stored (constitution §6.8).
 * Money is integer cents (`bigint`, mode number — no float ceiling on annual figures),
 * time is minutes, percentages are basis points; all integers. `default_markup_bp` and
 * `default_tax_rate_bp` are advanced inputs edited in full settings, not the wizard, so
 * they are nullable. `business_id` is unique — a business has exactly one settings row.
 */
export const businessSettings = pgTable("business_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .unique()
    .references(() => businesses.id, { onDelete: "cascade" }),
  /** Single annual overhead figure — the source of truth for overhead math. */
  annualOverheadCents: bigint("annual_overhead_cents", { mode: "number" }).notNull(),
  ownerWageCentsPerHour: bigint("owner_wage_cents_per_hour", { mode: "number" }).notNull(),
  laborBurdenBp: integer("labor_burden_bp").notNull(),
  workingDaysPerYear: integer("working_days_per_year").notNull(),
  billableMinutesPerDay: integer("billable_minutes_per_day").notNull(),
  incomeGoalCents: bigint("income_goal_cents", { mode: "number" }).notNull(),
  profitTargetCents: bigint("profit_target_cents", { mode: "number" }).notNull(),
  targetMarginBp: integer("target_margin_bp").notNull(),
  defaultContingencyBp: integer("default_contingency_bp").notNull(),
  /** Advanced (full settings only) — nullable until set. */
  defaultMarkupBp: integer("default_markup_bp"),
  /** Advanced (full settings only) — nullable until set. */
  defaultTaxRateBp: integer("default_tax_rate_bp"),
  /**
   * Where the business works (e.g. "Austin, TX"). Free text, nullable until set. Stored only —
   * never derived-from — and used by Material Finder (#7b) to bias its web search toward local
   * suppliers and prices. A blank service area falls back to a non-local search.
   */
  serviceArea: text("service_area"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Optional overhead line items (constitution §3.2). Stored for the owner's recall; when
 * present they sum to `business_settings.annual_overhead_cents`, but the annual **total**
 * — not these rows — is the source of truth the engine reads. Kept as its own table so a
 * business can itemize freely without bloating the settings row.
 */
export const overheadItems = pgTable("overhead_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  /** Free-text grouping (e.g. "insurance", "vehicle"); optional. */
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Granular line-item categories (constitution §3.4); grouping is display-only. Mirrors
 * the engine's `LineCategory`. */
export const lineCategory = pgEnum("line_category", [
  "labor",
  "material",
  "subcontractor",
  "equipment",
  "permit",
  "disposal",
  "other",
]);

/**
 * An estimate version for a project (constitution §3.4, §6.8). A project has many versions
 * (v1, revised, Option A/B); exactly one is `is_active` (enforced by a partial unique index
 * in the migration) and feeds the portfolio. `target_margin_bp` and `contingency_bp` are the
 * per-estimate pricing inputs (seeded from settings at creation, editable). The solved price
 * is **not** stored — the engine recomputes it (constitution §6.8); only a deliberate
 * `total_price_override_cents` is persisted, after which margin becomes an outcome.
 */
export const estimates = pgTable("estimates", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  versionLabel: text("version_label").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  targetMarginBp: integer("target_margin_bp").notNull(),
  contingencyBp: integer("contingency_bp").notNull(),
  /** Deliberate total-price override; null means price is margin-solved by the engine. */
  totalPriceOverrideCents: bigint("total_price_override_cents", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One line of an estimate (constitution §3.4). Labor lines carry `labor_minutes`; non-labor
 * lines carry `quantity` × `unit_cost_cents`. `price_cents` is an optional per-line override
 * (reserved; v1 pricing solves/overrides at the total). Costs are entered — the client price
 * and margin are derived by the engine, never stored as truth.
 */
export const lineItems = pgTable("line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  estimateId: uuid("estimate_id")
    .notNull()
    .references(() => estimates.id, { onDelete: "cascade" }),
  category: lineCategory("category").notNull(),
  description: text("description"),
  /** Labor lines only. */
  laborMinutes: integer("labor_minutes"),
  /** Non-labor lines: count/measure (may be fractional — a measure, not money). */
  quantity: doublePrecision("quantity"),
  /** Non-labor lines: cost per unit. */
  unitCostCents: bigint("unit_cost_cents", { mode: "number" }),
  /** Optional per-line price override (reserved for future per-line pricing). */
  priceCents: bigint("price_cents", { mode: "number" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Shared project context (constitution §4; add-project-context) ------------------

/** Who authored a context entry, message, or suggestion: the human owner or a named tool. */
export const authorKind = pgEnum("author_kind", ["user", "tool"]);

/** The typed kinds of shared-context entry (constitution §4.1). */
export const contextEntryKind = pgEnum("context_entry_kind", [
  "finding",
  "material",
  "code_ref",
  "photo",
  "fact",
]);

/** A suggestion's lifecycle (constitution §4.3, §5). */
export const suggestionStatus = pgEnum("suggestion_status", [
  "pending",
  "accepted",
  "dismissed",
]);

/** What a suggestion proposes to change when accepted. */
export const suggestionTarget = pgEnum("suggestion_target", [
  "context_entry",
  "estimate_line_item",
]);

/** How a tool run was invoked (constitution §5; add-tool-platform). `user` = a person opened
 * the tool; `auto` = an event auto-triggered it (e.g. photo upload → Code Finder); `compose`
 * = it ran as a hop in a composed tool graph. Drives the runner's step budget. */
export const toolRunSource = pgEnum("tool_run_source", ["user", "auto", "compose"]);

/** The outcome of one tool run — `ok`, or `error` (the run threw or its output failed
 * validation). Failed runs are still recorded so partial AI spend stays observable (§7). */
export const toolRunStatus = pgEnum("tool_run_status", ["ok", "error"]);

/**
 * A typed entry in a project's shared context (constitution §4.1). The `payload` is a typed
 * JSON blob validated by the `src/context/` Zod schema for its `kind` — never `any`. `author`
 * is the human owner today; tool authors carry a `author_tool` name once tools ship.
 */
export const contextEntries = pgTable("context_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: contextEntryKind("kind").notNull(),
  payload: jsonb("payload").notNull(),
  author: authorKind("author").notNull().default("user"),
  /** The tool's name when `author = 'tool'`; null for the user. */
  authorTool: text("author_tool"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A message in a project's **single** conversation (constitution §4.2). All tools and the
 * user post into one thread per project (keyed by `project_id`); there are no per-tool
 * histories. Each message is attributed to its author.
 */
export const conversationMessages = pgTable("conversation_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  author: authorKind("author").notNull().default("user"),
  authorTool: text("author_tool"),
  body: text("body").notNull(),
  /** The tool run that posted this message, when a tool authored it (add-tool-platform).
   * Nullable: user messages and pre-platform rows have none. Traceable to its cost (§6.6). */
  toolRunId: uuid("tool_run_id").references(() => toolRuns.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A proposed change awaiting confirmation (constitution §4.3, §5). Accepting is the ONLY
 * path that commits the proposed context entry or estimate line item; a `dismissed`
 * suggestion is remembered so it does not nag. `payload` is the typed proposal (validated by
 * `src/context/`); `target_estimate_id` names the estimate for an `estimate_line_item`
 * target. Nothing is applied automatically — new rows are `pending`.
 */
export const suggestions = pgTable("suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  status: suggestionStatus("status").notNull().default("pending"),
  target: suggestionTarget("target").notNull(),
  /** For an `estimate_line_item` target: the estimate the line is added to on accept. */
  targetEstimateId: uuid("target_estimate_id").references(() => estimates.id, {
    onDelete: "cascade",
  }),
  payload: jsonb("payload").notNull(),
  author: authorKind("author").notNull().default("user"),
  authorTool: text("author_tool"),
  /** The tool run that proposed this suggestion, when a tool created it (add-tool-platform).
   * Nullable: user-created and pre-platform suggestions have none. Every proposed change is
   * traceable to the run — and cost — that produced it (§6.6). */
  toolRunId: uuid("tool_run_id").references(() => toolRuns.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An audit record of one tool invocation (constitution §2 "Tool Run", §5, §7). Records what a
 * run cost — tokens and latency — plus its tool, project, source, and status, so AI spend is
 * observable per tenant as the product scales. Written by the tool runner through the tenant
 * seam; `business_id` is stamped from the bound handle, never input. Failed runs are recorded
 * too (status `error`) so partial spend is never invisible. Suggestions and conversation
 * messages point back here via `tool_run_id`.
 */
export const toolRuns = pgTable("tool_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  toolName: text("tool_name").notNull(),
  /** Terminal status once the run finishes. NULL while the run is in flight — see
   * {@link runStatus} (add-tool-dispatch). Nullable rather than a `running` enum value so the
   * migration avoids the Postgres "ALTER TYPE … ADD VALUE inside a transaction" hazard. */
  status: toolRunStatus("status"),
  source: toolRunSource("source").notNull().default("user"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** When the run reached a terminal status. NULL while running (add-tool-dispatch). */
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/**
 * A job photo (add-photo-capture). The **row** is the record; the **bytes** live in a private
 * storage bucket under a `business_id/project_id/…` key (`src/photos/`), so a photo is isolated
 * twice: this table's RLS policy, and a `storage.objects` policy on the same first key segment.
 * `storage_key` is unique — one object, one row. Dimensions and byte size are of what was
 * actually stored (the client downscales and re-encodes, which also strips EXIF/GPS — §7), not
 * of the original on the phone. `uploaded_by_auth_id` is stamped by the backend from the
 * signed-in identity, never accepted from input.
 */
export const projectPhotos = pgTable("project_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** Object key of the full-size image, derived by `src/photos/photoObjectKey`. */
  storageKey: text("storage_key").notNull().unique(),
  /** Object key of the thumbnail produced in the same client-side pass. */
  thumbKey: text("thumb_key").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  /** The owner's short note on the photo ("joist under the tub"); null until set. */
  caption: text("caption"),
  /** The Supabase Auth identity that uploaded it (matches `users.auth_id`); null if unknown. */
  uploadedByAuthId: uuid("uploaded_by_auth_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A client-facing document (add-client-document; constitution §5) — the polished proposal a
 * **client** sees, kept strictly separate from the internal estimate. `payload` is a **client-safe
 * snapshot** validated by `src/document/` (business identity, client, priced lines, totals, terms)
 * — it has no cost, overhead, EPH, signal, or labor-minute field, so internal figures cannot leak.
 * Frozen at creation, so a later estimate edit never changes what a client was already sent.
 *
 * `share_token` is an unguessable capability: a client opens `/share/<token>` with no login, read
 * through the `get_shared_document` SECURITY DEFINER function (migration `0009`) which returns the
 * payload only when `shared_at` is set and `revoked_at` is null. RLS still isolates every
 * authenticated path by `business_id`. Re-sharing a revoked document mints a fresh token, so a
 * revoked link never revives.
 */
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** The estimate version this was generated from (provenance); the payload is self-contained, so
   * losing the estimate doesn't change the document. */
  estimateId: uuid("estimate_id").references(() => estimates.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  /** The client-safe snapshot (validated by `src/document/`). Never carries an internal figure. */
  payload: jsonb("payload").notNull(),
  /** Unguessable share capability; unique. Minted at creation, re-minted only on re-share after
   * revoke. */
  shareToken: text("share_token").notNull().unique(),
  /** Set when shared; null before first share. */
  sharedAt: timestamp("shared_at", { withTimezone: true }),
  /** Set when revoked; the public read requires this to be null. */
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BusinessRow = typeof businesses.$inferSelect;
export type NewBusinessRow = typeof businesses.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type BusinessSettingsRow = typeof businessSettings.$inferSelect;
export type NewBusinessSettingsRow = typeof businessSettings.$inferInsert;
export type OverheadItemRow = typeof overheadItems.$inferSelect;
export type NewOverheadItemRow = typeof overheadItems.$inferInsert;
export type EstimateRow = typeof estimates.$inferSelect;
export type NewEstimateRow = typeof estimates.$inferInsert;
export type LineItemRow = typeof lineItems.$inferSelect;
export type NewLineItemRow = typeof lineItems.$inferInsert;
export type ContextEntryRow = typeof contextEntries.$inferSelect;
export type NewContextEntryRow = typeof contextEntries.$inferInsert;
export type ConversationMessageRow = typeof conversationMessages.$inferSelect;
export type NewConversationMessageRow = typeof conversationMessages.$inferInsert;
export type SuggestionRow = typeof suggestions.$inferSelect;
export type NewSuggestionRow = typeof suggestions.$inferInsert;
export type ToolRunRow = typeof toolRuns.$inferSelect;
export type NewToolRunRow = typeof toolRuns.$inferInsert;
export type ProjectPhotoRow = typeof projectPhotos.$inferSelect;
export type NewProjectPhotoRow = typeof projectPhotos.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;
export type NewDocumentRow = typeof documents.$inferInsert;

/** Valid context-entry kinds, for boundary validation. */
export const CONTEXT_ENTRY_KINDS = [
  "finding",
  "material",
  "code_ref",
  "photo",
  "fact",
] as const;
export type ContextEntryKindName = (typeof CONTEXT_ENTRY_KINDS)[number];

/** Valid suggestion statuses and targets, for boundary validation. */
export const SUGGESTION_STATUSES = ["pending", "accepted", "dismissed"] as const;
export type SuggestionStatusName = (typeof SUGGESTION_STATUSES)[number];
export const SUGGESTION_TARGETS = ["context_entry", "estimate_line_item"] as const;
export type SuggestionTargetName = (typeof SUGGESTION_TARGETS)[number];

/** The set of valid line categories, for boundary validation. */
export const LINE_CATEGORIES = [
  "labor",
  "material",
  "subcontractor",
  "equipment",
  "permit",
  "disposal",
  "other",
] as const;
export type LineCategoryName = (typeof LINE_CATEGORIES)[number];

/** The set of valid project statuses, for boundary validation. */
export const PROJECT_STATUSES = ["active", "complete", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Valid tool-run sources and terminal statuses, for boundary validation. */
export const TOOL_RUN_SOURCES = ["user", "auto", "compose"] as const;
export type ToolRunSourceName = (typeof TOOL_RUN_SOURCES)[number];
export const TOOL_RUN_STATUSES = ["ok", "error"] as const;
export type ToolRunStatusName = (typeof TOOL_RUN_STATUSES)[number];

/** The lifecycle state of a tool run: `running` while its terminal `status` is still NULL,
 * otherwise the terminal status (add-tool-dispatch). */
export function runStatus(row: { status: ToolRunStatusName | null }): "running" | ToolRunStatusName {
  return row.status ?? "running";
}
