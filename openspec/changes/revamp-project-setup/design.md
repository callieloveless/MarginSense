## Context

Creating a job is a three-field inline form (`clientName`, `address`, `scope`) →
`createProjectAction` → `projectInputSchema` → `tenantDb.createProject`. The `projects` table holds
`clientName`, `address`, `scope`, `status`. Estimates carry their own `targetMarginBp`/`contingencyBp`
(seeded from business settings at creation). The prototype makes new-job a guided two-step capturing
job type, crew, start window, and the margin/contingency the job should price to. The critique
surfaced the load-bearing question: **the wizard captures margin/contingency before any estimate
exists — where do they live?**

## Goals / Non-Goals

**Goals:** the guided two-step wizard; additive per-job fields on the project; an estimate
seed-precedence (project default → business default) that gives the captured margin/contingency a
home. **Non-Goals:** the rich job hub (its own next change); the auto-run rules screen (R9); the
chain teaser, branding badge, or client answers (R7–R9); any engine/formula change.

## Decisions

- **A project-level default tier for margin/contingency.** New nullable columns
  `default_target_margin_bp` / `default_contingency_bp` on `projects`; **estimate creation seeds**
  from the project default when set, else the business default. *Why:* the setup captures them
  before an estimate exists, and the estimate stays the source of truth for its own value — the
  default is a **seed, not a link**, so editing a default never silently mutates an existing
  estimate. *Rejected:* (a) creating an empty estimate at setup (premature, clutters versions);
  (b) storing only on the estimate (no home at setup time); (c) re-reading the project default live
  (would surprise-change existing estimates — violates store-inputs-and-recompute intent).
- **Additive nullable columns on `projects`; no new RLS policy.** The columns live on `projects`,
  already covered by its per-business Row-Level Security; the migration is `ALTER TABLE ADD COLUMN`
  (forward-only), existing rows read `null`. *Why nullable:* legacy projects + optional inputs.
- **`job_type`, `crew_size`, `start_window` stored as text (data-driven).** Chip sets constrain the
  UI (job type: Kitchen/Bath/Addition/Deck/Whole house/Repair; crew: Just me/2/3/4+) but the values
  persist as free text, so new trades or crew shapes need **no enum migration** (keeps trades
  data-driven for the electrical/plumbing expansion). `start_window` is free text ("Week of Oct 13").
- **Two-step wizard on the shell primitives** (`SteppedProgress`, chips, tokens), a client component
  posting to the server action — chips over typing (job-site reality).
- **The auto-run panel is informational** — it describes the one automation that runs today (a photo
  added → local-code check, the live `photo-advisor → code-finder` edge) and links to **no** rules
  screen (that is R9). No dead control.

## Risks / Trade-offs

- **Seed-vs-link confusion** — a contractor edits a project default expecting existing estimates to
  update; they won't (by design). *Mitigation:* label it "new estimates start here"; a spec scenario
  locks the behavior; existing estimates are edited on the estimate screen.
- **Live migration** — additive nullable columns, forward-only, no backfill → low risk; verify
  existing rows render `null` calmly across the list/dashboard.
- **`crew_size` as text** loses numeric semantics (can't sum crews) — not needed in v1, and text
  preserves "Just me" / "4+".

## Migration Plan

Forward-only migration adding five nullable columns to `projects` (`npm run db:generate`; confirm no
RLS block is needed — the columns inherit the table's policy). **Verify:** `npm run typecheck`,
`npx vitest run` (validation + estimate-seed + tenant-isolation), `npm run build`; apply the
migration to the live DB and prove the new fields are tenant-scoped (extend the projects isolation
contract); phone-width walk of create-job. **Rollback:** the columns are additive; reverting the
code leaves unused nullable columns (harmless) — no data migration to undo.

## Open Questions

- Where does the wizard land on success — the (new) rich hub or the estimate builder? Lean the hub
  (next change); until it ships, land on the existing project page.
- `crew_size` free text vs an int + "4+" flag — lean free text for v1 (display only).
