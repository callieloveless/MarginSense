/**
 * Code Finder tests (add-code-finder), against the mock port with a canned code result — no key,
 * no network. What they hold:
 *
 * - a sourced code becomes a `pending` `code_ref` suggestion with its source and compliance note;
 * - an **unsourced** code is dropped (§7 — never a citation it can't source);
 * - the result set is capped at MAX_CODE_RESULTS (no phone-queue flood);
 * - **no `estimate_line_item` is ever proposed** (a code is a fact; an unpriced permit line would
 *   understate the job's cost);
 * - the post frames compliance as cost/hour impact;
 * - a composed run's `photoStorageKey` rides onto each `code_ref`;
 * - every run carries the licensed-professional disclaimer.
 */

import { describe, expect, it } from "vitest";
import { createMockModelPort } from "../../ai";
import { buildProjectSnapshot, type ProjectSnapshot } from "../../context";
import { codeFinderTool } from "./code-finder";
import { MAX_CODE_RESULTS } from "./suggestions";
import { type CodeFinderInput, type CodeResult } from "./schema";
import { PHYSICAL_WORK_DISCLAIMER } from "../disclaimer";

const SOURCE = "https://codes.iccsafe.org/content/IRC2021";

const result: CodeResult = {
  codes: [
    {
      code: "IRC R806.2",
      requirement: "Net free ventilating area not less than 1/150 of the vented space.",
      jurisdiction: "Travis County, TX",
      sourceUrl: `${SOURCE}/chapter-8`,
      complianceNote: "Adding soffit vents typically needs a permit and a final inspection.",
    },
    {
      code: "IRC R507.2",
      requirement: "Deck ledger connection to the band joist per Table R507.2.",
      sourceUrl: `${SOURCE}/chapter-5`,
    },
    // Unsourced — must be dropped (§7).
    { code: "Local amendment 12-4", requirement: "Something the model couldn't source." },
  ],
};

function snapshot(): ProjectSnapshot {
  return buildProjectSnapshot({ projectId: "p-1", entries: [], conversation: [] });
}

function run(opts: { input?: Partial<CodeFinderInput>; result?: CodeResult } = {}) {
  const ai = createMockModelPort({ result: opts.result ?? result });
  return codeFinderTool.run({
    snapshot: snapshot(),
    input: { query: "attic ventilation requirements", location: "Travis County, TX", ...opts.input },
    ai,
  });
}

describe("Code Finder — sourced code references", () => {
  it("proposes each sourced code as a pending code_ref with its source and note", async () => {
    const out = await run();
    const suggestions = out.suggestions ?? [];

    // Two of the three canned codes are sourced; the unsourced one is dropped.
    expect(suggestions).toHaveLength(2);
    expect(suggestions.every((s) => s.target === "context_entry")).toBe(true);

    const first = suggestions[0]!.payload as { kind: string; payload: Record<string, unknown> };
    expect(first.kind).toBe("code_ref");
    expect(first.payload.code).toBe("IRC R806.2");
    expect(first.payload.citation).toMatch(/ventilating area/);
    expect(first.payload.jurisdiction).toBe("Travis County, TX");
    expect(String(first.payload.sourceUrl)).toContain("iccsafe.org");
    expect(String(first.payload.complianceNote)).toMatch(/permit/);
  });

  it("drops a code with no source URL", async () => {
    const out = await run();
    const codes = (out.suggestions ?? []).map(
      (s) => (s.payload as { payload: { code: string } }).payload.code,
    );
    expect(codes).not.toContain("Local amendment 12-4");
  });

  it("caps the proposals at MAX_CODE_RESULTS", async () => {
    const many: CodeResult = {
      codes: Array.from({ length: MAX_CODE_RESULTS + 3 }, (_, i) => ({
        code: `IRC ${i}`,
        requirement: `Requirement ${i}.`,
        sourceUrl: `${SOURCE}/s${i}`,
      })),
    };
    const out = await run({ result: many });
    expect(out.suggestions ?? []).toHaveLength(MAX_CODE_RESULTS);
    expect(out.output.codes).toHaveLength(MAX_CODE_RESULTS);
  });
});

describe("Code Finder — never a line item, always on the number", () => {
  it("proposes no estimate line item and no cost-bearing payload", async () => {
    const out = await run();
    for (const s of out.suggestions ?? []) {
      expect(s.target).toBe("context_entry");
      expect(JSON.stringify(s.payload)).not.toMatch(/priceCents|unitCostCents|laborMinutes/);
    }
  });

  it("frames compliance as the job's cost and crew hours", async () => {
    const out = await run();
    expect(out.message?.body).toMatch(/cost and crew hours|profit per hour/i);
    expect(out.message?.body).toMatch(/permit/i);
  });
});

describe("Code Finder — composed traceability and safety", () => {
  it("carries the photo key onto each code_ref when composed off a finding", async () => {
    const out = await run({ input: { photoStorageKey: "biz-a/p-1/photo-9.jpg" } });
    for (const s of out.suggestions ?? []) {
      const payload = (s.payload as { payload: Record<string, unknown> }).payload;
      expect(payload.photoStorageKey).toBe("biz-a/p-1/photo-9.jpg");
    }
  });

  it("omits the photo key on a standalone run", async () => {
    const out = await run();
    const payload = ((out.suggestions ?? [])[0]!.payload as { payload: Record<string, unknown> }).payload;
    expect(payload.photoStorageKey).toBeUndefined();
  });

  it("carries the disclaimer on every run, including an empty result", async () => {
    const found = await run();
    const empty = await run({ result: { codes: [] } });
    expect(found.message?.disclaimer).toBe(PHYSICAL_WORK_DISCLAIMER);
    expect(empty.message?.disclaimer).toBe(PHYSICAL_WORK_DISCLAIMER);
    expect(empty.suggestions ?? []).toHaveLength(0);
    expect(empty.message?.body).toMatch(/didn't find a sourced local code/i);
  });

  it("says the jurisdiction wasn't narrowed with no location", async () => {
    const out = await run({ input: { location: undefined }, result: { codes: [] } });
    expect(out.message?.body).toMatch(/didn't find/i);
  });

  it("rejects empty input at the boundary", () => {
    expect(codeFinderTool.inputSchema.safeParse({ query: "" }).success).toBe(false);
  });
});
