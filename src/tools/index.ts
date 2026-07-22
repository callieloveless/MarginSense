/**
 * The tool platform (constitution §5; techstack §4). Public surface for the uniform tool
 * contract, the registry, the runner (read-only snapshot in; de-duplicated pending
 * suggestions + a linked conversation post out), and the reference tool. Tools read a
 * read-only snapshot and emit only suggestions — the accept-to-commit guarantee is structural
 * here and holds across composed tools (§5 "Composing tools").
 */

export * from "./contract";
export * from "./runner";
export * from "./registry";
export { referenceTool } from "./reference";
