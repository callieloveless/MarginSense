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
  ContextEntryKindName,
  ContextEntryRow,
  ConversationMessageRow,
  EstimateRow,
  LineCategoryName,
  LineItemRow,
  NewBusinessSettingsRow,
  NewContextEntryRow,
  NewConversationMessageRow,
  NewEstimateRow,
  NewLineItemRow,
  NewOverheadItemRow,
  NewProjectRow,
  NewSuggestionRow,
  NewToolRunRow,
  OverheadItemRow,
  ProjectRow,
  ProjectStatus,
  SuggestionRow,
  SuggestionStatusName,
  SuggestionTargetName,
  ToolRunRow,
  ToolRunSourceName,
  ToolRunStatusName,
} from "./schema";
import {
  authorToRow,
  nextStatus,
  suggestionEffect,
  type Author,
  type ProposedLineItem,
  type SuggestionAction,
} from "../context";

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

/** Fields for creating an estimate version. `business_id` is stamped by `TenantDb`. */
export interface EstimateInput {
  projectId: string;
  versionLabel: string;
  targetMarginBp: number;
  contingencyBp: number;
  /** Make this the project's active version (unsets any other). */
  isActive?: boolean | undefined;
  /** Deliberate total-price override; null/omitted → price is margin-solved. */
  totalPriceOverrideCents?: number | null | undefined;
}

/** A partial update to an estimate's pricing inputs / label. */
export interface EstimatePatch {
  versionLabel?: string | undefined;
  targetMarginBp?: number | undefined;
  contingencyBp?: number | undefined;
  totalPriceOverrideCents?: number | null | undefined;
}

/** One line-item's inputs. `business_id`/`estimate_id` are stamped by `TenantDb`. */
export interface LineItemInput {
  category: LineCategoryName;
  description?: string | null | undefined;
  laborMinutes?: number | null | undefined;
  quantity?: number | null | undefined;
  unitCostCents?: number | null | undefined;
  priceCents?: number | null | undefined;
  sortOrder?: number | undefined;
}

/** An estimate together with its line items (for computing a roll-up). */
export interface EstimateWithLines {
  estimate: EstimateRow;
  lines: LineItemRow[];
}

/**
 * The estimate port `TenantDb` talks to. Every method takes `businessId` explicitly so the
 * real backend filters/stamps in SQL — but only `TenantDb` calls these, always with its own
 * bound id. `setActive` enforces one active version per project; `replaceLineItems` swaps a
 * version's whole line set atomically.
 */
export interface EstimateBackend {
  listByProject(businessId: BusinessId, projectId: string): Promise<EstimateRow[]>;
  getById(businessId: BusinessId, id: string): Promise<EstimateRow | null>;
  insert(row: NewEstimateRow): Promise<EstimateRow>;
  update(businessId: BusinessId, id: string, patch: EstimatePatch): Promise<EstimateRow | null>;
  /** Set `estimateId` active and clear any other active version for `projectId`. */
  setActive(businessId: BusinessId, projectId: string, estimateId: string): Promise<void>;
  listLineItems(businessId: BusinessId, estimateId: string): Promise<LineItemRow[]>;
  replaceLineItems(businessId: BusinessId, estimateId: string, rows: NewLineItemRow[]): Promise<LineItemRow[]>;
  /** Every project's active version + its lines (for the portfolio dashboard). */
  listActiveWithLines(businessId: BusinessId): Promise<EstimateWithLines[]>;
}

/** A context entry to add. `business_id` and author columns are stamped by `TenantDb`. */
export interface ContextEntryInput {
  projectId: string;
  kind: ContextEntryKindName;
  /** Validated by the `src/context/` schema for `kind` before it reaches here. */
  payload: unknown;
  author?: Author | undefined;
}

/** A message to post into a project's single conversation. */
export interface MessageInput {
  projectId: string;
  body: string;
  author?: Author | undefined;
  /** The tool run that authored this message, when a tool posted it (add-tool-platform). */
  toolRunId?: string | null | undefined;
}

/** A suggestion to create (always `pending`). */
export interface SuggestionInput {
  projectId: string;
  target: SuggestionTargetName;
  payload: unknown;
  targetEstimateId?: string | null | undefined;
  author?: Author | undefined;
  /** The tool run that proposed this suggestion, when a tool created it (add-tool-platform). */
  toolRunId?: string | null | undefined;
}

/** Start a tool run (add-tool-dispatch): inserts a running record (terminal `status` NULL).
 * `business_id` is stamped by `TenantDb`, never accepted from input. */
export interface StartToolRunInput {
  projectId: string;
  toolName: string;
  source?: ToolRunSourceName | undefined;
}

/** Finalize a running tool run to its terminal status + cost. Recorded for `ok` and `error`
 * alike, so partial AI spend stays observable (§7). */
export interface CompleteToolRunInput {
  status: ToolRunStatusName;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  latencyMs?: number | undefined;
}

/** The outcome of resolving (accepting/dismissing) a suggestion. */
export type SuggestionResolution =
  | {
      ok: true;
      suggestion: SuggestionRow;
      /** What accepting committed, or null for a dismiss / idempotent no-op. */
      committed: "context_entry" | "estimate_line_item" | null;
    }
  | { ok: false; error: string };

/**
 * The context port `TenantDb` talks to. Like the others, every method takes `businessId`
 * explicitly (only `TenantDb` calls these, always with its own bound id). `resolveSuggestion`
 * is the accept/dismiss orchestrator: it runs the state machine and performs the effect
 * (commit a context entry or append an estimate line item) in **one** transaction.
 */
export interface ContextBackend {
  listEntries(businessId: BusinessId, projectId: string): Promise<ContextEntryRow[]>;
  addEntry(row: NewContextEntryRow): Promise<ContextEntryRow>;
  listMessages(businessId: BusinessId, projectId: string): Promise<ConversationMessageRow[]>;
  addMessage(row: NewConversationMessageRow): Promise<ConversationMessageRow>;
  listSuggestions(
    businessId: BusinessId,
    projectId: string,
    opts?: { status?: SuggestionStatusName | undefined } | undefined,
  ): Promise<SuggestionRow[]>;
  getSuggestion(businessId: BusinessId, id: string): Promise<SuggestionRow | null>;
  createSuggestion(row: NewSuggestionRow): Promise<SuggestionRow>;
  resolveSuggestion(
    businessId: BusinessId,
    id: string,
    action: SuggestionAction,
  ): Promise<SuggestionResolution>;
}

/**
 * The tool-run port `TenantDb` talks to (add-tool-platform). Records what a tool invocation
 * cost — tokens, latency, status — so AI spend is observable per tenant (§7). Like the other
 * ports, only `TenantDb` calls it, always with its own bound business id.
 */
export interface ToolRunsBackend {
  listByProject(businessId: BusinessId, projectId: string): Promise<ToolRunRow[]>;
  /** Insert a running record (`row.status` NULL). `row.businessId` is set by `TenantDb`. */
  startRun(row: NewToolRunRow): Promise<ToolRunRow>;
  /** Finalize a run to its terminal status + cost, scoped to the business. Null if not ours. */
  finalizeRun(
    businessId: BusinessId,
    id: string,
    patch: { status: ToolRunStatusName; inputTokens: number; outputTokens: number; latencyMs: number },
  ): Promise<ToolRunRow | null>;
}

/** Backends a {@link TenantDb} composes. All but `projects` are optional so tests wire just
 * what they exercise; feature code (via `tenantDbForSession`) supplies all. */
export interface TenantBackends {
  projects: ProjectBackend;
  settings?: SettingsBackend | undefined;
  estimates?: EstimateBackend | undefined;
  context?: ContextBackend | undefined;
  toolRuns?: ToolRunsBackend | undefined;
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
  readonly #estimates: EstimateBackend | undefined;
  readonly #context: ContextBackend | undefined;
  readonly #toolRuns: ToolRunsBackend | undefined;

  /** @internal — use {@link createTenantDb}, which requires a business id. */
  constructor(businessId: BusinessId, backends: TenantBackends) {
    if (!businessId) {
      throw new Error("TenantDb requires a business id — no unscoped access.");
    }
    this.businessId = businessId;
    this.#projects = backends.projects;
    this.#settings = backends.settings;
    this.#estimates = backends.estimates;
    this.#context = backends.context;
    this.#toolRuns = backends.toolRuns;
  }

  /** The settings backend, or a clear error if this handle wasn't wired with one. */
  get #settingsBackend(): SettingsBackend {
    if (!this.#settings) {
      throw new Error("TenantDb has no settings backend configured.");
    }
    return this.#settings;
  }

  /** The estimate backend, or a clear error if this handle wasn't wired with one. */
  get #estimateBackend(): EstimateBackend {
    if (!this.#estimates) {
      throw new Error("TenantDb has no estimate backend configured.");
    }
    return this.#estimates;
  }

  /** The context backend, or a clear error if this handle wasn't wired with one. */
  get #contextBackend(): ContextBackend {
    if (!this.#context) {
      throw new Error("TenantDb has no context backend configured.");
    }
    return this.#context;
  }

  /** The tool-runs backend, or a clear error if this handle wasn't wired with one. */
  get #toolRunsBackend(): ToolRunsBackend {
    if (!this.#toolRuns) {
      throw new Error("TenantDb has no tool-runs backend configured.");
    }
    return this.#toolRuns;
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

  /** This project's estimate versions (newest first is the backend's concern). */
  listEstimates(projectId: string): Promise<EstimateRow[]> {
    return this.#estimateBackend.listByProject(this.businessId, projectId);
  }

  /** One estimate by id, scoped to this business. Null if it isn't ours. */
  getEstimate(id: string): Promise<EstimateRow | null> {
    return this.#estimateBackend.getById(this.businessId, id);
  }

  /**
   * Create an estimate version. The stored `business_id` is always this handle's. When
   * `isActive` is set, the new version becomes the project's active one (any prior active
   * version is cleared) — done as a follow-up so the one-active constraint never trips.
   */
  async createEstimate(input: EstimateInput): Promise<EstimateRow> {
    const created = await this.#estimateBackend.insert({
      businessId: this.businessId,
      projectId: input.projectId,
      versionLabel: input.versionLabel,
      isActive: false,
      targetMarginBp: input.targetMarginBp,
      contingencyBp: input.contingencyBp,
      totalPriceOverrideCents: input.totalPriceOverrideCents ?? null,
    });
    if (input.isActive) {
      await this.#estimateBackend.setActive(this.businessId, input.projectId, created.id);
      return { ...created, isActive: true };
    }
    return created;
  }

  /** Update an estimate's pricing inputs / label, scoped to this business. */
  updateEstimate(id: string, patch: EstimatePatch): Promise<EstimateRow | null> {
    return this.#estimateBackend.update(this.businessId, id, patch);
  }

  /** Make one version active for its project (clears any other active version). */
  setActiveEstimate(projectId: string, estimateId: string): Promise<void> {
    return this.#estimateBackend.setActive(this.businessId, projectId, estimateId);
  }

  /** This estimate's line items, scoped to this business. */
  getLineItems(estimateId: string): Promise<LineItemRow[]> {
    return this.#estimateBackend.listLineItems(this.businessId, estimateId);
  }

  /** Replace an estimate's line items (delete-then-insert). Each row is stamped with this
   * handle's `business_id` and the given `estimateId`. */
  saveLineItems(estimateId: string, items: LineItemInput[]): Promise<LineItemRow[]> {
    return this.#estimateBackend.replaceLineItems(
      this.businessId,
      estimateId,
      items.map((item, i) => ({
        businessId: this.businessId,
        estimateId,
        category: item.category,
        description: item.description ?? null,
        laborMinutes: item.laborMinutes ?? null,
        quantity: item.quantity ?? null,
        unitCostCents: item.unitCostCents ?? null,
        priceCents: item.priceCents ?? null,
        sortOrder: item.sortOrder ?? i,
      })),
    );
  }

  /** Every project's active estimate version + its lines — the portfolio input. */
  listActiveEstimatesWithLines(): Promise<EstimateWithLines[]> {
    return this.#estimateBackend.listActiveWithLines(this.businessId);
  }

  // --- Shared project context (constitution §4, §5) --------------------------------

  /** This project's context entries, scoped to this business. */
  listContextEntries(projectId: string): Promise<ContextEntryRow[]> {
    return this.#contextBackend.listEntries(this.businessId, projectId);
  }

  /** Add a typed context entry. Author defaults to the user; `business_id` is this handle's. */
  addContextEntry(input: ContextEntryInput): Promise<ContextEntryRow> {
    const { author, authorTool } = authorToRow(input.author ?? "user");
    return this.#contextBackend.addEntry({
      businessId: this.businessId,
      projectId: input.projectId,
      kind: input.kind,
      payload: input.payload,
      author,
      authorTool,
    });
  }

  /** This project's single conversation, oldest-first (the backend's ordering). */
  listMessages(projectId: string): Promise<ConversationMessageRow[]> {
    return this.#contextBackend.listMessages(this.businessId, projectId);
  }

  /** Post a message into the project's one conversation. When a tool posts it, `toolRunId`
   * links the message to the run — and its cost — that produced it. */
  postMessage(input: MessageInput): Promise<ConversationMessageRow> {
    const { author, authorTool } = authorToRow(input.author ?? "user");
    return this.#contextBackend.addMessage({
      businessId: this.businessId,
      projectId: input.projectId,
      body: input.body,
      author,
      authorTool,
      toolRunId: input.toolRunId ?? null,
    });
  }

  /** This project's suggestions, optionally filtered by status (e.g. the pending queue). */
  listSuggestions(
    projectId: string,
    opts?: { status?: SuggestionStatusName | undefined },
  ): Promise<SuggestionRow[]> {
    return this.#contextBackend.listSuggestions(this.businessId, projectId, opts);
  }

  /** The project's pending suggestions — the queue awaiting confirmation. */
  listPendingSuggestions(projectId: string): Promise<SuggestionRow[]> {
    return this.#contextBackend.listSuggestions(this.businessId, projectId, { status: "pending" });
  }

  /** Create a `pending` suggestion. Nothing is applied until the user accepts it. When a tool
   * proposes it, `toolRunId` links the suggestion to the run that produced it. */
  createSuggestion(input: SuggestionInput): Promise<SuggestionRow> {
    const { author, authorTool } = authorToRow(input.author ?? "user");
    return this.#contextBackend.createSuggestion({
      businessId: this.businessId,
      projectId: input.projectId,
      target: input.target,
      targetEstimateId: input.targetEstimateId ?? null,
      payload: input.payload,
      status: "pending",
      author,
      authorTool,
      toolRunId: input.toolRunId ?? null,
    });
  }

  // --- Tool runs (constitution §2, §7; add-tool-platform) --------------------------

  /** This project's tool-run records, scoped to this business. */
  listToolRuns(projectId: string): Promise<ToolRunRow[]> {
    return this.#toolRunsBackend.listByProject(this.businessId, projectId);
  }

  /** Start a tool run — insert a running record (terminal `status` NULL) and return it, so its
   * id links the run's emissions. The stored `business_id` is always this handle's. */
  startToolRun(input: StartToolRunInput): Promise<ToolRunRow> {
    return this.#toolRunsBackend.startRun({
      businessId: this.businessId,
      projectId: input.projectId,
      toolName: input.toolName,
      status: null,
      source: input.source ?? "user",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      completedAt: null,
    });
  }

  /** Finalize a running tool run to its terminal status + cost, scoped to this business. Null
   * if it isn't ours (no-op). Called for `ok` and `error` alike. */
  completeToolRun(id: string, input: CompleteToolRunInput): Promise<ToolRunRow | null> {
    return this.#toolRunsBackend.finalizeRun(this.businessId, id, {
      status: input.status,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      latencyMs: input.latencyMs ?? 0,
    });
  }

  /** Accept a suggestion — the ONLY path that commits its proposed change (server-side, one
   * transaction). A no-op if it isn't pending. */
  acceptSuggestion(id: string): Promise<SuggestionResolution> {
    return this.#contextBackend.resolveSuggestion(this.businessId, id, "accept");
  }

  /** Dismiss a suggestion — remembered so it never re-surfaces; commits nothing. */
  dismissSuggestion(id: string): Promise<SuggestionResolution> {
    return this.#contextBackend.resolveSuggestion(this.businessId, id, "dismiss");
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

/**
 * An in-memory {@link EstimateBackend} over shared arrays holding *every* tenant's estimates
 * and line items — the condition RLS defends against. A handle bound to A can never see or
 * touch B's rows here (the isolation tests assert this). `setActive` mirrors the DB's
 * one-active-per-project rule.
 */
export function createMemoryEstimateBackend(
  seed: EstimateRow[] = [],
  seedLines: LineItemRow[] = [],
): EstimateBackend {
  const rows: EstimateRow[] = [...seed];
  const lines: LineItemRow[] = [...seedLines];
  let seq = seed.length;
  let lineSeq = seedLines.length;
  const now = new Date(0);

  return {
    async listByProject(businessId, projectId) {
      return rows.filter((r) => r.businessId === businessId && r.projectId === projectId);
    },
    async getById(businessId, id) {
      return rows.find((r) => r.id === id && r.businessId === businessId) ?? null;
    },
    async insert(row) {
      const stored: EstimateRow = {
        id: `mem-est-${++seq}`,
        businessId: row.businessId,
        projectId: row.projectId,
        versionLabel: row.versionLabel,
        isActive: row.isActive ?? false,
        targetMarginBp: row.targetMarginBp,
        contingencyBp: row.contingencyBp,
        totalPriceOverrideCents: row.totalPriceOverrideCents ?? null,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(stored);
      return stored;
    },
    async update(businessId, id, patch) {
      const row = rows.find((r) => r.id === id && r.businessId === businessId);
      if (!row) return null;
      if (patch.versionLabel !== undefined) row.versionLabel = patch.versionLabel;
      if (patch.targetMarginBp !== undefined) row.targetMarginBp = patch.targetMarginBp;
      if (patch.contingencyBp !== undefined) row.contingencyBp = patch.contingencyBp;
      if (patch.totalPriceOverrideCents !== undefined) {
        row.totalPriceOverrideCents = patch.totalPriceOverrideCents;
      }
      return row;
    },
    async setActive(businessId, projectId, estimateId) {
      for (const r of rows) {
        if (r.businessId === businessId && r.projectId === projectId) {
          r.isActive = r.id === estimateId;
        }
      }
    },
    async listLineItems(businessId, estimateId) {
      return lines.filter((l) => l.businessId === businessId && l.estimateId === estimateId);
    },
    async replaceLineItems(businessId, estimateId, newRows) {
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i]!;
        if (l.businessId === businessId && l.estimateId === estimateId) lines.splice(i, 1);
      }
      const stored = newRows.map<LineItemRow>((r) => ({
        id: `mem-line-${++lineSeq}`,
        businessId: r.businessId,
        estimateId: r.estimateId,
        category: r.category,
        description: r.description ?? null,
        laborMinutes: r.laborMinutes ?? null,
        quantity: r.quantity ?? null,
        unitCostCents: r.unitCostCents ?? null,
        priceCents: r.priceCents ?? null,
        sortOrder: r.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      }));
      lines.push(...stored);
      return stored;
    },
    async listActiveWithLines(businessId) {
      return rows
        .filter((r) => r.businessId === businessId && r.isActive)
        .map((estimate) => ({
          estimate,
          lines: lines.filter(
            (l) => l.businessId === businessId && l.estimateId === estimate.id,
          ),
        }));
    },
  };
}

/**
 * An in-memory {@link ContextBackend} over shared arrays holding *every* tenant's context
 * entries, messages, and suggestions — the condition RLS defends against. A handle bound to
 * A can never read or resolve B's rows here (the isolation tests assert this). `accept`
 * performs the suggestion's effect: it commits a context entry directly, and delegates an
 * estimate line-item add to the optional `appendLineItem` hook (so a test can wire it to the
 * estimate backend). The state machine + effect come from `src/context/`.
 */
export function createMemoryContextBackend(
  opts: {
    appendLineItem?:
      | ((input: { businessId: BusinessId; estimateId: string; line: ProposedLineItem }) => void)
      | undefined;
  } = {},
): ContextBackend {
  const entries: ContextEntryRow[] = [];
  const messages: ConversationMessageRow[] = [];
  const suggestionRows: SuggestionRow[] = [];
  let seq = 0;
  const now = new Date(0);

  return {
    async listEntries(businessId, projectId) {
      return entries.filter((e) => e.businessId === businessId && e.projectId === projectId);
    },
    async addEntry(row) {
      const stored: ContextEntryRow = {
        id: `mem-ctx-${++seq}`,
        businessId: row.businessId,
        projectId: row.projectId,
        kind: row.kind,
        payload: row.payload,
        author: row.author ?? "user",
        authorTool: row.authorTool ?? null,
        createdAt: now,
        updatedAt: now,
      };
      entries.push(stored);
      return stored;
    },
    async listMessages(businessId, projectId) {
      return messages.filter((m) => m.businessId === businessId && m.projectId === projectId);
    },
    async addMessage(row) {
      const stored: ConversationMessageRow = {
        id: `mem-msg-${++seq}`,
        businessId: row.businessId,
        projectId: row.projectId,
        author: row.author ?? "user",
        authorTool: row.authorTool ?? null,
        body: row.body,
        toolRunId: row.toolRunId ?? null,
        createdAt: now,
      };
      messages.push(stored);
      return stored;
    },
    async listSuggestions(businessId, projectId, listOpts) {
      return suggestionRows.filter(
        (s) =>
          s.businessId === businessId &&
          s.projectId === projectId &&
          (listOpts?.status === undefined || s.status === listOpts.status),
      );
    },
    async getSuggestion(businessId, id) {
      return suggestionRows.find((s) => s.id === id && s.businessId === businessId) ?? null;
    },
    async createSuggestion(row) {
      const stored: SuggestionRow = {
        id: `mem-sug-${++seq}`,
        businessId: row.businessId,
        projectId: row.projectId,
        status: row.status ?? "pending",
        target: row.target,
        targetEstimateId: row.targetEstimateId ?? null,
        payload: row.payload,
        author: row.author ?? "user",
        authorTool: row.authorTool ?? null,
        toolRunId: row.toolRunId ?? null,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      suggestionRows.push(stored);
      return stored;
    },
    async resolveSuggestion(businessId, id, action) {
      const s = suggestionRows.find((x) => x.id === id && x.businessId === businessId);
      if (!s) return { ok: false, error: "Suggestion not found." };

      const transition = nextStatus(s.status, action);
      if (!transition.changed) return { ok: true, suggestion: s, committed: null };

      if (action === "dismiss") {
        s.status = "dismissed";
        s.resolvedAt = now;
        return { ok: true, suggestion: s, committed: null };
      }

      const eff = suggestionEffect({
        target: s.target,
        payload: s.payload,
        targetEstimateId: s.targetEstimateId,
      });
      if (!eff.ok) return { ok: false, error: eff.error };

      if (eff.effect.kind === "commit_context_entry") {
        entries.push({
          id: `mem-ctx-${++seq}`,
          businessId,
          projectId: s.projectId,
          kind: eff.effect.entryKind,
          payload: eff.effect.payload,
          author: s.author,
          authorTool: s.authorTool,
          createdAt: now,
          updatedAt: now,
        });
        s.status = "accepted";
        s.resolvedAt = now;
        return { ok: true, suggestion: s, committed: "context_entry" };
      }

      opts.appendLineItem?.({ businessId, estimateId: eff.effect.estimateId, line: eff.effect.line });
      s.status = "accepted";
      s.resolvedAt = now;
      return { ok: true, suggestion: s, committed: "estimate_line_item" };
    },
  };
}

/**
 * An in-memory {@link ToolRunsBackend} over a shared array holding *every* tenant's runs — the
 * condition RLS defends against. A handle bound to A can never read B's runs here (the
 * isolation test asserts this), and every stored `business_id` is the one `TenantDb` passed.
 */
export function createMemoryToolRunsBackend(seed: ToolRunRow[] = []): ToolRunsBackend {
  const rows: ToolRunRow[] = [...seed];
  let seq = seed.length;
  const now = new Date(0);

  return {
    async listByProject(businessId, projectId) {
      return rows.filter((r) => r.businessId === businessId && r.projectId === projectId);
    },
    async startRun(row) {
      const stored: ToolRunRow = {
        id: `mem-run-${++seq}`,
        businessId: row.businessId,
        projectId: row.projectId,
        toolName: row.toolName,
        status: row.status ?? null,
        source: row.source ?? "user",
        inputTokens: row.inputTokens ?? 0,
        outputTokens: row.outputTokens ?? 0,
        latencyMs: row.latencyMs ?? 0,
        createdAt: now,
        completedAt: row.completedAt ?? null,
      };
      rows.push(stored);
      return stored;
    },
    async finalizeRun(businessId, id, patch) {
      const row = rows.find((r) => r.id === id && r.businessId === businessId);
      if (!row) return null;
      row.status = patch.status;
      row.inputTokens = patch.inputTokens;
      row.outputTokens = patch.outputTokens;
      row.latencyMs = patch.latencyMs;
      row.completedAt = now;
      return row;
    },
  };
}
