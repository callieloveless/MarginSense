import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { listTools } from "@/src/tools";
import { resolveModelPort } from "@/src/ai";
import { loadJobProfit, previewForSuggestion } from "@/app/_lib/job-profit";
import { SuggestionCard } from "@/app/_components/suggestion-card";
import { ProfitHeader } from "@/app/_components/profit-header";
import { acceptSuggestionAction, dismissSuggestionAction } from "../context/actions";
import { RunReferenceForm } from "./run-form";
import { MaterialFinderForm } from "./material-finder-form";
import { PhotoAdvisorForm, type AdvisorPhoto } from "./photo-advisor-form";

/**
 * The project-page Tools surface (constitution §5) — where a job's AI tools open. Tools read
 * the job's shared context (read-only) and propose changes you accept or dismiss under Job
 * context; they never write directly. This change ships the shell plus a reference tool that
 * proves the platform end to end. Tenant-scoped; another business's project is not-found.
 */
export default async function ProjectToolsPage({
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
        <p className="text-sm text-neutral-500">Connect Supabase and sign in to use this job&apos;s tools.</p>
      </Shell>
    );
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const project = await tenantDb.getProject(projectId);
  if (!project) notFound();

  const tools = listTools();
  const aiConfigured = resolveModelPort().status === "configured";
  const storageReady = tenantDb.hasPhotoStorage;
  const [pending, job, settings, photoRows] = await Promise.all([
    tenantDb.listPendingSuggestions(projectId),
    loadJobProfit(tenantDb, projectId),
    tenantDb.getSettings(),
    storageReady ? tenantDb.listPhotos(projectId) : Promise.resolve([]),
  ]);
  const serviceArea = settings?.serviceArea ?? "";

  // Thumbnails for Photo Advisor's picker — signed for the whole set in one round trip, and
  // short-lived (constitution §7); a photo is never served publicly.
  const thumbUrls = await tenantDb.signedPhotoUrls(photoRows.map((p) => p.thumbKey));
  const advisorPhotos: AdvisorPhoto[] = photoRows.map((p) => ({
    id: p.id,
    caption: p.caption,
    thumbUrl: thumbUrls.get(p.thumbKey) ?? null,
  }));

  return (
    <Shell projectId={projectId}>
      <h1 className="text-xl font-semibold">{project.clientName} — tools</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Tools read this job&apos;s context and <strong>suggest</strong> changes — they never
        change an estimate on their own. What they propose shows up right here to accept or
        dismiss, and also lives under{" "}
        <Link href={`/projects/${projectId}/context`} className="underline">
          Job context
        </Link>
        .
      </p>

      <div className="mt-4">
        <ProfitHeader job={job} projectId={projectId} />
      </div>

      {!aiConfigured ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Live AI isn&apos;t connected yet. The reference tool below runs without it; tools that
          need a model will show a &ldquo;connect AI&rdquo; state until an API key is set.
        </p>
      ) : null}

      <ul className="mt-6 space-y-4">
        {tools.map((tool) => (
          <li key={tool.name} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-lg font-semibold">{tool.title}</h2>
            {tool.name === "photo-advisor" ? (
              <>
                <p className="mt-1 text-sm text-neutral-500">
                  Take a job photo or use one you&apos;ve already added, and get a read on what
                  you&apos;re looking at — plus the repair hours it would take, previewed against
                  this job&apos;s profit per hour before you accept anything.
                </p>
                <PhotoAdvisorForm
                  projectId={projectId}
                  photos={advisorPhotos}
                  aiConfigured={aiConfigured}
                  storageReady={storageReady}
                />
              </>
            ) : tool.name === "material-finder" ? (
              <>
                <p className="mt-1 text-sm text-neutral-500">
                  Search the web for materials, prices, and suppliers — or add one by hand.
                  Each option is proposed below with its profit-per-hour impact; nothing changes
                  your estimate until you accept it.
                </p>
                <MaterialFinderForm
                  projectId={projectId}
                  serviceArea={serviceArea}
                  aiConfigured={aiConfigured}
                />
              </>
            ) : tool.name === "reference" ? (
              <>
                <p className="mt-1 text-sm text-neutral-500">
                  A wiring check: echoes your note back as a fact suggestion and posts to the
                  conversation, proving the tool platform end to end.
                </p>
                <RunReferenceForm projectId={projectId} />
              </>
            ) : (
              <p className="mt-1 text-sm text-neutral-500">Opens here.</p>
            )}
          </li>
        ))}
      </ul>

      {/* Run-in-place: what tools have proposed shows up here to accept or dismiss. */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Waiting on you</h2>
        {pending.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">
            Nothing yet — run a tool above and its suggestion appears here.
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
