/**
 * Tenant-isolation + share-lifecycle tests for client documents (constitution §5, §6.3, §7;
 * add-client-document). The memory backend holds *every* tenant's documents in one array — the
 * condition RLS defends against — so these prove a handle bound to one business can neither read
 * nor share/revoke another's, that `business_id` and the share token are stamped from the handle,
 * that an invalid or non-adding-up payload is refused, and that the public token read (mirrored by
 * `getShareable`) resolves only for a shared, non-revoked token — including the revoke-then-reshare
 * rotation. The live `SECURITY DEFINER` function is proven separately (deferred `test:rls`).
 */

import { describe, expect, it } from "vitest";
import {
  createMemoryDocumentBackend,
  createMemoryProjectBackend,
  createTenantDb,
  type TenantDb,
} from "./tenant";
import { type ClientDocument } from "../document";

const BUSINESS_A = "biz-a";
const BUSINESS_B = "biz-b";

const payload: ClientDocument = {
  businessName: "Acme Remodeling",
  clientName: "Jane Homeowner",
  title: "Bathroom remodel",
  preparedOn: "July 25, 2026",
  lines: [{ description: "Tile the shower", priceCents: 180_000 }],
  subtotalCents: 180_000,
  totalCents: 180_000,
};

/** Two handles over ONE shared document backend (the cross-tenant condition). */
function shared(): {
  a: TenantDb;
  b: TenantDb;
  backend: ReturnType<typeof createMemoryDocumentBackend>;
} {
  const backend = createMemoryDocumentBackend();
  const wire = (businessId: string) =>
    createTenantDb(businessId, { projects: createMemoryProjectBackend(), documents: backend });
  return { a: wire(BUSINESS_A), b: wire(BUSINESS_B), backend };
}

function create(db: TenantDb, projectId = "p-1") {
  return db.createDocument({ projectId, payload });
}

describe("client documents — creation and identity", () => {
  it("stamps business_id and an unguessable token from the handle", async () => {
    const { a } = shared();
    const doc = await create(a);

    expect(doc.businessId).toBe(BUSINESS_A);
    // The row's title mirrors the payload's, so the two can't diverge.
    expect(doc.title).toBe(payload.title);
    expect(doc.sharedAt).toBeNull();
    expect(doc.revokedAt).toBeNull();
    expect(typeof doc.shareToken).toBe("string");
    expect(doc.shareToken.length).toBeGreaterThanOrEqual(24); // 192 bits base64url
  });

  it("refuses a payload that isn't client-safe or doesn't add up", async () => {
    const { a } = shared();
    // A leaked internal field.
    await expect(
      a.createDocument({
        projectId: "p-1",
        payload: { ...payload, costCents: 90_000 } as unknown as ClientDocument,
      }),
    ).rejects.toThrow(/invalid client document/i);
    // Numbers that don't add up.
    await expect(
      a.createDocument({
        projectId: "p-1",
        payload: { ...payload, totalCents: 999_999 } as unknown as ClientDocument,
      }),
    ).rejects.toThrow(/invalid client document/i);
  });
});

describe("client documents — tenant isolation", () => {
  it("lists only the bound business's documents", async () => {
    const { a, b } = shared();
    await create(a, "shared-project");
    await create(b, "shared-project");

    const mine = await a.listDocuments("shared-project");
    expect(mine).toHaveLength(1);
    expect(mine[0]!.businessId).toBe(BUSINESS_A);
  });

  it("cannot read, share, or revoke another business's document", async () => {
    const { a, b } = shared();
    const theirs = await create(b);

    expect(await a.getDocument(theirs.id)).toBeNull();
    expect(await a.shareDocument(theirs.id)).toBeNull();
    expect(await a.revokeDocument(theirs.id)).toBeNull();
    // B's document is untouched.
    const stillTheirs = await b.getDocument(theirs.id);
    expect(stillTheirs?.sharedAt).toBeNull();
  });
});

describe("client documents — the share lifecycle", () => {
  it("share makes the token resolve; revoke stops it", async () => {
    const { a, backend } = shared();
    const doc = await create(a);

    // Not shared yet → the public read resolves nothing.
    expect(backend.getShareable(doc.shareToken)).toBeNull();

    await a.shareDocument(doc.id);
    expect(backend.getShareable(doc.shareToken)).toEqual(payload);

    await a.revokeDocument(doc.id);
    expect(backend.getShareable(doc.shareToken)).toBeNull();
  });

  it("keeps a stable token across a plain re-share", async () => {
    const { a } = shared();
    const doc = await create(a);
    const first = await a.shareDocument(doc.id);
    const second = await a.shareDocument(doc.id);
    // Never revoked in between → the client's link doesn't change under them.
    expect(second!.shareToken).toBe(first!.shareToken);
  });

  it("re-sharing a revoked document mints a fresh token; the old one stays dead", async () => {
    const { a, backend } = shared();
    const doc = await create(a);
    const original = (await a.shareDocument(doc.id))!.shareToken;

    await a.revokeDocument(doc.id);
    const reshared = (await a.shareDocument(doc.id))!.shareToken;

    expect(reshared).not.toBe(original);
    // The link the client was told is dead never comes back.
    expect(backend.getShareable(original)).toBeNull();
    // The new link works.
    expect(backend.getShareable(reshared)).toEqual(payload);
  });

  it("a wrong or never-shared token resolves to nothing", async () => {
    const { a, backend } = shared();
    const doc = await create(a);
    expect(backend.getShareable("not-a-token")).toBeNull();
    expect(backend.getShareable(doc.shareToken)).toBeNull(); // created but never shared
  });
});
