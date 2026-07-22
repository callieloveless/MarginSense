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

/** The set of valid project statuses, for boundary validation. */
export const PROJECT_STATUSES = ["active", "complete", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
