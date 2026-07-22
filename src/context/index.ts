/**
 * The shared-project-context module (constitution §4, §5). Public surface for the typed
 * context/suggestion shapes, the accept/dismiss state machine, and the read-only project
 * snapshot the tool contract will consume. Holds no DB connection; numbers come from
 * `src/engine/`.
 */

export * from "./context";
