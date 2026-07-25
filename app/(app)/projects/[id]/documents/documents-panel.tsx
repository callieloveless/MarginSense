"use client";

import { useState } from "react";
import { formatCents } from "@/src/engine";
import { type ClientDocument } from "@/src/document";
import { inputClassName } from "@/app/_components/fields";
import {
  generateDocumentAction,
  revokeDocumentAction,
  shareDocumentAction,
  updateDraftAction,
  type DocumentActionResult,
} from "./actions";

export type DocumentStatus = "draft" | "shared" | "revoked";

/** A document as the owner panel needs it: status, the client-safe payload to preview, and (when
 * live) the share token so the link can be copied. */
export interface DocumentSummary {
  id: string;
  title: string;
  status: DocumentStatus;
  shareToken: string | null;
  document: ClientDocument | null;
}

/**
 * The owner's Documents surface (add-client-estimate-doc): generate a proposal from the active
 * estimate, preview each draft, edit or remove its scope narrative before sharing (the review step
 * that guards the AI free-text), then share/copy/revoke.
 */
export function DocumentsPanel({
  projectId,
  documents,
  canGenerate,
  aiConfigured,
}: {
  projectId: string;
  documents: DocumentSummary[];
  canGenerate: boolean;
  aiConfigured: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<DocumentActionResult | null>(null);

  async function onGenerate(): Promise<void> {
    setBusy(true);
    setMsg(null);
    setMsg(await generateDocumentAction(projectId));
    setBusy(false);
  }

  return (
    <div className="mt-4 space-y-4">
      {!aiConfigured ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          AI isn&apos;t connected, so documents generate without a written scope summary. You can
          add one yourself on the draft.
        </p>
      ) : null}

      {canGenerate ? (
        <div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900 sm:w-auto sm:px-4"
          >
            {busy ? "Generating…" : "Generate client document"}
          </button>
          {msg ? (
            <p className={`mt-2 text-sm ${msg.ok ? "text-green-700 dark:text-green-500" : "text-red-600"}`}>
              {msg.ok ? msg.message : msg.error}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-500 dark:bg-neutral-900">
          Mark an estimate active first — a client document is generated from it.
        </p>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-neutral-500">No documents yet.</p>
      ) : (
        <ul className="space-y-3">
          {documents.map((d) => (
            <DocumentRow key={d.id} projectId={projectId} doc={d} />
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const tone =
    status === "shared"
      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
      : status === "revoked"
        ? "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  const label = status === "shared" ? "Shared" : status === "revoked" ? "Link off" : "Draft";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}

function DocumentRow({ projectId, doc }: { projectId: string; doc: DocumentSummary }) {
  const [editing, setEditing] = useState(false);
  const [intro, setIntro] = useState(doc.document?.intro ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<DocumentActionResult | null>(null);
  const [copied, setCopied] = useState(false);

  const isDraft = doc.status === "draft";

  async function run(action: () => Promise<DocumentActionResult>): Promise<DocumentActionResult> {
    setBusy(true);
    setMsg(null);
    const result = await action();
    setMsg(result);
    setBusy(false);
    return result;
  }

  async function onShare(): Promise<void> {
    const result = await run(() => shareDocumentAction(projectId, doc.id));
    // The action returns the relative path; make it absolute + copy it.
    if (result.ok) {
      const url = `${window.location.origin}${result.message}`;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        setCopied(false);
      }
      setMsg({ ok: true, message: url });
    }
  }

  return (
    <li className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{doc.title}</span>
        <StatusBadge status={doc.status} />
      </div>

      {doc.document ? (
        <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          <p className="tabular-nums">Total {formatCents(doc.document.totalCents)}</p>
          {doc.document.intro ? <p className="mt-1 line-clamp-2">{doc.document.intro}</p> : null}
        </div>
      ) : null}

      {/* Edit the scope narrative — only on an unshared draft (a shared snapshot is frozen). */}
      {isDraft && editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={3}
            placeholder="Scope summary the client sees (optional). Never mention your costs."
            className={inputClassName}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const r = await run(() => updateDraftAction(projectId, doc.id, { intro: intro.trim() === "" ? null : intro }));
                if (r.ok) setEditing(false);
              }}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {isDraft ? (
          <>
            {!editing ? (
              <button type="button" onClick={() => setEditing(true)} className="underline">
                {doc.document?.intro ? "Edit scope" : "Add scope"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={onShare}
              className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              Share & copy link
            </button>
          </>
        ) : doc.status === "shared" ? (
          <>
            <button type="button" disabled={busy} onClick={onShare} className="underline">
              Copy link
            </button>
            <button type="button" disabled={busy} onClick={() => run(() => revokeDocumentAction(projectId, doc.id))} className="text-red-600 underline">
              Turn off link
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={onShare} className="underline">
            Share again (new link)
          </button>
        )}
      </div>

      {msg ? (
        <p className={`mt-1 break-all text-xs ${msg.ok ? "text-green-700 dark:text-green-500" : "text-red-600"}`}>
          {msg.ok ? (copied ? `Link copied: ${msg.message}` : msg.message) : msg.error}
        </p>
      ) : null}
    </li>
  );
}
