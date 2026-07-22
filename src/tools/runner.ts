/**
 * The tool runner (constitution §5; techstack §4) — the ONE code path that invokes a tool.
 * It is the only impure step in the platform, yet it still has no path that commits an
 * estimate or context fact directly: the only things that leave a run are `pending`
 * suggestions and a conversation post. It:
 *   1. validates the tool's input at the boundary (invalid input → the tool never runs);
 *   2. runs the tool with a **metered** model port and the read-only snapshot;
 *   3. validates the tool's `output` and every proposed suggestion;
 *   4. records a `tool_run` (tokens, latency, status) — for failed runs too;
 *   5. **de-duplicates** proposals against the project's pending queue (the gap change #5
 *      handed the platform), then creates the survivors as `pending`;
 *   6. posts one conversation message; and stamps `tool_run_id` on both, so every emission is
 *      traceable to the run — and cost — that produced it.
 *
 * It is framework/DB-free: it persists only through the injected {@link ToolRunnerPorts}, which
 * an app-layer adapter backs with the tenant-scoped `TenantDb`. That keeps the runner unit-
 * testable with a fake and keeps `business_id` stamping on the tenant side.
 */

import { suggestionEffect, type Author, type ProjectSnapshot } from "../context";
import { meterModelPort, type ModelPort } from "../ai";
import { type SuggestionTargetName, type ToolRunSourceName } from "../db/schema";
import { type AnyTool, type ProposedSuggestion } from "./contract";

/** A composed/auto-triggered run may not go deeper than this many hops — the guardrail that
 * keeps a tool graph (#12) or a photo-upload auto-trigger (#9) from re-triggering forever. */
export const MAX_TOOL_STEPS = 8;

/** The shape the runner needs to compare against the pending queue for de-duplication. */
export interface PendingSuggestionKey {
  readonly target: SuggestionTargetName;
  readonly targetEstimateId: string | null;
  readonly payload: unknown;
}

/**
 * The persistence the runner needs, bound to a tenant by the caller's adapter. Every method
 * takes an explicit `projectId`; the adapter (over `TenantDb`) stamps `business_id` from the
 * session handle, never from here.
 */
export interface ToolRunnerPorts {
  listPendingSuggestions(projectId: string): Promise<readonly PendingSuggestionKey[]>;
  recordToolRun(input: {
    projectId: string;
    toolName: string;
    status: "ok" | "error";
    source: ToolRunSourceName;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  }): Promise<{ id: string }>;
  createSuggestion(input: {
    projectId: string;
    target: SuggestionTargetName;
    payload: unknown;
    targetEstimateId: string | null;
    author: Author;
    toolRunId: string;
  }): Promise<{ id: string }>;
  postMessage(input: {
    projectId: string;
    body: string;
    author: Author;
    toolRunId: string;
  }): Promise<{ id: string }>;
}

/** What the caller passes for one invocation. `snapshot` is assembled by the caller (it needs
 * the app-layer roll-up glue); the runner keeps it read-only. */
export interface RunToolInput {
  readonly projectId: string;
  readonly input: unknown;
  readonly ai: ModelPort;
  readonly snapshot: ProjectSnapshot;
  /** Who/what invoked the run; drives the step budget. Defaults to `user`. */
  readonly source?: ToolRunSourceName | undefined;
  /** Composition depth (0 = a direct run). Enforced only for non-`user` sources. */
  readonly step?: number | undefined;
}

/** The result of a run: the id of the logged `tool_run`, the validated output, and what it
 * emitted (with how many duplicates were skipped). */
export interface ToolRunOutcome {
  readonly toolRunId: string;
  readonly output: unknown;
  readonly createdSuggestionIds: readonly string[];
  readonly skippedDuplicates: number;
  readonly messageId: string | null;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
}

/** Deterministic, key-order-independent stringify so field ordering can't defeat dedup. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** The dedup key for a suggestion: target + target estimate + canonical payload. */
function suggestionKey(s: PendingSuggestionKey): string {
  return `${s.target}|${s.targetEstimateId ?? ""}|${stableStringify(s.payload)}`;
}

/** Validate a proposed suggestion by running change #5's effect derivation (which parses the
 * payload against its kind/line schema). Throws with a clear message on an invalid proposal. */
function assertValidProposal(toolName: string, s: ProposedSuggestion): void {
  const eff = suggestionEffect({
    target: s.target,
    payload: s.payload,
    targetEstimateId: s.targetEstimateId ?? null,
  });
  if (!eff.ok) throw new Error(`Tool "${toolName}" proposed an invalid suggestion: ${eff.error}`);
}

/**
 * Run one tool end to end. See the module note for the pipeline. Throws on invalid input
 * (before any run is recorded), and on a tool/validation failure (after recording a
 * `status: "error"` run so partial AI spend stays observable).
 */
export async function runTool(
  tool: AnyTool,
  input: RunToolInput,
  ports: ToolRunnerPorts,
): Promise<ToolRunOutcome> {
  const source: ToolRunSourceName = input.source ?? "user";
  const step = input.step ?? 0;
  if (source !== "user" && step >= MAX_TOOL_STEPS) {
    throw new Error(`Tool "${tool.name}" exceeded the composed-run step budget (${MAX_TOOL_STEPS}).`);
  }

  // 1. Validate input at the boundary — the tool's `run` never sees invalid input, and an
  //    invalid-input rejection is not a run (nothing is recorded).
  const parsedInput = tool.inputSchema.parse(input.input);

  const metered = meterModelPort(input.ai);
  const startedAt = Date.now();
  const author: Author = { tool: tool.name };

  const recordError = () =>
    ports.recordToolRun({
      projectId: input.projectId,
      toolName: tool.name,
      status: "error",
      source,
      ...metered.usage(),
      latencyMs: Date.now() - startedAt,
    });

  // 2. Run the tool, then 3. validate its output + proposals. Any failure records an error run.
  let output: unknown;
  let suggestions: readonly ProposedSuggestion[];
  let message: { body: string; disclaimer?: string | undefined } | undefined;
  try {
    const result = await tool.run({ snapshot: input.snapshot, input: parsedInput, ai: metered.port });
    output = tool.outputSchema.parse(result.output);
    suggestions = result.suggestions ?? [];
    for (const s of suggestions) assertValidProposal(tool.name, s);
    message = result.message;
  } catch (err) {
    await recordError();
    throw err;
  }

  // 4. Record the successful run first, so its id can link the emissions.
  const usage = metered.usage();
  const run = await ports.recordToolRun({
    projectId: input.projectId,
    toolName: tool.name,
    status: "ok",
    source,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    latencyMs: Date.now() - startedAt,
  });

  // 5. De-dupe against the pending queue (and within this batch), then create the survivors.
  const pending = await ports.listPendingSuggestions(input.projectId);
  const seen = new Set(pending.map(suggestionKey));
  const createdSuggestionIds: string[] = [];
  let skippedDuplicates = 0;
  for (const s of suggestions) {
    const key = suggestionKey({ target: s.target, targetEstimateId: s.targetEstimateId ?? null, payload: s.payload });
    if (seen.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(key);
    const created = await ports.createSuggestion({
      projectId: input.projectId,
      target: s.target,
      payload: s.payload,
      targetEstimateId: s.targetEstimateId ?? null,
      author,
      toolRunId: run.id,
    });
    createdSuggestionIds.push(created.id);
  }

  // 6. Post the conversation message (with any disclaimer), linked to the run.
  let messageId: string | null = null;
  if (message) {
    const body = message.disclaimer ? `${message.body}\n\n${message.disclaimer}` : message.body;
    const posted = await ports.postMessage({ projectId: input.projectId, body, author, toolRunId: run.id });
    messageId = posted.id;
  }

  return { toolRunId: run.id, output, createdSuggestionIds, skippedDuplicates, messageId, usage };
}
