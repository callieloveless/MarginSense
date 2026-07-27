CREATE TYPE "public"."photo_set_analysis_status" AS ENUM('analyzing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "photo_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"caption" text,
	"analysis_status" "photo_set_analysis_status" DEFAULT 'analyzing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_photos" ADD COLUMN "set_id" uuid;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "set_id" uuid;--> statement-breakpoint
ALTER TABLE "photo_sets" ADD CONSTRAINT "photo_sets_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_sets" ADD CONSTRAINT "photo_sets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_set_id_photo_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."photo_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_set_id_photo_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."photo_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- ============================================================================
-- Row-Level Security for photo_sets (revamp-photo-advisor).
-- RLS ships in the SAME migration as the table (constitution §6.3). The new
-- `set_id` columns on project_photos and suggestions inherit those tables'
-- existing per-business policies, so they need no policy of their own.
-- ============================================================================
ALTER TABLE "photo_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "photo_sets_same_business" ON "photo_sets"
  FOR ALL
  USING ("business_id" = public.current_business_id())
  WITH CHECK ("business_id" = public.current_business_id());--> statement-breakpoint

-- Privileges for the `authenticated` role (RLS decides WHICH rows; grants decide
-- table access at all). The app drops to `authenticated` per transaction (src/db/rls.ts).
GRANT SELECT, INSERT, UPDATE, DELETE ON "photo_sets" TO authenticated;