/**
 * The reference / echo tool (add-tool-platform) — the trivial tool that proves the whole
 * platform wire end to end with no external dependency: input validated → read-only snapshot
 * read → the **mock** model port asked for a one-line summary → a typed `output` → one
 * proposed `fact` suggestion → a conversation post → a `tool_run` logged and linked. It is not
 * a real user tool; the real tools (#7–#10) replace it on the same contract.
 */

import { z } from "zod";
import { type Tool } from "./contract";

const inputSchema = z.object({
  /** A short job note to echo back as a fact. */
  note: z.string().min(1),
});

const outputSchema = z.object({
  /** The model's one-line summary of the note (from the mock port here). */
  echo: z.string(),
  /** How many context entries the snapshot held when the tool ran. */
  entryCount: z.number().int().nonnegative(),
});

type ReferenceInput = z.infer<typeof inputSchema>;
type ReferenceOutput = z.infer<typeof outputSchema>;

export const referenceTool: Tool<ReferenceInput, ReferenceOutput> = {
  name: "reference",
  title: "Reference tool",
  inputSchema,
  outputSchema,
  async run(ctx) {
    const entryCount = ctx.snapshot.entries.length;
    const summary = await ctx.ai.complete({
      system: "You summarize a trade contractor's note in one short line.",
      messages: [{ role: "user", content: ctx.input.note }],
    });
    const echo = summary.text;

    return {
      output: { echo, entryCount },
      suggestions: [
        {
          target: "context_entry",
          payload: { kind: "fact", payload: { label: "Reference note", value: ctx.input.note } },
        },
      ],
      message: {
        body: `Reference tool ran: ${echo} (this job has ${entryCount} context ${
          entryCount === 1 ? "entry" : "entries"
        }).`,
      },
    };
  },
};
