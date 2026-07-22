import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config. Schema lives in `src/db/schema.ts`; generated migrations go to
 * `src/db/migrations/`. Migrations are forward-only and versioned in the repo
 * (constitution §6.4). RLS policy SQL is appended to the generated migration files so
 * schema and per-business policies are versioned together.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Set in the environment; never committed (techstack §7).
    url: process.env.DATABASE_URL ?? "",
  },
});
