import { formatCents } from "@/src/engine";
import { type ClientDocument } from "@/src/document";

/**
 * The client-facing document render (add-client-document) — a clean, phone- and print-friendly
 * proposal. It shows the business, the client, the scope, the priced line items, and the total,
 * and **nothing internal**: there is no cost, overhead, margin, EPH, signal, or labor-minute field
 * to render, because the payload has none. Read-only — no accept/sign/pay controls.
 */
export function DocumentView({ document }: { document: ClientDocument }) {
  const d = document;
  return (
    <article className="mx-auto max-w-2xl px-5 py-8 print:py-0">
      {/* Business header */}
      <header className="border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <h1 className="text-2xl font-semibold">{d.businessName}</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          {[d.tradeType, d.serviceArea].filter(Boolean).join(" · ")}
          {d.license ? `${d.tradeType || d.serviceArea ? " · " : ""}License ${d.license}` : ""}
        </p>
      </header>

      {/* Title + who/when */}
      <section className="mt-6 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{d.title}</h2>
          <p className="text-sm text-neutral-500">
            Prepared for <span className="font-medium text-neutral-700 dark:text-neutral-300">{d.clientName}</span>
            {d.clientAddress ? ` — ${d.clientAddress}` : ""}
          </p>
        </div>
        <p className="text-sm text-neutral-500">{d.preparedOn}</p>
      </section>

      {/* Scope narrative */}
      {d.intro ? (
        <section className="mt-6">
          <p className="whitespace-pre-line text-sm leading-relaxed">{d.intro}</p>
        </section>
      ) : null}

      {/* Priced lines — client prices only */}
      <section className="mt-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
              <th className="py-2 font-medium">Work</th>
              <th className="py-2 text-right font-medium">Price</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((line, i) => (
              <tr key={i} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-4">{line.description}</td>
                <td className="py-2 text-right tabular-nums">{formatCents(line.priceCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="py-2 pr-4 text-right text-neutral-500">Subtotal</td>
              <td className="py-2 text-right tabular-nums">{formatCents(d.subtotalCents)}</td>
            </tr>
            {d.taxCents !== undefined ? (
              <tr>
                <td className="py-1 pr-4 text-right text-neutral-500">Tax</td>
                <td className="py-1 text-right tabular-nums">{formatCents(d.taxCents)}</td>
              </tr>
            ) : null}
            <tr className="border-t border-neutral-300 dark:border-neutral-700">
              <td className="py-2 pr-4 text-right text-base font-semibold">Total</td>
              <td className="py-2 text-right text-base font-semibold tabular-nums">
                {formatCents(d.totalCents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* Terms */}
      {d.terms ? (
        <section className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Terms</h3>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{d.terms}</p>
        </section>
      ) : null}
    </article>
  );
}

/** The "this document isn't available" state — a wrong, unshared, or revoked link, or unconfigured
 * storage. Deliberately says nothing about which, so a token can't be probed. */
export function DocumentUnavailable() {
  return (
    <div className="mx-auto max-w-md px-5 py-16 text-center">
      <h1 className="text-lg font-semibold">This document isn&apos;t available</h1>
      <p className="mt-2 text-sm text-neutral-500">
        The link may have been turned off or replaced. Ask whoever sent it for an updated copy.
      </p>
    </div>
  );
}
