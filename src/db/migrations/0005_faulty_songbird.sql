ALTER TABLE "tool_runs" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_runs" ADD COLUMN "completed_at" timestamp with time zone;