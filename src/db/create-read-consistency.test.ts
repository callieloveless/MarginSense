/**
 * "I made a new job, then clicked it and it didn't work." — the simulated regression guard for
 * that report. It pins the create→navigate→read flow the new-job wizard depends on end to end:
 *
 *   wizard:  const res = await createProjectAction(fd); router.push("/projects/" + res.id)
 *   hub:     const project = await getProject(id); if (!project) notFound();   // else 404
 *
 * Two ways that click can 404, and this file locks the door on both:
 *   1. A read-after-write regression — the id `createProject` returns drifts from the id
 *      `getProject` accepts, or a just-created row is hidden from its own business. That is a
 *      real bug; if it ever returns, the first test here fails before a human sees a 404.
 *   2. The job was created under a *different account*. That is tenant isolation working, not a
 *      lost write — the second test documents it as the ONLY legitimate reason a fresh job
 *      won't open, so "my new job vanished" is never mistaken for data loss again.
 *
 * In-memory backend (holds every tenant's rows in one array) — same seam as tenant.test.ts.
 */

import { describe, expect, it } from "vitest";
import { createMemoryProjectBackend, createTenantDb } from "./tenant";

const CREATOR = "biz-creator";
const OTHER = "biz-other";

describe("new job → click it → it opens (create→read consistency)", () => {
  it("hands back the exact id the hub reads, visible immediately to the creating account", async () => {
    const backend = createMemoryProjectBackend();
    const creator = createTenantDb(CREATOR, { projects: backend });

    // The wizard's create step.
    const created = await creator.createProject({ clientName: "Jane Whitmore", jobType: "Kitchen" });

    // The hub's read step — with the exact id the wizard would push to (no id drift).
    const opened = await creator.getProject(created.id);
    expect(opened).not.toBeNull();
    expect(opened?.id).toBe(created.id);
    expect(opened?.clientName).toBe("Jane Whitmore");

    // And it's in the list the /projects page renders — nothing hides a just-made job.
    const list = await creator.listProjects();
    expect(list.map((r) => r.id)).toContain(created.id);
  });

  it("a job created on one account never opens on another — the only reason a fresh job 404s", async () => {
    const backend = createMemoryProjectBackend();
    const creator = createTenantDb(CREATOR, { projects: backend });
    const other = createTenantDb(OTHER, { projects: backend });

    const created = await creator.createProject({ clientName: "Jane Whitmore" });

    // Same id, a different account → not found (the hub's 404), and absent from that account's list.
    expect(await other.getProject(created.id)).toBeNull();
    expect((await other.listProjects()).map((r) => r.id)).not.toContain(created.id);

    // The creating account still sees it — the write wasn't lost, it's isolated.
    expect(await creator.getProject(created.id)).not.toBeNull();
  });

  it("stamps the creating account on the new job, never a business id smuggled through the form", async () => {
    const backend = createMemoryProjectBackend();
    const creator = createTenantDb(CREATOR, { projects: backend });

    const created = await creator.createProject({
      clientName: "Smuggle attempt",
      ...({ businessId: OTHER } as object),
    });

    expect(created.businessId).toBe(CREATOR);
    // ...so the account whose id was smuggled in still can't see it.
    const other = createTenantDb(OTHER, { projects: backend });
    expect(await other.getProject(created.id)).toBeNull();
  });
});
