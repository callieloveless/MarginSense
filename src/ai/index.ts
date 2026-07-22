/**
 * The AI layer (constitution §5, §7; techstack §1, §4, §7). The single home for model IDs and
 * config, the model port tools call, its mock (used in every test), and the
 * configured/unconfigured resolver for the real Anthropic client behind `ANTHROPIC_API_KEY`.
 * Tools import from here; they never import `@anthropic-ai/sdk` directly.
 */

export * from "./config";
export * from "./port";
export * from "./mock";
export * from "./anthropic";
