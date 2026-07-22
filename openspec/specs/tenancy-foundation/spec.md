# tenancy-foundation Specification

## Purpose
TBD - created by archiving change add-tenancy-foundation. Update Purpose after archive.
## Requirements
### Requirement: Tenant spine tables
The system SHALL persist the domain spine as `businesses` (the tenant: name, trade
type), `users` (a unique auth identity mapped to exactly one business), and `projects`
(one client job: client name, address, scope, status), where every business-owned row
carries a non-null `business_id`.

#### Scenario: A project always belongs to a business
- **WHEN** a project row is inserted without a `business_id`
- **THEN** the database rejects the insert (non-null constraint)

#### Scenario: One user, one business
- **WHEN** a second `users` row is inserted with an `auth_id` that already exists
- **THEN** the database rejects the insert (unique constraint)

#### Scenario: Project status is constrained
- **WHEN** a project is written with a status outside `active | complete | archived`
- **THEN** the write is rejected at the validation boundary

### Requirement: Row-Level Security on every business-owned table
The database SHALL have Row-Level Security enabled on every business-owned table from
its first migration, with policies restricting each row to the business of the
authenticated user (resolved from the user's auth identity via the `users` table). The
client SHALL never supply the `business_id` used for authorization.

#### Scenario: Cross-tenant read is blocked by the database
- **WHEN** a session authenticated as a user of business A queries `projects`
- **THEN** rows belonging to business B are absent from every result, regardless of the
  query's filters

#### Scenario: Cross-tenant write is blocked by the database
- **WHEN** a session authenticated as a user of business A attempts to insert or update
  a row with business B's `business_id`
- **THEN** the database rejects the write

#### Scenario: RLS ships with the schema
- **WHEN** the migration creating a business-owned table is applied
- **THEN** the same migration enables RLS and creates its per-business policy — there is
  no window where the table exists unprotected

### Requirement: RLS is enforced on every application query
Because the application reaches the database as a single pooled connection role, the
system SHALL run every tenant-scoped query inside an authenticated request context that
publishes the server-verified user identity as `auth.uid()` and assumes a role the RLS
policies apply to (rather than a role that bypasses them). The identity SHALL be the one
verified from the session, never a value from client input, and SHALL be scoped to the
single transaction.

#### Scenario: Query carries the signed-in identity
- **WHEN** a tenant-scoped query runs for a signed-in user
- **THEN** it executes in a transaction where `auth.uid()` equals that user's id and the
  active role is subject to RLS, so the policies filter rows to the user's business

#### Scenario: No identity means no access
- **WHEN** the authenticated context cannot be established (no verified user id)
- **THEN** the query is not run (it fails closed) rather than executing with RLS bypassed

#### Scenario: Context does not leak between requests
- **WHEN** a request's authenticated transaction completes
- **THEN** the identity and role revert, so a subsequent request on the same pooled
  connection does not inherit the previous user's `auth.uid()` or role

### Requirement: Tenant-scoped data access helpers
All application data access SHALL go through `src/db/` helpers that operate on a query
handle already bound to a `business_id`; obtaining a handle SHALL require a
`business_id`, and no unscoped query path SHALL be exported to feature code.

#### Scenario: A bound handle cannot reach another tenant
- **WHEN** a query handle bound to business A lists, reads, or mutates projects
- **THEN** only business A's rows are visible or affected, even if business B's row ids
  are supplied directly

#### Scenario: Creation stamps the bound tenant
- **WHEN** a project is created through a handle bound to business A
- **THEN** the stored row's `business_id` is business A's, regardless of any
  `business_id` present in the input

### Requirement: Session resolves to one business server-side
The system SHALL resolve the signed-in user's `business_id` on the server from the auth
session (auth identity → `users.business_id`), SHALL scope every request's data access
to that single business, and SHALL NOT trust a business identifier from client input.

#### Scenario: Signed-in user is scoped to their business
- **WHEN** a signed-in user of business A loads the projects list
- **THEN** the server resolves business A from the session and the list contains only
  business A's projects

#### Scenario: Client-supplied business id is ignored
- **WHEN** a request arrives carrying a different `business_id` in its payload
- **THEN** data access still uses the session-resolved business

### Requirement: Authenticated app shell
The application SHALL serve an authenticated `(app)` shell (dashboard, projects list,
project detail, settings) only to signed-in users, SHALL redirect signed-out users to
sign-in, and SHALL route a signed-in user with no business to a create-business step —
the only path that creates a `businesses` row.

#### Scenario: Signed-out access is redirected
- **WHEN** a signed-out visitor requests any `(app)` route
- **THEN** they are redirected to sign-in

#### Scenario: First sign-in creates the business
- **WHEN** a newly signed-up user with no `users` row completes the create-business step
  with a name and trade type
- **THEN** a `businesses` row and their `users` row are created and they land in the
  `(app)` shell scoped to that business

### Requirement: Forward-only, versioned migrations
Schema changes SHALL ship as versioned, forward-only migration files generated and
applied through the ORM tooling, with RLS statements versioned in the same files; the
production schema SHALL never be edited by hand.

#### Scenario: Schema and policies are reproducible
- **WHEN** the migration files are applied in order to an empty database
- **THEN** the resulting schema, RLS state, and policies match what the application and
  tests expect, with no manual steps

