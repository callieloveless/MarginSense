/**
 * Hub composition pieces (revamp-project-hub) — the tools grid and the compact activity feed on a
 * job's default surface. Server-renderable, token-driven (globals.css), phone-first. A tile opens a
 * surface that exists today and shows a badge only when a real count/status backs it; the feed is a
 * read-only recent slice that links through to the full job memory.
 */

import Link from "next/link";
import { authorFromRow, authorLabel } from "@/src/context";
import type { ContextEntryRow, ConversationMessageRow } from "@/src/db/schema";
import { describeEntry, KIND_LABEL } from "@/app/_lib/context-entry-summary";
import { Chip, SectionHeader } from "@/app/_components/ui";

/** One tool tile — opens an existing surface, with an honest badge only when one is passed. */
function ToolTile({
  href,
  title,
  hint,
  badge,
}: {
  href: string;
  title: string;
  hint: string;
  badge?: string | null;
}) {
  return (
    <Link href={href} className="flex flex-col rounded-2xl border border-line bg-surface p-4">
      <span className="flex items-start justify-between gap-2">
        <span className="font-semibold text-ink">{title}</span>
        {badge ? <Chip>{badge}</Chip> : null}
      </span>
      <span className="mt-1 text-sm text-muted">{hint}</span>
    </Link>
  );
}

/** The tools grid — only surfaces that exist today (photos, job memory, tools, client document). */
export function ToolsGrid({
  projectId,
  photosBadge,
  docBadge,
}: {
  projectId: string;
  photosBadge: string | null;
  docBadge: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ToolTile
        href={`/projects/${projectId}/photos`}
        title="Photos"
        hint="Shoot a set; MarginSense reads it"
        badge={photosBadge}
      />
      <ToolTile
        href={`/projects/${projectId}/context`}
        title="Job memory"
        hint="Findings, materials & notes"
      />
      <ToolTile
        href={`/projects/${projectId}/tools`}
        title="Tools"
        hint="Run a tool for suggestions"
      />
      <ToolTile
        href={`/projects/${projectId}/documents`}
        title="Client document"
        hint="Share a clean estimate"
        badge={docBadge}
      />
    </div>
  );
}

interface FeedItem {
  readonly id: string;
  readonly when: Date;
  readonly kind: string;
  readonly text: string;
  readonly who: string;
}

/** A compact, most-recent-first slice of the job's context entries and conversation. Read-only on
 * the hub; posting still happens on the job-memory page (linked via "See all"). */
export function ActivityFeed({
  projectId,
  entries,
  messages,
}: {
  projectId: string;
  entries: ContextEntryRow[];
  messages: ConversationMessageRow[];
}) {
  const items: FeedItem[] = [
    ...entries.map((e) => ({
      id: `e-${e.id}`,
      when: e.createdAt,
      kind: KIND_LABEL[e.kind],
      text: describeEntry(e.kind, e.payload),
      who: authorLabel(authorFromRow(e.author, e.authorTool)),
    })),
    ...messages.map((m) => ({
      id: `m-${m.id}`,
      when: m.createdAt,
      kind: "Message",
      text: m.body,
      who: authorLabel(authorFromRow(m.author, m.authorTool)),
    })),
  ]
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, 5);

  return (
    <section className="mt-6">
      <SectionHeader
        title="Activity"
        action={
          <Link href={`/projects/${projectId}/context`} className="underline">
            See all →
          </Link>
        }
      />
      {items.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-muted">
          No activity yet — findings, materials, and notes show up here as you work the job.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {items.map((it) => (
            <li key={it.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">{it.kind}</span>
                <span className="text-xs text-muted">{it.who}</span>
              </div>
              <p className="line-clamp-2 text-sm text-ink">{it.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
