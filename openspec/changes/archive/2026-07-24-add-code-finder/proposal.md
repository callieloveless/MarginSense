# Add Code Finder — local building codes, on demand and off a finding (stage 9b)

## Why

When John diagnoses a problem, the next question an inspector will ask is *"does the fix meet
code?"* — and code is **local**: the same repair is fine in one county and a permit-and-inspection
job in the next. Today nothing in MarginSense answers that, and John is back to a separate search
with no memory of the job. Code Finder closes it: ask a code question and get sourced, local code
references pinned to the job — and when Photo Advisor has already found a defect, the codes for it
appear **without John retyping the diagnosis into a second tool**.

This is the first tool to use 9a's composition seam, so it is where composition earns its keep:
Photo Advisor says *"rot at the joist end,"* and Code Finder looks up the joist and notching codes
for that address — one hand-off, no second vision pass. It is also the second physical-work tool,
so it reuses 8b's shared licensed-professional disclaimer and must never present a code lookup as
an authoritative inspection (constitution §5, §7).

## What Changes

- **The Code Finder tool** (`src/tools/code-finder/`) on the existing contract:
  - **Standalone query** — a plain question ("what's required for a bathroom exhaust fan here?").
    It web-searches local code (the port's `web_search`, like Material Finder) with a
    `resultSchema`, and proposes the **few most relevant** results as `code_ref` context-entry
    suggestions carrying the **code, the requirement, the jurisdiction, and its source link** — a
    focused answer, not an exhaustive citation dump that would bury a phone screen. It posts a
    summary to the job's single conversation. **One question, one answer, into the one job
    thread** — not a separate chat history (constitution §4).
  - **Never a code it can't source.** A result with no source URL is dropped, exactly as Material
    Finder drops an unsourced price (§7 — the app never fabricates a citation it cannot source).
  - **Localized to the service area.** The search location is pre-filled from
    `business_settings.service_area` (the field Material Finder already added) and overridable per
    query; with none set it searches without a local bias and says so.
  - **Compliance notes tied to the job's number.** Each code reference may carry a plain-language
    compliance note (a permit, an inspection, a "this needs an electrician"), and the conversation
    post surfaces those notes **as what they cost the job** — added crew hours and dollars the
    estimate may not include — because that is the question the whole product answers. A permit
    isn't a filing detail; it's time and money that can turn a green job yellow.
- **The first compose edge: `photo-advisor → code-finder`.** 9a shipped `dispatchAndCompose`
  dormant; this registers `COMPOSE_EDGES["photo-advisor"]` with a mapper that runs Code Finder for
  **each finding that carries a code implication** — a `safety` or `attention` severity, not a
  cosmetic `note` — its query built from the finding and its jurisdiction from the service area.
  Composed runs are `source: "compose"` at the next step, bounded by the budget, and — like every
  run — produce only `pending` suggestions. So a photo diagnosis fans out to the codes for the
  problems worth acting on, and John accepts each independently.
  - **Why not every finding:** composition is synchronous (the platform has no reliable background
    execution — a server action must finish its work before it returns), so each composed run adds
    latency to the photo result and another card to the review queue. Looking up code for "minor
    surface mould" spends a web search and a phone-screen row on nothing. Gating on severity keeps
    the auto-path fast and the queue about the things that matter; Photo Advisor's prompt is
    tightened so anything with a permit/code/inspection angle is marked at least `attention`, so
    the gate never drops a real code need.
- **Findings and their codes stay traceable to the photo.** Photo Advisor's typed `output` gains
  the storage key of the photo the run was about (additive), so the compose mapper can pass it to
  Code Finder and each composed `code_ref` records which photo the code answers.
- **`code_ref` carries its source, note, and photo.** The `code_ref` context payload gains an
  optional `sourceUrl`, `complianceNote`, and `photoStorageKey` (additive JSON, no migration) — so
  a pinned code shows where it came from, what it implies, and (when composed) the photo behind it.
- **The disclaimer is the shared one.** `PHYSICAL_WORK_DISCLAIMER` (8b) on the run's
  `message.disclaimer` and as a standing notice on the tool panel — its "not an official
  inspection / not authoritative" wording already covers code.
- **Live AI stays deferred.** Everything is built and unit-tested against the mock port with a
  canned code result and a composed-run test; the real `web_search` proof joins
  `relevant_notes.md` §5.

## Capabilities

### New Capabilities
- `code-finder`: the Code Finder tool — a standalone local-code query and the first composed
  consumer (off the code-relevant Photo Advisor findings); web-search → a focused set of sourced
  `code_ref` entries with citations, compliance notes framed as their cost/hour impact on the job,
  jurisdiction from the service area, and the licensed-professional disclaimer.

### Modified Capabilities
- `project-context`: a `code_ref` entry MAY additionally carry a source URL, a compliance note,
  and the photo it was derived from (all optional, additive) — so a pinned code is sourced,
  its consequence is legible, and a composed code stays traceable to its photo.

## Impact

- **New code:** `src/tools/code-finder/` (the tool, its input/result/output schemas, the
  result → `code_ref` suggestion mapping with the unsourced-drop rule and a focused result cap);
  the `code_ref` payload extension in `src/context/context.ts`; a `photoStorageKey` on Photo
  Advisor's output plus a prompt tweak so code-relevant findings are marked `attention`; the
  `photo-advisor → code-finder` edge registered in `app/_lib/compose.ts` with its mapper (one run
  per **code-relevant** finding, jurisdiction resolved once); a Code Finder query panel + server
  action under `app/(app)/projects/[id]/tools/`; unit tests (sourced codes mapped from a canned
  result; an unsourced code dropped; the result cap; the compose edge fans a run per code-relevant
  finding and skips `note`s; a composed `code_ref` records its photo; the post frames compliance as
  cost/hour impact; the disclaimer on every run; standalone requires a configured model).
- **No new dependency, no migration.** `web_search` + `resultSchema` (port) and the compose seam
  (9a) already exist; the payload changes are additive JSON.
- **Depends on:** `tool-platform` (#6, #7a port, 9a compose), `photo-advisor` (#8b — the producer
  and its `output`), `project-context` (#5 `code_ref` entries + suggestions), `onboarding`
  (`service_area`).
- **Feeds:** #12's tool-graph editor draws the `photo-advisor → code-finder` edge rather than
  registering it in code; any future physical-work tool reuses the shared disclaimer.

## Non-goals

- **No line-item mutation and no fabricated permit line.** Code Finder proposes `code_ref` entries
  and names the cost/hour consequence in the post; it does **not** attach a badge to Photo
  Advisor's pending line-item suggestions (independent rows), and it does **not** propose a permit
  or inspection as a line item — an unpriced line would roll up as $0 and overstate the job's
  profit, the exact trap 8b avoided. The consequence is a note that tells John to put the cost in
  himself (or price it with Material Finder); badging an accepted line is a later change.
- **No composing cosmetic findings.** A `note`-severity finding does not trigger a code lookup;
  the auto-path is for problems worth acting on. A `note` John still wants codes for, he asks about
  in the standalone query.
- **No `photo.uploaded` subscriber.** The event keeps emitting for a future use, but the trigger
  is the compose edge off *findings*, not the raw photo — codes are looked up for a known defect,
  not a blind image.
- **No uploaded code documents.** Standalone Code Finder searches the open web; "bring your own
  adopted local amendments as PDFs" (storage + extraction + retrieval) is its own later change.
- **No separate per-tool chat history**, no multi-turn thread — one question, one answer, into the
  project's single conversation (constitution §4).
- **No authoritative determination.** Every result carries the non-authoritative disclaimer; Code
  Finder assists, it does not certify compliance.
- **No new financial math and no commit path.** Everything is a `pending` suggestion (§5).
