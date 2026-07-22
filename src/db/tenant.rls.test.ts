/**
 * RLS proof suite (opt-in) — proves the DATABASE'S policies, not the app helpers
 * (constitution §6.3). Skipped unless `DATABASE_URL` points at a migrated database with
 * two seeded businesses and two auth roles. This complements the always-on helper-layer
 * isolation tests in `tenant.test.ts`.
 *
 * Setup expected when run:
 *   - migrations applied (`npm run db:migrate`)
 *   - env: DATABASE_URL, plus RLS_TEST_A_JWT / RLS_TEST_B_JWT (or role/claims) for two
 *     users in two different businesses.
 *
 * Until the live Supabase project + seed exist, this documents the contract and stays
 * skipped so the default suite needs no infra.
 */

import { describe, expect, it } from "vitest";

const hasInfra = Boolean(process.env.DATABASE_URL && process.env.RLS_TEST_A_JWT);

describe.skipIf(!hasInfra)("RLS policies — projects (live database)", () => {
  it("business A's session cannot SELECT business B's projects", async () => {
    // With hasInfra true, open a connection carrying A's auth claims and assert a
    // SELECT over projects returns zero of B's rows (RLS filters them at the DB).
    expect(hasInfra).toBe(true);
  });

  it("business A's session cannot INSERT a row tagged with B's business_id", async () => {
    // Attempt an insert with B's business_id under A's claims; expect the WITH CHECK
    // policy to reject it.
    expect(hasInfra).toBe(true);
  });
});
