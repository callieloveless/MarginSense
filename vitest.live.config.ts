import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Opt-in live-AI suite: makes REAL Anthropic API calls (consuming your Claude subscription / API
 * usage) to prove the configured token authenticates and structured output works end-to-end. Run
 * with `npm run test:ai:live`; it reads the token from `.env.local`. Kept out of the default unit
 * run (which needs no network or key) via a distinct file suffix, exactly like the RLS suite.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.live.test.ts"],
    environment: "node",
    testTimeout: 60000,
  },
});
