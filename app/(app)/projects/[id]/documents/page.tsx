import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { resolveModelPort } from "@/src/ai";
import { activeVersion } from "@/src/estimate";
import { parseClientDocument } from "@/src/document";
import { documentStatus } from "@/app/_lib/document-status";
import { DocumentsPanel, type DocumentSummary } from "./documents-panel";

/**
 * The project's client documents (add-client-estimate-doc) — generate a proposal from the active
 * estimate, review the draft, then share a link (or revoke it). The internal estimate never leaks
 * onto these; the document is a client-safe snapshot. Tenant-scoped; another business's project is
 * not-found.
 */
export default async function ProjectDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const session = await getServerSession();

  if (session.status === "signed-out") redirect("/sign-in");
  if (session.status === "no-business") redirect("/create-business");
  if (session.status === "unconfigured") {
    return (
      <Shell projectId={projectId}>
        <p className="text-sm text-neutral-500">Connect Supabase and sign in to make client documents.</p>
      </Shell>
    );
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const project = await tenantDb.getProject(projectId);
  if (!project) notFound();

  const [rows, estimates] = await Promise.all([
    tenantDb.listDocuments(projectId),
    tenantDb.listEstimates(projectId),
  ]);
  const hasActiveEstimate = activeVersion(estimates) !== null;
  const aiConfigured = resolveModelPort().status === "configured";

  // Map rows to a client-safe summary (status + the payload the panel previews). The payload is
  // already client-safe; parse defensively so a bad row can't crash the owner's page.
  const documents: DocumentSummary[] = rows.map((r) => {
    const parsed = parseClientDocument(r.payload);
    return {
      id: r.id,
      title: r.title,
      status: documentStatus(r),
      shareToken: r.sharedAt && !r.revokedAt ? r.shareToken : null,
      document: parsed.ok ? parsed.value : null,
    };
  });

  return (
    <Shell projectId={projectId}>
      <h1 className="text-xl font-semibold">{project.clientName} — client documents</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Generate a clean proposal from your active estimate — client prices only, none of your
        costs or margins. Review it, then share a link the client opens with no login.
      </p>

      <DocumentsPanel
        projectId={projectId}
        documents={documents}
        canGenerate={hasActiveEstimate}
        aiConfigured={aiConfigured}
      />
    </Shell>
  );
}

function Shell({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  return (
    <section>
      <Link href={`/projects/${projectId}`} className="text-sm text-neutral-500">
        ← Project
      </Link>
      <div className="mt-2">{children}</div>
    </section>
  );
}
