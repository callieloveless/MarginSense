## Why

Creating a job today is a three-field inline form (client, address, scope) with no sense of
occasion and none of the context the rest of the app needs — a job's **type**, the **crew** on it,
when it **starts**, and the **margin/contingency** it should price to. The prototype makes new-job
a short, guided two-step: *Who & where* and *Money & schedule*. Capturing those up front means the
first estimate is already pointed at the right target, the address sets the code jurisdiction, and
the dashboard/hub have real facts to show — instead of the contractor re-entering them later.

## What Changes

- **A guided 2-step new-job wizard** on the shell, replacing the inline form:
  - **Who & where:** client name, job address (sets the code jurisdiction), **job type** (chips),
    scope note.
  - **Money & schedule:** **target margin** and **contingency** for this job, **crew size** (chips),
    a **start window**, and an *auto-run* panel that plainly describes the automation that actually
    runs today (a photo you add gets a local-code check) — no promise of automation that doesn't
    exist yet.
- **Per-job fields on the project** (nullable, additive): `job_type`, `crew_size`, `start_window`,
  and **default** `target_margin_bp` / `contingency_bp`.
- **The per-job margin/contingency get a real home (the critique's key fix).** They are stored as
  **project-level defaults** that **seed a new estimate's** `target_margin_bp` / `contingency_bp`
  when it is created — the estimate remains the source of truth for *its own* values; the project
  just supplies the starting point. When a project default is unset, estimate creation falls back to
  the business settings default (today's behavior). Nothing derived is stored; margins are basis
  points.

## Financial-model interaction (called out per the rules)

Per-job margin/contingency are **inputs** (basis points), consistent with §3.4 (which already allows
per-line/total overrides and a per-business default). This change adds a **project-level default tier**
between the business default and the estimate's own value — a seed, not a new computation. No total,
threshold, EPH, or formula changes. Every value is stored as an integer input, never a derived one.

## Capabilities

### New Capabilities
- `project-setup`: the guided two-step new-job flow and the per-job fields it captures (type, crew,
  start window, and the margin/contingency defaults), stored tenant-isolated on the project, with an
  auto-run panel that describes only automation that exists.

### Modified Capabilities
- `estimates`: when an estimate is created for a project, its `target_margin_bp` and `contingency_bp`
  seed from the project's defaults when set, else from the business settings default.

## Impact

- **Schema:** a forward-only migration adds five **nullable** columns to the existing `projects`
  table (`job_type`, `crew_size`, `start_window`, `default_target_margin_bp`,
  `default_contingency_bp`). No new RLS policy is needed — the columns live on `projects`, whose
  per-business policy already covers them; existing rows read as `null` and render calmly.
- **Code:** `app/(app)/projects/new-project-form.tsx` (→ a 2-step wizard on the shell primitives),
  `app/(app)/projects/actions.ts` + `src/db/validation.ts` (accept + validate the new inputs),
  `src/db/schema.ts` + `src/db/{tenant,drizzle-backend}.ts` (`createProject` carries the fields),
  the estimate-creation path (seed precedence). Tenant-isolation test extended for the new columns.
- **No touch:** `src/engine/` (no formula change), thresholds, the client document, tools.

## Non-goals

- **The rich job hub** (profit hero, tools grid, waiting-on-you, activity feed) — its **own** next
  change (`revamp-project-hub`); this change only creates the job and its facts.
- **The auto-run rules screen / "Change the rules" link** — a **Later feature (L2)**; the setup
  panel here is informational only (no dead link to a screen that doesn't exist).
- The **chain teaser** (L2), **branding / "Jane's copy" badge** (R9), and **client answers** (L1) —
  none appear in this change.
- No change to the profit formula, thresholds, or the estimate roll-up math.
