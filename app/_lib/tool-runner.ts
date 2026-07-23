/**
 * The app-layer binding that gives the tool dispatch seam ({@link DispatchDeps}) its
 * tenant-scoped teeth: the run-lifecycle + suggestion/message persistence over a `TenantDb`, the
 * read-only snapshot assembler, the tool registry, and the model port. The runner stays
 * framework/DB-free; this is where its injected ports become tenant-scoped writes, so
 * `business_id` is stamped from the session handle (never from tool output).
 *
 * The model port is the mock here — the reference tool proves the wire with no key; real tools
 * (#7+) will resolve the live port and render a "connect AI" state when unconfigured.
 */

import { getTool, type DispatchDeps } from "@/src/tools";
import { createMockModelPort } from "@/src/ai";
import { type TenantDb } from "@/src/db/tenant";
import { assembleProjectSnapshot } from "./project-snapshot";

/** Build the dispatch dependencies over a tenant-bound handle. */
export function dispatchDeps(tenantDb: TenantDb): DispatchDeps {
  return {
    getTool,
    ai: createMockModelPort(),
    buildSnapshot: (projectId) => assembleProjectSnapshot(tenantDb, projectId),
    ports: {
      async startToolRun(input) {
        const run = await tenantDb.startToolRun(input);
        return { id: run.id };
      },
      async completeToolRun(id, input) {
        await tenantDb.completeToolRun(id, input);
      },
      async listPendingSuggestions(projectId) {
        const rows = await tenantDb.listPendingSuggestions(projectId);
        return rows.map((r) => ({
          target: r.target,
          targetEstimateId: r.targetEstimateId,
          payload: r.payload,
        }));
      },
      async createSuggestion(input) {
        const s = await tenantDb.createSuggestion({
          projectId: input.projectId,
          target: input.target,
          payload: input.payload,
          targetEstimateId: input.targetEstimateId,
          author: input.author,
          toolRunId: input.toolRunId,
        });
        return { id: s.id };
      },
      async postMessage(input) {
        const m = await tenantDb.postMessage({
          projectId: input.projectId,
          body: input.body,
          author: input.author,
          toolRunId: input.toolRunId,
        });
        return { id: m.id };
      },
    },
  };
}
