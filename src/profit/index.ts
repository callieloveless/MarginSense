/**
 * The profit surface module (constitution §3.5, §6.8). Public surface for coloring a
 * finished estimate roll-up and building the portfolio ranking. Consumes `src/engine/` only;
 * never imports `src/estimate/` — the engine roll-up it receives is the seam between them.
 */

export * from "./profit.js";
