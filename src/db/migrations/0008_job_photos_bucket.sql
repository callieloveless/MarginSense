-- ============================================================================
-- Job-photo object storage (add-photo-capture) — the bucket and its tenant policy.
--
-- Photo BYTES live in Supabase Storage, outside Postgres and outside the RLS on
-- `project_photos` (migration 0007). This restores the guarantee for the objects:
-- a policy on storage.objects comparing the first key segment to the caller's
-- business. Keys are built only by src/photos/photoObjectKey() as
-- "{business_id}/{project_id}/{photo_id}.{ext}", with the business id stamped from
-- the tenant handle — never from input. The bucket name is fixed (src/photos/
-- PHOTO_BUCKET) precisely because this policy names one bucket.
--
-- Deliberately its OWN migration, separate from the table in 0007: `storage` is a
-- Supabase-provided schema, so these statements are the only ones in the chain that
-- can fail for reasons unrelated to our schema — a plain Postgres (the opt-in
-- `npm run test:rls` target) has no `storage` schema at all, and a hosted project may
-- refuse storage.objects to the migration role, since it is owned by the storage
-- extension. Bundled with 0007, either failure would roll back `project_photos`, its
-- RLS policy, and its grants along with it.
--
-- Both blocks are therefore idempotent AND self-skipping: they no-op with a NOTICE
-- rather than raising, so a missing schema or an insufficient privilege can never
-- block this or any later migration. When skipped on a real Supabase project, run
-- this file's statements once from the dashboard SQL editor — until then the DB half
-- of object isolation is absent and only the app-layer prefix check is standing.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'skipping job-photos bucket: no storage schema (not a Supabase database)';
    RETURN;
  END IF;

  -- Private bucket (public = false): the app never mints a public URL, it issues
  -- short-lived signed URLs (constitution §7).
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('job-photos', 'job-photos', false)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'skipping job-photos bucket: insufficient privilege — create it from the Supabase dashboard';
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'skipping job-photos object policy: no storage schema (not a Supabase database)';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "job_photos_objects_same_business" ON storage.objects;

  -- The app reaches Storage through the session-scoped SSR client (anon key + the
  -- user's JWT), never the service-role key, so auth.uid() resolves and this applies.
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
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'skipping job-photos object policy: insufficient privilege — create it from the Supabase dashboard';
END $$;
