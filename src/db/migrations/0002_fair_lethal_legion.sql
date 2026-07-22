CREATE TYPE "public"."line_category" AS ENUM('labor', 'material', 'subcontractor', 'equipment', 'permit', 'disposal', 'other');--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version_label" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"target_margin_bp" integer NOT NULL,
	"contingency_bp" integer NOT NULL,
	"total_price_override_cents" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"category" "line_category" NOT NULL,
	"description" text,
	"labor_minutes" integer,
	"quantity" double precision,
	"unit_cost_cents" bigint,
	"price_cents" bigint,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- At most one active estimate version per project (constitution §3.4). Partial unique
-- index: many inactive versions allowed, only one is_active = true per project.
CREATE UNIQUE INDEX "estimates_one_active_per_project" ON "estimates" ("project_id") WHERE "is_active";--> statement-breakpoint
-- ============================================================================
-- Row-Level Security (constitution §6.3) — versioned with the tables it protects,
-- same pattern as 0000/0001: each business-owned table is restricted to the
-- authenticated user's business via public.current_business_id(). The client never
-- supplies the business_id used for authorization. RLS ships in the SAME migration.
-- ============================================================================
ALTER TABLE "estimates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "estimates_same_business" ON "estimates"
  FOR ALL
  USING ("business_id" = public.current_business_id())
  WITH CHECK ("business_id" = public.current_business_id());--> statement-breakpoint

CREATE POLICY "line_items_same_business" ON "line_items"
  FOR ALL
  USING ("business_id" = public.current_business_id())
  WITH CHECK ("business_id" = public.current_business_id());--> statement-breakpoint

-- Privileges for the `authenticated` role (RLS decides WHICH rows; grants decide table
-- access at all). The app drops to `authenticated` per transaction (src/db/rls.ts).
GRANT SELECT, INSERT, UPDATE, DELETE ON "estimates" TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "line_items" TO authenticated;