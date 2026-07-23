/**
 * The tool registry (add-tool-platform) — the one enumerable list of available tools. The
 * project-page Tools surface lists it, #9's photo-upload auto-trigger will resolve a tool by
 * name from it, and #12's graph editor will draw nodes from it. New tools (#7–#10) register
 * here; nothing else hard-codes a tool list.
 */

import { type AnyTool } from "./contract";
import { referenceTool } from "./reference";
import { materialFinderTool } from "./material-finder";

/** Every registered tool, in display order. */
const TOOLS: readonly AnyTool[] = [materialFinderTool, referenceTool];

/** The registry keyed by tool name. */
export const toolRegistry: ReadonlyMap<string, AnyTool> = new Map(TOOLS.map((t) => [t.name, t]));

/** Resolve a tool by name, or `null` if it isn't registered (the runner rejects unknown names). */
export function getTool(name: string): AnyTool | null {
  return toolRegistry.get(name) ?? null;
}

/** All registered tools, for the Tools surface. */
export function listTools(): AnyTool[] {
  return [...toolRegistry.values()];
}
