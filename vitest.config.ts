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
    // The opt-in RLS suite needs a live database; it runs via vitest.rls.config.ts.
    exclude: ["**/node_modules/**", "**/*.rls.test.ts"],
    environment: "node",
  },
});
