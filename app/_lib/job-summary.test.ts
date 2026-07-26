/**
 * The hub's pure presentation helpers (revamp-project-hub): the identity sub-line is built from
 * only the set fields, and the two tools-grid badges are shown only when a real count/status backs
 * them — never fabricated (constitution §6).
 */

import { describe, expect, it } from "vitest";
import { documentBadge, jobSubline, photoBadge } from "./job-summary";

describe("jobSubline", () => {
  it("joins only the fields that are set, in order", () => {
    expect(
      jobSubline({ address: "12 Oak St", jobType: "Kitchen", crewSize: "3", startWindow: "Week of Oct 13" }),
    ).toBe("12 Oak St · Kitchen · 3 crew · Week of Oct 13");
  });

  it("omits unset fields with no placeholder", () => {
    expect(jobSubline({ address: "12 Oak St", jobType: "Kitchen", crewSize: null, startWindow: null })).toBe(
      "12 Oak St · Kitchen",
    );
  });

  it("shows 'Just me' verbatim rather than '... crew'", () => {
    expect(jobSubline({ address: null, jobType: null, crewSize: "Just me", startWindow: null })).toBe("Just me");
  });

  it("returns null when nothing is set", () => {
    expect(jobSubline({ address: null, jobType: null, crewSize: null, startWindow: null })).toBeNull();
  });
});

describe("photoBadge", () => {
  it("shows the count when storage is ready and there are photos", () => {
    expect(photoBadge(true, 1)).toBe("1 photo");
    expect(photoBadge(true, 4)).toBe("4 photos");
  });

  it("shows no badge when storage is not ready or there are no photos", () => {
    expect(photoBadge(false, 4)).toBeNull();
    expect(photoBadge(true, 0)).toBeNull();
  });
});

describe("documentBadge", () => {
  const at = new Date("2026-07-26T00:00:00Z");

  it("reads 'Shared' when a live shared document exists", () => {
    expect(documentBadge([{ sharedAt: at, revokedAt: null }])).toBe("Shared");
  });

  it("reads 'Draft' when a document exists but none is live", () => {
    expect(documentBadge([{ sharedAt: null, revokedAt: null }])).toBe("Draft");
    // A shared-then-revoked document is no longer live → Draft, not Shared.
    expect(documentBadge([{ sharedAt: at, revokedAt: at }])).toBe("Draft");
  });

  it("shows no badge when there is no document", () => {
    expect(documentBadge([])).toBeNull();
  });
});
