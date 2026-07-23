/**
 * Unit tests for the tool dispatch seam (add-tool-dispatch). All offline against the mock port
 * and a fake lifecycle-persistence adapter. They prove: dispatch starts and finalizes a run;
 * an unknown tool starts no run; invalid input starts no run; a failure finalizes `error`
 * without masking the real error; dedup + linked emissions; the read-only boundary; the step
 * budget; and that an empty trigger registry makes `emit` a no-op.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildProjectSnapshot } from "../context";
import { createMockModelPort } from "../ai";
import {
  MAX_TOOL_STEPS,
  dispatch,
  emit,
  referenceTool,
  type DispatchDeps,
  type PendingSuggestionKey,
  type Tool,
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

/** A fake lifecycle adapter + deps. `tool` is what getTool resolves; `pending` seeds dedup. */
function makeDeps(tool: Tool<never, unknown> | null, pending: PendingSuggestionKey[] = []) {
  let n = 0;
  const runs: Array<Record<string, unknown> & { id: string }> = [];
  const finals: Array<Record<string, unknown> & { id: string }> = [];
  const suggestions: Array<Record<string, unknown> & { id: string }> = [];
  const messages: Array<Record<string, unknown> & { id: string }> = [];
  const deps: DispatchDeps = {
    getTool: () => tool as never,
    ai: createMockModelPort(),
    buildSnapshot: async () => snapshot(1),
    ports: {
      async startToolRun(input) {
        const id = `run-${++n}`;
        runs.push({ id, ...input });
        return { id };
      },
      async completeToolRun(id, input) {
        finals.push({ id, ...input });
      },
      async listPendingSuggestions() {
        return pending;
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
    },
  };
  return { deps, runs, finals, suggestions, messages };
}

const req = { toolName: "reference", projectId: "p1", input: { note: NOTE } };

describe("dispatch — happy path", () => {
  it("starts a run, emits one linked suggestion + post, finalizes ok", async () => {
    const { deps, runs, finals, suggestions, messages } = makeDeps(referenceTool as never);
    const outcome = await dispatch(req, deps);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ toolName: "reference", source: "user" });
    expect(finals).toHaveLength(1);
    expect(finals[0]).toMatchObject({ id: outcome.toolRunId, status: "ok" });
    expect(Number(finals[0]?.outputTokens ?? 0)).toBeGreaterThan(0);

    expect(suggestions[0]).toMatchObject({ target: "context_entry", author: { tool: "reference" }, toolRunId: outcome.toolRunId });
    expect(messages[0]).toMatchObject({ author: { tool: "reference" }, toolRunId: outcome.toolRunId });
    expect(outcome.output).toEqual({ echo: expect.any(String), entryCount: 1 });
    expect(outcome.createdSuggestionIds).toHaveLength(1);
  });
});

describe("dispatch — de-duplication", () => {
  it("skips a proposal identical to one already pending, still runs + posts", async () => {
    const duplicate: PendingSuggestionKey = {
      target: "context_entry",
      targetEstimateId: null,
      payload: { payload: { value: NOTE, label: "Reference note" }, kind: "fact" }, // reordered keys
    };
    const { deps, finals, suggestions, messages } = makeDeps(referenceTool as never, [duplicate]);
    const outcome = await dispatch(req, deps);

    expect(outcome.skippedDuplicates).toBe(1);
    expect(suggestions).toHaveLength(0);
    expect(messages).toHaveLength(1);
    expect(finals[0]).toMatchObject({ status: "ok" });
  });
});

describe("dispatch — safety boundary", () => {
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
    const { deps } = makeDeps(probe as never);
    await dispatch({ toolName: "probe", projectId: "p1", input: {} }, deps);
    expect(seenKeys).toEqual(["ai", "input", "snapshot"]);
    expect(frozen).toBe(true);
  });
});

describe("dispatch — failures", () => {
  it("rejects an unknown tool and starts no run", async () => {
    const { deps, runs } = makeDeps(null);
    await expect(dispatch({ toolName: "nope", projectId: "p1", input: {} }, deps)).rejects.toThrow(/unknown tool/i);
    expect(runs).toHaveLength(0);
  });

  it("rejects invalid input and starts no run", async () => {
    const { deps, runs } = makeDeps(referenceTool as never);
    await expect(dispatch({ toolName: "reference", projectId: "p1", input: {} }, deps)).rejects.toThrow();
    expect(runs).toHaveLength(0);
  });

  it("finalizes error when the tool throws, and commits nothing", async () => {
    const boom: Tool<Record<string, never>, unknown> = {
      name: "boom",
      title: "Boom",
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
      run() {
        throw new Error("kaboom");
      },
    };
    const { deps, runs, finals, suggestions, messages } = makeDeps(boom as never);
    await expect(dispatch({ toolName: "boom", projectId: "p1", input: {} }, deps)).rejects.toThrow(/kaboom/);
    expect(runs).toHaveLength(1);
    expect(finals[0]).toMatchObject({ status: "error" });
    expect(suggestions).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  it("finalizes error on an invalid proposal", async () => {
    const bad: Tool<Record<string, never>, Record<string, never>> = {
      name: "bad",
      title: "Bad",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      run() {
        return { output: {}, suggestions: [{ target: "context_entry", payload: { kind: "nope", payload: {} } }] };
      },
    };
    const { deps, finals, suggestions } = makeDeps(bad as never);
    await expect(dispatch({ toolName: "bad", projectId: "p1", input: {} }, deps)).rejects.toThrow(/invalid suggestion/i);
    expect(finals[0]).toMatchObject({ status: "error" });
    expect(suggestions).toHaveLength(0);
  });

  it("enforces the composed-run step budget", async () => {
    const { deps, runs } = makeDeps(referenceTool as never);
    await expect(dispatch({ ...req, source: "compose", step: MAX_TOOL_STEPS }, deps)).rejects.toThrow(/step budget/i);
    expect(runs).toHaveLength(0);
  });
});

describe("emit — dormant trigger registry", () => {
  it("dispatches nothing when no tool subscribes", async () => {
    const { deps, runs } = makeDeps(referenceTool as never);
    await emit("photo.uploaded", { projectId: "p1", input: { note: NOTE } }, deps);
    expect(runs).toHaveLength(0);
  });
});
