CREATE TABLE "business_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"annual_overhead_cents" bigint NOT NULL,
	"owner_wage_cents_per_hour" bigint NOT NULL,
	"labor_burden_bp" integer NOT NULL,
	"working_days_per_year" integer NOT NULL,
	"billable_minutes_per_day" integer NOT NULL,
	"income_goal_cents" bigint NOT NULL,
	"profit_target_cents" bigint NOT NULL,
	"target_margin_bp" integer NOT NULL,
	"default_contingency_bp" integer NOT NULL,
	"default_markup_bp" integer,
	"default_tax_rate_bp" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_settings_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "overhead_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overhead_items" ADD CONSTRAINT "overhead_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ============================================================================
-- Row-Level Security (constitution §6.3) — versioned with the tables it protects,
-- same pattern as 0000: each business-owned table is restricted to the authenticated
-- user's business via public.current_business_id() (resolved from auth.uid() → users).
-- The client never supplies the business_id used for authorization. RLS ships in the
-- SAME migration as the tables — no unprotected window.
-- ============================================================================
ALTER TABLE "business_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "overhead_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Business settings: read and write restricted to the caller's business.
CREATE POLICY "business_settings_same_business" ON "business_settings"
  FOR ALL
  USING ("business_id" = public.current_business_id())
  WITH CHECK ("business_id" = public.current_business_id());--> statement-breakpoint

-- Overhead items: read and write restricted to the caller's business.
CREATE POLICY "overhead_items_same_business" ON "overhead_items"
  FOR ALL
  USING ("business_id" = public.current_business_id())
  WITH CHECK ("business_id" = public.current_business_id());--> statement-breakpoint

-- Privileges for the `authenticated` role (RLS decides WHICH rows; these grants decide
-- whether the role may touch the tables at all). The app drops to `authenticated` per
-- transaction (src/db/rls.ts); `anon` is granted nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON "business_settings" TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "overhead_items" TO authenticated;