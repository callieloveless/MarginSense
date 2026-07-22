CREATE TYPE "public"."tool_run_source" AS ENUM('user', 'auto', 'compose');--> statement-breakpoint
CREATE TYPE "public"."tool_run_status" AS ENUM('ok', 'error');--> statement-breakpoint
CREATE TABLE "tool_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"status" "tool_run_status" NOT NULL,
	"source" "tool_run_source" DEFAULT 'user' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "tool_run_id" uuid;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "tool_run_id" uuid;--> statement-breakpoint
ALTER TABLE "tool_runs" ADD CONSTRAINT "tool_runs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_runs" ADD CONSTRAINT "tool_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_tool_run_id_tool_runs_id_fk" FOREIGN KEY ("tool_run_id") REFERENCES "public"."tool_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_tool_run_id_tool_runs_id_fk" FOREIGN KEY ("tool_run_id") REFERENCES "public"."tool_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ============================================================================
-- Row-Level Security (constitution §6.3) — versioned with the table it protects,
-- same pattern as 0000–0003: tool_runs is restricted to the authenticated user's
-- business via public.current_business_id() (resolved from auth.uid() → users).
-- The client never supplies the business_id used for authorization. RLS ships in
-- the SAME migration as the table.
--
-- The new nullable suggestions.tool_run_id / conversation_messages.tool_run_id
-- columns need no policy change: those tables already enforce per-business RLS
-- (migration 0003), and the added column is covered by the existing row policy.
-- ============================================================================
ALTER TABLE "tool_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "tool_runs_same_business" ON "tool_runs"
  FOR ALL
  USING ("business_id" = public.current_business_id())
  WITH CHECK ("business_id" = public.current_business_id());--> statement-breakpoint

-- Privileges for the `authenticated` role (RLS decides WHICH rows; grants decide table
-- access at all). The app drops to `authenticated` per transaction (src/db/rls.ts).
GRANT SELECT, INSERT, UPDATE, DELETE ON "tool_runs" TO authenticated;