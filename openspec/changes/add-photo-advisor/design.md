## Context

Everything Photo Advisor needs already exists and is unit-tested: the tool contract and dispatch
(#6, P1), the model port's `images` input and `resultSchema` structured output (#7a), the
suggestion queue with its profit preview and tool-agnostic card (#5, P2), the per-tool panel
pattern (#7b), and — as of 8a — a stored, tenant-isolated photo whose bytes can be read through
the tenant handle. This change adds no infrastructure. It is the first tool that gives **advice
about physical work**, and the first whose output is *hours* rather than *prices*, which is
where the interesting decisions are.

Constraints: a tool may hold no DB or storage handle (constitution §5, structurally enforced by
`ToolContext`); the app never fabricates a price it cannot source (§7); labor minutes are the
denominator of the metric the whole product exists for, so anything the tool says about hours
lands directly on the red/yellow/green signal.

## Goals / Non-Goals

**Goals:**
- Turn one photo into a diagnosis the job remembers and candidate work whose profit impact the
  user sees *before* accepting it.
- Say honestly what the tool does not know — no invented prices, no free-looking line items.
- Make the licensed-professional disclaimer structural and shared, not per-tool prose.
- Leave #9 (Code Finder on `photo.uploaded`) nothing to undo.

**Non-Goals:**
- Auto-triggering, multi-photo runs, image annotation, severity taxonomies (see the proposal).
- Any new financial math, and any change to how the engine computes cost, margin, or EPH.

## Decisions

### 1. The image travels as tool **input**, not as a new context capability
`run(ctx)` receives `{ photoId, mediaType, imageBase64, caption?, question? }`; the server action
resolves the photo tenant-scoped, reads its bytes, and passes them in. The tool still holds no
handle — it cannot read a second photo, another project, or any row.

*Alternative considered:* extend `ToolContext` with a resolved-attachments field so tools name a
photo id and the runner fetches bytes. Cleaner call sites, but it puts a storage dependency into
dispatch — the one seam every tool flows through — to serve a single tool, and it would need a
`tool-platform` requirement change. Revisit if a second tool needs images; until then this is the
shallower change. The cost is that a `tool_run`'s input is large in memory; nothing persists it
(there is no input column on `tool_runs`), so this is transient only.

*Note for #9:* Code Finder wants **local codes for a finding**, not pixels — it can run from a
finding's text plus the service area, so this decision does not corner the auto-trigger, whose
event payload today carries `{ projectId, photoId, storageKey }` and no bytes.

### 2. The model returns findings and candidate work; the tool decides what may be proposed
The port `resultSchema` is `{ findings: [{ summary, detail? }], labor: [{ description,
laborMinutes }], materials: [{ description, quantity, unit }] }`. Two rules live in the tool, not
the prompt, because a prompt is a request and a schema boundary is a guarantee:

- **materials carry no cost field at all** — there is nowhere for an invented price to go;
- **labor minutes are clamped to a sane range** and a candidate outside it is dropped rather than
  proposed, so a model that returns 40,000 minutes cannot quietly wreck a job's signal.

### 3. Unpriced material lines are proposed — and the preview stops pretending they're free
A material line with no `unitCostCents` rolls up as **zero cost**, so P2's preview would show
"profit per hour unchanged" for a line that in reality costs money — a fabricated number by
omission, which §6.6 forbids as firmly as a fabricated price. So the preview gains a third case
beside "normal" and "no active estimate": *cost not yet known* → show the hour impact, say the
cost is unknown, show no profit delta.

*Alternatives considered:* (a) have the model estimate a price — rejected outright by §7;
(b) propose materials as context entries instead of lines — the `material` payload requires a
`priceCents`, so this would mean storing a fabricated `0`; (c) don't propose materials at all —
loses the handoff where Material Finder prices exactly what the photo found. The preview branch
is one condition and buys honesty in the one place the product cannot afford to be wrong.

### 4. Labor is where this tool earns its keep, so labor is proposed with real minutes
A labor line's cost is *not* the model's opinion — it is `minutes/60 × burdenedRate` from the
business's own settings, computed by the engine (§3.4). The model contributes only the estimate
of *how long the work takes*, which is exactly the judgment a photo supports and the number the
whole EPH signal turns on. That keeps every dollar traceable to inputs the user owns.

### 5. One disclaimer constant, attached two ways
`src/tools/disclaimer.ts` exports the text; the tool sets `message.disclaimer` (the runner
already appends it to the conversation post, so it lands in the durable record next to the
advice) and the panel renders the same constant above the run control. Deliberately **not** on
the suggestion card: `project-context` requires cards to be presented from target and payload
alone, with no branch on the producing tool, and adding a tool-specific banner there would break
a requirement that exists to keep the queue uniform.

### 6. The panel picks from photos already on the job
Photo Advisor does not upload. It lists the job's photos (8a's rows, thumbnails signed in one
batch) and runs against the selected one — so the capture path stays in one place, and a photo
can be advised on more than once as the job changes.

## Risks / Trade-offs

- **A model over-estimates hours and the signal moves on bad data** → nothing commits without
  acceptance, the minutes are visible on the card before accepting and editable after, and the
  clamp in decision 2 bounds the damage; the profit preview is what makes a bad estimate obvious
  rather than silent.
- **A confident wrong diagnosis on a safety-relevant defect** → the disclaimer is on every post
  and on the panel, and findings are proposals the user accepts one at a time. This is the risk
  the constitution's §5/§7 rule exists for; it is mitigated, not eliminated.
- **Vision costs more per run than a text call** → one photo per run bounds it, the image is
  already downscaled to 1568px by 8a, and `tool_run` records tokens per run so the spend is
  observable per tenant before it is a surprise.
- **The unpriced-line preview is a new branch in shared code** → it is covered by its own unit
  test at the boundary, and it degrades in the safe direction (says less rather than more).
- **Live vision is unproven until a key exists** → same posture as every prior tool: proven
  offline against the mock's canned result, with a key-gated proof item in `relevant_notes.md`.

## Open Questions

- Should accepting a finding offer a one-tap "price these materials with Material Finder" handoff,
  or is naming the tool in the post enough for v1? Assumed: the post, for now.
- Should a run against a photo that already has findings show the prior ones to avoid re-proposing
  the same thing? Dispatch's dedup already prevents duplicate *pending* suggestions; whether the
  prompt should also see prior findings is a quality question worth testing live.
