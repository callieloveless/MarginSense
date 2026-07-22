# `src/ui/` — shared UI components

Shared, accessible, mobile-first components (Tailwind + shadcn/ui / Radix primitives). See
[`techstack.md` §6](../../techstack.md).

- **Phone-first:** design and check at phone width first, then scale up.
- **Server components by default;** client components only where interactivity needs them
  (the tool UIs).
- **Color signals are always paired with text** — red/yellow/green is never the only cue.
- Components never re-derive financial totals; they call [`src/engine/`](../engine) for
  money math and render what it returns.
