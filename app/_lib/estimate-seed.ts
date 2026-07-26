/**
 * The seed precedence for a new estimate's pricing inputs (revamp-project-setup). A project may
 * carry per-job **defaults** (`default_target_margin_bp` / `default_contingency_bp`) captured at
 * setup; a new estimate seeds from those when set, else from the business settings default. This
 * is a **seed, not a link** — the returned values are copied onto the estimate at creation, so
 * changing a project default later never mutates an existing estimate. Pure and unit-tested.
 */

export function seedEstimatePricing(
  project: { defaultTargetMarginBp: number | null; defaultContingencyBp: number | null } | null,
  business: { targetMarginBp: number; defaultContingencyBp: number },
): { targetMarginBp: number; contingencyBp: number } {
  return {
    targetMarginBp: project?.defaultTargetMarginBp ?? business.targetMarginBp,
    contingencyBp: project?.defaultContingencyBp ?? business.defaultContingencyBp,
  };
}
