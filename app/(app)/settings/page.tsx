/**
 * Business settings (constitution §3.2 outer layer). The financial inputs (overhead, wage
 * + burden, capacity, goals) and their derived-rate playback arrive in `add-onboarding`;
 * this foundation renders the shell so the tenant + navigation are real first.
 */
export default function SettingsPage() {
  return (
    <section>
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Your business, overhead, wage, capacity, and goals will live here — the inputs the
        profit math depends on.
      </p>
      <p className="mt-4 rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-900">
        Coming in the onboarding change: a short, phone-first wizard plus a Review screen
        that plays back your loaded cost, break-even day, and target profit per hour.
      </p>
    </section>
  );
}
