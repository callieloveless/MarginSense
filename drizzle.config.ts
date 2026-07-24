import { readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config. Schema lives in `src/db/schema.ts`; generated migrations go to
 * `src/db/migrations/`. Migrations are forward-only and versioned in the repo
 * (constitution §6.4). RLS policy SQL is appended to the generated migration files so
 * schema and per-business policies are versioned together.
 */

/**
 * Read `DATABASE_URL` from the environment, falling back to `.env.local`.
 *
 * Next.js loads `.env.local` automatically; **drizzle-kit does not**, so `npm run db:migrate`
 * otherwise fails with `url: ''` even though the app itself is perfectly configured. Parsed by
 * hand rather than adding a dotenv dependency for one variable. The value is never logged.
 */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("DATABASE_URL=")) continue;
      // Strip optional surrounding quotes, as dotenv would.
      return trimmed.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local — fall through to the empty string and let drizzle-kit say so.
  }
  return "";
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Set in the environment or `.env.local`; never committed (techstack §7).
    url: databaseUrl(),
  },
});
