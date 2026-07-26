## MODIFIED Requirements

### Requirement: Costs entered, price solved to target margin
The estimate builder SHALL send entered costs and the business `target_margin_bp` to the
engine to solve each estimate's price, and SHALL support a per-line or total price override
after which margin is recomputed as an outcome rather than solved. The estimate total SHALL
equal the sum of effective line prices (a line's entered price when present, else its derived
cost-proportional baseline). **Only a price the user enters is stored on a line**
(`priceCents`); solved and allocated baseline prices are derived values, recomputed by the
engine every time and never persisted. When any entered line price exists it supersedes a
total-price override. Derived price/margin SHALL come from `src/engine/`, never re-implemented
in the builder.

#### Scenario: Margin-solve by default
- **WHEN** the user enters costs and does not override any price
- **THEN** the estimate's price is solved by the engine so `netMargin` hits the target
  margin

#### Scenario: Override makes margin an outcome
- **WHEN** the user overrides the total price
- **THEN** the engine is not re-solved and the displayed margin is recomputed from the
  entered price

#### Scenario: Explicit line price sums to the total
- **WHEN** the user sets an explicit price on one line and leaves the others unpriced
- **THEN** the unpriced lines keep their cost-proportional baselines, the estimate total
  equals the sum of all effective line prices, and margin is recomputed as an outcome

#### Scenario: Derived prices are never stored
- **WHEN** an estimate is margin-solved without the user entering any line price
- **THEN** no `priceCents` value is written, and a later cost change re-solves the estimate
  and re-derives every line's baseline price

#### Scenario: Entered line price supersedes a total override
- **WHEN** an estimate has a total-price override and the user then enters a price on a line
- **THEN** the estimate total is the sum of effective line prices and the total override is
  not applied

#### Scenario: Legacy estimate unchanged
- **WHEN** an existing estimate has no explicit line prices
- **THEN** every line takes its derived baseline price and the estimate's total, margin, and
  signal are identical to before per-line pricing
