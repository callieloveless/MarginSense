## ADDED Requirements

### Requirement: Active workspace is visible in the shell
The authenticated shell SHALL show the name of the workspace (business) the current session
resolves to, so a signed-in user can always tell which account's data they are viewing. The
workspace name SHALL be resolved server-side through the existing tenant-scoped handle
(`getBusiness()` on the session-bound `TenantDb`); the shell SHALL NOT introduce a new data-access
path and SHALL NOT trust any client-supplied business id. When no data is present (an empty
jobs list), the empty state SHALL name the active workspace so an empty list reads as *this
account's* empty list rather than lost data.

#### Scenario: Header shows the active workspace
- **WHEN** a signed-in user with a resolved business views any authenticated screen
- **THEN** the shell header shows that business's name, read via the session-bound tenant handle

#### Scenario: Empty jobs list names the workspace
- **WHEN** the signed-in user's workspace has zero jobs
- **THEN** the jobs-list empty state names the active workspace (e.g. "No jobs yet in <workspace>")
  alongside the primary "new job" action, rather than a generic blank

#### Scenario: No new data path, no client-supplied id
- **WHEN** the shell resolves the active workspace name
- **THEN** it reads only through the existing tenant-scoped `getBusiness()` handle and adds no query
  or mutation that trusts a client-supplied business id
