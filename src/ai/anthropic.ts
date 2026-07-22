/**
 * The real model port and the configured/unconfigured resolver (constitution §7; techstack
 * §7). Mirrors the Supabase seam in `src/db/session.ts`: with no `ANTHROPIC_API_KEY`, the AI
 * layer reports `unconfigured` and the real client is never constructed, so the app renders a
 * "connect AI" state instead of crashing. The Anthropic key is server-side only.
 *
 * **Live model calls are deferred to live infra** (see `relevant_notes.md` §5). This change
 * builds and tests the whole platform against the mock port; wiring `@anthropic-ai/sdk` into
 * `createAnthropicModelPort` is the explicit follow-up stage once a key exists. Keeping the
 * SDK out of the import graph until then means the mock path builds with no new dependency.
 */

import { ANTHROPIC_API_KEY_ENV } from "./config";
import { type ModelPort } from "./port";

/** Whether the AI layer has a usable configuration this request. */
export type ModelPortResolution =
  | { readonly status: "configured"; readonly port: ModelPort }
  | { readonly status: "unconfigured" };

/**
 * The real Anthropic-backed port. **Not yet wired** — live calls are deferred (see the module
 * note). Its `complete` throws a clear, actionable error rather than silently returning
 * nothing, so the follow-up stage is obvious and nothing pretends to have called a model.
 */
export function createAnthropicModelPort(): ModelPort {
  return {
    async complete() {
      throw new Error(
        "Live Anthropic model calls are not wired yet (deferred — see relevant_notes.md §5). " +
          "Set ANTHROPIC_API_KEY and implement createAnthropicModelPort against @anthropic-ai/sdk.",
      );
    },
  };
}

/**
 * Resolve the model port from the environment. Returns `unconfigured` when
 * `ANTHROPIC_API_KEY` is unset (the real client is never constructed); otherwise a
 * `configured` port. `env` is injectable for tests.
 */
export function resolveModelPort(
  env: Record<string, string | undefined> = process.env,
): ModelPortResolution {
  const key = env[ANTHROPIC_API_KEY_ENV];
  if (!key) return { status: "unconfigured" };
  return { status: "configured", port: createAnthropicModelPort() };
}
