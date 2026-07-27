import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve the `@/…` path alias (Next's tsconfig `paths`) so app-layer glue under `app/`
  // (which imports via `@/src/...`) is testable, not just the relative-import `src/` modules.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
    // Opt-in suites that need real infra run via their own configs: the RLS suite
    // (vitest.rls.config.ts, live Postgres) and the live-AI suite (vitest.live.config.ts,
    // real Anthropic API). Both are kept out of the default run by their file suffix.
    exclude: ["**/node_modules/**", "**/*.rls.test.ts", "**/*.live.test.ts"],
    environment: "node",
  },
});
