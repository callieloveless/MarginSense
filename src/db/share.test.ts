/**
 * The public client-document read (add-client-document). This is the security-sensitive path — the
 * one place document data leaves the tenant boundary — so its own logic (re-validation, the
 * not-found mapping, error handling) is worth exercising directly, not just via the memory
 * backend's SQL-rule mirror.
 *
 * `@supabase/supabase-js` is mocked so the RPC's return can be scripted: a valid payload, a
 * payload that smuggles an internal field (must be refused before it reaches a client), a null
 * (wrong/unshared/revoked token), and an RPC error (a missing function — 0009 unapplied — which
 * must fail closed AND be logged, not silently 404).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The scripted RPC result for the next call. */
let rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const rpc = vi.fn(async () => rpcResult);

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc }),
}));

const OLD_ENV = { ...process.env };
let getSharedDocument: typeof import("./share").getSharedDocument;

beforeEach(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  rpc.mockClear();
  ({ getSharedDocument } = await import("./share"));
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.restoreAllMocks();
});

const validPayload = {
  businessName: "Acme",
  clientName: "Jane",
  title: "Proposal",
  preparedOn: "July 25, 2026",
  lines: [{ description: "Tile", priceCents: 180_000 }],
  subtotalCents: 180_000,
  totalCents: 180_000,
};

describe("getSharedDocument", () => {
  it("returns the validated document for a good token", async () => {
    rpcResult = { data: validPayload, error: null };
    const result = await getSharedDocument("tok");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.document.title).toBe("Proposal");
    expect(rpc).toHaveBeenCalledWith("get_shared_document", { p_token: "tok" });
  });

  it("refuses a payload that smuggles an internal field, before a client sees it", async () => {
    // The DB shouldn't contain this, but the public page must not render it if it somehow does.
    rpcResult = { data: { ...validPayload, costCents: 90_000 }, error: null };
    expect((await getSharedDocument("tok")).status).toBe("not-found");
  });

  it("maps a null result (wrong/unshared/revoked token) to not-found", async () => {
    rpcResult = { data: null, error: null };
    expect((await getSharedDocument("tok")).status).toBe("not-found");
  });

  it("fails closed AND logs when the RPC errors (e.g. migration not applied)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcResult = { data: null, error: { message: "function get_shared_document does not exist" } };

    const result = await getSharedDocument("tok");

    expect(result.status).toBe("not-found");
    // A misconfiguration must not be invisible.
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("get_shared_document RPC failed"),
      expect.stringContaining("does not exist"),
    );
    logged.mockRestore();
  });

  it("is unconfigured without Supabase env, and never calls the RPC", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    ({ getSharedDocument } = await import("./share"));
    expect((await getSharedDocument("tok")).status).toBe("unconfigured");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns not-found for an empty token without calling the RPC", async () => {
    expect((await getSharedDocument("")).status).toBe("not-found");
    expect(rpc).not.toHaveBeenCalled();
  });
});
