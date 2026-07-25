CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"estimate_id" uuid,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"share_token" text NOT NULL,
	"shared_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ============================================================================
-- Row-Level Security (constitution §6.3) — versioned with the table it protects,
-- same pattern as 0000–0007: documents is restricted to the authenticated user's
-- business via public.current_business_id(). The client never supplies the
-- business_id used for authorization. RLS ships in the SAME migration as the table.
-- ============================================================================
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "documents_same_business" ON "documents"
  FOR ALL
  USING ("business_id" = public.current_business_id())
  WITH CHECK ("business_id" = public.current_business_id());--> statement-breakpoint

-- Privileges for the `authenticated` role (RLS decides WHICH rows; grants decide table
-- access at all). The app drops to `authenticated` per transaction (src/db/rls.ts).
GRANT SELECT, INSERT, UPDATE, DELETE ON "documents" TO authenticated;--> statement-breakpoint

-- ============================================================================
-- The one deliberate PUBLIC capability (add-client-document; constitution §5, §7).
-- A client has no account, so sharing a proposal needs a path that returns ONE
-- document's client-safe payload without a tenant session — gated entirely by a
-- secret, high-entropy share token. This mirrors create_business (0000) as the
-- app's lone SECURITY DEFINER function: tiny, one keyed lookup, one returned value.
--
-- It returns the payload ONLY when the token matches a document that is shared and
-- not revoked — never the row id, business, project, or token, so there is nothing
-- to enumerate and nothing cross-tenant to reach. RLS on `documents` is unchanged;
-- this function is the only way document data leaves the tenant boundary.
--
-- GRANT EXECUTE to `anon` (the public page calls it with the Supabase anon client,
-- no session) and to `authenticated`. The token is the whole authorization.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_shared_document(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT payload
  FROM public.documents
  WHERE share_token = p_token
    AND shared_at IS NOT NULL
    AND revoked_at IS NULL
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.get_shared_document(text) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_shared_document(text) TO anon, authenticated;