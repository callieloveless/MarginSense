/**
 * The app-layer adapter that backs the tool runner's injected persistence
 * ({@link ToolRunnerPorts}) with the tenant-scoped `TenantDb`. The runner stays framework/DB-
 * free; this thin adapter is where its port calls become tenant-scoped writes, so
 * `business_id` is stamped from the session handle (never from tool output). Pending
 * suggestions are projected to just the fields dedup needs.
 */

import { type TenantDb } from "@/src/db/tenant";
import { type ToolRunnerPorts } from "@/src/tools";

/** Build the runner's persistence ports over a tenant-bound handle. */
export function tenantToolRunnerPorts(tenantDb: TenantDb): ToolRunnerPorts {
  return {
    async listPendingSuggestions(projectId) {
      const rows = await tenantDb.listPendingSuggestions(projectId);
      return rows.map((r) => ({
        target: r.target,
        targetEstimateId: r.targetEstimateId,
        payload: r.payload,
      }));
    },
    async recordToolRun(input) {
      const run = await tenantDb.recordToolRun(input);
      return { id: run.id };
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
  };
}
