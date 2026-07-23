import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { formatCents } from "@/src/engine";
import { authorFromRow, authorLabel } from "@/src/context";
import type { ContextEntryKindName } from "@/src/db/schema";
import { loadJobProfit, previewForSuggestion } from "@/app/_lib/job-profit";
import { SuggestionCard } from "@/app/_components/suggestion-card";
import { ProfitHeader } from "@/app/_components/profit-header";
import { PostMessageForm } from "./post-message-form";
import { acceptSuggestionAction, dismissSuggestionAction } from "./actions";

/**
 * Shared project context (constitution §4) — the job's "one memory": typed context entries,
 * the single conversation, and the suggestions queue. Accepting a suggestion is the only
 * path that commits its change (§5); dismissing is remembered. Tenant-scoped; another
 * business's project resolves to not-found.
 */
export default async function ProjectContextPage({
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
        <p className="text-sm text-neutral-500">Connect Supabase and sign in to view this job&apos;s context.</p>
      </Shell>
    );
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const project = await tenantDb.getProject(projectId);
  if (!project) notFound();

  const [entries, messages, pending, job] = await Promise.all([
    tenantDb.listContextEntries(projectId),
    tenantDb.listMessages(projectId),
    tenantDb.listPendingSuggestions(projectId),
    loadJobProfit(tenantDb, projectId),
  ]);

  return (
    <Shell projectId={projectId}>
      <h1 className="text-xl font-semibold">{project.clientName} — job context</h1>
      <p className="mt-1 text-sm text-neutral-500">
        One job, one memory. Findings, materials, and notes live here; tools will add
        suggestions you accept or dismiss.
      </p>

      <div className="mt-4">
        <ProfitHeader job={job} projectId={projectId} />
      </div>

      {/* Suggestions queue */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Suggestions</h2>
        {pending.length === 0 ? (
          <p className="mt-1 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-500 dark:bg-neutral-900">
            Nothing waiting. When tools propose materials, findings, or line items, they&apos;ll
            appear here for you to accept or dismiss.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pending.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                preview={previewForSuggestion(s, job)}
                accept={acceptSuggestionAction.bind(null, projectId, s.id)}
                dismiss={dismissSuggestionAction.bind(null, projectId, s.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Context entries */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Context</h2>
        {entries.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">No entries yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
            {entries.map((e) => (
              <li key={e.id} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {KIND_LABEL[e.kind]}
                  </span>
                  <span className="text-xs text-neutral-400">{authorLabel(authorFromRow(e.author, e.authorTool))}</span>
                </div>
                <p className="text-sm">{describeEntry(e.kind, e.payload)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Conversation */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Conversation</h2>
        <ul className="mb-3 mt-2 space-y-2">
          {messages.length === 0 ? (
            <li className="text-sm text-neutral-500">No messages yet — start the thread below.</li>
          ) : (
            messages.map((m) => (
              <li key={m.id} className="rounded-md bg-neutral-100 px-3 py-2 dark:bg-neutral-900">
                <span className="text-xs font-medium text-neutral-500">
                  {authorLabel(authorFromRow(m.author, m.authorTool))}
                </span>
                <p className="text-sm">{m.body}</p>
              </li>
            ))
          )}
        </ul>
        <PostMessageForm projectId={projectId} />
      </section>
    </Shell>
  );
}

const KIND_LABEL: Record<ContextEntryKindName, string> = {
  finding: "Finding",
  material: "Material",
  code_ref: "Code",
  photo: "Photo",
  fact: "Fact",
};

/** A plain-language one-liner for a context entry's payload (defensive over the JSON blob). */
function describeEntry(kind: ContextEntryKindName, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (v == null ? "" : String(v));
  switch (kind) {
    case "finding":
      return s(p.summary);
    case "material": {
      const price = typeof p.priceCents === "number" ? ` — ${formatCents(p.priceCents)}/${s(p.unit)}` : "";
      return `${s(p.name)}${price}`;
    }
    case "code_ref":
      return `${s(p.code)}: ${s(p.citation)}`;
    case "photo":
      return `Photo (${s(p.storageKey)})`;
    case "fact":
      return `${s(p.label)}: ${s(p.value)}`;
  }
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
