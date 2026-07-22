# `app/` — Next.js App Router (the outer layer / Profit Tracker)

The authenticated shell and the **outer layer**, which is *not* a Tool. See
[`constitution.md` §2](../constitution.md) (the two layers) and
[`techstack.md` §2](../techstack.md).

- `(auth)/` — sign-in / onboarding.
- `(app)/` — the authenticated Profit Tracker shell:
  - `dashboard/` — portfolio red/yellow/green.
  - `projects/[id]/` — a job: shared context, the one conversation, estimates, and tools.
  - `settings/` — business + financial settings.
- `api/` — route handlers where needed.

The outer layer includes the dashboard, onboarding/settings, the projects list, and
**creating/editing estimates**. Making a new estimate is a first-class app action that
**seeds the shared context** with the job's cost and hour data — it is not an AI tool. The
AI tools live in [`src/tools/`](../src/tools).
