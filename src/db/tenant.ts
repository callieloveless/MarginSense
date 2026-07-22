/**
 * Tenant-scoped data access (constitution §6.3; techstack §3).
 *
 * The rule: **all application data access goes through a handle already bound to a
 * `business_id`, and obtaining that handle requires a `business_id`.** Feature code
 * never sees a raw, unscoped query path — so "a query that spans tenants" is not a
 * state the code can reach. Row-Level Security in the database is the second layer
 * (the guarantee); this is the first (defense in depth).
 *
 * The seam is a small `ProjectBackend` port. The real backend runs Drizzle SQL that
 * filters/stamps by `business_id` (`drizzle-backend.ts`); an in-memory backend
 * (`createMemoryProjectBackend`) lets the isolation tests prove the guarantee with no
 * live database. `TenantDb` is the *only* caller of the port, and it always passes its
 * own bound `businessId` — never one from input.
 */

import type { NewProjectRow, ProjectRow, ProjectStatus } from "./schema.js";

/** A business id. A branded string would be nicer; kept plain for v1 simplicity. */
export type BusinessId = string;

/** Fields a caller may supply when creating a project. `business_id` is NOT among them. */
export interface ProjectInput {
  clientName: string;
  address?: string | null | undefined;
  scope?: string | null | undefined;
}

/**
 * The port `TenantDb` talks to. Every method takes the `businessId` explicitly so the
 * backend can filter/stamp in SQL (the real impl) — but only `TenantDb` calls these, and
 * it always supplies its own bound id. Implementations must never return or mutate a row
 * whose `business_id` differs from the one passed.
 */
export interface ProjectBackend {
  listByBusiness(businessId: BusinessId): Promise<ProjectRow[]>;
  getByBusiness(businessId: BusinessId, id: string): Promise<ProjectRow | null>;
  /** `row.businessId` is set by `TenantDb`; the backend persists it verbatim. */
  insert(row: NewProjectRow): Promise<ProjectRow>;
  updateStatusByBusiness(
    businessId: BusinessId,
    id: string,
    status: ProjectStatus,
  ): Promise<ProjectRow | null>;
}

/**
 * A data handle bound to one business. Construct it via {@link createTenantDb}. Every
 * method scopes to `this.businessId`; there is no method that accepts a different
 * business id, and creation always stamps the bound id (ignoring anything in the input).
 */
export class TenantDb {
  readonly businessId: BusinessId;
  readonly #projects: ProjectBackend;

  /** @internal — use {@link createTenantDb}, which requires a business id. */
  constructor(businessId: BusinessId, backends: { projects: ProjectBackend }) {
    if (!businessId) {
      throw new Error("TenantDb requires a business id — no unscoped access.");
    }
    this.businessId = businessId;
    this.#projects = backends.projects;
  }

  /** List this business's projects. Another tenant's rows can never appear here. */
  listProjects(): Promise<ProjectRow[]> {
    return this.#projects.listByBusiness(this.businessId);
  }

  /** Get one project by id, scoped to this business. Returns null if it isn't ours. */
  getProject(id: string): Promise<ProjectRow | null> {
    return this.#projects.getByBusiness(this.businessId, id);
  }

  /** Create a project. The stored `business_id` is always this handle's — never the input's. */
  createProject(input: ProjectInput): Promise<ProjectRow> {
    return this.#projects.insert({
      businessId: this.businessId,
      clientName: input.clientName,
      address: input.address ?? null,
      scope: input.scope ?? null,
    });
  }

  /** Update a project's status, scoped to this business. Null if it isn't ours (no-op). */
  updateProjectStatus(id: string, status: ProjectStatus): Promise<ProjectRow | null> {
    return this.#projects.updateStatusByBusiness(this.businessId, id, status);
  }
}

/**
 * The one way to get a tenant-bound handle: a `business_id` is required. Feature code
 * resolves the id from the session (`resolveBusinessId`, `auth.ts`) — never from client
 * input — and passes it here.
 */
export function createTenantDb(
  businessId: BusinessId,
  backends: { projects: ProjectBackend },
): TenantDb {
  return new TenantDb(businessId, backends);
}

// --- In-memory backend (for isolation tests; no live database) ----------------------

/**
 * An in-memory `ProjectBackend` over a shared row array that holds *every* tenant's
 * rows — exactly the condition RLS defends against. Because `TenantDb` only ever passes
 * its own `businessId`, a handle bound to A can never see or touch B's rows here, which
 * is what the isolation tests assert.
 */
export function createMemoryProjectBackend(seed: ProjectRow[] = []): ProjectBackend {
  const rows: ProjectRow[] = [...seed];
  let seq = seed.length;
  const now = new Date(0);

  return {
    async listByBusiness(businessId) {
      return rows.filter((r) => r.businessId === businessId);
    },
    async getByBusiness(businessId, id) {
      return rows.find((r) => r.id === id && r.businessId === businessId) ?? null;
    },
    async insert(row) {
      const stored: ProjectRow = {
        id: `mem-${++seq}`,
        businessId: row.businessId,
        clientName: row.clientName,
        address: row.address ?? null,
        scope: row.scope ?? null,
        status: row.status ?? "active",
        createdAt: now,
        updatedAt: now,
      };
      rows.push(stored);
      return stored;
    },
    async updateStatusByBusiness(businessId, id, status) {
      const row = rows.find((r) => r.id === id && r.businessId === businessId);
      if (!row) return null;
      row.status = status;
      return row;
    },
  };
}
