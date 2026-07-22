import { defineConfig } from "vitest/config";

/**
 * Opt-in RLS suite: proves the database's Row-Level Security policies themselves, against
 * a real Postgres. Run with `npm run test:rls` and a `DATABASE_URL` pointing at a
 * migrated database with two seeded businesses. Kept out of the default unit run (which
 * needs no infra) via a distinct file suffix.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.rls.test.ts"],
    environment: "node",
  },
});
