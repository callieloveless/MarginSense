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

import {
  keyBelongsToBusiness,
  photoObjectKey,
  photoThumbKey,
  SIGNED_URL_TTL_SECONDS,
} from "../photos";
import { parseClientDocument, type ClientDocument } from "../document";
import type {
  BusinessRow,
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
  DocumentRow,
  NewDocumentRow,
  NewProjectPhotoRow,
  NewProjectRow,
  NewSuggestionRow,
  NewToolRunRow,
  OverheadItemRow,
  ProjectPhotoRow,
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

/** A high-entropy, URL-safe share token (192 bits) — the sole access credential for a public
 * client-document link (add-client-document). Not the row id, not guessable, not enumerable. */
function newShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/** Fields a caller may supply when creating a project. `business_id` is NOT among them. */
export interface ProjectInput {
  clientName: string;
  address?: string | null | undefined;
  scope?: string | null | undefined;
  jobType?: string | null | undefined;
  crewSize?: string | null | undefined;
  startWindow?: string | null | undefined;
  /** Default target margin (bp) that seeds a new estimate; null → the business default. */
  defaultTargetMarginBp?: number | null | undefined;
  /** Default contingency (bp) that seeds a new estimate; null → the business default. */
  defaultContingencyBp?: number | null | undefined;
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
  /** This business's own row (its identity: name, trade). Scoped like everything else. */
  getBusiness(businessId: BusinessId): Promise<BusinessRow | null>;
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
  /** Where the business works (e.g. "Austin, TX"); stored only, biases Material Finder search. */
  serviceArea?: string | null | undefined;
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
  /** Remove an entry the user is retracting (e.g. the `photo` entry for a deleted photo), scoped
   * to the business. Returns the removed row, or null if it isn't ours. */
  deleteEntry(businessId: BusinessId, id: string): Promise<ContextEntryRow | null>;
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

/** What a caller supplies to store a photo (add-photo-capture). Notably absent: `business_id`,
 * the storage keys, and the uploader — all stamped downstream, never accepted from input. The
 * bytes are what the client already downscaled and re-encoded (EXIF/GPS stripped, §7). */
export interface PhotoUploadInput {
  projectId: string;
  contentType: string;
  bytes: Uint8Array;
  thumbBytes: Uint8Array;
  width: number;
  height: number;
  caption?: string | null | undefined;
}

/**
 * The photo-row port `TenantDb` talks to (add-photo-capture). Like the others, every method
 * takes `businessId` explicitly and only `TenantDb` calls it, always with its own bound id.
 * `insert` receives a row whose keys were derived from `src/photos/`; the real backend also
 * stamps the signed-in identity as `uploaded_by_auth_id` — which is why the port's row type
 * omits it, so no caller can claim to be someone else.
 */
export interface PhotoBackend {
  listByProject(businessId: BusinessId, projectId: string): Promise<ProjectPhotoRow[]>;
  getById(businessId: BusinessId, id: string): Promise<ProjectPhotoRow | null>;
  insert(row: Omit<NewProjectPhotoRow, "uploadedByAuthId">): Promise<ProjectPhotoRow>;
  updateCaption(
    businessId: BusinessId,
    id: string,
    caption: string | null,
  ): Promise<ProjectPhotoRow | null>;
  /** Delete scoped to the business; returns the deleted row (null if it isn't ours). */
  deleteById(businessId: BusinessId, id: string): Promise<ProjectPhotoRow | null>;
}

/**
 * The object port `TenantDb` talks to — the bytes, which live outside Postgres and therefore
 * outside RLS. Every method takes `businessId` so the implementation can **refuse a key outside
 * that business's prefix** before touching storage; the `storage.objects` policy in migration
 * `0007` enforces the same rule in the database.
 */
export interface PhotoStorageBackend {
  putObject(
    businessId: BusinessId,
    input: { key: string; contentType: string; bytes: Uint8Array },
  ): Promise<void>;
  /**
   * Short-lived signed URLs for a **set** of keys, as a `key → url` map. Batched on purpose: a
   * gallery signs every thumbnail in one round trip instead of one per photo. Keys outside the
   * business's prefix, and keys that don't exist or the policy refuses, are simply absent from
   * the map — an unsignable photo is a plain "unavailable" tile, not a failed page.
   */
  signedUrls(
    businessId: BusinessId,
    keys: readonly string[],
    expiresInSeconds: number,
  ): Promise<Map<string, string>>;
  /**
   * Read an object's bytes back, for server-side use that a signed URL can't serve — sending a
   * photo to the model (add-photo-advisor). Null when the key isn't this business's or doesn't
   * exist; the same prefix refusal as every other method here.
   */
  getObject(
    businessId: BusinessId,
    key: string,
  ): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  /** Delete objects by key; keys outside the business's prefix are ignored. Idempotent. */
  deleteObjects(businessId: BusinessId, keys: readonly string[]): Promise<void>;
}

/** What a caller supplies to create a client document (add-client-document). Notably absent:
 * `business_id`, the share token, and the title — the id/token are stamped by the handle, and the
 * row's `title` is derived from `payload.title` so the two can never diverge. `payload` is the
 * client-safe snapshot. */
export interface DocumentInput {
  projectId: string;
  estimateId?: string | null | undefined;
  payload: ClientDocument;
}

/**
 * The document port `TenantDb` talks to (add-client-document). Every method takes `businessId`
 * explicitly and only `TenantDb` calls it, always with its own bound id. `insert` receives a row
 * whose `business_id` and `share_token` were stamped by the handle; `setShared`/`setRevoked` move
 * the timestamps, and `setShared` also (re)issues a token so the caller can rotate it on a
 * re-share-after-revoke.
 */
export interface DocumentBackend {
  listByProject(businessId: BusinessId, projectId: string): Promise<DocumentRow[]>;
  getById(businessId: BusinessId, id: string): Promise<DocumentRow | null>;
  insert(row: NewDocumentRow): Promise<DocumentRow>;
  /** Replace an unshared draft's payload (and mirrored title), scoped to the business. Null if the
   * document isn't ours. */
  updatePayload(businessId: BusinessId, id: string, payload: ClientDocument, title: string): Promise<DocumentRow | null>;
  /** Set `shared_at = now`, `revoked_at = null`, and `share_token = token`, scoped to the
   * business. Null if the document isn't ours. */
  setShared(businessId: BusinessId, id: string, token: string): Promise<DocumentRow | null>;
  /** Set `revoked_at = now`, scoped to the business. Null if the document isn't ours. */
  setRevoked(businessId: BusinessId, id: string): Promise<DocumentRow | null>;
}

/** Backends a {@link TenantDb} composes. All but `projects` are optional so tests wire just
 * what they exercise; feature code (via `tenantDbForSession`) supplies all. */
export interface TenantBackends {
  projects: ProjectBackend;
  settings?: SettingsBackend | undefined;
  estimates?: EstimateBackend | undefined;
  context?: ContextBackend | undefined;
  toolRuns?: ToolRunsBackend | undefined;
  photos?: PhotoBackend | undefined;
  /** Absent when object storage is unconfigured — the surface renders "connect storage". */
  photoStorage?: PhotoStorageBackend | undefined;
  documents?: DocumentBackend | undefined;
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
  readonly #photos: PhotoBackend | undefined;
  readonly #photoStorage: PhotoStorageBackend | undefined;
  readonly #documents: DocumentBackend | undefined;

  /** @internal — use {@link createTenantDb}, which requires a business id. */
  constructor(businessId: BusinessId, backends: TenantBackends) {
    if (!businessId) {
      throw new Error("TenantDb requires a business id — no unscoped access.");
    }
    this.businessId = businessId;
    this.#documents = backends.documents;
    this.#projects = backends.projects;
    this.#settings = backends.settings;
    this.#estimates = backends.estimates;
    this.#context = backends.context;
    this.#toolRuns = backends.toolRuns;
    this.#photos = backends.photos;
    this.#photoStorage = backends.photoStorage;
  }

  /** The settings backend, or a clear error if this handle wasn't wired with one. */
  get #settingsBackend(): SettingsBackend {
    if (!this.#settings) {
      throw new Error("TenantDb has no settings backend configured.");
    }
    return this.#settings;
  }

  /** The documents backend, or a clear error if this handle wasn't wired with one. */
  get #documentBackend(): DocumentBackend {
    if (!this.#documents) {
      throw new Error("TenantDb has no documents backend configured.");
    }
    return this.#documents;
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

  /** The photo-row backend, or a clear error if this handle wasn't wired with one. */
  get #photoBackend(): PhotoBackend {
    if (!this.#photos) {
      throw new Error("TenantDb has no photos backend configured.");
    }
    return this.#photos;
  }

  /** The photo-object backend, or a clear error when object storage is unconfigured. Callers
   * that can degrade should check {@link hasPhotoStorage} first and render "connect storage". */
  get #photoStorageBackend(): PhotoStorageBackend {
    if (!this.#photoStorage) {
      throw new Error("TenantDb has no photo storage configured.");
    }
    return this.#photoStorage;
  }

  /** Whether object storage is wired — the surface renders a "connect storage" state when not. */
  get hasPhotoStorage(): boolean {
    return this.#photoStorage !== undefined;
  }

  /** List this business's projects. Another tenant's rows can never appear here. */
  listProjects(): Promise<ProjectRow[]> {
    return this.#projects.listByBusiness(this.businessId);
  }

  /** Get one project by id, scoped to this business. Returns null if it isn't ours. */
  getProject(id: string): Promise<ProjectRow | null> {
    return this.#projects.getByBusiness(this.businessId, id);
  }

  /** This business's own row — its identity (name, trade), for a client document header. */
  getBusiness(): Promise<BusinessRow | null> {
    return this.#projects.getBusiness(this.businessId);
  }

  /** Create a project. The stored `business_id` is always this handle's — never the input's. */
  createProject(input: ProjectInput): Promise<ProjectRow> {
    return this.#projects.insert({
      businessId: this.businessId,
      clientName: input.clientName,
      address: input.address ?? null,
      scope: input.scope ?? null,
      jobType: input.jobType ?? null,
      crewSize: input.crewSize ?? null,
      startWindow: input.startWindow ?? null,
      defaultTargetMarginBp: input.defaultTargetMarginBp ?? null,
      defaultContingencyBp: input.defaultContingencyBp ?? null,
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
      serviceArea: input.serviceArea ?? null,
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

  /** Remove a context entry, scoped to this business. Used when the thing an entry points at is
   * withdrawn by the user (a deleted photo), so the job's memory never cites something gone. */
  deleteContextEntry(id: string): Promise<ContextEntryRow | null> {
    return this.#contextBackend.deleteEntry(this.businessId, id);
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

  // --- Job photos (constitution §4, §7; add-photo-capture) -------------------------

  /** This project's photos, scoped to this business. Another tenant's can never appear. */
  listPhotos(projectId: string): Promise<ProjectPhotoRow[]> {
    return this.#photoBackend.listByProject(this.businessId, projectId);
  }

  /** One photo by id, scoped to this business. Null if it isn't ours. */
  getPhoto(id: string): Promise<ProjectPhotoRow | null> {
    return this.#photoBackend.getById(this.businessId, id);
  }

  /**
   * Store a photo: derive its keys from this handle's business (never from input), write the
   * full-size object and its thumbnail, then insert the row. If the row insert fails, the
   * objects just written are deleted before the error propagates — so a failed upload leaves no
   * row **and** no stray bytes (design §5). The id is generated here so the key and the row
   * agree.
   */
  async addPhoto(input: PhotoUploadInput): Promise<ProjectPhotoRow> {
    const storage = this.#photoStorageBackend;
    const photoId = crypto.randomUUID();
    const storageKey = photoObjectKey(this.businessId, input.projectId, photoId, input.contentType);
    const thumbKey = photoThumbKey(this.businessId, input.projectId, photoId, input.contentType);

    await storage.putObject(this.businessId, {
      key: storageKey,
      contentType: input.contentType,
      bytes: input.bytes,
    });
    try {
      await storage.putObject(this.businessId, {
        key: thumbKey,
        contentType: input.contentType,
        bytes: input.thumbBytes,
      });
      return await this.#photoBackend.insert({
        id: photoId,
        businessId: this.businessId,
        projectId: input.projectId,
        storageKey,
        thumbKey,
        contentType: input.contentType,
        byteSize: input.bytes.byteLength,
        width: input.width,
        height: input.height,
        caption: input.caption ?? null,
      });
    } catch (err) {
      // Best-effort cleanup; never let it mask the real failure.
      await storage.deleteObjects(this.businessId, [storageKey, thumbKey]).catch(() => {});
      throw err;
    }
  }

  /** Set (or clear) a photo's caption, scoped to this business. Null if it isn't ours. */
  setPhotoCaption(id: string, caption: string | null): Promise<ProjectPhotoRow | null> {
    return this.#photoBackend.updateCaption(this.businessId, id, caption);
  }

  /**
   * Delete a photo: its objects first, then its row. That order converges — if the row delete
   * fails the user can retry (object deletion is idempotent), whereas deleting the row first
   * would strand bytes nothing points at. Null if the photo isn't ours (a no-op).
   */
  async deletePhoto(id: string): Promise<ProjectPhotoRow | null> {
    const photo = await this.#photoBackend.getById(this.businessId, id);
    if (!photo) return null;
    await this.#photoStorageBackend.deleteObjects(this.businessId, [
      photo.storageKey,
      photo.thumbKey,
    ]);
    return this.#photoBackend.deleteById(this.businessId, id);
  }

  /**
   * Short-lived signed URLs for a set of this business's photo objects, as a `key → url` map
   * (constitution §7 — a photo is never served from a public URL). One round trip for the whole
   * set; a key that isn't ours, doesn't exist, or is refused is simply absent from the map.
   */
  signedPhotoUrls(
    keys: readonly string[],
    expiresInSeconds = SIGNED_URL_TTL_SECONDS,
  ): Promise<Map<string, string>> {
    const ours = keys.filter((key) => keyBelongsToBusiness(this.businessId, key));
    if (ours.length === 0) return Promise.resolve(new Map());
    return this.#photoStorageBackend.signedUrls(this.businessId, ours, expiresInSeconds);
  }

  /**
   * Read one of this business's photos — its row plus the stored bytes — for server-side use a
   * signed URL can't serve: handing the image to a tool as validated input (add-photo-advisor).
   * Null if the photo isn't ours or its object is missing. The tool never gets this handle; the
   * action calls it and passes the bytes in.
   */
  async readPhoto(
    id: string,
  ): Promise<{ photo: ProjectPhotoRow; bytes: Uint8Array; contentType: string } | null> {
    const photo = await this.#photoBackend.getById(this.businessId, id);
    if (!photo) return null;
    const object = await this.#photoStorageBackend.getObject(this.businessId, photo.storageKey);
    if (!object) return null;
    // The ROW's content type is authoritative: it was validated against the accepted image types
    // at upload. What storage reports can be empty or a generic octet-stream depending on how the
    // object was written, and this value goes on to a vision API that only accepts real image
    // media types — so the stored one wins, and the object's is only a fallback.
    return { photo, bytes: object.bytes, contentType: photo.contentType || object.contentType };
  }

  /**
   * A signed URL for **one** photo object. Meant to be called in response to a user action
   * (opening a photo full-size) rather than at render time — a URL signed during render has
   * usually expired by the time anyone taps it.
   */
  async signedPhotoUrl(key: string, expiresInSeconds = SIGNED_URL_TTL_SECONDS): Promise<string | null> {
    const signed = await this.signedPhotoUrls([key], expiresInSeconds);
    return signed.get(key) ?? null;
  }

  // --- Client documents (constitution §5; add-client-document) ---------------------

  /** This project's documents, scoped to this business. */
  listDocuments(projectId: string): Promise<DocumentRow[]> {
    return this.#documentBackend.listByProject(this.businessId, projectId);
  }

  /** One document by id, scoped to this business. Null if it isn't ours. */
  getDocument(id: string): Promise<DocumentRow | null> {
    return this.#documentBackend.getById(this.businessId, id);
  }

  /**
   * Create a client document from a **validated client-safe payload**. The `business_id` and a
   * fresh unguessable `share_token` are stamped from the handle, never from input; the payload is
   * re-validated here (defense in depth — it may have been built anywhere) so a stray internal
   * field or a document that doesn't add up never reaches storage. Created unshared.
   */
  async createDocument(input: DocumentInput): Promise<DocumentRow> {
    const check = parseClientDocument(input.payload);
    if (!check.ok) throw new Error(`Refusing to store an invalid client document: ${check.error}`);
    return this.#documentBackend.insert({
      businessId: this.businessId,
      projectId: input.projectId,
      estimateId: input.estimateId ?? null,
      // The row's title mirrors the payload's, so the owner's list and the client's page can never
      // show different titles for the same document.
      title: check.value.title,
      payload: check.value,
      shareToken: newShareToken(),
      sharedAt: null,
      revokedAt: null,
    });
  }

  /**
   * Share a document — make its link live. Sets `shared_at` and clears any `revoked_at`, and
   * **mints a fresh token whenever the document is currently revoked**, so a link the client was
   * told is dead never revives; a document that was never revoked keeps its stable token. Null if
   * it isn't ours.
   */
  async shareDocument(id: string): Promise<DocumentRow | null> {
    const doc = await this.#documentBackend.getById(this.businessId, id);
    if (!doc) return null;
    // Rotate the token only when re-sharing a revoked doc; otherwise keep the link the client has.
    const token = doc.revokedAt ? newShareToken() : doc.shareToken;
    return this.#documentBackend.setShared(this.businessId, id, token);
  }

  /** Revoke a document — its public link stops resolving. Null if it isn't ours. */
  revokeDocument(id: string): Promise<DocumentRow | null> {
    return this.#documentBackend.setRevoked(this.businessId, id);
  }

  /**
   * Edit an **unshared** draft's scope narrative and terms — the owner's review step before
   * sharing (add-client-estimate-doc). Refuses once a document has ever been shared: a shared
   * snapshot is frozen (§5), so a revision is a *new* document, not an edit of what was sent.
   * Re-validates the payload so an edit can't introduce an inconsistent or unsafe document. Null
   * if it isn't ours or isn't an editable draft.
   */
  async updateDocumentDraft(
    id: string,
    edits: { intro?: string | null | undefined; terms?: string | null | undefined },
  ): Promise<DocumentRow | null> {
    const doc = await this.#documentBackend.getById(this.businessId, id);
    if (!doc || doc.sharedAt !== null) return null;

    const current = doc.payload as ClientDocument;
    // Build the next payload without setting optional keys to undefined; a null/"" edit removes it.
    const next: Record<string, unknown> = { ...current };
    if (edits.intro !== undefined) {
      if (edits.intro === null || edits.intro.trim() === "") delete next.intro;
      else next.intro = edits.intro.trim();
    }
    if (edits.terms !== undefined) {
      if (edits.terms === null || edits.terms.trim() === "") delete next.terms;
      else next.terms = edits.terms.trim();
    }

    const check = parseClientDocument(next);
    if (!check.ok) throw new Error(`Refusing to store an invalid client document: ${check.error}`);
    return this.#documentBackend.updatePayload(this.businessId, id, check.value, check.value.title);
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
export function createMemoryProjectBackend(
  seed: ProjectRow[] = [],
  seedBusinesses: BusinessRow[] = [],
): ProjectBackend {
  const rows: ProjectRow[] = [...seed];
  const businesses: BusinessRow[] = [...seedBusinesses];
  let seq = seed.length;
  const now = new Date(0);

  return {
    async listByBusiness(businessId) {
      return rows.filter((r) => r.businessId === businessId);
    },
    async getByBusiness(businessId, id) {
      return rows.find((r) => r.id === id && r.businessId === businessId) ?? null;
    },
    async getBusiness(businessId) {
      // Synthesize a minimal identity row when a test didn't seed one — the isolation guarantee is
      // still that only this business's id is ever asked for.
      return (
        businesses.find((b) => b.id === businessId) ?? {
          id: businessId,
          name: "Test Business",
          tradeType: "general",
          createdAt: now,
          updatedAt: now,
        }
      );
    },
    async insert(row) {
      const stored: ProjectRow = {
        id: `mem-${++seq}`,
        businessId: row.businessId,
        clientName: row.clientName,
        address: row.address ?? null,
        scope: row.scope ?? null,
        status: row.status ?? "active",
        jobType: row.jobType ?? null,
        crewSize: row.crewSize ?? null,
        startWindow: row.startWindow ?? null,
        defaultTargetMarginBp: row.defaultTargetMarginBp ?? null,
        defaultContingencyBp: row.defaultContingencyBp ?? null,
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
        serviceArea: row.serviceArea ?? null,
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
    async deleteEntry(businessId, id) {
      const i = entries.findIndex((e) => e.id === id && e.businessId === businessId);
      if (i < 0) return null;
      return entries.splice(i, 1)[0]!;
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

/**
 * An in-memory {@link PhotoBackend} over a shared array holding *every* tenant's photo rows —
 * the condition RLS defends against. A handle bound to A can never read, caption, or delete B's
 * photos here, which is what the isolation tests assert.
 */
export function createMemoryPhotoBackend(seed: ProjectPhotoRow[] = []): PhotoBackend {
  const rows: ProjectPhotoRow[] = [...seed];
  let seq = seed.length;
  const now = new Date(0);

  return {
    async listByProject(businessId, projectId) {
      return rows.filter((r) => r.businessId === businessId && r.projectId === projectId);
    },
    async getById(businessId, id) {
      return rows.find((r) => r.id === id && r.businessId === businessId) ?? null;
    },
    async insert(row) {
      const stored: ProjectPhotoRow = {
        id: row.id ?? `mem-photo-${++seq}`,
        businessId: row.businessId,
        projectId: row.projectId,
        storageKey: row.storageKey,
        thumbKey: row.thumbKey,
        contentType: row.contentType,
        byteSize: row.byteSize,
        width: row.width,
        height: row.height,
        caption: row.caption ?? null,
        // The real backend stamps the signed-in identity; the memory one has no session.
        uploadedByAuthId: null,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(stored);
      return stored;
    },
    async updateCaption(businessId, id, caption) {
      const row = rows.find((r) => r.id === id && r.businessId === businessId);
      if (!row) return null;
      row.caption = caption;
      return row;
    },
    async deleteById(businessId, id) {
      const i = rows.findIndex((r) => r.id === id && r.businessId === businessId);
      if (i < 0) return null;
      return rows.splice(i, 1)[0]!;
    },
  };
}

/**
 * An in-memory {@link PhotoStorageBackend} over one map holding *every* tenant's objects —
 * the condition the `storage.objects` policy defends against. It refuses any key outside the
 * calling business's prefix, exactly as the real impl and the DB policy do, so the isolation
 * tests can prove cross-tenant object access is impossible without a live bucket.
 */
export function createMemoryPhotoStorageBackend(): PhotoStorageBackend & {
  /** Test helper: the keys currently stored (any tenant). */
  keys(): string[];
} {
  const objects = new Map<string, { contentType: string; bytes: Uint8Array }>();

  return {
    async putObject(businessId, input) {
      if (!keyBelongsToBusiness(businessId, input.key)) {
        throw new Error("Refusing to write an object outside this business's prefix.");
      }
      objects.set(input.key, { contentType: input.contentType, bytes: input.bytes });
    },
    async signedUrls(businessId, keys) {
      const signed = new Map<string, string>();
      for (const key of keys) {
        if (keyBelongsToBusiness(businessId, key) && objects.has(key)) {
          signed.set(key, `memory://${key}`);
        }
      }
      return signed;
    },
    async getObject(businessId, key) {
      if (!keyBelongsToBusiness(businessId, key)) return null;
      return objects.get(key) ?? null;
    },
    async deleteObjects(businessId, keys) {
      for (const key of keys) {
        if (keyBelongsToBusiness(businessId, key)) objects.delete(key);
      }
    },
    keys() {
      return [...objects.keys()];
    },
  };
}

/**
 * An in-memory {@link DocumentBackend} over a shared array holding *every* tenant's documents —
 * the condition RLS defends against. A handle bound to A can never read, share, or revoke B's
 * documents here (the isolation tests assert this). `getShareable` mirrors the SQL access rule of
 * the `get_shared_document` function (payload only when shared and not revoked), so the public-read
 * rule — including the revoke-then-reshare token rotation — is unit-testable without the live DB.
 */
export function createMemoryDocumentBackend(seed: DocumentRow[] = []): DocumentBackend & {
  /** Test mirror of the public token read: the client-safe payload for a shared, non-revoked
   * token, else null. Tenant-agnostic on purpose — the real function is too. */
  getShareable(token: string): unknown | null;
} {
  const rows: DocumentRow[] = [...seed];
  let seq = seed.length;
  const now = new Date(0);

  return {
    async listByProject(businessId, projectId) {
      return rows.filter((r) => r.businessId === businessId && r.projectId === projectId);
    },
    async getById(businessId, id) {
      return rows.find((r) => r.id === id && r.businessId === businessId) ?? null;
    },
    async insert(row) {
      const stored: DocumentRow = {
        id: `mem-doc-${++seq}`,
        businessId: row.businessId,
        projectId: row.projectId,
        estimateId: row.estimateId ?? null,
        title: row.title,
        payload: row.payload,
        shareToken: row.shareToken,
        sharedAt: row.sharedAt ?? null,
        revokedAt: row.revokedAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(stored);
      return stored;
    },
    async updatePayload(businessId, id, payload, title) {
      const row = rows.find((r) => r.id === id && r.businessId === businessId);
      if (!row) return null;
      row.payload = payload;
      row.title = title;
      return row;
    },
    async setShared(businessId, id, token) {
      const row = rows.find((r) => r.id === id && r.businessId === businessId);
      if (!row) return null;
      row.shareToken = token;
      row.sharedAt = now;
      row.revokedAt = null;
      return row;
    },
    async setRevoked(businessId, id) {
      const row = rows.find((r) => r.id === id && r.businessId === businessId);
      if (!row) return null;
      row.revokedAt = now;
      return row;
    },
    getShareable(token) {
      const row = rows.find(
        (r) => r.shareToken === token && r.sharedAt !== null && r.revokedAt === null,
      );
      return row ? row.payload : null;
    },
  };
}
