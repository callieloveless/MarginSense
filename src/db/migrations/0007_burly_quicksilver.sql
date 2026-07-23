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
GRANT SELECT, INSERT, UPDATE, DELETE ON "project_photos" TO authenticated;--> statement-breakpoint

-- ============================================================================
-- Object storage (add-photo-capture) — the bytes live in Supabase Storage, which
-- is outside this table's RLS. A photo is therefore isolated TWICE: the row policy
-- above, and the object policy below, which compares the first key segment against
-- the caller's business. Keys are built only by src/photos/photoObjectKey() as
-- "{business_id}/{project_id}/{photo_id}.{ext}", and the business id is always
-- stamped from the tenant handle — never from input.
--
-- The bucket is PRIVATE (public = false): the app never mints a public URL, it
-- issues short-lived signed URLs. The app reaches Storage through the
-- session-scoped SSR client (anon key + the user's JWT), never the service-role
-- key, so auth.uid() resolves and this policy actually applies.
--
-- Both statements are idempotent. If a hosted environment refuses them to the
-- migration role (storage.objects is owned by the storage extension), create the
-- bucket and this policy once from the Supabase dashboard's SQL editor — the
-- app-layer prefix rule in src/photos/ holds either way.
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', false)
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

DROP POLICY IF EXISTS "job_photos_objects_same_business" ON storage.objects;--> statement-breakpoint

CREATE POLICY "job_photos_objects_same_business" ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'job-photos'
    AND (storage.foldername(name))[1] = public.current_business_id()::text
  )
  WITH CHECK (
    bucket_id = 'job-photos'
    AND (storage.foldername(name))[1] = public.current_business_id()::text
  );