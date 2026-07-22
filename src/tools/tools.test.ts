/**
 * Unit tests for the tool platform (add-tool-platform). All offline against the mock port and
 * a fake persistence adapter. They prove the runner's contract: read-only snapshot in;
 * de-duplicated pending suggestions + a linked conversation post out; failed runs still
 * logged; the step budget; and the structural safety boundary (the tool context exposes no
 * write path, and the runner never commits — its only outputs are pending suggestions).
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildProjectSnapshot } from "../context";
import { createMockModelPort } from "../ai";
import {
  MAX_TOOL_STEPS,
  referenceTool,
  runTool,
  type PendingSuggestionKey,
  type Tool,
  type ToolRunnerPorts,
} from "./index";

const NOTE = "Add a GFCI outlet by the sink";

function snapshot(entryCount = 0) {
  return buildProjectSnapshot({
    projectId: "p1",
    entries: Array.from({ length: entryCount }, (_, i) => ({
      id: `e${i}`,
      kind: "fact" as const,
      payload: { label: "x", value: "y" },
      author: "user" as const,
    })),
    conversation: [],
  });
}

function makePorts(pending: PendingSuggestionKey[] = []) {
  let n = 0;
  const runs: Array<Record<string, unknown> & { id: string }> = [];
  const suggestions: Array<Record<string, unknown> & { id: string }> = [];
  const messages: Array<Record<string, unknown> & { id: string }> = [];
  const ports: ToolRunnerPorts = {
    async listPendingSuggestions() {
      return pending;
    },
    async recordToolRun(input) {
      const id = `run-${++n}`;
      runs.push({ id, ...input });
      return { id };
    },
    async createSuggestion(input) {
      const id = `sug-${++n}`;
      suggestions.push({ id, ...input });
      return { id };
    },
    async postMessage(input) {
      const id = `msg-${++n}`;
      messages.push({ id, ...input });
      return { id };
    },
  };
  return { ports, runs, suggestions, messages };
}

const refInput = { projectId: "p1", input: { note: NOTE }, ai: createMockModelPort(), snapshot: snapshot(1) };

describe("runTool — happy path", () => {
  it("emits one pending suggestion + one post + one linked tool_run", async () => {
    const { ports, runs, suggestions, messages } = makePorts();
    const outcome = await runTool(referenceTool, refInput, ports);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ toolName: "reference", status: "ok", source: "user" });
    expect(outcome.usage.outputTokens).toBeGreaterThan(0);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      target: "context_entry",
      author: { tool: "reference" },
      toolRunId: outcome.toolRunId,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ author: { tool: "reference" }, toolRunId: outcome.toolRunId });

    expect(outcome.output).toEqual({ echo: expect.any(String), entryCount: 1 });
    expect(outcome.skippedDuplicates).toBe(0);
    expect(outcome.createdSuggestionIds).toHaveLength(1);
  });
});

describe("runTool — de-duplication", () => {
  it("skips a proposal identical to one already pending, but still runs and posts", async () => {
    const duplicate: PendingSuggestionKey = {
      target: "context_entry",
      targetEstimateId: null,
      // Same payload the reference tool proposes, with keys in a different order.
      payload: { payload: { value: NOTE, label: "Reference note" }, kind: "fact" },
    };
    const { ports, runs, suggestions, messages } = makePorts([duplicate]);
    const outcome = await runTool(referenceTool, refInput, ports);

    expect(outcome.skippedDuplicates).toBe(1);
    expect(outcome.createdSuggestionIds).toHaveLength(0);
    expect(suggestions).toHaveLength(0); // nothing created
    expect(runs).toHaveLength(1); // run still logged
    expect(messages).toHaveLength(1); // post still made
  });
});

describe("runTool — safety boundary", () => {
  it("hands the tool a frozen snapshot and a context with no write path", async () => {
    let seenKeys: string[] = [];
    let frozen = false;
    const probe: Tool<Record<string, never>, { ok: boolean }> = {
      name: "probe",
      title: "Probe",
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      run(ctx) {
        seenKeys = Object.keys(ctx).sort();
        frozen = Object.isFrozen(ctx.snapshot);
        return { output: { ok: true } };
      },
    };
    const { ports } = makePorts();
    await runTool(probe, { projectId: "p1", input: {}, ai: createMockModelPort(), snapshot: snapshot() }, ports);

    // The only things a tool receives are the snapshot, its input, and the model port.
    expect(seenKeys).toEqual(["ai", "input", "snapshot"]);
    expect(frozen).toBe(true);
  });
});

describe("runTool — failures", () => {
  it("rejects invalid input and records no run", async () => {
    const { ports, runs } = makePorts();
    await expect(
      runTool(referenceTool, { projectId: "p1", input: {}, ai: createMockModelPort(), snapshot: snapshot() }, ports),
    ).rejects.toThrow();
    expect(runs).toHaveLength(0); // invalid input is not a run
  });

  it("records an error tool_run when the tool throws, and commits nothing", async () => {
    const boom: Tool<Record<string, never>, unknown> = {
      name: "boom",
      title: "Boom",
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
      run() {
        throw new Error("kaboom");
      },
    };
    const { ports, runs, suggestions, messages } = makePorts();
    await expect(
      runTool(boom, { projectId: "p1", input: {}, ai: createMockModelPort(), snapshot: snapshot() }, ports),
    ).rejects.toThrow(/kaboom/);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "error", toolName: "boom" });
    expect(suggestions).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  it("rejects (and error-logs) a tool that proposes an invalid suggestion", async () => {
    const bad: Tool<Record<string, never>, Record<string, never>> = {
      name: "bad",
      title: "Bad",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      run() {
        return {
          output: {},
          // A context_entry proposal whose payload doesn't match any entry kind.
          suggestions: [{ target: "context_entry", payload: { kind: "nope", payload: {} } }],
        };
      },
    };
    const { ports, runs, suggestions } = makePorts();
    await expect(
      runTool(bad, { projectId: "p1", input: {}, ai: createMockModelPort(), snapshot: snapshot() }, ports),
    ).rejects.toThrow(/invalid suggestion/i);
    expect(runs[0]).toMatchObject({ status: "error" });
    expect(suggestions).toHaveLength(0);
  });

  it("enforces the composed-run step budget", async () => {
    const { ports } = makePorts();
    await expect(
      runTool(referenceTool, { ...refInput, source: "compose", step: MAX_TOOL_STEPS }, ports),
    ).rejects.toThrow(/step budget/i);
  });
});
