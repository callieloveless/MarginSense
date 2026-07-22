/**
 * `src/db/` public surface — the tenant spine and its scoped access (constitution §2,
 * §6.3; techstack §3). Feature code imports tenant-scoped helpers and validation from
 * here; the live connection (`client.ts`) is imported directly where a real DB is needed
 * so tests never pull in `postgres`.
 */

export * from "./schema";
export * from "./tenant";
export * from "./auth";
export * from "./validation";
