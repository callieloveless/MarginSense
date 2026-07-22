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

export type BusinessRow = typeof businesses.$inferSelect;
export type NewBusinessRow = typeof businesses.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

/** The set of valid project statuses, for boundary validation. */
export const PROJECT_STATUSES = ["active", "complete", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
