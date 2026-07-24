/**
 * Tool composition (add-tool-compose) — one tool's output becomes another tool's input.
 *
 * The tool-platform spec has described composition since #6, and P1 gave `dispatch` a `compose`
 * source and a step budget; this is where it is finally wired. {@link dispatchAndCompose} is the
 * **single app-layer way to run a tool**: it dispatches the tool, and on success fans the tool's
 * `output` out to any registered consumers, dispatching each through the same `dispatch` with
 * `source: "compose"`.
 *
 * Why here and not in the runner: the runner is deliberately DB-free (that is what keeps a tool
 * unable to write), but a real composition edge needs tenant data — Code Finder (9b) needs the
 * business's service area to find *local* code. So the fan-out lives one layer up, where a
 * `TenantDb` is in hand, while `dispatch` stays the one entry point every run flows through.
 *
 * Why *one* entry and not a call dropped into each tool's action: composition is a property of the
 * platform, not of one tool. If only Photo Advisor's action fanned out, a later `material-finder →
 * X` edge would silently do nothing. Routing every app-layer run through {@link dispatchAndCompose}
 * means a registered edge fires no matter which tool produced the output.
 *
 * It ships **dormant**: {@link COMPOSE_EDGES} is empty, so today the wrapper is `dispatch` plus a
 * no-op. 9b registers the first edge (`photo-advisor → code-finder`); #12's graph editor will make
 * this registry user-editable.
 */

import {
  codeFinderTool,
  dispatch,
  MAX_TOOL_STEPS,
  photoAdvisorTool,
  type CodeFinderInput,
  type DispatchRequest,
  type PhotoAdvisorOutput,
  type ToolRunOutcome,
} from "@/src/tools";
import { type ModelPort } from "@/src/ai";
import { type TenantDb } from "@/src/db/tenant";
import { dispatchDeps } from "./tool-runner";

/** What an edge's mapper is given: the tenant handle (to read settings, context, etc.), the
 * project, and the step the composed run will be dispatched at. Tenant access lives here, in the
 * app layer — never in the runner. */
export interface ComposeContext {
  readonly tenantDb: TenantDb;
  readonly projectId: string;
  readonly step: number;
}

/**
 * A composition edge: when `consumer`'s producer runs, `map` turns the producer's typed `output`
 * into zero or more inputs for `consumer`, each becoming its own composed run. `map` is `async`
 * so it can read tenant-scoped data (a consumer's jurisdiction, prior context) through `ctx`.
 */
export interface ComposeEdge {
  readonly consumer: string;
  map(producerOutput: unknown, ctx: ComposeContext): Promise<readonly unknown[]>;
}

/**
 * When Photo Advisor diagnoses a photo, look up the local code for the problems worth acting on
 * (add-code-finder). One Code Finder run per **code-relevant** finding — `safety` or `attention`,
 * not a cosmetic `note` — because composition is synchronous (it blocks the photo result and adds
 * a card to the queue), so a lookup for "minor surface mould" would spend a web search and a
 * phone-screen row on nothing. The jurisdiction is resolved once here in the app layer, which is
 * why the seam is app-layer at all (the runner can't read settings).
 */
const photoAdvisorToCodeFinder: ComposeEdge = {
  consumer: codeFinderTool.name,
  async map(producerOutput, ctx) {
    const output = producerOutput as PhotoAdvisorOutput;
    const relevant = output.findings.filter((f) => f.severity === "safety" || f.severity === "attention");
    if (relevant.length === 0) return [];

    const serviceArea = (await ctx.tenantDb.getSettings())?.serviceArea ?? undefined;

    return relevant.map((finding): CodeFinderInput => {
      const materials = finding.materials && finding.materials.length > 0 ? ` Materials: ${finding.materials.join(", ")}.` : "";
      return {
        query: `Building code for: ${finding.summary}.${materials}`,
        ...(serviceArea ? { location: serviceArea } : {}),
        photoStorageKey: output.photoStorageKey,
      };
    });
  },
};

/**
 * Producer tool name → its outgoing edges. Photo Advisor fans out to Code Finder; other tools have
 * no consumers yet. #12's graph editor will make this registry user-editable.
 */
export const COMPOSE_EDGES: Record<string, readonly ComposeEdge[]> = {
  [photoAdvisorTool.name]: [photoAdvisorToCodeFinder],
};

/** What the caller supplies once, per run: the tenant handle and the model port the tool (and any
 * composed consumer) should use. */
export interface ComposeDeps {
  readonly tenantDb: TenantDb;
  /** The model port; omitted for tools that run on the mock (e.g. the reference tool). */
  readonly port?: ModelPort | undefined;
}

/**
 * Run `request` through the platform's `dispatch`, then fan its output out to any registered
 * consumers. Returns the **producer's** `ToolRunOutcome` unchanged, so this is a drop-in for a
 * raw `dispatch` call at the app layer.
 *
 * The producer's own failure propagates (its `dispatch` throws, and nothing is composed). A
 * *composition's* failure never does: a bad mapper, an unknown consumer, or a composed run the
 * step budget refuses is caught and logged, because the producer already succeeded and its
 * suggestions are on the queue — a follow-up must not turn that into a failure.
 */
export async function dispatchAndCompose(
  request: DispatchRequest,
  deps: ComposeDeps,
): Promise<ToolRunOutcome> {
  const dispatchPorts = dispatchDeps(deps.tenantDb, deps.port);
  const outcome = await dispatch(request, dispatchPorts);

  const edges = COMPOSE_EDGES[request.toolName] ?? [];
  if (edges.length === 0) return outcome;

  // A composed run is one step deeper than its producer; `dispatch` refuses a non-user run whose
  // step reaches MAX_TOOL_STEPS, so a looping edge is stopped by the platform, not by hope.
  const step = (request.step ?? 0) + 1;
  const ctx: ComposeContext = { tenantDb: deps.tenantDb, projectId: request.projectId, step };

  for (const edge of edges) {
    let inputs: readonly unknown[];
    try {
      inputs = await edge.map(outcome.output, ctx);
    } catch (err) {
      console.error(
        `[compose] mapping ${request.toolName} → ${edge.consumer} failed for project ${request.projectId}:`,
        err,
      );
      continue;
    }

    for (const input of inputs) {
      // Belt-and-braces: the budget is enforced inside dispatch too, but skipping here keeps the
      // log quiet for the expected ceiling case rather than treating it as an error.
      if (step >= MAX_TOOL_STEPS) {
        console.error(
          `[compose] ${request.toolName} → ${edge.consumer} refused: step ${step} reaches the budget (${MAX_TOOL_STEPS}).`,
        );
        continue;
      }
      try {
        await dispatch(
          { toolName: edge.consumer, projectId: request.projectId, input, source: "compose", step },
          dispatchPorts,
        );
      } catch (err) {
        console.error(
          `[compose] running ${edge.consumer} (composed from ${request.toolName}) failed:`,
          err,
        );
      }
    }
  }

  return outcome;
}
