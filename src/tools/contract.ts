/**
 * The tool contract (constitution §5; techstack §4). Every tool in `src/tools/*` is a plain
 * typed object of this shape — a Zod `inputSchema`, a Zod `outputSchema`, and a `run(ctx)`.
 * The contract is what makes the §5 safety rule structural: `run` receives a **read-only**
 * snapshot and the model port, and returns a {@link ToolResult}. It gets no DB handle and no
 * write path, so "a tool wrote to the estimate" is not a reachable state.
 *
 * A `ToolResult` separates three things on purpose (see the proposal): `output` is typed,
 * read-only data (the payload the future tool-graph editor routes downstream); `suggestions`
 * are proposals into the change-#5 queue (the ONLY commit path, on user accept); `message` is
 * the post to the single conversation. Keeping `output` distinct from `suggestions` is what
 * lets tools be composed without a routed output ever becoming an un-accepted write.
 */

import { type z } from "zod";
import { type ProjectSnapshot } from "../context";
import { type ModelPort } from "../ai";
import { type SuggestionTargetName } from "../db/schema";

/** A change a tool proposes. Reuses change #5's targets; the runner turns it into a `pending`
 * suggestion (never `accepted` — status is the runner's, not the tool's). */
export interface ProposedSuggestion {
  readonly target: SuggestionTargetName;
  readonly payload: unknown;
  /** For an `estimate_line_item` target: the estimate the line is added to on accept. */
  readonly targetEstimateId?: string | null | undefined;
}

/** A tool's post to the one conversation. `disclaimer` carries the licensed-professional /
 * non-authoritative notice for physical-work tools (§5, §7) uniformly. */
export interface ToolMessage {
  readonly body: string;
  readonly disclaimer?: string | undefined;
}

/** What a tool returns. `output` is validated read-only data; `suggestions` are the only
 * commit channel; `message` is optional. */
export interface ToolResult<Output = unknown> {
  readonly output: Output;
  readonly suggestions?: readonly ProposedSuggestion[] | undefined;
  readonly message?: ToolMessage | undefined;
}

/** What a tool's `run` receives: a frozen read-only snapshot, validated input, the model port.
 * There is deliberately no persistence handle here. */
export interface ToolContext<Input = unknown> {
  readonly snapshot: ProjectSnapshot;
  readonly input: Input;
  readonly ai: ModelPort;
}

/** The uniform tool shape. `Input`/`Output` are inferred from the Zod schemas. */
export interface Tool<Input = unknown, Output = unknown> {
  readonly name: string;
  readonly title: string;
  readonly inputSchema: z.ZodType<Input>;
  readonly outputSchema: z.ZodType<Output>;
  run(ctx: ToolContext<Input>): Promise<ToolResult<Output>> | ToolResult<Output>;
}

/**
 * A tool with its type parameters erased — the shape the registry and runner hold. `any` is
 * confined to this plumbing type (a registry can't be typed over each tool's distinct
 * Input/Output); the **authoring** boundary stays fully typed via each tool's own schemas,
 * and the runner re-validates every value through those schemas at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any, any>;
