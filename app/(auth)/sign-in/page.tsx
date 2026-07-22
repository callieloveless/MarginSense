/**
 * Sign-up / sign-in is TEMPORARILY CLOSED (see relevant_notes.md → "Temporarily disabled").
 *
 * The email one-time-code flow is intact and unchanged in `../actions.ts`
 * (`signInWithEmailAction`) and in git history — this page simply stops exposing it for now.
 * To reopen sign-ups, restore the form (the previous version of this file renders it) and
 * remove the note. Nothing else needs to change.
 */
export default function SignInPage() {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">MarginSense isn&apos;t open for sign-ups yet</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        We&apos;re still building. Sign-ups are paused for now — check back soon.
      </p>
    </div>
  );
}
