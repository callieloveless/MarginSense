/**
 * Unit tests for the RLS request context (constitution §6.3). These prove the SQL that
 * `withAuthenticatedTx` emits — the identity claim and the role switch — without a live
 * database, so a regression that silently stops enforcing tenancy is caught here. The
 * end-to-end proof against real policies is the opt-in `tenant.rls.test.ts` suite.
 */

import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { withAuthenticatedTx, type Db, type Tx } from "./rls";

const dialect = new PgDialect();

/** A fake Db whose transaction records every statement executed inside it. */
function fakeDb(recorder: SQL[]): Db {
  const tx = {
    execute(query: SQL) {
      recorder.push(query);
      return Promise.resolve([]);
    },
  } as unknown as Tx;
  return {
    transaction<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
      return fn(tx);
    },
  } as unknown as Db;
}

describe("withAuthenticatedTx", () => {
  it("sets the verified user's sub claim, then drops to the authenticated role", async () => {
    const recorder: SQL[] = [];
    const db = fakeDb(recorder);

    const result = await withAuthenticatedTx(db, "user-123", async () => "done");

    expect(result).toBe("done");
    expect(recorder).toHaveLength(2);

    const first = dialect.sqlToQuery(recorder[0]!);
    expect(first.sql).toContain("request.jwt.claims");
    // The sub is passed as a bound parameter (not string-concatenated), and carries the
    // verified user id — never client input.
    expect(first.params[0]).toBe(JSON.stringify({ sub: "user-123", role: "authenticated" }));

    // Second statement drops to the authenticated role (ordering: identity is published
    // in statement 0, before this privilege drop in statement 1).
    const second = dialect.sqlToQuery(recorder[1]!);
    expect(second.sql).toContain("set_config");
    expect(second.sql).toContain("authenticated");
    expect(second.sql).not.toContain("request.jwt.claims");
  });

  it("refuses to run without an authenticated user id (fails closed)", async () => {
    const recorder: SQL[] = [];
    const fn = vi.fn();
    await expect(withAuthenticatedTx(fakeDb(recorder), "", fn)).rejects.toThrow(
      /authenticated user id/i,
    );
    expect(fn).not.toHaveBeenCalled();
    expect(recorder).toHaveLength(0);
  });
});
