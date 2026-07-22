/**
 * Tenant-isolation + accept-path tests for shared project context (add-project-context;
 * constitution §4, §5, §6.3). The in-memory backend holds *every* tenant's entries, messages,
 * and suggestions, so these prove: one business can't read or resolve another's rows; accept
 * is the only path that commits (and does so once — idempotent); dismiss is remembered and
 * drops out of the pending queue; and the line-item effect carries the bound business.
 */

import { describe, expect, it, vi } from "vitest";
import {
  createMemoryContextBackend,
  createMemoryProjectBackend,
  createTenantDb,
  type ContextBackend,
} from "./tenant";

const A = "biz-a";
const B = "biz-b";
const PROJECT = "proj-1";

function handle(businessId: string, context: ContextBackend) {
  return createTenantDb(businessId, { projects: createMemoryProjectBackend(), context });
}

describe("tenant isolation — context entries & conversation", () => {
  it("cannot read another business's entries or messages", async () => {
    const ctx = createMemoryContextBackend();
    await handle(B, ctx).addContextEntry({ projectId: PROJECT, kind: "fact", payload: { label: "Access", value: "Rear gate" } });
    await handle(B, ctx).postMessage({ projectId: PROJECT, body: "B's note" });

    expect(await handle(A, ctx).listContextEntries(PROJECT)).toEqual([]);
    expect(await handle(A, ctx).listMessages(PROJECT)).toEqual([]);
  });

  it("stamps the bound business and defaults the author to the user", async () => {
    const ctx = createMemoryContextBackend();
    const entry = await handle(A, ctx).addContextEntry({
      projectId: PROJECT,
      kind: "material",
      payload: { name: "2x4", priceCents: 385, unit: "each" },
    });
    expect(entry.businessId).toBe(A);
    expect(entry.author).toBe("user");
  });

  it("puts every post in the one project conversation", async () => {
    const ctx = createMemoryContextBackend();
    const a = handle(A, ctx);
    await a.postMessage({ projectId: PROJECT, body: "first" });
    await a.postMessage({ projectId: PROJECT, body: "second", author: { tool: "Material Finder" } });
    const thread = await a.listMessages(PROJECT);
    expect(thread.map((m) => m.body)).toEqual(["first", "second"]);
    expect(thread[1]!.author).toBe("tool");
    expect(thread[1]!.authorTool).toBe("Material Finder");
  });
});

describe("suggestions — accept is the only mutation path", () => {
  it("accepting a context-entry suggestion commits the entry", async () => {
    const ctx = createMemoryContextBackend();
    const a = handle(A, ctx);
    const sug = await a.createSuggestion({
      projectId: PROJECT,
      target: "context_entry",
      payload: { kind: "finding", payload: { summary: "Rot at sill plate" } },
    });
    expect(sug.status).toBe("pending");
    expect(await a.listContextEntries(PROJECT)).toHaveLength(0); // nothing committed yet

    const result = await a.acceptSuggestion(sug.id);
    expect(result.ok && result.committed).toBe("context_entry");
    const entries = await a.listContextEntries(PROJECT);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("finding");
  });

  it("dismiss commits nothing and drops out of the pending queue", async () => {
    const ctx = createMemoryContextBackend();
    const a = handle(A, ctx);
    const sug = await a.createSuggestion({
      projectId: PROJECT,
      target: "context_entry",
      payload: { kind: "fact", payload: { label: "note", value: "skip" } },
    });

    await a.dismissSuggestion(sug.id);
    expect(await a.listContextEntries(PROJECT)).toHaveLength(0);
    expect(await a.listPendingSuggestions(PROJECT)).toHaveLength(0);
    expect((await a.listSuggestions(PROJECT, { status: "dismissed" }))).toHaveLength(1);
  });

  it("is idempotent — a second accept does not commit again", async () => {
    const ctx = createMemoryContextBackend();
    const a = handle(A, ctx);
    const sug = await a.createSuggestion({
      projectId: PROJECT,
      target: "context_entry",
      payload: { kind: "fact", payload: { label: "x", value: "y" } },
    });
    await a.acceptSuggestion(sug.id);
    const second = await a.acceptSuggestion(sug.id);
    expect(second.ok && second.committed).toBe(null); // no-op
    expect(await a.listContextEntries(PROJECT)).toHaveLength(1); // still one
  });

  it("performs a line-item effect scoped to the bound business", async () => {
    const appendLineItem = vi.fn();
    const ctx = createMemoryContextBackend({ appendLineItem });
    const a = handle(A, ctx);
    const sug = await a.createSuggestion({
      projectId: PROJECT,
      target: "estimate_line_item",
      targetEstimateId: "est-1",
      payload: { category: "material", description: "studs", quantity: 10, unitCostCents: 385 },
    });
    await a.acceptSuggestion(sug.id);
    expect(appendLineItem).toHaveBeenCalledWith({
      businessId: A,
      estimateId: "est-1",
      line: { category: "material", description: "studs", quantity: 10, unitCostCents: 385 },
    });
  });

  it("cannot accept another business's suggestion", async () => {
    const ctx = createMemoryContextBackend();
    const sug = await handle(B, ctx).createSuggestion({
      projectId: PROJECT,
      target: "context_entry",
      payload: { kind: "fact", payload: { label: "b", value: "secret" } },
    });
    const result = await handle(A, ctx).acceptSuggestion(sug.id);
    expect(result.ok).toBe(false);
    // B's suggestion is untouched and nothing committed for B.
    const bSuggestions = await handle(B, ctx).listSuggestions(PROJECT);
    expect(bSuggestions.find((s) => s.id === sug.id)?.status).toBe("pending");
  });
});

describe("TenantDb without a context backend", () => {
  it("fails clearly instead of silently allowing unscoped access", () => {
    const db = createTenantDb(A, { projects: createMemoryProjectBackend() });
    expect(() => db.listContextEntries(PROJECT)).toThrow(/context backend/i);
  });
});
