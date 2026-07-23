CREATE TABLE "project_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"caption" text,
	"uploaded_by_auth_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_photos_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ============================================================================
-- Row-Level Security (constitution §6.3) — versioned with the table it protects,
-- same pattern as 0000–0004: project_photos is restricted to the authenticated
-- user's business via public.current_business_id() (resolved from auth.uid() →
-- users). The client never supplies the business_id used for authorization.
-- RLS ships in the SAME migration as the table.
-- ============================================================================
ALTER TABLE "project_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "project_photos_same_business" ON "project_photos"
  FOR ALL
  USING ("business_id" = public.current_business_id())
  WITH CHECK ("business_id" = public.current_business_id());--> statement-breakpoint

-- Privileges for the `authenticated` role (RLS decides WHICH rows; grants decide table
-- access at all). The app drops to `authenticated` per transaction (src/db/rls.ts).
GRANT SELECT, INSERT, UPDATE, DELETE ON "project_photos" TO authenticated;

-- The photo BYTES live in Supabase Storage, outside this table and outside its RLS.
-- The object-side policy that isolates them is migration 0008 — kept separate so a
-- Supabase-specific statement can never roll back this table.
