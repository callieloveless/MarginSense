## Context

The authenticated shell today is `app/(app)/layout.tsx`: a `max-w-md` centered column with a
sticky bottom grid of three plain `<Link>`s (Dashboard · Projects · Settings) — **no active
state, no `aria-current`** — and a static header wordmark. Job-level pages are reached by
drilling in. Styling is ad-hoc Tailwind per screen. `SignalBadge` already enforces the
constitution's "color always paired with text" rule and the "EPH never shown to users" rule.

The prototype establishes a calm paper/green theme, a red/yellow/green **signal palette**, and a
recurring vocabulary of surfaces — cards, signal chips, stat rows, stepped progress, bottom
sheets, teaching empty states. Every later revamp phase (R2–R10) needs these. Building them
per-screen would fork the visual language and re-litigate the signal colors. This change lands
them **once**, as the frame the rest of the revamp is built on. Stack constraints: Next.js App
Router (server-first, techstack §6), React 19, Tailwind v4, phone-first; **no** engine, DB,
migration, or tool change here.

## Goals / Non-Goals

**Goals:**
- One mobile shell with active-state bottom-tab nav (`aria-current`), Projects tab relabelled Jobs.
- A centralized token system: paper/green theme + the signal palette, so a threshold color is
  defined in exactly one place and never used raw (always via a text-bearing component).
- Reusable phone-first primitives (section header, card, signal chip, stat row, stepped-progress,
  bottom sheet) + a teaching empty-state component — the stable contract R2–R10 consume.
- Accessibility baseline: color+text, `aria-current`, ≥44px targets, focus-managed sheet.

**Non-Goals:**
- Redesigning any screen's *content* (each is its own later phase). No device-frame emulation.
- No new behavior, data, schema, AI, or offline/PWA-install work. No route renames.

## Decisions

- **Tokens as Tailwind v4 `@theme` / CSS variables in `globals.css`, surfaced only through
  components.** One home for the paper/ink/brand and `--signal-green/-yellow/-red` values, mirroring
  the prototype's `:root`. *Why not a Tailwind config theme extension:* Tailwind v4 is CSS-first;
  CSS vars read cleaner and keep the signal colors in one legible block. Components (not raw
  classes) consume signal tokens so color never appears without text.
- **Signal chip extends `SignalBadge`, not a rewrite.** Add a compact chip variant + the neutral
  "not enough info" state to the component that already enforces color+text and hides EPH. *Why:*
  keep a single rule-enforcing component; avoid a second place the threshold colors live.
- **Active-tab state via a minimal `'use client'` nav island using `usePathname`; the layout stays
  a server component.** *Why not a client layout:* server-first (techstack §6) — only the nav needs
  the current path, so only the nav hydrates; it passes no tenant data.
- **Bottom sheet is a lightweight client primitive** (a focus-trapped, portalled element with
  backdrop + ESC/close), local open state. *Why not pull in a new drawer dependency:* keep deps
  lean; a small accessible sheet covers the prototype's two uses ("shoot a photo for…", "more").
- **Primitives live under `app/_components/` (underscore = not a route), prop-driven and
  server-renderable except the interactive ones (`'use client'`).** Mirrors the existing
  `_components` convention.
- **Reorganization is label + wrapper only; routes stay `/projects`.** Relabel the tab to "Jobs",
  leave the route and `project` entity intact. *Why not rename to `/jobs`:* needless churn,
  redirects, and broken deep links for a word change.

## Risks / Trade-offs

- **Double-restyle** (later phases touch these screens again) → R1 ships *frame + tokens +
  primitives* only; screen content is each phase's job; the primitives are the stable contract.
- **Tailwind v4 theming footgun** → keep tokens additive; don't rip out existing classes wholesale;
  verify with `npm run build` (Turbopack is the only check that catches App-Router/import issues).
- **Scope creep into screen redesign** → explicit non-goal; the spec scopes this to the frame.
- **Nav island hydration in a server layout** → keep the island tiny, tenant-data-free; everything
  else server-rendered.
- **Regression in gating / unconfigured skeletons** → those paths are preserved and re-verified
  inside the shell (spec requirement), not rewritten.

## Migration Plan

Purely additive and presentational. Introduce tokens + primitives, then swap the layout's tab bar
to the active-state nav and wrap existing screens — no data migration, no DB, no engine touch.
**Rollback** = revert the presentational commit; screens keep working on their prior classes
during transition. **Verify:** `npm run typecheck`, `npx vitest run` (existing tests unaffected),
`npm run build`, then a phone-width manual pass of tab active-state, a bottom sheet, and one
teaching empty state.

## Open Questions

- Hand-rolled sheet vs a Radix `Dialog`-based one — pick the lighter at apply time (lean
  hand-rolled/Radix to avoid a new dependency).
- Final semantic token names to mirror the prototype's `:root` (paper/ink/brand/signal) — settle at
  apply; keep them semantic (`--signal-green`), never raw hex inside components.
