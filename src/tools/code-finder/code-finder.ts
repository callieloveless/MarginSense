/**
 * Code Finder (add-code-finder) — local building codes, on demand and composed off a finding. It
 * web-searches for the **local** code relevant to a question, proposes a focused set of sourced
 * `code_ref` entries, and posts a summary to the one job conversation. Reads only the frozen
 * snapshot, its validated input, and the model port — no DB handle (§5).
 *
 * What keeps it on the product's spine: a code is only worth surfacing because of what it *costs*
 * the job. A permit, an inspection, or a licensed trade is crew hours and dollars the estimate may
 * not include — so the post frames each compliance note as its impact on the job, not as a bare
 * citation, and points the user at Material Finder to price it. Code Finder writes **no line item**
 * (an unpriced permit line would roll up as $0 and overstate profit — the trap 8b avoids).
 *
 * Physical-work / code advice carries the shared licensed-professional disclaimer (§5, §7), and a
 * code lookup is never presented as an authoritative inspection.
 */

import { WEB_SEARCH_TOOL } from "../../ai";
import { type ContextEntryView, type ProjectSnapshot } from "../../context";
import { type ProposedSuggestion, type Tool } from "../contract";
import { PHYSICAL_WORK_DISCLAIMER } from "../disclaimer";
import {
  inputSchema,
  outputSchema,
  codeResultSchema,
  type CodeFinderInput,
  type CodeFinderOutput,
  type CodeResult,
} from "./schema";
import { codeSuggestion, sourcedCodes } from "./suggestions";

const SYSTEM = [
  "You are Code Finder for a trade contractor. Find the LOCAL building code that applies to the",
  "question — prefer the jurisdiction given, and the adopted local amendments over a generic model",
  "code. Return the MOST IMPORTANT few requirements, not a survey. Cite the exact code and section",
  "and the source URL you read it from; never state a code you cannot source. For each, say the",
  "real-world consequence in plain words — whether it needs a PERMIT, an INSPECTION, or a licensed",
  "trade — because that is time and money the contractor must put in the estimate. You are not an",
  "authoritative inspection; say what the code requires, not that the job passes. Record your",
  "answer with the result tool.",
].join(" ");

/** A compact read-only description of what the job already knows, to sharpen the search. */
function contextLines(entries: readonly ContextEntryView[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    if (e.kind === "finding" || e.kind === "fact" || e.kind === "code_ref") {
      lines.push(`- ${e.kind}: ${JSON.stringify(e.payload)}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "(no context recorded yet)";
}

function buildPrompt(snapshot: ProjectSnapshot, input: CodeFinderInput): string {
  const location = input.location
    ? `Jurisdiction: ${input.location}. Use its adopted code and local amendments.`
    : "No jurisdiction given — search the common model code and say the local jurisdiction wasn't narrowed.";
  return [
    `Code question: "${input.query}".`,
    location,
    "",
    "What the job already knows:",
    contextLines(snapshot.entries),
  ].join("\n");
}

/** Group the sourced codes into a human summary — each framed as its cost/hour consequence, with
 * a Material Finder handoff when a permit/material cost is implied. Plain text: the conversation
 * renders bodies verbatim (no markdown). */
function summarize(codes: ReturnType<typeof sourcedCodes>, input: CodeFinderInput): string {
  if (codes.length === 0) {
    const where = input.location ? ` for ${input.location}` : "";
    return `Code Finder didn't find a sourced local code${where} for that. Try a more specific question, or add the jurisdiction.`;
  }

  const blocks = codes.map((c) => {
    const where = c.jurisdiction ? ` (${c.jurisdiction})` : "";
    const note = c.complianceNote ? `\n  Impact: ${c.complianceNote}` : "";
    return `- ${c.code}${where}: ${c.requirement}${note}\n  Source: ${c.sourceUrl}`;
  });

  const anyConsequence = codes.some((c) => c.complianceNote);
  const tail = anyConsequence
    ? "These add cost and crew hours — if a permit, inspection, or licensed trade isn't already in your estimate, the job's profit per hour is lower than it looks. Price the added work (Material Finder can help) before you quote."
    : "Check these against your estimate before you quote.";

  return ["Code Finder found the local code that applies:", "", blocks.join("\n"), "", tail].join("\n");
}

export const codeFinderTool: Tool<CodeFinderInput, CodeFinderOutput> = {
  name: "code-finder",
  title: "Code Finder",
  inputSchema,
  outputSchema,
  async run(ctx) {
    const response = await ctx.ai.complete({
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(ctx.snapshot, ctx.input) }],
      serverTools: [WEB_SEARCH_TOOL],
      resultSchema: codeResultSchema,
    });
    // The port already validated `result` against `codeResultSchema`; read it directly.
    const result = response.result as CodeResult;

    // Only sourced codes, capped — no unsourced citation, no phone-queue flood (§7).
    const codes = sourcedCodes(result.codes);
    const suggestions: ProposedSuggestion[] = codes.map((c) =>
      codeSuggestion(c, ctx.input.photoStorageKey),
    );

    const output: CodeFinderOutput = { codes };

    return {
      output,
      suggestions,
      message: { body: summarize(codes, ctx.input), disclaimer: PHYSICAL_WORK_DISCLAIMER },
    };
  },
};
