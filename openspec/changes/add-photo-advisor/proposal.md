# Add Photo Advisor — vision on a job photo (stage 8b)

## Why

John's most common question on a job site is the one he asks a camera: *what am I looking at,
and what will it take to fix it?* Today MarginSense can hold the photo (8a) but has nothing to
say about it — and the answer that matters isn't a diagnosis, it's **how many crew hours the
repair eats**, because that is what decides whether the job pulls its weight. Photo Advisor is
the first tool that turns a photograph into *work*: a diagnosis he can keep, and candidate labor
lines that move the job's profit-per-hour signal **before** he quotes it.

This is also the first tool whose advice is about physical work, so it is the first to carry the
licensed-professional, non-authoritative disclaimer (constitution §5, §7) — a photo advisor is
not a structural engineer, and the product must say so every time it speaks.

## What Changes

- **The Photo Advisor tool** (`src/tools/photo-advisor/`) on the existing contract:
  - **One photo per run**, plus an optional question ("is this joist worth sistering?"). The
    server action loads the photo's bytes tenant-scoped and passes them **in the tool input**;
    the tool itself gets no storage handle, exactly as the contract requires, and calls the
    model port's already-existing `images` input with `resultSchema` (#7a) for typed findings.
  - **Findings** → `finding` context-entry suggestions, each carrying the storage key of the
    photo it came from, so a diagnosis is traceable to the picture that produced it (§6.6).
  - **Candidate work** → `estimate_line_item` suggestions against the active estimate: **labor**
    lines carrying estimated `laborMinutes`, and **material** lines carrying a description and
    quantity. Every option flows through P2's `SuggestionCard`, so accepting "sister the joist —
    3.5 hrs" shows what it does to profit-per-hour first.
  - **It never invents a price.** Photo Advisor has no web search, so a material candidate is
    proposed **unpriced** — the job needs *three sheets of ¾ ply*, not "$62.40 a sheet"
    (constitution §7). Pricing is Material Finder's job, and the conversation post says so.
  - **A run with no active estimate** proposes findings only and says plainly that candidate work
    needs an estimate to land in — never a line item with nowhere to go.
- **The disclaimer becomes shared infrastructure.** One constant in `src/tools/disclaimer.ts`,
  attached to the run's `message.disclaimer` (the runner already appends it to the durable
  conversation post) **and** rendered as a standing notice on the tool panel, before the user
  even runs it. #9 Code Finder reuses the same constant rather than writing its own wording.
- **An unpriced line item previews honestly.** A proposed line whose cost is unknown currently
  previews as "profit per hour unchanged" — which is worse than no number, because a material
  line always costs *something*. The preview gains an unpriced case: it shows the labor-hour
  impact and says the cost isn't known yet, rather than implying a free line.
- **Findings can name their photo.** The `finding` context payload gains an optional photo
  reference (additive; `jsonb`, no migration), so the job's memory records which picture a
  diagnosis came from.
- **Live AI stays deferred.** Everything is built and unit-tested against the mock port with a
  canned vision result; the real vision call joins `relevant_notes.md` §5 as a key-gated proof.

## Capabilities

### New Capabilities
- `photo-advisor`: the vision tool — one photo plus an optional question in, `finding` entries
  and candidate labor/material line items out as `pending` suggestions, a cited-to-the-photo
  conversation post, and the licensed-professional disclaimer on everything it says.

### Modified Capabilities
- `project-context`: a pending `estimate_line_item` suggestion whose cost is not yet known SHALL
  show its hour impact with an explicit "not yet priced" note instead of a profit delta that
  reads as free. (The `finding` payload's optional photo reference is an additive JSON field, not
  a requirement change — the behavior it serves is specified under `photo-advisor`.)

## Impact

- **New code:** `src/tools/photo-advisor/` (the tool, its input/result/output schemas, the
  findings-and-lines → suggestions mapping); `src/tools/disclaimer.ts`; the `finding` payload's
  optional photo reference in `src/context/context.ts`; the unpriced branch in
  `app/_lib/suggestion-preview.ts`; a Photo Advisor panel under
  `app/(app)/projects/[id]/tools/` (photo picker from the job's photos + question + run) and its
  server action (loads bytes tenant-scoped, dispatches, never trusts a client `business_id`);
  unit tests (findings and lines mapped from a canned vision result; unpriced material lines
  proposed without a price; no active estimate → findings only; the disclaimer present on every
  run; the unpriced preview).
- **No new dependency, no migration.** Vision (`images`) and structured results (`resultSchema`)
  already exist on the port; the `finding` payload change is additive JSON.
- **Depends on:** `job-photos` (8a — the stored photo and its bytes), `tool-platform` (#6
  contract, P1 dispatch, #7a structured result + images), `project-context` (#5 entries and
  suggestions, P2 preview and card), `estimates` (what the candidate work is measured against).
- **Feeds:** #9 Code Finder, which reuses the shared disclaimer and can read a finding's photo
  reference; the per-tool panel pattern continues from #7b.

## Non-goals

- **No auto-trigger.** `photo.uploaded` stays without subscribers; wiring Code Finder to it is #9.
- **No multi-photo runs**, no comparing angles, no video. One photo, one run — which is also what
  #9's per-photo trigger will want.
- **No prices from a photo** and no web search in this tool. An unpriced material candidate is
  the correct output; Material Finder prices it.
- **No drawing on the image** — no boxes, arrows, or annotation overlays; findings are text.
- **No severity taxonomy or triage ranking.** Urgency belongs in the finding's own words for v1.
- **No new financial math.** Labor minutes flow through the existing engine roll-up at the
  business's burdened rate; no tool computes cost, margin, or EPH itself.
- **No commit path.** Everything Photo Advisor produces is a `pending` suggestion (§5).
