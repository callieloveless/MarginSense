## Why

Every MarginSense capability is built, but a contractor reaches them through a thin,
utilitarian shell that doesn't fit the job: a phone in one hand, dirty, one bar of signal —
and it lacks the calm, guided feel the new prototype sets as the product's voice. Before any
screen is reshaped, the app needs one consistent mobile shell, one shared visual language (the
paper/green theme plus the red/yellow/green **signal palette**, always paired with text), and a
small set of phone-first primitives every later phase reuses. Doing this **once, first** stops
each later phase (R2–R10) from re-inventing — and re-styling — the frame, and gives the profit
signal a single, trustworthy visual home so the same green means the same thing everywhere.

## What Changes

- **Navigation:** an active-state bottom tab bar — **Dashboard · Jobs · Settings** — with
  `aria-current`; the "Projects" tab is relabelled **"Jobs"** (the prototype's plainer word for
  a contractor). The domain entity stays `project`; only the label changes.
- **Design tokens:** the paper/green theme and the signal palette (green / yellow / red, each
  bound to a text label, never color-only) centralized as tokens rather than scattered ad-hoc
  classes — the one place a threshold color is defined.
- **Shared phone-first primitives:** section header, card, **signal chip** (extending the
  existing `SignalBadge`), stat row, stepped-progress, and a **bottom sheet** — with a
  **teaching empty-state** pattern. Server-rendered by default; a client island only where an
  interaction needs it (sheet open/close, tab active state), never a whole-app SPA.
- **Route organization:** existing routes are reorganized into the shell **without changing
  their behavior, data, or copy**. This change owns the *frame, tokens, and primitives* only;
  each later phase owns its own screen content, so no screen is styled twice.
- **Not a device frame:** keep the responsive `max-w-md` column. The prototype's literal phone
  chrome and left sidebar are mock scaffolding, not app chrome — the real app is a responsive PWA.

**Explicitly unchanged (per the constitution's load-bearing rules):** no financial math (every
number still comes from `src/engine/`), **no schema or migration**, no change to tenant isolation
or any tenant-scoped query, and no tool behavior (tools still suggest; users still confirm). This
change is **presentational and navigational only** — it interacts with none of the financial
model, tenant-isolation, or tools-suggest-users-confirm rules.

## Capabilities

### New Capabilities
- `app-shell`: the authenticated mobile shell — bottom-tab navigation with active state, the
  design-token system and the red/yellow/green signal palette, the shared phone-first UI
  primitives (section header, card, signal chip, stat row, stepped-progress, bottom sheet), and
  the teaching empty-state pattern that every outer-layer and tool screen reuses.

### Modified Capabilities
<!-- None. No existing capability's REQUIREMENTS change; the tab relabel and reorganization are
     presentation only. Later phases reshape individual screens under their own capabilities. -->

## Impact

- **Code:** `app/(app)/layout.tsx` (tab bar + active state + `aria-current`), `app/layout.tsx`
  (viewport, unchanged behavior), a tokens home (`app/globals.css` / a tokens module),
  `app/_components/*` (new primitives; extend `signal-badge.tsx`), tab labels.
- **No touch:** `src/engine/`, `src/db/`, migrations, `src/tools/`, `src/ai/`, RLS policies.
- **Downstream:** R2–R10 build their screens on these primitives and tokens; they are a public
  contract for the revamp and should stay stable. Accessibility (color+text, `aria-current`,
  ≥44px tap targets) is set here as the baseline every later screen inherits.

## Non-goals

- No screen's *content* is redesigned here (dashboard, hub, estimate, tools, docs, onboarding
  are each their own later phase) — only the frame they sit in.
- No new capability behavior, data, or AI. No device-frame emulation. No offline/PWA-install
  work (tracked for R10). No change to auth, gating, or the unconfigured/skeleton states beyond
  reusing them within the new shell.
