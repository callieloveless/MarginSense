/**
 * RLS proof suite (opt-in) — proves the DATABASE'S policies over the real Drizzle
 * connection (constitution §6.3), including the `withAuthenticatedTx` request context.
 * Skipped unless `DATABASE_URL` points at a migrated database seeded with two businesses
 * and two users (their auth ids in `RLS_TEST_A_AUTH` / `RLS_TEST_B_AUTH`). Complements the
 * always-on helper-layer isolation tests in `tenant.test.ts`.
 *
 * Setup expected when run:
 *   - migrations applied (`npm run db:migrate`)
 *   - two businesses, each with a user; export those users' auth uuids as
 *     RLS_TEST_A_AUTH and RLS_TEST_B_AUTH, and at least one project owned by business B.
 */

import { describe, expect, it } from "vitest";

const authA = process.env.RLS_TEST_A_AUTH;
const authB = process.env.RLS_TEST_B_AUTH;
const hasInfra = Boolean(process.env.DATABASE_URL && authA && authB);

describe.skipIf(!hasInfra)("RLS policies over Drizzle (live database)", () => {
  it("a user only sees their own business's projects", async () => {
    const { getDb } = await import("./client.js");
    const { withAuthenticatedTx } = await import("./rls.js");
    const { projects } = await import("./schema.js");
    const db = getDb();

    const asA = await withAuthenticatedTx(db, authA!, (tx) => tx.select().from(projects));
    const asB = await withAuthenticatedTx(db, authB!, (tx) => tx.select().from(projects));

    // No project id is visible to both sessions.
    const idsA = new Set(asA.map((p) => p.id));
    expect(asB.some((p) => idsA.has(p.id))).toBe(false);
  });

  it("current_business_id differs per authenticated user", async () => {
    const { getDb } = await import("./client.js");
    const { businessIdForAuthUser } = await import("./rls.js");
    const db = getDb();

    const bizA = await businessIdForAuthUser(db, authA!);
    const bizB = await businessIdForAuthUser(db, authB!);
    expect(bizA).toBeTruthy();
    expect(bizB).toBeTruthy();
    expect(bizA).not.toBe(bizB);
  });
});
