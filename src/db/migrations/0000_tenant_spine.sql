CREATE TYPE "public"."project_status" AS ENUM('active', 'complete', 'archived');--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"trade_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"client_name" text NOT NULL,
	"address" text,
	"scope" text,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_id_unique" UNIQUE("auth_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- ============================================================================
-- Row-Level Security (constitution §6.3) — versioned with the schema it protects.
-- Every business-owned table is restricted to the authenticated user's business.
-- The business is resolved from auth.uid() via the users table, never from client
-- input. RLS ships in the SAME migration as the tables — no unprotected window.
-- ============================================================================

-- Resolve the caller's business_id from their auth identity. SECURITY DEFINER so it
-- can read `users` while `users` itself is under RLS (avoids policy recursion); search
-- path is pinned for safety.
CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_id FROM public.users WHERE auth_id = auth.uid()
$$;--> statement-breakpoint

ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- A business is visible only to its own members.
CREATE POLICY "businesses_same_business" ON "businesses"
  FOR ALL
  USING ("id" = public.current_business_id())
  WITH CHECK ("id" = public.current_business_id());--> statement-breakpoint

-- User rows are visible only within the same business.
CREATE POLICY "users_same_business" ON "users"
  FOR ALL
  USING ("business_id" = public.current_business_id())
  WITH CHECK ("business_id" = public.current_business_id());--> statement-breakpoint

-- Projects: read and write restricted to the caller's business.
CREATE POLICY "projects_same_business" ON "projects"
  FOR ALL
  USING ("business_id" = public.current_business_id())
  WITH CHECK ("business_id" = public.current_business_id());--> statement-breakpoint

-- Bootstrap the very first business + user for a freshly signed-up auth identity.
-- This is the ONLY businesses/users insert path (constitution §5 spirit: deliberate,
-- server-controlled). SECURITY DEFINER so it can insert before the caller has a
-- business (current_business_id() is still null at that moment). Refuses to run twice.
CREATE OR REPLACE FUNCTION public.create_business(p_name text, p_trade_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_business_id uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'create_business requires an authenticated user';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE auth_id = v_auth) THEN
    RAISE EXCEPTION 'user already belongs to a business';
  END IF;
  INSERT INTO public.businesses (name, trade_type)
    VALUES (p_name, p_trade_type)
    RETURNING id INTO v_business_id;
  INSERT INTO public.users (auth_id, business_id)
    VALUES (v_auth, v_business_id);
  RETURN v_business_id;
END;
$$;
