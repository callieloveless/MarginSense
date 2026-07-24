## Context

Everything Photo Advisor needs already exists and is unit-tested: the tool contract and dispatch
(#6, P1), the model port's `images` input and `resultSchema` structured output (#7a), the
suggestion queue with its profit preview and tool-agnostic card (#5, P2), the per-tool panel
pattern (#7b), and — as of 8a — a stored, tenant-isolated photo. This change adds no
infrastructure. It is the first tool that gives **advice about physical work**, and the first
whose output is *hours* rather than *prices*, which is where the interesting decisions are.

Constraints: a tool may hold no DB or storage handle (constitution §5, structurally enforced by
`ToolContext`); the app never fabricates a price it cannot source (§7); labor minutes are the
denominator of the metric the whole product exists for, so anything the tool says about hours
lands directly on the red/yellow/green signal.

## Goals / Non-Goals

**Goals:**
- Turn one photo into a diagnosis the job remembers and repair labor whose profit impact the user
  sees *before* accepting it.
- Say honestly what the tool does not know — no invented prices, and nothing costed entering an
  estimate without a real number behind it.
- Make the licensed-professional disclaimer structural and shared, not per-tool prose.
- Leave #9 (Code Finder on `photo.uploaded`) nothing to undo.

**Non-Goals:**
- Auto-triggering, multi-photo runs, image annotation, a triage view (see the proposal).
- Any new financial math, and any change to how the engine computes cost, margin, or EPH.

## Decisions

### 1. Materials are named in the finding and never become line items
Photo Advisor has no web search, so any price it produced would be fabricated (§7). The tempting
middle road — propose the material line *unpriced* — is worse than it looks: an uncosted line
rolls up as **zero cost**, so a line John accepts and forgets leaves the estimate quietly
overstating profit and the signal green when it should be yellow. That is precisely the failure
this product exists to prevent, and a note on the suggestion card only guards the moment before
acceptance, not the weeks after it.

So the finding says *what the repair needs* ("three sheets of ¾ ply") and the conversation post
hands pricing to Material Finder, which searches, sources, and proposes the real line. The two
tools compose the way the tool system intends, and **no zero-cost line can reach an estimate by
any path.**

*Alternatives considered:* flagging unpriced lines in the estimate editor and the profit signal
(honest end to end, but a second change across the estimate and profit surfaces — bigger than
this tool); requiring a price at accept time (nothing unpriced lands, but it puts data entry into
an accept flow that is one tap today).

### 2. Labor is where this tool earns its keep, and the model only supplies minutes
A labor line's cost is *not* the model's opinion — it is `minutes/60 × burdenedRate` from the
business's own settings, computed by the engine (§3.4). The model contributes only the estimate
of *how long the work takes*, which is exactly the judgment a photo supports and the number the
whole EPH signal turns on. Every dollar stays traceable to inputs the user owns.

### 3. An implausible estimate is proposed and flagged, not dropped
An earlier draft clamped labor minutes and discarded anything out of range. That is a silent
truncation of the single most valuable thing a photo can reveal: if the model thinks this is a
sixty-hour repair, John needs to see that, because it may be the reason to walk away from the
job. So the bound (one named constant) drives a **warning in the conversation post**, not a
filter — and the minutes on the suggestion are always the minutes the model returned.

### 4. The image travels as tool **input**, and the storage port gains a read
`run(ctx)` receives `{ photoId, mediaType, imageBase64, caption?, question? }`; the server action
resolves the photo tenant-scoped, reads its bytes, and passes them in. The tool still holds no
handle — it cannot read a second photo, another project, or any row.

This requires a method 8a does not have: `PhotoStorageBackend` can `putObject`, `signedUrls`, and
`deleteObjects`, but cannot **read an object back**. `getObject(businessId, key)` is added with
the same prefix refusal as its siblings, memory and Supabase impls, and an isolation test.

*Alternative considered:* extend `ToolContext` with a resolved-attachments field so tools name a
photo id and the runner fetches bytes. Cleaner call sites, but it puts a storage dependency into
dispatch — the one seam every tool flows through — to serve a single tool, and it would need a
`tool-platform` requirement change. Revisit if a second tool needs images. The cost of the
current choice is that a run holds the image in memory; nothing persists it (there is no input
column on `tool_runs`), so it is transient only.

*A second alternative:* pass a signed URL and let the model fetch it. Rejected for now — it would
add a URL variant to the port's image block, and it makes a tenant's photo reachable by anyone
holding the link for its lifetime.

*Note for #9:* Code Finder wants **local codes for a finding**, not pixels — it can run from a
finding's text plus the service area, so this decision does not corner the auto-trigger, whose
event payload today carries `{ projectId, photoId, storageKey }` and no bytes.

### 5. Severity is typed data on the finding, not a convention in its prose
`safety` / `attention` / `note` on the `finding` payload (additive JSON, no migration). "Is this
a safety problem?" decides whether John finishes the quote or walks, and a model writing
"URGENT:" into a summary cannot be filtered, sorted, or highlighted later — #9 and any future
triage view need the field to exist now. It renders as **text plus colour** on the suggestion
card and in the job context list, never colour alone, and it is driven by the payload, so the
card stays tool-agnostic as `project-context` requires.

### 6. The panel both captures and chooses; the disclaimer sits above both
On site the flow is take-ask-run in one step: the panel uploads through 8a's existing path (so
the photo joins the job like any other) and dispatches immediately. Back at the truck, it lists
the job's photos — thumbnails signed in one batch — and runs on a chosen one. There is no
separate upload screen between having a photo and asking about it.

The disclaimer constant lives in `src/tools/disclaimer.ts`, is set as `message.disclaimer` (the
runner already appends it to the durable post, next to the advice), and renders above the run
control. Deliberately **not** on the suggestion card: `project-context` requires cards to be
presented from target and payload alone with no branch on the producing tool, and a tool-specific
banner there would break a requirement that exists to keep the queue uniform.

## Risks / Trade-offs

- **A model over-estimates hours and the signal moves on bad data** → nothing commits without
  acceptance, the minutes are visible on the card before accepting and editable after, and an
  out-of-range estimate is called out in the post rather than hidden; the profit preview is what
  makes a bad estimate obvious rather than silent.
- **A confident wrong diagnosis on a safety-relevant defect** → the disclaimer is on every post
  and on the panel, findings are proposals accepted one at a time, and severity makes the serious
  ones legible rather than buried. This is the risk §5/§7 exists for; it is mitigated, not
  eliminated.
- **Materials being findings rather than lines means a repair's material cost is missing from the
  estimate until Material Finder runs** → deliberate: a missing cost the user can see he hasn't
  entered is safer than a zero he cannot. The post names the handoff explicitly.
- **Vision costs more per run than a text call** → one photo per run bounds it, the image is
  already downscaled to 1568px by 8a, and `tool_run` records tokens per run so the spend is
  observable per tenant before it is a surprise.
- **Live vision is unproven until a key exists** → same posture as every prior tool: proven
  offline against the mock's canned result, with a key-gated proof item in `relevant_notes.md`.

## Open Questions

- Should accepting a finding offer a one-tap "price these materials with Material Finder" handoff,
  or is naming the tool in the post enough for v1? Assumed: the post, for now.
- Should a run against a photo that already has findings show the prior ones to avoid re-proposing
  the same thing? Dispatch's dedup already prevents duplicate *pending* suggestions; whether the
  prompt should also see prior findings is a quality question worth testing live.
- Does severity deserve a job-level roll-up ("2 safety findings open on this job")? Out of scope
  here; the field exists so it can be built without a migration.
