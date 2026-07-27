import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { deleteSetAction } from "../actions";
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

  const photos = await tenantDb.listPhotosBySet(setId);
  const thumbUrls = await tenantDb.signedPhotoUrls(photos.map((p) => p.thumbKey));
  const setPhotos: SetPhoto[] = photos.map((p) => ({
    id: p.id,
    thumbUrl: thumbUrls.get(p.thumbKey) ?? null,
  }));

  return (
    <Shell projectId={projectId}>
      <SetGallery photos={setPhotos} />

      <h1 className="mt-4 text-xl font-semibold text-ink">{set.caption ?? "Untitled set"}</h1>
      <p className="mt-1 text-sm text-muted">
        {relativeTime(set.createdAt)} · one caption for the set · posted to job memory
      </p>

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
