/**
 * Material Finder (add-material-finder) — the first real tool. It web-searches for materials,
 * prices, and suppliers and proposes **comparable, sourced options** into the job, then posts a
 * summary to the one conversation. Two modes: a free-text `query` (one need) or `estimate`
 * (everything for the active estimate). It reads only the frozen snapshot and the model port —
 * no DB handle — so, like every tool, it can only produce `pending` suggestions (§5).
 *
 * The structured result + citations come from the port's `resultSchema` capability (#7a): the
 * model runs `web_search`, then records a `{ needs: [{ need, options }] }` result we validate.
 * Each option becomes a suggestion via `./suggestions` (a line item when there's an active
 * estimate — so options compare by profit-per-hour — else a context entry); an option with no
 * `sourceUrl` is dropped (§7). Material advice carries **citations + a verify-with-supplier
 * note**, not the licensed-professional disclaimer (that's Photo Advisor / Code Finder).
 */

import { WEB_SEARCH_TOOL } from "../../ai";
import { readResult } from "../../ai";
import { type ContextEntryView, type ProjectSnapshot } from "../../context";
import { type ProposedSuggestion, type Tool } from "../contract";
import {
  inputSchema,
  materialResultSchema,
  outputSchema,
  type MaterialFinderInput,
  type MaterialFinderOutput,
  type MaterialNeed,
} from "./schema";
import { searchOptionSuggestions } from "./suggestions";

/** A compact, read-only description of the job for the search prompt (materials/findings the
 * job already knows about bias the search toward the right products). */
function contextLines(entries: readonly ContextEntryView[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    if (e.kind === "material" || e.kind === "finding" || e.kind === "fact") {
      lines.push(`- ${e.kind}: ${JSON.stringify(e.payload)}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "(no context recorded yet)";
}

/** Build the search instruction from the mode, the query/estimate target, and the location. */
function buildPrompt(snapshot: ProjectSnapshot, input: MaterialFinderInput): string {
  const location = input.location ? `Search suppliers near: ${input.location}.` : "No specific location — search common national suppliers.";
  const target =
    input.mode === "query"
      ? `Find current products and prices for this material need: "${input.query}".`
      : "Find current products and prices for every material this estimate needs, grouped by need.";
  return [
    target,
    location,
    "For each need, return a few comparable options across suppliers so the contractor can pick the best value.",
    "Every option MUST include the source URL its price came from; omit any option you cannot source.",
    "",
    "What the job already knows:",
    contextLines(snapshot.entries),
  ].join("\n");
}

const SYSTEM = [
  "You are Material Finder for a trade contractor. Use web search to find current, real",
  "materials, prices, units, and suppliers. Prefer local suppliers when a location is given.",
  "Return a few comparable options per need. Never invent a price — every option must carry the",
  "source URL it came from. Record your answer with the result tool.",
].join(" ");

/** Group the found needs into a human summary with source links + a verify note. */
function summarize(needs: readonly MaterialNeed[]): string {
  if (needs.length === 0) return "No sourced materials were found. Try a more specific search, or add one by hand.";
  const blocks = needs.map((n) => {
    const sourced = n.options.filter((o) => (o.sourceUrl ?? "") !== "");
    if (sourced.length === 0) return `**${n.need}**: no sourced options found.`;
    const lines = sourced.map((o) => {
      const price = `$${(o.priceCents / 100).toFixed(2)}/${o.unit}`;
      const who = o.supplier ? ` — ${o.supplier}` : "";
      return `  - ${o.name}: ${price}${who} (${o.sourceUrl})`;
    });
    return `**${n.need}**\n${lines.join("\n")}`;
  });
  return [
    "Material Finder found these options:",
    "",
    blocks.join("\n"),
    "",
    "Prices are live estimates from the web — confirm with the supplier before you rely on them.",
  ].join("\n");
}

export const materialFinderTool: Tool<MaterialFinderInput, MaterialFinderOutput> = {
  name: "material-finder",
  title: "Material Finder",
  inputSchema,
  outputSchema,
  async run(ctx) {
    const response = await ctx.ai.complete({
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(ctx.snapshot, ctx.input) }],
      serverTools: [WEB_SEARCH_TOOL],
      resultSchema: materialResultSchema,
    });
    const result = readResult(response, materialResultSchema);

    // Each sourced option → a suggestion (line item when there's an active estimate, else a
    // context entry). Unsourced options are dropped by `searchOptionSuggestions`.
    const suggestions: ProposedSuggestion[] = [];
    for (const need of result.needs) {
      for (const option of need.options) {
        suggestions.push(...searchOptionSuggestions(option, ctx.snapshot.activeEstimateId));
      }
    }

    // `output` mirrors the found needs but only with sourced options (what actually got proposed).
    const output: MaterialFinderOutput = {
      needs: result.needs.map((n) => ({
        need: n.need,
        options: n.options.filter((o) => (o.sourceUrl ?? "") !== ""),
      })),
    };

    return {
      output,
      suggestions,
      message: { body: summarize(result.needs) },
    };
  },
};
