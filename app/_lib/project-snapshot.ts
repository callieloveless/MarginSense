/**
 * Server-side glue that assembles the read-only {@link ProjectSnapshot} a tool consumes
 * (constitution §4, §5) from the tenant-scoped rows. It maps context entries and conversation
 * messages into the snapshot's views and computes the active estimate's engine roll-up via the
 * existing compute glue. No math lives here — numbers come from `src/engine/`; the snapshot is
 * frozen and exposes no write path (that guarantee lives in `buildProjectSnapshot`).
 */

import {
  authorFromRow,
  buildProjectSnapshot,
  type ContextEntryView,
  type MessageView,
  type ProjectSnapshot,
} from "@/src/context";
import { type EstimateRollUp } from "@/src/engine";
import { type TenantDb } from "@/src/db/tenant";
import { businessRates, computeFromRows } from "./estimate-compute";

/** Build the read-only snapshot for a project: its entries, its one conversation, and its
 * active estimate's roll-up (null when there's no active version or the business has no
 * billable capacity set yet). */
export async function assembleProjectSnapshot(
  tenantDb: TenantDb,
  projectId: string,
): Promise<ProjectSnapshot> {
  const [entries, messages, settings, actives] = await Promise.all([
    tenantDb.listContextEntries(projectId),
    tenantDb.listMessages(projectId),
    tenantDb.getSettings(),
    tenantDb.listActiveEstimatesWithLines(),
  ]);

  const entryViews: ContextEntryView[] = entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    payload: e.payload,
    author: authorFromRow(e.author, e.authorTool),
  }));
  const conversation: MessageView[] = messages.map((m) => ({
    id: m.id,
    author: authorFromRow(m.author, m.authorTool),
    body: m.body,
  }));

  let activeEstimate: EstimateRollUp | null = null;
  const active = actives.find((a) => a.estimate.projectId === projectId);
  if (active && settings) {
    const computed = computeFromRows(active.estimate, active.lines, businessRates(settings));
    if (computed.ok) activeEstimate = computed.value.rollUp;
  }

  return buildProjectSnapshot({ projectId, entries: entryViews, conversation, activeEstimate });
}
