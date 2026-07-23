/**
 * Centralized AI configuration (techstack §1 "Models", §6; constitution §7). This is the ONE
 * place model IDs and model defaults live — no magic model strings scattered across tools or
 * UI. Tools read the id from here; the port (`port.ts`) reads the defaults. Changing the
 * judgment model or the default effort is a one-line edit here.
 */

/** The effort levels the model port accepts (techstack "Models"; Claude Opus 4.x). */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Model IDs by role. `judgment` is the default judgment-heavy model for tools that reason
 * (Photo Advisor, Code Finder); a cheaper/faster model can be added here for lightweight
 * extraction/formatting without touching call sites.
 */
export const MODELS = {
  /** Default judgment-heavy tool model (techstack §1). */
  judgment: "claude-opus-4-8",
} as const;

/** Defaults every request inherits unless a tool overrides them. Adaptive thinking is on by
 * default per the Claude Opus 4.x guidance; `effort` tunes depth/cost. */
export const AI_DEFAULTS = {
  model: MODELS.judgment,
  effort: "high" as Effort,
  /** Adaptive thinking (Claude Opus 4.x): the model decides when/how much to think. */
  thinking: "adaptive" as const,
  /** Non-streaming default output cap (kept under SDK HTTP timeouts). */
  maxTokens: 16000,
} as const;

/** The environment variable that gates the real Anthropic client. Unset → AI is unconfigured. */
export const ANTHROPIC_API_KEY_ENV = "ANTHROPIC_API_KEY";

/**
 * The Anthropic server-side web-search tool (constitution §7). Declared on a request via
 * `serverTools`; the real port forwards it to the API and the mock ignores it. Centralized
 * here so the tool-type version string lives in one place — Material Finder (#7b) is the first
 * consumer, later web tools reuse it.
 */
export const WEB_SEARCH_TOOL = { type: "web_search_20260209", name: "web_search" } as const;
