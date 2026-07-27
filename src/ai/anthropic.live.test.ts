/**
 * Live Anthropic API check (OPT-IN — `npm run test:ai:live`). This one file actually hits the
 * network, so it is excluded from the default suite (by its `.live.test.ts` suffix) and only runs
 * under `vitest.live.config.ts`. It reads the token straight from `.env.local`, so it verifies the
 * exact thing that broke in the app: the configured Claude subscription token authenticates (no
 * 401) and a structured-output call returns a schema-valid result (the same path Photo Advisor
 * uses). With no token configured, the live call is skipped and the sanity check still passes.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resolveModelPort } from "./index";

/** Parse `.env.local` (repo root) into a plain map so the token is available without a dotenv dep. */
function loadEnvLocal(): Record<string, string> {
  try {
    const path = fileURLToPath(new URL("../../.env.local", import.meta.url));
    const out: Record<string, string> = {};
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[line.slice(0, i).trim()] = v;
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...loadEnvLocal(), ...process.env } as Record<string, string | undefined>;
const resolution = resolveModelPort(env);
const configured = resolution.status === "configured";

describe("live Anthropic API (opt-in)", () => {
  it("resolves the model port from .env.local (configured or not)", () => {
    expect(["configured", "unconfigured"]).toContain(resolution.status);
    if (!configured) {
      // eslint-disable-next-line no-console
      console.warn(
        "[test:ai:live] No ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY in .env.local — live call skipped.",
      );
    }
  });

  it.skipIf(!configured)(
    "authenticates and returns schema-valid structured output (the Photo Advisor path)",
    async () => {
      if (resolution.status !== "configured") return; // type-narrow; skipIf already guards
      const schema = z.object({
        sizes: z.array(z.string().min(1)).min(1),
      });
      const res = await resolution.port.complete({
        system: "You help a trade contractor. Answer concisely and record the result with the tool.",
        messages: [
          {
            role: "user",
            content:
              "Name two common dimensional framing lumber sizes (like 2x4). Record them with the result tool.",
          },
        ],
        resultSchema: schema,
      });
      const result = res.result as { sizes: string[] };
      expect(Array.isArray(result.sizes)).toBe(true);
      expect(result.sizes.length).toBeGreaterThan(0);
      expect(res.usage.outputTokens).toBeGreaterThan(0);
    },
    60_000,
  );
});
