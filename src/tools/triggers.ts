/**
 * The event → tool trigger registry (add-tool-dispatch) — the seam that lets an event fire the
 * tools subscribed to it, instead of a tool being named by whatever emitted the event. It ships
 * **dormant** (no subscribers): #8's photo upload will `emit("photo.uploaded", …)`, #9 will
 * subscribe Code Finder by adding one entry here, and #12's graph editor will make this table
 * user-editable. Every triggered run goes through {@link dispatch} with `source: "auto"` and a
 * bumped step, so the step budget bounds any chain.
 */

import { dispatch, type DispatchDeps } from "./runner";

/** A named event a tool can subscribe to. Kept open (a string) so tools define their own. */
export type ToolEvent = string;

/**
 * Event → the tool names it dispatches, in order. **Empty for now** — the seam exists before a
 * subscriber does, on purpose (so #8 emits rather than calls). Add entries as tools register,
 * e.g. `{ "photo.uploaded": ["code-finder"] }`.
 */
export const TRIGGERS: Readonly<Record<ToolEvent, readonly string[]>> = {};

/** Context an emitted event carries: the project it happened in, the input handed to each
 * subscribed tool, and the current composition depth. */
export interface EmitContext {
  readonly projectId: string;
  readonly input: unknown;
  readonly step?: number | undefined;
}

/**
 * Emit an event: dispatch every subscribed tool with `source: "auto"` at the next step. A no-op
 * when nothing subscribes. Tenant scope and the step budget come from {@link dispatch}.
 */
export async function emit(event: ToolEvent, ctx: EmitContext, deps: DispatchDeps): Promise<void> {
  const subscribers = TRIGGERS[event] ?? [];
  for (const toolName of subscribers) {
    await dispatch(
      { toolName, projectId: ctx.projectId, input: ctx.input, source: "auto", step: (ctx.step ?? 0) + 1 },
      deps,
    );
  }
}
