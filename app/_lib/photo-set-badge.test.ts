/**
 * The photo-set review badge (revamp-photo-advisor): status + pending count → analyzing / retry /
 * N to review / no action. The count is real (never fabricated).
 */

import { describe, expect, it } from "vitest";
import { photoSetBadge, photoSetBadgeLabel } from "./photo-set-badge";

describe("photoSetBadge", () => {
  it("is analyzing while a run is in flight, regardless of count", () => {
    expect(photoSetBadge("analyzing", 0)).toEqual({ kind: "analyzing" });
    expect(photoSetBadgeLabel(photoSetBadge("analyzing", 3))).toBe("analyzing…");
  });

  it("offers retry when the run failed", () => {
    expect(photoSetBadge("failed", 0).kind).toBe("failed");
    expect(photoSetBadgeLabel(photoSetBadge("failed", 0))).toMatch(/retry/i);
  });

  it("reads N to review when a done set has pending suggestions", () => {
    expect(photoSetBadge("done", 2)).toEqual({ kind: "review", count: 2 });
    expect(photoSetBadgeLabel(photoSetBadge("done", 2))).toBe("2 to review");
  });

  it("reads no action when a done set has none", () => {
    expect(photoSetBadge("done", 0)).toEqual({ kind: "none" });
    expect(photoSetBadgeLabel(photoSetBadge("done", 0))).toBe("No action");
  });
});
