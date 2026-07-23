/**
 * The `photo.uploaded` event contract (add-photo-capture; constitution §5). Uploading a photo
 * emits through the platform's trigger seam rather than naming a tool, so #9 can subscribe Code
 * Finder with one registry entry. Until then `TRIGGERS` is empty and the tool-platform spec says
 * an event with no subscribers is a **no-op** — these tests hold that line: nothing runs, no
 * `tool_run` is recorded, and nothing is proposed.
 *
 * The second test is the forward-looking half: when a subscriber *does* exist, the event
 * dispatches it with source `auto` at the next step — proving the seam is wired, not decorative,
 * without shipping a subscriber.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emit, TRIGGERS, type DispatchDeps } from "./index";
import { type AnyTool } from "./contract";
import { buildProjectSnapshot } from "../context";
import { createMockModelPort } from "../ai";

/** A recording set of dispatch ports — anything a run would persist shows up here. */
function recordingDeps(tool: AnyTool | null): {
  deps: DispatchDeps;
  runs: { toolName: string; source: string }[];
  suggestions: unknown[];
  messages: unknown[];
} {
  const runs: { toolName: string; source: string }[] = [];
  const suggestions: unknown[] = [];
  const messages: unknown[] = [];
  let seq = 0;

  const deps: DispatchDeps = {
    getTool: (name) => (tool && tool.name === name ? tool : null),
    ai: createMockModelPort(),
    buildSnapshot: async (projectId) =>
      buildProjectSnapshot({ projectId, entries: [], conversation: [] }),
    ports: {
      async startToolRun(input) {
        runs.push({ toolName: input.toolName, source: input.source });
        return { id: `run-${++seq}` };
      },
      async completeToolRun() {
        return undefined;
      },
      async listPendingSuggestions() {
        return [];
      },
      async createSuggestion(input) {
        suggestions.push(input);
        return { id: `sug-${++seq}` };
      },
      async postMessage(input) {
        messages.push(input);
        return { id: `msg-${++seq}` };
      },
    },
  };
  return { deps, runs, suggestions, messages };
}

const PHOTO_EVENT = {
  projectId: "p-1",
  input: { projectId: "p-1", photoId: "photo-1", storageKey: "biz-a/p-1/photo-1.jpg" },
};

describe("photo.uploaded", () => {
  it("ships with no subscribers", () => {
    // The seam exists before a subscriber does, on purpose (#9 adds Code Finder here).
    expect(TRIGGERS["photo.uploaded"]).toBeUndefined();
  });

  it("is a no-op today: no run, no tool_run, no suggestion, no post", async () => {
    const { deps, runs, suggestions, messages } = recordingDeps(null);

    await expect(emit("photo.uploaded", PHOTO_EVENT, deps)).resolves.toBeUndefined();

    expect(runs).toHaveLength(0);
    expect(suggestions).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  it("dispatches a subscriber with source `auto` when one is registered", async () => {
    // Prove the wire without shipping a subscriber: register one for this test only.
    const spy: AnyTool = {
      name: "photo-spy",
      title: "Photo spy",
      inputSchema: z.object({ photoId: z.string(), projectId: z.string(), storageKey: z.string() }),
      outputSchema: z.object({ saw: z.string() }),
      run: (ctx) => ({ output: { saw: (ctx.input as { photoId: string }).photoId } }),
    };
    const { deps, runs, suggestions } = recordingDeps(spy);

    const original = TRIGGERS["photo.uploaded"];
    (TRIGGERS as Record<string, readonly string[]>)["photo.uploaded"] = ["photo-spy"];
    try {
      await emit("photo.uploaded", PHOTO_EVENT, deps);
    } finally {
      if (original === undefined) delete (TRIGGERS as Record<string, readonly string[]>)["photo.uploaded"];
      else (TRIGGERS as Record<string, readonly string[]>)["photo.uploaded"] = original;
    }

    expect(runs).toEqual([{ toolName: "photo-spy", source: "auto" }]);
    // Even auto-triggered, a tool can only propose — nothing was committed.
    expect(suggestions).toHaveLength(0);
  });
});
