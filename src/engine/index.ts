/**
 * The profit engine — MarginSense's pure, deterministic, unit-tested financial core
 * (constitution §3, §6.1). It owns **all** money math and imports nothing from Next, React,
 * Drizzle, or Anthropic: plain data in, plain data out. UI and DB call it; they never
 * re-derive totals, EPH, or color logic.
 *
 * Public surface:
 * - {@link module:money} — cents/minutes/bp primitives, half-up display, the not-applicable type.
 * - {@link module:config} — thresholds, target-profit formula, contingency base, rounding.
 * - {@link module:rates} — annual derived business rates.
 * - {@link module:estimate} — the roll-up, contingency, EPH, and margin-solve pricing.
 * - {@link module:signal} — the red/yellow/green "pull-their-weight" signal (both views).
 */

export * from "./money.js";
export * from "./config.js";
export * from "./rates.js";
export * from "./estimate.js";
export * from "./signal.js";
