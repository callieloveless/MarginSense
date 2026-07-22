# `src/db/` — Drizzle schema, migrations, tenant-scoped queries

The data plane. See [`constitution.md` §6.3/§6.4](../../constitution.md) and
[`techstack.md` §3](../../techstack.md).

- Every business-owned table has a non-null `business_id`. **Row-Level Security is on**;
  policies restrict every row to its business. The DB is the guarantee of tenant
  isolation — the UI filtering it too, but a missing tenant filter is a security incident.
- All tenant-scoped access goes through helpers here that **require** a `business_id`.
  Never write a raw query that could span tenants.
- Money columns are integer cents, time columns integer minutes, percentages basis points.
  Column names make the unit explicit (`*_cents`, `*_minutes`, `*_bp`). Timestamps in UTC.
- Migrations are **forward-only**, one reviewed file per change, generated and applied
  through Drizzle. No editing production schema by hand.
