/**
 * The tool dispatch seam (constitution §5; techstack §4) — the ONE code path that invokes a
 * tool. Every invocation (a user tap, an event trigger, a composed hop) flows through
 * {@link dispatch}. It starts an observable `tool_run`, runs the tool with a **metered** model
 * port and the read-only snapshot, validates the output and every proposed suggestion,
 * **de-duplicates** against the pending queue, creates the survivors as `pending` linked to the
 * run, posts one conversation message, and **finalizes** the run to `ok` or `error`. The only
 * things that leave a run are `pending` suggestions and a conversation post — never a direct
 * estimate/context write.
 *
 * Because the run id exists *before* any emission and the status is set *after*, a run that
 * fails to persist its emissions is finalized `error`, never a misleading `ok`.
 *
 * It is framework/DB-free: it persists only through the injected {@link DispatchDeps.ports} and
 * gets its snapshot from an injected `buildSnapshot`, so an app-layer binding supplies the
 * tenant-scoped `TenantDb`. Runs execute inline today; a queue driver can wrap the
 * start → run → finalize body without changing this signature or any caller.
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
 * The persistence dispatch needs, bound to a tenant by the caller's adapter. Every method
 * takes an explicit `projectId`/id; the adapter (over `TenantDb`) stamps `business_id` from the
 * session handle, never from here. `startToolRun`/`completeToolRun` are the run lifecycle.
 */
export interface DispatchPorts {
  startToolRun(input: {
    projectId: string;
    toolName: string;
    source: ToolRunSourceName;
  }): Promise<{ id: string }>;
  completeToolRun(
    id: string,
    input: {
      status: "ok" | "error";
      inputTokens: number;
      outputTokens: number;
      latencyMs: number;
    },
  ): Promise<unknown>;
  listPendingSuggestions(projectId: string): Promise<readonly PendingSuggestionKey[]>;
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

/** Everything dispatch needs, injected by the caller (app-layer binding or a test fake). */
export interface DispatchDeps {
  getTool(name: string): AnyTool | null;
  ports: DispatchPorts;
  ai: ModelPort;
  buildSnapshot(projectId: string): Promise<ProjectSnapshot>;
}

/** One invocation. `source` defaults to `user`; `step` is the composition depth (0 = direct). */
export interface DispatchRequest {
  readonly toolName: string;
  readonly projectId: string;
  readonly input: unknown;
  readonly source?: ToolRunSourceName | undefined;
  readonly step?: number | undefined;
}

/** The result of a run: the id + terminal status of its `tool_run`, the validated output, and
 * what it emitted (with how many duplicates were skipped). */
export interface ToolRunOutcome {
  readonly toolRunId: string;
  readonly status: "ok";
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

/** The dedup key for a suggestion: target + target estimate + canonical payload. Exported so a
 * non-dispatch path (e.g. Material Finder's manual add) can dedup against the pending queue with
 * the exact same key the runner uses. */
export function suggestionKey(s: PendingSuggestionKey): string {
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
 * Dispatch one tool run end to end. Rejects an unknown tool and invalid input **before** any
 * run is started (that isn't a run). Once started, always finalizes the run — `ok` on success,
 * `error` on any failure (the error is re-thrown; finalizing never masks it).
 */
export async function dispatch(request: DispatchRequest, deps: DispatchDeps): Promise<ToolRunOutcome> {
  const source: ToolRunSourceName = request.source ?? "user";
  const step = request.step ?? 0;
  if (source !== "user" && step >= MAX_TOOL_STEPS) {
    throw new Error(`Tool "${request.toolName}" exceeded the composed-run step budget (${MAX_TOOL_STEPS}).`);
  }

  const tool = deps.getTool(request.toolName);
  if (!tool) throw new Error(`Unknown tool "${request.toolName}".`);

  // Validate input at the boundary — the tool's `run` never sees invalid input, and an
  // invalid-input rejection is not a run (nothing is started).
  const parsedInput = tool.inputSchema.parse(request.input);

  const run = await deps.ports.startToolRun({ projectId: request.projectId, toolName: tool.name, source });
  const metered = meterModelPort(deps.ai);
  const startedAt = Date.now();
  const author: Author = { tool: tool.name };
  const finalize = (status: "ok" | "error") =>
    deps.ports.completeToolRun(run.id, {
      status,
      ...metered.usage(),
      latencyMs: Date.now() - startedAt,
    });

  try {
    const snapshot = await deps.buildSnapshot(request.projectId);
    const result = await tool.run({ snapshot, input: parsedInput, ai: metered.port });
    const output = tool.outputSchema.parse(result.output);
    const suggestions = result.suggestions ?? [];
    for (const s of suggestions) assertValidProposal(tool.name, s);

    // De-dupe against the pending queue (and within this batch), then create the survivors.
    const pending = await deps.ports.listPendingSuggestions(request.projectId);
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
      const created = await deps.ports.createSuggestion({
        projectId: request.projectId,
        target: s.target,
        payload: s.payload,
        targetEstimateId: s.targetEstimateId ?? null,
        author,
        toolRunId: run.id,
      });
      createdSuggestionIds.push(created.id);
    }

    let messageId: string | null = null;
    if (result.message) {
      const body = result.message.disclaimer ? `${result.message.body}\n\n${result.message.disclaimer}` : result.message.body;
      const posted = await deps.ports.postMessage({ projectId: request.projectId, body, author, toolRunId: run.id });
      messageId = posted.id;
    }

    await finalize("ok");
    return {
      toolRunId: run.id,
      status: "ok",
      output,
      createdSuggestionIds,
      skippedDuplicates,
      messageId,
      usage: metered.usage(),
    };
  } catch (err) {
    // Finalize as error, but never let a finalize failure mask the real error.
    await finalize("error").catch(() => {});
    throw err;
  }
}
