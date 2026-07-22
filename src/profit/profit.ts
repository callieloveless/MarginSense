/**
 * The profit surface's domain module (constitution §3.5, §6.8) — the second surface on top
 * of the engine, and the judgment layer over the estimate builder's output. It reads a
 * finished **engine roll-up** (the typed seam) plus the business's annual figures and asks
 * the engine to color it: the absolute red/yellow/green for one estimate, and the
 * comparative fair-share ranking + "against your year" figures for the portfolio.
 *
 * It imports `src/engine/` only — never `src/estimate/`. The single value it receives from
 * the estimate side is the engine's `EstimateRollUp`, so the two surfaces never blur
 * (constitution §6.8).
 */

import {
  type AbsoluteSignal,
  type Cents,
  type CentsPerHour,
  type ComparativeSignal,
  type Computed,
  type EngineConfig,
  type EstimateRollUp,
  DEFAULT_CONFIG,
  signalAbsolute,
  signalComparative,
} from "../engine/index";

/**
 * The red/yellow/green for a single estimate: the engine's absolute view of its EPH against
 * the business target. Not-applicable when the roll-up has no EPH (no labor hours) or the
 * target is undefined/zero.
 */
export function estimateSignal(
  rollUp: EstimateRollUp,
  targetProfitPerHour: Computed<CentsPerHour>,
  config: EngineConfig = DEFAULT_CONFIG,
): Computed<AbsoluteSignal> {
  return signalAbsolute(rollUp.eph, targetProfitPerHour, config);
}

/** One job's contribution to the portfolio (drawn from its active version's roll-up). */
export interface PortfolioJobInput {
  readonly projectId: string;
  readonly projectName: string;
  readonly laborHours: number;
  readonly netProfit: Cents;
  readonly overheadAllocated: Cents;
}

/** The business-level figures the comparative view needs. */
export interface BusinessPortfolioInput {
  readonly annualBillableHours: number;
  readonly grossProfitGoal: Cents;
}

/** A ranked portfolio entry: its comparative signal (color, weight, and the two figures). */
export interface PortfolioJob {
  readonly projectId: string;
  readonly projectName: string;
  readonly signal: Computed<ComparativeSignal>;
}

/** Sort key: a job's weight, with not-applicable jobs pushed to the end. */
function weightOf(job: PortfolioJob): number {
  return job.signal.ok ? job.signal.value.weight : Number.POSITIVE_INFINITY;
}

/**
 * Build the portfolio: score every job with the engine's comparative view within the set,
 * then rank **worst-first** (ascending weight) so the jobs not pulling their weight surface
 * at the top. Each entry carries its `percentOfYear` and `percentOfProfitGoal`. Ratios are
 * the engine's; this module computes none itself.
 */
export function buildPortfolio(
  jobs: readonly PortfolioJobInput[],
  business: BusinessPortfolioInput,
  config: EngineConfig = DEFAULT_CONFIG,
): PortfolioJob[] {
  const totalHours = jobs.reduce((sum, j) => sum + j.laborHours, 0);
  const totalProfit = jobs.reduce((sum, j) => sum + j.netProfit, 0);

  const scored: PortfolioJob[] = jobs.map((j) => ({
    projectId: j.projectId,
    projectName: j.projectName,
    signal: signalComparative(
      {
        laborHours: j.laborHours,
        netProfit: j.netProfit,
        overheadAllocated: j.overheadAllocated,
        totalHours,
        totalProfit,
        annualBillableHours: business.annualBillableHours,
        grossProfitGoal: business.grossProfitGoal,
      },
      config,
    ),
  }));

  return scored.sort((a, b) => weightOf(a) - weightOf(b));
}
