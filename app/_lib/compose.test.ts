/**
 * Tool composition (add-tool-compose), against the in-memory tenant backends and a mock model.
 *
 * The mechanism ships dormant (`COMPOSE_EDGES` empty), so these tests register a throwaway edge
 * for the duration of a test and restore it afterward — the same pattern the `photo.uploaded`
 * tests use. A reference producer and a reference consumer prove the wiring without any real
 * tool: one producer output fans out to N composed runs, each a `compose` `tool_run`; composed
 * output stays `pending`; the step budget refuses a run at the ceiling; and no composition
 * failure ever escapes to break the producer.
 */

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  getTool,
  MAX_TOOL_STEPS,
  toolRegistry,
  type AnyTool,
} from "@/src/tools";
import {
  createMemoryContextBackend,
  createMemoryEstimateBackend,
  createMemoryProjectBackend,
  createMemorySettingsBackend,
  createMemoryToolRunsBackend,
  createTenantDb,
  type TenantDb,
} from "@/src/db/tenant";
import { createMockModelPort } from "@/src/ai";
import { COMPOSE_EDGES, dispatchAndCompose, type ComposeEdge } from "./compose";

const BUSINESS = "biz-a";
const PROJECT = "p-1";

/** A producer whose output carries a list of terms; each term will become one consumer run. */
const producerTool: AnyTool = {
  name: "test-producer",
  title: "Test producer",
  inputSchema: z.object({}).passthrough(),
  outputSchema: z.object({ terms: z.array(z.string()) }),
  run: () => ({ output: { terms: ["a", "b", "c"] } }),
};

/** A consumer that proposes one context-entry suggestion per run (to prove pending emission). */
const consumerTool: AnyTool = {
  name: "test-consumer",
  title: "Test consumer",
  inputSchema: z.object({ term: z.string() }),
  outputSchema: z.object({ term: z.string() }),
  run: (ctx) => {
    const term = (ctx.input as { term: string }).term;
    return {
      output: { term },
      suggestions: [{ target: "context_entry", payload: { kind: "fact", payload: { label: "code", value: term } } }],
    };
  },
};

/** Register `tools` in the shared registry and `edges` for the run, restoring both after `body`.
 * The registry is a Map (mutable); COMPOSE_EDGES is a plain object. */
async function withWiring(
  tools: AnyTool[],
  edges: Record<string, readonly ComposeEdge[]>,
  body: () => Promise<void>,
): Promise<void> {
  const registry = toolRegistry as Map<string, AnyTool>;
  const savedEdges: Record<string, readonly ComposeEdge[] | undefined> = {};
  for (const tool of tools) registry.set(tool.name, tool);
  for (const [producer, list] of Object.entries(edges)) {
    savedEdges[producer] = COMPOSE_EDGES[producer];
    COMPOSE_EDGES[producer] = list;
  }
  try {
    await body();
  } finally {
    for (const tool of tools) registry.delete(tool.name);
    for (const [producer, prev] of Object.entries(savedEdges)) {
      if (prev === undefined) delete COMPOSE_EDGES[producer];
      else COMPOSE_EDGES[producer] = prev;
    }
  }
}

function tenantDb(): TenantDb {
  return createTenantDb(BUSINESS, {
    projects: createMemoryProjectBackend(),
    context: createMemoryContextBackend(),
    toolRuns: createMemoryToolRunsBackend(),
    settings: createMemorySettingsBackend(),
    estimates: createMemoryEstimateBackend(),
  });
}

/** The standard edge: one consumer run per term in the producer's output. */
const termEdge: ComposeEdge = {
  consumer: "test-consumer",
  async map(output) {
    return (output as { terms: string[] }).terms.map((term) => ({ term }));
  },
};

async function runProducer(db: TenantDb, step = 0): Promise<void> {
  await dispatchAndCompose(
    { toolName: "test-producer", projectId: PROJECT, input: {}, source: "user", step },
    { tenantDb: db, port: createMockModelPort() },
  );
}

describe("dispatchAndCompose — fan-out", () => {
  it("runs one composed consumer per mapped input, each a `compose` tool_run", async () => {
    const db = tenantDb();
    await withWiring([producerTool, consumerTool], { "test-producer": [termEdge] }, async () => {
      await runProducer(db);
    });

    const runs = await db.listToolRuns(PROJECT);
    const producer = runs.filter((r) => r.toolName === "test-producer");
    const composed = runs.filter((r) => r.toolName === "test-consumer");
    expect(producer).toHaveLength(1);
    expect(producer[0]!.source).toBe("user");
    expect(composed).toHaveLength(3); // one per term
    expect(composed.every((r) => r.source === "compose")).toBe(true);
    expect(composed.every((r) => r.status === "ok")).toBe(true);
  });

  it("leaves every composed suggestion pending — nothing auto-commits", async () => {
    const db = tenantDb();
    await withWiring([producerTool, consumerTool], { "test-producer": [termEdge] }, async () => {
      await runProducer(db);
    });

    const pending = await db.listPendingSuggestions(PROJECT);
    expect(pending).toHaveLength(3);
    expect(pending.every((s) => s.status === "pending")).toBe(true);
    // Committed context entries only appear on accept — none yet.
    expect(await db.listContextEntries(PROJECT)).toHaveLength(0);
  });

  it("dispatches composed runs at producerStep + 1", async () => {
    const db = tenantDb();
    // A step-recording consumer proves the composed step without reaching into dispatch.
    const seenSteps: number[] = [];
    const recordingEdge: ComposeEdge = {
      consumer: "test-consumer",
      async map(_output, ctx) {
        seenSteps.push(ctx.step);
        return [{ term: "x" }];
      },
    };
    await withWiring([producerTool, consumerTool], { "test-producer": [recordingEdge] }, async () => {
      await runProducer(db, 0);
    });
    expect(seenSteps).toEqual([1]);
  });
});

describe("dispatchAndCompose — the step budget", () => {
  it("refuses a composed run at the ceiling instead of looping", async () => {
    const db = tenantDb();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await withWiring([producerTool, consumerTool], { "test-producer": [termEdge] }, async () => {
      // Producer at MAX_TOOL_STEPS - 1 → composed run would be at MAX_TOOL_STEPS, which dispatch
      // refuses for a non-user run.
      await runProducer(db, MAX_TOOL_STEPS - 1);
    });

    const composed = (await db.listToolRuns(PROJECT)).filter((r) => r.toolName === "test-consumer");
    expect(composed).toHaveLength(0); // none started
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("dispatchAndCompose — failure isolation", () => {
  it("a throwing mapper is logged and never breaks the producer", async () => {
    const db = tenantDb();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const badEdge: ComposeEdge = {
      consumer: "test-consumer",
      async map() {
        throw new Error("mapper exploded");
      },
    };
    await withWiring([producerTool, consumerTool], { "test-producer": [badEdge] }, async () => {
      // Must resolve, not reject.
      await expect(runProducer(db)).resolves.toBeUndefined();
    });

    // The producer still ran and was recorded ok.
    const producer = (await db.listToolRuns(PROJECT)).filter((r) => r.toolName === "test-producer");
    expect(producer[0]!.status).toBe("ok");
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("a throwing consumer is logged; the producer's outcome is unaffected", async () => {
    const db = tenantDb();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwingConsumer: AnyTool = {
      ...consumerTool,
      run: () => {
        throw new Error("consumer exploded");
      },
    };
    await withWiring([producerTool, throwingConsumer], { "test-producer": [termEdge] }, async () => {
      await expect(runProducer(db)).resolves.toBeUndefined();
    });

    const runs = await db.listToolRuns(PROJECT);
    expect(runs.filter((r) => r.toolName === "test-producer")[0]!.status).toBe("ok");
    // The failed composed runs are still recorded as error (dispatch finalizes them).
    const composed = runs.filter((r) => r.toolName === "test-consumer");
    expect(composed.length).toBeGreaterThan(0);
    expect(composed.every((r) => r.status === "error")).toBe(true);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("dispatchAndCompose — dormant by default", () => {
  it("starts no composed run when no edge is registered", async () => {
    const db = tenantDb();
    expect(COMPOSE_EDGES["test-producer"]).toBeUndefined();
    await withWiring([producerTool], {}, async () => {
      const outcome = await dispatchAndCompose(
        { toolName: "test-producer", projectId: PROJECT, input: {}, source: "user" },
        { tenantDb: db, port: createMockModelPort() },
      );
      expect(outcome.status).toBe("ok");
    });

    // Only the producer ran; nothing composed.
    const runs = await db.listToolRuns(PROJECT);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.toolName).toBe("test-producer");
  });

  it("the real registry ships empty", () => {
    // Guards against a stray edge being committed before 9b.
    expect(Object.keys(COMPOSE_EDGES)).toHaveLength(0);
    // And the reference/real tools resolve (sanity that routing didn't break the registry).
    expect(getTool("material-finder")).not.toBeNull();
  });
});
