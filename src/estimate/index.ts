/**
 * The estimate builder module (constitution §3.4, §6.8). Public surface for turning stored
 * line items + pricing inputs into the engine's typed roll-up. Consumes `src/engine/` only;
 * never imports `src/profit/` — the roll-up it returns is the seam between the two.
 */

export * from "./estimate";
export * from "./client-projection";
