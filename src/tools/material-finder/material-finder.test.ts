/**
 * Unit tests for Material Finder (add-material-finder). All offline against the #7a mock port
 * returning canned structured materials + citations — no network, no key. They prove: query and
 * estimate modes propose sourced options; options are line items when there's an active estimate
 * and context entries when not; an unsourced option is dropped; dedup skips a repeat option; the
 * conversation post carries source links; manual add needs no model; and nothing commits (every
 * proposal is a `pending` suggestion the runner records, never an accept).
 */

import { describe, expect, it } from "vitest";
import { buildProjectSnapshot } from "../../context";
import { createMockModelPort } from "../../ai";
import {
  dispatch,
  type DispatchDeps,
  type PendingSuggestionKey,
} from "../index";
import {
  manualMaterialSuggestions,
  materialFinderTool,
  searchOptionSuggestions,
  type MaterialResult,
} from "./index";

const ESTIMATE_ID = "est-1";

/** A canned two-need, comparable-options result (one option deliberately unsourced). */
const CANNED: MaterialResult = {
  needs: [
    {
      need: "2x4x8 framing studs",
      options: [
        { name: "SPF 2x4x8 stud", priceCents: 387, unit: "each", supplier: "Home Depot", sourceUrl: "https://homedepot.com/p/1" },
        { name: "Premium 2x4x8 stud", priceCents: 512, unit: "each", supplier: "Lowe's", sourceUrl: "https://lowes.com/p/2" },
        { name: "Unsourced stud", priceCents: 300, unit: "each" }, // no sourceUrl → must be dropped
      ],
    },
    {
      need: "construction adhesive",
      options: [{ name: "PL Premium 10oz", priceCents: 699, unit: "tube", sourceUrl: "https://homedepot.com/p/3" }],
    },
  ],
};

function snapshot(activeEstimateId: string | null) {
  return buildProjectSnapshot({
    projectId: "p1",
    entries: [{ id: "e1", kind: "fact", payload: { label: "Scope", value: "Frame a wall" }, author: "user" }],
    conversation: [],
    activeEstimateId,
  });
}

/** A fake lifecycle adapter over the mock port, mirroring the platform's dispatch harness. */
function makeDeps(activeEstimateId: string | null, pending: PendingSuggestionKey[] = []) {
  let n = 0;
  const suggestions: Array<Record<string, unknown> & { id: string }> = [];
  const messages: Array<Record<string, unknown> & { id: string }> = [];
  const deps: DispatchDeps = {
    getTool: () => materialFinderTool as never,
    ai: createMockModelPort({ result: CANNED, citations: [{ url: "https://homedepot.com/p/1" }] }),
    buildSnapshot: async () => snapshot(activeEstimateId),
    ports: {
      async startToolRun() {
        return { id: `run-${++n}` };
      },
      async completeToolRun() {},
      async listPendingSuggestions() {
        return pending;
      },
      async createSuggestion(input) {
        const id = `sug-${++n}`;
        suggestions.push({ id, ...input });
        return { id };
      },
      async postMessage(input) {
        const id = `msg-${++n}`;
        messages.push({ id, ...input });
        return { id };
      },
    },
  };
  return { deps, suggestions, messages };
}

const queryReq = { toolName: "material-finder", projectId: "p1", input: { mode: "query", query: "framing studs" } };

describe("Material Finder — search proposes comparable, sourced options", () => {
  it("query mode: sourced options become line items when there is an active estimate", async () => {
    const { deps, suggestions, messages } = makeDeps(ESTIMATE_ID);
    const outcome = await dispatch(queryReq, deps);

    // 2 sourced studs + 1 adhesive = 3; the unsourced stud is dropped.
    expect(outcome.createdSuggestionIds).toHaveLength(3);
    expect(suggestions).toHaveLength(3);
    for (const s of suggestions) {
      expect(s).toMatchObject({ target: "estimate_line_item", targetEstimateId: ESTIMATE_ID });
      expect((s.payload as { category: string }).category).toBe("material");
    }
    // The post carries the source links + a verify note.
    const body = String(messages[0]?.body ?? "");
    expect(body).toContain("https://homedepot.com/p/1");
    expect(body).toMatch(/confirm with the supplier/i);
  });

  it("no active estimate: sourced options become material context entries (no line items)", async () => {
    const { deps, suggestions } = makeDeps(null);
    const outcome = await dispatch(queryReq, deps);

    expect(outcome.createdSuggestionIds).toHaveLength(3);
    for (const s of suggestions) {
      expect(s.target).toBe("context_entry");
      expect((s.payload as { kind: string }).kind).toBe("material");
    }
  });

  it("estimate mode runs the same way and proposes per-need options", async () => {
    const { deps, suggestions } = makeDeps(ESTIMATE_ID);
    const outcome = await dispatch(
      { toolName: "material-finder", projectId: "p1", input: { mode: "estimate" } },
      deps,
    );
    expect(outcome.createdSuggestionIds).toHaveLength(3);
    expect(suggestions.every((s) => s.target === "estimate_line_item")).toBe(true);
  });

  it("never proposes an unsourced price (the third stud is dropped from output too)", async () => {
    const { deps } = makeDeps(ESTIMATE_ID);
    const outcome = await dispatch(queryReq, deps);
    const output = outcome.output as MaterialResult;
    const studOptions = output.needs.find((nd) => nd.need.includes("stud"))?.options ?? [];
    expect(studOptions).toHaveLength(2); // unsourced one filtered out of output
    expect(studOptions.every((o) => (o.sourceUrl ?? "") !== "")).toBe(true);
  });

  it("skips an option identical to one already pending (dedup across repeat searches)", async () => {
    // Seed the queue with the first stud's line-item suggestion (key = target + estimate + payload).
    const already: PendingSuggestionKey = {
      target: "estimate_line_item",
      targetEstimateId: ESTIMATE_ID,
      payload: { category: "material", description: "SPF 2x4x8 stud", quantity: 1, unitCostCents: 387 },
    };
    const { deps, suggestions } = makeDeps(ESTIMATE_ID, [already]);
    const outcome = await dispatch(queryReq, deps);

    expect(outcome.skippedDuplicates).toBe(1);
    expect(suggestions).toHaveLength(2); // the duplicate stud is not restacked
  });
});

describe("Material Finder — option → suggestion mapping", () => {
  it("drops an option with no source", () => {
    expect(searchOptionSuggestions({ name: "x", priceCents: 100, unit: "each" }, ESTIMATE_ID)).toEqual([]);
  });

  it("a hand-added material is always a context entry, plus a line when there's an estimate", () => {
    const material = { name: "Deck screws 5lb", priceCents: 3499, unit: "box", supplier: "Fastenal" };

    const withEstimate = manualMaterialSuggestions(material, ESTIMATE_ID);
    expect(withEstimate.map((s) => s.target)).toEqual(["context_entry", "estimate_line_item"]);
    expect(withEstimate[1]).toMatchObject({ targetEstimateId: ESTIMATE_ID });

    const withoutEstimate = manualMaterialSuggestions(material, null);
    expect(withoutEstimate.map((s) => s.target)).toEqual(["context_entry"]);
    // No source is demanded of a hand-added material — the user is the source.
    expect((withoutEstimate[0]?.payload as { payload: { sourceUrl?: string } }).payload.sourceUrl).toBeUndefined();
  });
});
