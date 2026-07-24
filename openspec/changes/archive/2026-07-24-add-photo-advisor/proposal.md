# Add Photo Advisor — vision on a job photo (stage 8b)

## Why

John's most common question on a job site is the one he asks a camera: *what am I looking at,
and what will it take to fix it?* Today MarginSense can hold the photo (8a) but has nothing to
say about it — and the answer that matters isn't a diagnosis, it's **how many crew hours the
repair eats**, because that is what decides whether the job pulls its weight. Photo Advisor is
the first tool that turns a photograph into *work*: a diagnosis he can keep, and candidate labor
lines that move the job's profit-per-hour signal **before** he quotes it.

It is also the first tool that advises on physical work, so it is the first to carry the
licensed-professional, non-authoritative disclaimer (constitution §5, §7) — a photo advisor is
not a structural engineer, and the product must say so every time it speaks.

## What Changes

- **The Photo Advisor tool** (`src/tools/photo-advisor/`) on the existing contract:
  - **One photo per run**, plus an optional question ("is this joist worth sistering?"). The
    server action reads the photo's bytes tenant-scoped and passes them **in the tool input**;
    the tool itself gets no storage handle, exactly as the contract requires, and calls the model
    port's already-existing `images` input with `resultSchema` (#7a) for typed findings.
  - **Findings** → `finding` context-entry suggestions, each carrying a **severity** —
    `safety`, `attention`, or `note` — and the storage key of the photo it came from, so a
    diagnosis is traceable to the picture behind it (§6.6). "Is this a safety problem?" is the
    question that decides whether John walks away from a job; it belongs in typed data, not
    buried in prose.
  - **Repair labor** → `estimate_line_item` suggestions against the active estimate carrying
    estimated `laborMinutes`. Each flows through P2's `SuggestionCard`, so accepting "sister the
    joist — 3.5 hrs" shows what it does to profit-per-hour first. A labor line's *cost* is never
    the model's opinion: the engine computes it from the business's own burdened rate (§3.4).
  - **An implausibly large estimate is proposed anyway, and flagged.** A candidate beyond a
    plausibility bound is still surfaced with its real minutes, with the conversation post saying
    it looks high — if the repair genuinely is that big, that is the most valuable thing the photo
    could tell him about this job's profitability. Nothing is dropped silently.
  - **A run with no active estimate** proposes findings only and says plainly that candidate work
    needs an estimate to land in — never a line item with nowhere to go.
- **Materials are named, never priced, and handed to Material Finder.** Photo Advisor has no web
  search, so it does not propose material line items at all: the finding says *what the repair
  needs* ("three sheets of ¾ ply"), and the conversation post offers Material Finder to price it
  and propose the real, sourced line. **No zero-cost line can ever reach an estimate** — a
  forgotten unpriced line would quietly overstate profit and turn the signal green when it should
  be yellow, which is exactly the failure this product exists to prevent (§7, §6.6).
- **The disclaimer becomes shared infrastructure.** One constant in `src/tools/disclaimer.ts`,
  attached to the run's `message.disclaimer` (the runner already appends it to the durable
  conversation post) **and** rendered as a standing notice on the tool panel, before the user even
  runs it. #9 Code Finder reuses the same constant rather than writing its own wording.
- **The Photo Advisor panel both takes a photo and picks one.** On site: capture, ask, run, in one
  step (it uploads through 8a's existing path, so the photo joins the job like any other). Back at
  the truck: choose a photo already on the job. The advisor is where the photos are, instead of
  behind a separate upload screen.
- **Findings carry severity in the job's memory.** The `finding` context payload gains a required
  `severity` and an optional photo reference (additive JSON, no migration), and the suggestion
  card shows severity as **text plus colour, never colour alone** — driven by the payload, so it
  stays tool-agnostic as `project-context` requires.
- **Live AI stays deferred.** Everything is built and unit-tested against the mock port with a
  canned vision result; the real vision call joins `relevant_notes.md` §5 as a key-gated proof.

## Capabilities

### New Capabilities
- `photo-advisor`: the vision tool — one photo (captured or chosen) plus an optional question in;
  `finding` entries with severity and candidate labor line items out as `pending` suggestions; a
  conversation post that names the materials it saw and hands pricing to Material Finder; and the
  licensed-professional disclaimer on everything it says.

### Modified Capabilities
- `project-context`: a `finding` entry SHALL carry a typed severity (`safety` / `attention` /
  `note`) and MAY name the photo it came from, and a severity SHALL be displayed as text paired
  with colour.

## Impact

- **New code:** `src/tools/photo-advisor/` (the tool, its input/result/output schemas, the
  findings-and-labor → suggestions mapping); `src/tools/disclaimer.ts`; severity + optional photo
  reference on the `finding` payload in `src/context/context.ts` and its rendering in
  `app/_components/suggestion-card.tsx` and the job context list; a Photo Advisor panel under
  `app/(app)/projects/[id]/tools/` (capture-or-choose + question + run) and its server action;
  unit tests (findings with severity mapped from a canned vision result; labor lines carrying
  minutes; no material line ever proposed; an over-range estimate proposed **and** flagged; no
  active estimate → findings only; the disclaimer on every run).
- **`PhotoStorageBackend` gains `getObject`** — 8a can write, sign, and delete an object but not
  read one back, and the action needs the bytes. Memory + Supabase impls and an isolation test
  (a key outside the caller's prefix reads back nothing), mirroring the existing methods.
- **No new dependency, no migration.** Vision (`images`) and structured results (`resultSchema`)
  already exist on the port; the `finding` payload change is additive JSON.
- **Depends on:** `job-photos` (8a — the stored photo, its bytes, and its upload path),
  `tool-platform` (#6 contract, P1 dispatch, #7a structured result + images), `project-context`
  (#5 entries and suggestions, P2 preview and card), `estimates` (what the labor is measured
  against).
- **Feeds:** #9 Code Finder, which reuses the shared disclaimer and can read a finding's photo
  reference and severity; the per-tool panel pattern continues from #7b.

## Non-goals

- **No auto-trigger.** `photo.uploaded` stays without subscribers; wiring Code Finder to it is #9.
- **No multi-photo runs**, no comparing angles, no video. One photo, one run — which is also what
  #9's per-photo trigger will want.
- **No prices from a photo, and no material line items at all** in this tool. Naming the material
  in the finding and handing off to Material Finder is the whole of it.
- **No drawing on the image** — no boxes, arrows, or annotation overlays; findings are text.
- **No triage view.** Severity is recorded and shown on an entry; sorting, filtering, or a
  "safety issues on this job" roll-up is a later change.
- **No new financial math.** Labor minutes flow through the existing engine roll-up at the
  business's burdened rate; no tool computes cost, margin, or EPH itself.
- **No commit path.** Everything Photo Advisor produces is a `pending` suggestion (§5).
