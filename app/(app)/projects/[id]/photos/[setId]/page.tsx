import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { PHYSICAL_WORK_DISCLAIMER } from "@/src/tools";
import { loadJobProfit, previewForSuggestion } from "@/app/_lib/job-profit";
import { SuggestionCard } from "@/app/_components/suggestion-card";
import { SectionHeader } from "@/app/_components/ui";
import { acceptSuggestionAction, dismissSuggestionAction } from "../../context/actions";
import { deleteSetAction } from "../actions";
import { SetAnalysis } from "./set-analysis";
import { SetGallery, type SetPhoto } from "./set-gallery";

/**
 * A photo set's detail (revamp-photo-advisor) — its photos (hero + thumbnails), its one caption, and
 * (in Stage C) the "see what MarginSense found" reveal. Tenant-scoped; another business's set, or a
 * set that isn't in this project, resolves to not-found.
 */
export default async function SetDetailPage({
  params,
}: {
  params: Promise<{ id: string; setId: string }>;
}) {
  const { id: projectId, setId } = await params;
  const session = await getServerSession();

  if (session.status === "signed-out") redirect("/sign-in");
  if (session.status === "no-business") redirect("/create-business");
  if (session.status === "unconfigured") {
    return (
      <Shell projectId={projectId}>
        <p className="text-sm text-muted">Connect Supabase and sign in to view this set.</p>
      </Shell>
    );
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const set = await tenantDb.getPhotoSet(setId);
  if (!set || set.projectId !== projectId) notFound();

  const [photos, pending, job] = await Promise.all([
    tenantDb.listPhotosBySet(setId),
    tenantDb.listPendingSuggestions(projectId),
    loadJobProfit(tenantDb, projectId),
  ]);
  const thumbUrls = await tenantDb.signedPhotoUrls(photos.map((p) => p.thumbKey));
  const setPhotos: SetPhoto[] = photos.map((p) => ({
    id: p.id,
    thumbUrl: thumbUrls.get(p.thumbKey) ?? null,
  }));
  // This set's own recommendations — the same durable queue as the hub's "Waiting on you".
  const setPending = pending.filter((s) => s.setId === setId);

  return (
    <Shell projectId={projectId}>
      <SetGallery photos={setPhotos} />

      <h1 className="mt-4 text-xl font-semibold text-ink">{set.caption ?? "Untitled set"}</h1>
      <p className="mt-1 text-sm text-muted">
        {relativeTime(set.createdAt)} · one caption for the set · posted to job memory
      </p>

      <div className="mt-4">
        <SetAnalysis projectId={projectId} setId={setId} status={set.analysisStatus} />
      </div>

      {set.analysisStatus === "done" ? (
        <section className="mt-4">
          <SectionHeader title="See what MarginSense found" />
          {setPending.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted">
              Nothing to act on from this set.
            </p>
          ) : (
            <ul className="space-y-2">
              {setPending.map((s) => (
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
          <p className="mt-2 text-xs text-muted">{PHYSICAL_WORK_DISCLAIMER}</p>
        </section>
      ) : null}

      <form action={deleteSetAction.bind(null, projectId, setId)} className="mt-6">
        <button className="rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted">
          Delete this set
        </button>
      </form>
    </Shell>
  );
}

/** A short "12 min ago" / "Yesterday" style label (display only). */
function relativeTime(when: Date): string {
  const ms = new Date().getTime() - when.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function Shell({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  return (
    <section>
      <Link href={`/projects/${projectId}/photos`} className="text-sm text-muted">
        ← History
      </Link>
      <div className="mt-2">{children}</div>
    </section>
  );
}
