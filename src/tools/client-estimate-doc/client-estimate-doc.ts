/**
 * Client Estimate Doc (add-client-estimate-doc) — the last v1 tool. It turns a finished internal
 * estimate into the clean, client-facing proposal (10a's document), with none of the internal
 * machinery on it. It reads only its validated input and the model port — no DB handle (§5) — and
 * returns the finished `ClientDocument` as its typed **output**: a document, not a suggestion (a
 * proposal isn't accept/dismiss).
 *
 * The numbers are the pure projection's (`src/estimate/`): the single solved total allocated across
 * the lines, exact to the cent. When AI is configured the tool also writes a short **scope
 * narrative**; when it isn't, the document generates deterministically with no narrative. The
 * narrative is the one free-text path 10a can't structurally constrain, so its prompt forbids any
 * cost/margin/profit/hour figure — and the generated document is created **unshared** so the owner
 * reviews it before any client sees it (the action's job).
 */

import { projectClientDocument, type ClientProjectionInput } from "../../estimate";
import { type ModelPort } from "../../ai";
import { type Tool } from "../contract";
import {
  inputSchema,
  outputSchema,
  type ClientEstimateDocInput,
  type ClientEstimateDocOutput,
} from "./schema";

const NARRATIVE_SYSTEM = [
  "You write a short, warm scope paragraph for a trade contractor's client-facing proposal — two to",
  "four sentences describing the work in plain language a homeowner understands. Do NOT state any",
  "price, cost, margin, profit, hourly figure, or number of hours — the proposal shows prices",
  "separately, and internal figures must never appear. Do not invent work beyond what's listed.",
  "Return only the paragraph, no heading.",
].join(" ");

/** Ask the model for a scope narrative from the line descriptions. Returns undefined (no narrative)
 * if the model gives nothing usable — the document is fine without one. */
async function writeNarrative(
  ai: ModelPort,
  input: ClientEstimateDocInput,
): Promise<string | undefined> {
  const work = input.lines.map((l) => `- ${l.description}`).join("\n");
  const response = await ai.complete({
    system: NARRATIVE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Write the scope paragraph for "${input.title}" for ${input.clientName}. The work:\n${work}`,
      },
    ],
  });
  const text = response.text.trim();
  return text === "" ? undefined : text;
}

/** Build the projection input from the tool input (+ an optional narrative). */
function projectionInput(
  input: ClientEstimateDocInput,
  intro: string | undefined,
): ClientProjectionInput {
  return {
    businessName: input.businessName,
    clientName: input.clientName,
    title: input.title,
    preparedOn: input.preparedOn,
    lines: input.lines,
    totalPriceCents: input.totalPriceCents,
    ...(input.tradeType !== undefined ? { tradeType: input.tradeType } : {}),
    ...(input.serviceArea !== undefined ? { serviceArea: input.serviceArea } : {}),
    ...(input.license !== undefined ? { license: input.license } : {}),
    ...(input.clientAddress !== undefined ? { clientAddress: input.clientAddress } : {}),
    ...(input.terms !== undefined ? { terms: input.terms } : {}),
    ...(input.taxRateBp !== undefined ? { taxRateBp: input.taxRateBp } : {}),
    ...(intro !== undefined ? { intro } : {}),
  };
}

export const clientEstimateDocTool: Tool<ClientEstimateDocInput, ClientEstimateDocOutput> = {
  name: "client-estimate-doc",
  title: "Client Estimate Doc",
  inputSchema,
  outputSchema,
  async run(ctx) {
    // The narrative is optional; write it first so the projection can carry it. A model failure
    // must not fail the whole document — fall back to no narrative.
    let intro: string | undefined;
    if (ctx.input.writeNarrative) {
      try {
        intro = await writeNarrative(ctx.ai, ctx.input);
      } catch {
        intro = undefined;
      }
    }

    const projected = projectClientDocument(projectionInput(ctx.input, intro));
    if (!projected.ok) {
      // The estimate can't become a document yet (unpriced, per-line override, no priced work).
      throw new Error(projected.error);
    }

    return {
      output: projected.value,
      message: {
        body: intro
          ? `Drafted a client document for "${ctx.input.title}", with a scope summary. Review it before you share.`
          : `Drafted a client document for "${ctx.input.title}". Review it before you share.`,
      },
    };
  },
};
