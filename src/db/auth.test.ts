/**
 * Session → business resolution tests (constitution §6.3, §7): the server resolves the
 * business from the session's identity only, and never from client-supplied data.
 */

import { describe, expect, it } from "vitest";
import { resolveBusinessId, type UserBusinessLookup } from "./auth";

function lookupOf(map: Record<string, string>): UserBusinessLookup {
  return {
    async businessIdForAuthId(authUserId) {
      return map[authUserId] ?? null;
    },
  };
}

describe("resolveBusinessId", () => {
  it("maps an authenticated user to their business", async () => {
    const lookup = lookupOf({ "auth-1": "biz-a" });
    expect(await resolveBusinessId({ authUserId: "auth-1" }, lookup)).toBe("biz-a");
  });

  it("returns null when signed out", async () => {
    const lookup = lookupOf({ "auth-1": "biz-a" });
    expect(await resolveBusinessId({ authUserId: null }, lookup)).toBeNull();
  });

  it("returns null when the user has no business yet (create-business step)", async () => {
    const lookup = lookupOf({});
    expect(await resolveBusinessId({ authUserId: "new-user" }, lookup)).toBeNull();
  });
});
