/**
 * Photo Advisor (add-photo-advisor) — the vision tool. One job photo plus an optional question
 * in; a diagnosis the job remembers and the repair labor it implies out, as `pending`
 * suggestions. It reads only the frozen snapshot, its validated input, and the model port — no DB
 * handle, no storage handle (§5), so the image arrives as input that the caller resolved
 * tenant-scoped.
 *
 * What makes this tool different from Material Finder: its output is **hours**, not prices. A
 * labor candidate carries minutes only, and the engine turns those into cost at the business's
 * own burdened rate — so the number that moves the red/yellow/green signal is traceable to inputs
 * the user owns (§3.4, §6.6). It never prices materials; it names them and hands them to Material
 * Finder (see `./suggestions`).
 *
 * Everything it says carries the licensed-professional, non-authoritative disclaimer (§5, §7) —
 * the runner appends it to the conversation post, so it lands in the durable record beside the
 * advice it qualifies.
 */

import { type ProposedSuggestion, type Tool } from "../contract";
import { PHYSICAL_WORK_DISCLAIMER } from "../disclaimer";
import {
  inputSchema,
  outputSchema,
  visionResultSchema,
  type PhotoAdvisorInput,
  type PhotoAdvisorOutput,
  type VisionResult,
} from "./schema";
import {
  findingSuggestion,
  isImplausibleEstimate,
  laborSuggestion,
  materialsNamed,
} from "./suggestions";

const SYSTEM = [
  "You are Photo Advisor for a trade contractor. Look at the job photo and report what you can",
  "actually see: the condition, the likely cause, and how serious it is. Mark anything",
  "structural, electrical, or otherwise dangerous as severity `safety`.",
  "For each repair, estimate the LABOR TIME in minutes for one experienced person — that",
  "estimate is the number the contractor's profit-per-hour depends on, so be realistic rather",
  "than optimistic. Name the materials a repair needs in plain words.",
  "NEVER state a price, a cost, or a dollar figure for anything: you cannot look prices up, and a",
  "guessed price would corrupt the contractor's estimate. Say what is needed; pricing is another",
  "tool's job. If the photo is unclear or you cannot tell, say so instead of guessing.",
  "Record your answer with the result tool.",
].join(" ");

/** The user turn: the question (if any), the caption (if any), and what the job already knows. */
function buildPrompt(input: PhotoAdvisorInput, hasActiveEstimate: boolean): string {
  const lines = [
    input.question
      ? `The contractor asks: "${input.question}"`
      : "Assess this job photo: what do you see, how serious is it, and what would the repair take?",
  ];
  if (input.caption) lines.push(`The photo is labelled: "${input.caption}".`);
  lines.push(
    hasActiveEstimate
      ? "Break the repair into labor tasks with realistic minutes for each."
      : "Describe the repair work; there is no active estimate to add tasks to yet.",
  );
  return lines.join("\n");
}

/**
 * The conversation post: what was seen, what the work looks like, what still needs pricing, and
 * any estimate large enough to be worth a second look.
 *
 * **Plain text, no markdown.** The conversation renders a message body verbatim, so `**bold**`
 * would show its asterisks — on the safety marker, of all places. The words carry the emphasis.
 */
function summarize(
  result: VisionResult,
  opts: { hasActiveEstimate: boolean; flagged: readonly string[] },
): string {
  if (result.findings.length === 0 && result.labor.length === 0) {
    return "Photo Advisor couldn't tell anything reliable from this photo. Try a clearer shot, or one from further back for context.";
  }

  const blocks: string[] = ["Photo Advisor looked at this photo:"];

  if (result.findings.length > 0) {
    blocks.push(
      "",
      ...result.findings.map((f) => {
        const mark =
          f.severity === "safety"
            ? "SAFETY ISSUE — "
            : f.severity === "attention"
              ? "Needs attention — "
              : "";
        return `- ${mark}${f.summary}`;
      }),
    );
  }

  if (result.labor.length > 0) {
    const hours = (minutes: number) => (minutes / 60).toFixed(1);
    blocks.push(
      "",
      opts.hasActiveEstimate
        ? "Repair labor proposed for your estimate (accept the ones you want):"
        : "Repair labor it estimates — there's no active estimate to add these to yet:",
      ...result.labor.map((l) => `- ${l.description}: ~${hours(l.laborMinutes)} hrs`),
    );
  }

  if (opts.flagged.length > 0) {
    blocks.push(
      "",
      `Worth a second look: the estimate for ${opts.flagged.join(", ")} is unusually large. If that's right, this job is a much bigger commitment than it looks — check it before you quote.`,
    );
  }

  const materials = materialsNamed(result.findings);
  if (materials.length > 0) {
    blocks.push(
      "",
      `Materials this needs: ${materials.join(", ")}. Photo Advisor can't price them — run Material Finder to get current, sourced prices and add them to the estimate.`,
    );
  }

  return blocks.join("\n");
}

export const photoAdvisorTool: Tool<PhotoAdvisorInput, PhotoAdvisorOutput> = {
  name: "photo-advisor",
  title: "Photo Advisor",
  inputSchema,
  outputSchema,
  async run(ctx) {
    const activeEstimateId = ctx.snapshot.activeEstimateId;
    const response = await ctx.ai.complete({
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(ctx.input, activeEstimateId !== null) }],
      images: [{ type: "image", mediaType: ctx.input.mediaType, dataBase64: ctx.input.imageBase64 }],
      resultSchema: visionResultSchema,
    });
    // The port already validated `result` against `visionResultSchema` (mock and real impl both
    // parse it), so read it directly rather than re-parsing the same value.
    const result = response.result as VisionResult;

    const suggestions: ProposedSuggestion[] = [];
    for (const finding of result.findings) {
      suggestions.push(findingSuggestion(finding, ctx.input.storageKey));
    }
    for (const labor of result.labor) {
      suggestions.push(...laborSuggestion(labor, activeEstimateId));
    }

    // Implausible estimates are surfaced, never dropped: the suggestion keeps the model's real
    // minutes and the post says it looks high (design §3).
    const flagged = result.labor.filter(isImplausibleEstimate).map((l) => l.description);

    const output: PhotoAdvisorOutput = {
      findings: result.findings,
      labor: result.labor,
      flaggedLabor: flagged,
      proposedLineItems: activeEstimateId !== null && result.labor.length > 0,
    };

    return {
      output,
      suggestions,
      message: {
        body: summarize(result, { hasActiveEstimate: activeEstimateId !== null, flagged }),
        disclaimer: PHYSICAL_WORK_DISCLAIMER,
      },
    };
  },
};
