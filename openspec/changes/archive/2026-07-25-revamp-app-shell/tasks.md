## 1. Design tokens & theme

- [x] 1.1 Define the paper/ink/brand theme and `--signal-green` / `--signal-yellow` / `--signal-red` tokens in `app/globals.css` (Tailwind v4 `@theme`/CSS variables), mirroring the prototype's `:root`; document each token's meaning.
- [x] 1.2 Establish that signal/threshold colors are consumed **only** through components (never raw hex or a threshold color in a screen); add a short convention note in the tokens block and a grep check in the verification step.

## 2. Shared phone-first primitives (`app/_components/`)

- [x] 2.1 Extend `signal-badge.tsx`: add a compact **signal chip** variant and the neutral "not enough info" state, preserving color+text pairing and the EPH-never-shown rule.
- [x] 2.2 Add `Card` and `SectionHeader` primitives (prop-driven, server-renderable).
- [x] 2.3 Add `StatRow` primitive (label/value, tabular-nums) for drill-down rows.
- [x] 2.4 Add `SteppedProgress` primitive (step N of M) for wizard flows.
- [x] 2.5 Add `BottomSheet` client primitive (`'use client'`, portalled, focus-trapped, body scroll-locked while open, dismiss on backdrop tap + ESC + explicit close, ≥44px controls).
- [x] 2.6 Add `EmptyState` primitive (title, teaching body, primary action).

## 3. Navigation shell

- [x] 3.1 Add a minimal `'use client'` nav island using `usePathname` that marks the current tab `aria-current="page"`; keep the rest of `app/(app)/layout.tsx` a server component passing no tenant data to the island.
- [x] 3.2 Relabel the Projects tab **and the list page title** to **"Jobs"** (route `/projects` and the `project` entity unchanged); ensure each tab is a ≥44px tap target.
- [x] 3.3 Hide the tab bar on job sub-pages (hub/estimate/tools/documents/context) and show a back affordance to the parent instead — the tab bar renders only on Dashboard, Jobs, and Settings (the prototype's drill-in model).

## 4. Reorganize routes into the shell (no behavior change)

- [x] 4.1 Wrap the existing `(app)` screens in the shell frame; confirm each renders the **same** engine-computed values and runs the **same** tenant-scoped queries — the shell adds no query or mutation of its own.
- [x] 4.2 Preserve auth gating (signed-out → sign-in; no-business → create-business) and the unconfigured/skeleton states, rendered inside the shell.
- [x] 4.3 **Isolation guard:** confirm this change modifies no `src/engine/`, `src/db/`, migration, `src/tools/`, or RLS file and touches no business-owned row — so there is no new tenant surface to isolate (presentation-only).

## 5. Accessibility & verification

- [x] 5.1 Accessibility pass: color always paired with text, `aria-current` on the active tab, ≥44px targets, focus management + ESC on the bottom sheet.
- [x] 5.2 Responsive check: single column at phone width; centered max-width column at desktop width; no rendered device frame.
- [x] 5.3 Run `npm run typecheck`, `npx vitest run` (existing suite stays green), and `npm run build` (Turbopack — the only check that catches App-Router/import issues).
- [x] 5.4 Update `PROGRESS.md` R1 status; note there are **no** new deferred live-infra items (no schema/migration in this change).
