/**
 * Context-module tests (add-project-context). Prove typed payload validation, the
 * accept/dismiss state machine (including idempotency so dismissed proposals never reappear
 * and a double-accept never commits twice), the effect derivation for both suggestion
 * targets, and that the project snapshot is read-only (the tool seam exposes no write path).
 */

import { describe, expect, it } from "vitest";
import {
  authorFromRow,
  authorToRow,
  buildProjectSnapshot,
  findingSeverityOf,
  nextStatus,
  parseContextPayload,
  suggestionEffect,
} from "./context";

describe("finding severity", () => {
  it("accepts each of the three severities", () => {
    for (const severity of ["safety", "attention", "note"] as const) {
      const result = parseContextPayload("finding", { summary: "Cracked joist", severity });
      expect(result.ok).toBe(true);
      if (result.ok) expect((result.value as { severity: string }).severity).toBe(severity);
    }
  });

  it("rejects a severity outside the set", () => {
    expect(parseContextPayload("finding", { summary: "Cracked joist", severity: "urgent" }).ok).toBe(
      false,
    );
  });

  it("reads a finding written before severity existed as `note`", () => {
    // Back-compat: entries and pending suggestions predating add-photo-advisor must keep
    // parsing, or an accept path would break on data already in the database.
    const result = parseContextPayload("finding", { summary: "Old finding" });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value as { severity: string }).severity).toBe("note");
  });

  it("keeps the photo reference when present, and is fine without one", () => {
    const withPhoto = parseContextPayload("finding", {
      summary: "Rot at the sill",
      severity: "safety",
      photoStorageKey: "biz-a/p-1/photo-1.jpg",
    });
    expect(withPhoto.ok).toBe(true);
    if (withPhoto.ok) {
      expect((withPhoto.value as { photoStorageKey?: string }).photoStorageKey).toBe(
        "biz-a/p-1/photo-1.jpg",
      );
    }
    expect(parseContextPayload("finding", { summary: "No photo", severity: "note" }).ok).toBe(true);
  });

  it("reads a severity defensively for display", () => {
    expect(findingSeverityOf({ severity: "safety" })).toBe("safety");
    expect(findingSeverityOf({ severity: "bogus" })).toBe("note");
    expect(findingSeverityOf({})).toBe("note");
    expect(findingSeverityOf(null)).toBe("note");
    expect(findingSeverityOf(undefined)).toBe("note");
  });
});

describe("author round-trip", () => {
  it("maps user and tool authors to and from row columns", () => {
    expect(authorToRow("user")).toEqual({ author: "user", authorTool: null });
    expect(authorToRow({ tool: "Material Finder" })).toEqual({ author: "tool", authorTool: "Material Finder" });
    expect(authorFromRow("user", null)).toBe("user");
    expect(authorFromRow("tool", "Code Finder")).toEqual({ tool: "Code Finder" });
  });
});

describe("parseContextPayload", () => {
  it("accepts a valid material payload and rejects a malformed one", () => {
    const ok = parseContextPayload("material", {
      name: "2x4 stud",
      priceCents: 385,
      unit: "each",
      supplier: "Local Lumber",
      sourceUrl: "https://example.com/2x4",
    });
    expect(ok.ok).toBe(true);

    const bad = parseContextPayload("material", { name: "2x4", priceCents: -1, unit: "each" });
    expect(bad.ok).toBe(false);
  });

  it("rejects a fact payload missing required fields", () => {
    expect(parseContextPayload("fact", { label: "" }).ok).toBe(false);
  });
});

describe("nextStatus — the state machine", () => {
  it("resolves a pending suggestion", () => {
    expect(nextStatus("pending", "accept")).toEqual({ status: "accepted", changed: true });
    expect(nextStatus("pending", "dismiss")).toEqual({ status: "dismissed", changed: true });
  });

  it("is an idempotent no-op once resolved (never re-nags, never double-commits)", () => {
    expect(nextStatus("dismissed", "accept")).toEqual({ status: "dismissed", changed: false });
    expect(nextStatus("accepted", "accept")).toEqual({ status: "accepted", changed: false });
    expect(nextStatus("accepted", "dismiss")).toEqual({ status: "accepted", changed: false });
  });
});

describe("suggestionEffect", () => {
  it("derives a context-entry commit from a valid proposal", () => {
    const result = suggestionEffect({
      target: "context_entry",
      payload: { kind: "finding", payload: { summary: "Water damage under sink" } },
      targetEstimateId: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect).toEqual({
      kind: "commit_context_entry",
      entryKind: "finding",
      // A proposal written before severity existed still commits — it reads as `note`
      // (add-photo-advisor back-compat), rather than failing validation in the accept path.
      payload: { summary: "Water damage under sink", severity: "note" },
    });
  });

  it("derives an estimate line-item add for a line-item suggestion", () => {
    const result = suggestionEffect({
      target: "estimate_line_item",
      payload: { category: "material", description: "2x4 studs", quantity: 10, unitCostCents: 385 },
      targetEstimateId: "est-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect).toEqual({
      kind: "add_estimate_line_item",
      estimateId: "est-1",
      line: { category: "material", description: "2x4 studs", quantity: 10, unitCostCents: 385 },
    });
  });

  it("fails a line-item suggestion with no target estimate", () => {
    const result = suggestionEffect({
      target: "estimate_line_item",
      payload: { category: "material", quantity: 1, unitCostCents: 100 },
      targetEstimateId: null,
    });
    expect(result.ok).toBe(false);
  });

  it("fails a context-entry suggestion whose inner payload is invalid for its kind", () => {
    const result = suggestionEffect({
      target: "context_entry",
      payload: { kind: "material", payload: { name: "x" } },
      targetEstimateId: null,
    });
    expect(result.ok).toBe(false);
  });
});

describe("buildProjectSnapshot — read-only tool seam", () => {
  it("assembles entries, conversation, and the active roll-up, frozen", () => {
    const snapshot = buildProjectSnapshot({
      projectId: "p1",
      entries: [{ id: "e1", kind: "fact", payload: { label: "Access", value: "Rear gate" }, author: "user" }],
      conversation: [{ id: "m1", author: "user", body: "Started the estimate." }],
      activeEstimate: null,
    });

    expect(snapshot.projectId).toBe("p1");
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.conversation).toHaveLength(1);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.entries)).toBe(true);
    // No write path: mutating the frozen snapshot throws in strict mode.
    expect(() => {
      (snapshot as { projectId: string }).projectId = "hacked";
    }).toThrow();
  });

  it("carries the active estimate id so a tool can target a line (null when none)", () => {
    const withEstimate = buildProjectSnapshot({
      projectId: "p1",
      entries: [],
      conversation: [],
      activeEstimateId: "est-1",
    });
    expect(withEstimate.activeEstimateId).toBe("est-1");

    // Absent id → null, matching a project with no active estimate.
    const withoutEstimate = buildProjectSnapshot({ projectId: "p2", entries: [], conversation: [] });
    expect(withoutEstimate.activeEstimateId).toBeNull();
  });
});
