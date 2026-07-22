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

import type {
  BusinessSettingsRow,
  NewBusinessSettingsRow,
  NewOverheadItemRow,
  NewProjectRow,
  OverheadItemRow,
  ProjectRow,
  ProjectStatus,
} from "./schema.js";

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
 * The solo-operator financial inputs a caller may supply (constitution §3.2). All units
 * are already integers (cents/minutes/bp) — the Zod boundary converts human dollars and
 * percentages before they reach here. `business_id` is NOT among them: it is stamped by
 * `TenantDb` from its bound business, never accepted from input.
 */
export interface SettingsInput {
  annualOverheadCents: number;
  ownerWageCentsPerHour: number;
  laborBurdenBp: number;
  workingDaysPerYear: number;
  billableMinutesPerDay: number;
  incomeGoalCents: number;
  profitTargetCents: number;
  targetMarginBp: number;
  defaultContingencyBp: number;
  /** Advanced (full settings only). */
  defaultMarkupBp?: number | null | undefined;
  /** Advanced (full settings only). */
  defaultTaxRateBp?: number | null | undefined;
}

/** One optional overhead line item. `business_id` is stamped by `TenantDb`, not accepted. */
export interface OverheadItemInput {
  name: string;
  amountCents: number;
  category?: string | null | undefined;
}

/**
 * The settings port `TenantDb` talks to. Like {@link ProjectBackend}, every method takes
 * the `businessId` explicitly so the real backend can filter/stamp in SQL — but only
 * `TenantDb` calls these, always with its own bound id. `upsert` maintains one settings
 * row per business; `replaceItems` swaps the whole itemization set atomically.
 */
export interface SettingsBackend {
  getByBusiness(businessId: BusinessId): Promise<BusinessSettingsRow | null>;
  /** Insert or update this business's single settings row; returns the stored row. */
  upsert(row: NewBusinessSettingsRow): Promise<BusinessSettingsRow>;
  listItemsByBusiness(businessId: BusinessId): Promise<OverheadItemRow[]>;
  /** Replace this business's overhead items with `rows` (delete-then-insert). */
  replaceItems(businessId: BusinessId, rows: NewOverheadItemRow[]): Promise<OverheadItemRow[]>;
}

/** Backends a {@link TenantDb} composes. `settings` is optional so tests that exercise
 * only projects (or only settings) wire just what they use; feature code supplies both. */
export interface TenantBackends {
  projects: ProjectBackend;
  settings?: SettingsBackend | undefined;
}

/**
 * A data handle bound to one business. Construct it via {@link createTenantDb}. Every
 * method scopes to `this.businessId`; there is no method that accepts a different
 * business id, and creation always stamps the bound id (ignoring anything in the input).
 */
export class TenantDb {
  readonly businessId: BusinessId;
  readonly #projects: ProjectBackend;
  readonly #settings: SettingsBackend | undefined;

  /** @internal — use {@link createTenantDb}, which requires a business id. */
  constructor(businessId: BusinessId, backends: TenantBackends) {
    if (!businessId) {
      throw new Error("TenantDb requires a business id — no unscoped access.");
    }
    this.businessId = businessId;
    this.#projects = backends.projects;
    this.#settings = backends.settings;
  }

  /** The settings backend, or a clear error if this handle wasn't wired with one. */
  get #settingsBackend(): SettingsBackend {
    if (!this.#settings) {
      throw new Error("TenantDb has no settings backend configured.");
    }
    return this.#settings;
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

  /** This business's settings row, or null if onboarding hasn't saved one yet. */
  getSettings(): Promise<BusinessSettingsRow | null> {
    return this.#settingsBackend.getByBusiness(this.businessId);
  }

  /**
   * Save (insert or update) this business's settings. The stored `business_id` is always
   * this handle's — never the input's — and advanced fields default to null when absent
   * (the 3-step wizard omits them; full settings supplies them).
   */
  saveSettings(input: SettingsInput): Promise<BusinessSettingsRow> {
    return this.#settingsBackend.upsert({
      businessId: this.businessId,
      annualOverheadCents: input.annualOverheadCents,
      ownerWageCentsPerHour: input.ownerWageCentsPerHour,
      laborBurdenBp: input.laborBurdenBp,
      workingDaysPerYear: input.workingDaysPerYear,
      billableMinutesPerDay: input.billableMinutesPerDay,
      incomeGoalCents: input.incomeGoalCents,
      profitTargetCents: input.profitTargetCents,
      targetMarginBp: input.targetMarginBp,
      defaultContingencyBp: input.defaultContingencyBp,
      defaultMarkupBp: input.defaultMarkupBp ?? null,
      defaultTaxRateBp: input.defaultTaxRateBp ?? null,
    });
  }

  /** This business's overhead line items (empty if none). */
  listOverheadItems(): Promise<OverheadItemRow[]> {
    return this.#settingsBackend.listItemsByBusiness(this.businessId);
  }

  /**
   * Replace this business's overhead items. Each stored row's `business_id` is this
   * handle's — never the input's. Passing `[]` clears the itemization (the annual total
   * on settings remains the source of truth for the math).
   */
  saveOverheadItems(items: OverheadItemInput[]): Promise<OverheadItemRow[]> {
    return this.#settingsBackend.replaceItems(
      this.businessId,
      items.map((item) => ({
        businessId: this.businessId,
        name: item.name,
        amountCents: item.amountCents,
        category: item.category ?? null,
      })),
    );
  }
}

/**
 * The one way to get a tenant-bound handle: a `business_id` is required. Feature code
 * resolves the id from the session (`resolveBusinessId`, `auth.ts`) — never from client
 * input — and passes it here.
 */
export function createTenantDb(
  businessId: BusinessId,
  backends: TenantBackends,
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

/**
 * An in-memory {@link SettingsBackend} over shared arrays holding *every* tenant's rows —
 * the condition RLS defends against. Because `TenantDb` only ever passes its own
 * `businessId`, a handle bound to A can never see or touch B's settings or items here,
 * which is what the isolation tests assert. One settings row per business (keyed on
 * `business_id`), matching the unique constraint.
 */
export function createMemorySettingsBackend(
  seed: BusinessSettingsRow[] = [],
  seedItems: OverheadItemRow[] = [],
): SettingsBackend {
  const rows: BusinessSettingsRow[] = [...seed];
  const items: OverheadItemRow[] = [...seedItems];
  let seq = seed.length;
  let itemSeq = seedItems.length;
  const now = new Date(0);

  return {
    async getByBusiness(businessId) {
      return rows.find((r) => r.businessId === businessId) ?? null;
    },
    async upsert(row) {
      const existing = rows.find((r) => r.businessId === row.businessId);
      if (existing) {
        Object.assign(existing, row, { id: existing.id, updatedAt: now });
        return existing;
      }
      const stored: BusinessSettingsRow = {
        id: `mem-settings-${++seq}`,
        businessId: row.businessId,
        annualOverheadCents: row.annualOverheadCents,
        ownerWageCentsPerHour: row.ownerWageCentsPerHour,
        laborBurdenBp: row.laborBurdenBp,
        workingDaysPerYear: row.workingDaysPerYear,
        billableMinutesPerDay: row.billableMinutesPerDay,
        incomeGoalCents: row.incomeGoalCents,
        profitTargetCents: row.profitTargetCents,
        targetMarginBp: row.targetMarginBp,
        defaultContingencyBp: row.defaultContingencyBp,
        defaultMarkupBp: row.defaultMarkupBp ?? null,
        defaultTaxRateBp: row.defaultTaxRateBp ?? null,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(stored);
      return stored;
    },
    async listItemsByBusiness(businessId) {
      return items.filter((i) => i.businessId === businessId);
    },
    async replaceItems(businessId, newRows) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i]!.businessId === businessId) items.splice(i, 1);
      }
      const stored = newRows.map<OverheadItemRow>((r) => ({
        id: `mem-item-${++itemSeq}`,
        businessId: r.businessId,
        name: r.name,
        amountCents: r.amountCents,
        category: r.category ?? null,
        createdAt: now,
        updatedAt: now,
      }));
      items.push(...stored);
      return stored;
    },
  };
}
