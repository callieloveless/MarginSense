import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // The opt-in RLS suite needs a live database; it runs via vitest.rls.config.ts.
    exclude: ["**/node_modules/**", "**/*.rls.test.ts"],
    environment: "node",
  },
});
