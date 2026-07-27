import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import type { ProjectPhotoRow } from "@/src/db/schema";
import { photoSetBadge, photoSetBadgeLabel } from "@/app/_lib/photo-set-badge";
import { Chip, EmptyState } from "@/app/_components/ui";
import { SetComposer } from "./set-composer";

/**
 * A job's Photos surface (revamp-photo-advisor) — a **history of sets**, not a gallery. Compose a
 * new set at the top; each past set is a card with its cover, caption, time, and review badge.
 * Tenant-scoped; another business's project is not-found.
 */
export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await getServerSession();

  if (session.status === "signed-out") redirect("/sign-in");
  if (session.status === "no-business") redirect("/create-business");
  if (session.status === "unconfigured") {
    return (
      <Shell projectId={projectId}>
        <p className="text-sm text-muted">Connect Supabase and sign in to add job photos.</p>
      </Shell>
    );
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const project = await tenantDb.getProject(projectId);
  if (!project) notFound();

  const storageReady = tenantDb.hasPhotoStorage;
  if (!storageReady) {
    return (
      <Shell projectId={projectId}>
        <h1 className="text-xl font-semibold text-ink">Photos</h1>
        <p className="mt-2 rounded-xl border border-notice-line bg-notice-bg px-3 py-2 text-sm text-notice-fg">
          Photo storage isn&apos;t connected yet. Once Supabase Storage is set up, the sets you shoot on
          site live here — private to your business.
        </p>
      </Shell>
    );
  }

  const [sets, photos, pending] = await Promise.all([
    tenantDb.listPhotoSets(projectId),
    tenantDb.listPhotos(projectId),
    tenantDb.listPendingSuggestions(projectId),
  ]);

  // Cover photo + count per set (from the project's photos, grouped by set).
  const bySet = new Map<string, ProjectPhotoRow[]>();
  for (const p of photos) {
    if (!p.setId) continue;
    const list = bySet.get(p.setId);
    if (list) list.push(p);
    else bySet.set(p.setId, [p]);
  }
  const pendingBySet = new Map<string, number>();
  for (const s of pending) {
    if (s.setId) pendingBySet.set(s.setId, (pendingBySet.get(s.setId) ?? 0) + 1);
  }

  // Sign every cover thumbnail in one round trip (short-lived; §7).
  const covers = new Map(sets.map((set) => [set.id, bySet.get(set.id)?.[0] ?? null]));
  const thumbUrls = await tenantDb.signedPhotoUrls(
    [...covers.values()].filter((p): p is ProjectPhotoRow => p !== null).map((p) => p.thumbKey),
  );

  return (
    <Shell projectId={projectId}>
      <h1 className="text-xl font-semibold text-ink">Photos</h1>
      <div className="mt-3">
        <SetComposer projectId={projectId} />
      </div>

      <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">History</h2>
      {sets.length === 0 ? (
        <div className="mt-2">
          <EmptyState
            title="No photo sets yet"
            body="Shoot a set of the work — wide, then the close-ups — and MarginSense reads the whole set."
          />
        </div>
      ) : (
        <ul className="mt-2 grid grid-cols-2 gap-3">
          {sets.map((set) => {
            const group = bySet.get(set.id) ?? [];
            const cover = covers.get(set.id) ?? null;
            const thumbUrl = cover ? (thumbUrls.get(cover.thumbKey) ?? null) : null;
            const badge = photoSetBadge(set.analysisStatus, pendingBySet.get(set.id) ?? 0);
            return (
              <li key={set.id}>
                <Link
                  href={`/projects/${projectId}/photos/${set.id}`}
                  className="block overflow-hidden rounded-2xl border border-line bg-surface"
                >
                  <div className="relative aspect-[4/3] bg-line">
                    {thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbUrl} alt={set.caption ?? "Photo set"} className="h-full w-full object-cover" />
                    ) : null}
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 px-2 py-0.5 text-xs font-medium text-paper">
                      {group.length} photo{group.length === 1 ? "" : "s"}
                    </span>
                    <span className="absolute left-1.5 top-1.5">
                      <Chip tone={badge.kind === "review" ? "brand" : "muted"}>{photoSetBadgeLabel(badge)}</Chip>
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-ink line-clamp-2">{set.caption ?? "Untitled set"}</p>
                    <p className="mt-1 text-xs text-muted">{relativeTime(set.createdAt)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
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
      <Link href={`/projects/${projectId}`} className="text-sm text-muted">
        ← {""}Job
      </Link>
      <div className="mt-2">{children}</div>
    </section>
  );
}
