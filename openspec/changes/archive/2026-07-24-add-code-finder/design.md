## Context

Everything Code Finder needs exists: the tool contract and dispatch (#6, P1), web search +
`resultSchema` on the port (#7a, first used by Material Finder), the compose seam (9a,
`dispatchAndCompose` + the empty `COMPOSE_EDGES`), the `code_ref` entry kind and the suggestion
queue (#5), the shared disclaimer (#8b), and `business_settings.service_area` (#7b). This change is
mostly assembly: a tool shaped like Material Finder, plus the first real compose edge.

Two shapes are settled by prior work and constrain the design. Material Finder set the pattern for
a **web-search tool that drops anything it can't source** (§7) — Code Finder copies it for
citations instead of prices. And 9a decided composition is an **app-layer fan-out**: the edge's
mapper runs where a `TenantDb` is in hand, which is exactly why the mapper can read the service
area the runner never could.

## Goals / Non-Goals

**Goals:**
- Answer a local-code question with sourced, jurisdiction-aware `code_ref` entries in the job's one
  memory, and make a code's *consequence* (permit, inspection) legible, not implicit.
- Light up 9a with the `photo-advisor → code-finder` edge: one code lookup per finding, no retyping.
- Keep a composed code traceable to the photo that prompted it.

**Non-Goals:**
- Line-item mutation, uploaded code PDFs, a per-tool chat thread, any authoritative determination
  (see the proposal). No migration; no new financial math.

## Decisions

### 1. The tool mirrors Material Finder, minus the modes and the estimate
`inputSchema` is `{ query, location?, photoStorageKey? }` — one question, an optional jurisdiction
override, and (on composed runs) the photo the query came from. The port `resultSchema` is
`{ codes: [{ code, requirement, jurisdiction?, sourceUrl?, complianceNote? }] }`; the tool drops
any code whose `sourceUrl` isn't a real URL (reusing the `isSourceUrl` rule Material Finder
already established) so no unsourced citation is ever proposed. Each surviving code becomes a
`code_ref` context-entry suggestion. There is **no `estimate` mode and no line item** — codes are
facts about the job, not costs, so Code Finder only ever writes to context.

### 2. `code_ref` gains optional source, compliance note, and photo — additive JSON
The `code_ref` payload is `{ code, citation, jurisdiction? }` today; it gains optional `sourceUrl`,
`complianceNote`, and `photoStorageKey`. All optional, so every existing `code_ref` still
validates and there is **no migration** (the payload is a `jsonb` column). This mirrors exactly how
8b added `severity`/`photoStorageKey` to `finding`. The card and the context list render the
compliance note as text and the source as a link.

### 3. Compose maps one *code-relevant* finding to one query, and resolves jurisdiction app-side
`COMPOSE_EDGES["photo-advisor"] = [{ consumer: "code-finder", map }]`. The mapper receives Photo
Advisor's `output` and the `ComposeContext` (which carries the `TenantDb`), reads
`tenantDb.getSettings()?.serviceArea` **once**, and returns one Code Finder input per finding whose
severity is `safety` or `attention` — the query built from the finding's summary (and the materials
it named), the location from the service area, and `photoStorageKey` from the output. This is the
app-layer tenant read 9a's design exists to allow: the runner never sees settings.

*Why gate on severity, and why it matters for UX (decision 7):* the tempting rule is "one run per
finding," but composition is **synchronous** (decision 7), so every composed run adds latency to
the photo result *and* a card to the review queue. A code lookup for "minor surface mould" spends a
web-search call and a phone-screen row on nothing, and buries the profit signal under citations.
Severity is the proxy for "worth a code lookup," and Photo Advisor's prompt is tightened so
anything with a permit/code/inspection angle is marked at least `attention` — so the gate is lean
without dropping a real code need. Dispatch's dedup still stops a repeated run from stacking
duplicate `code_ref` suggestions.

### 7. Composition is synchronous, so it must be lean — not because leanness is nice, because the
### user waits for it
A server action has no reliable "finish after returning" — on serverless the function can be frozen
or killed once it responds, so `dispatchAndCompose` must `await` each composed run before the
producer's action returns. Concretely: tapping "Add photo & ask" returns only after the vision call
**and** every composed Code Finder web search complete, and John then reviews everything at once.
That reality drives two choices already made — gate the fan-out on severity (decision 3) and cap
each Code Finder run's results (decision 8) — and one more: Photo Advisor's result message names
the follow-up ("looked up code for 2 findings"), so the extra seconds read as work done, not a
hang. A background job queue would let composition run after the response; it doesn't exist yet, and
building it is out of scope. Until it does, "auto" means "synchronously, so keep it small."

### 8. A focused result set, not an exhaustive citation list
A code question can return a dozen loosely-relevant sections; dumping all of them onto a phone
queue is noise that hides the one permit that matters. The tool caps its proposals to the few most
relevant codes per run (a small named constant), and the model prompt asks for the most important
requirements, not a survey. Fewer, better `code_ref` cards keep the queue about decisions, not
reading.

### 4. Photo Advisor's output gains the run's photo key
The compose mapper needs the photo a finding came from, but Photo Advisor's `output.findings` are
the raw vision findings and don't carry it (the key is added when a finding becomes a *suggestion*,
not in the output). So Photo Advisor's `outputSchema` gains `photoStorageKey` — the one photo the
run was about, which every finding from that run shares. One additive field on an existing tool's
output; no behavior change to Photo Advisor itself beyond populating it.

### 5. Compliance notes live on the code and in the post — framed as the job's cost and hours
The user asked for "compliance notes on candidate line items." The honest v1: a line item proposed
by Photo Advisor is a *pending suggestion*, an independent row Code Finder can't mutate, and the two
tools' suggestions are deliberately independent (§5). So a compliance note is carried on the
`code_ref` (`complianceNote`) and surfaced in Code Finder's conversation post.

But a bare citation isn't why this tool exists — the product answers *"is this job worth the
hours."* A permit, an inspection, or a licensed-trade requirement is **cost and crew time John may
not have estimated**, and that can turn a green job yellow. So the post frames the consequence, not
just the code: "A permit and inspection here add cost and about a day — make sure the estimate
covers it, or the profit-per-hour is lower than it looks." Code Finder writes no line (an unpriced
permit line would roll up as $0 and overstate profit — 8b's trap), but it points John at the number
and tells him to put the cost in, by hand or via Material Finder. That is how a codes tool stays on
the product's spine. Badging an **accepted** line item with its code is a real feature, but it needs
a committed line and a cross-tool link — deferred, and called out as such rather than half-built.

### 6. Standalone requires the model; composed runs inherit the live port
The standalone query gates on `resolveModelPort()` being configured (like Material Finder's
search), because code lookup is the whole tool — there is no useful no-AI fallback. A composed run
needs no separate gate: it only happens because Photo Advisor just ran, which already required the
live port, and `dispatchAndCompose` reuses that same port for the consumer.

## Risks / Trade-offs

- **Composed runs cost tokens and latency the user didn't directly ask for** → gated on
  code-relevant severity (so a `note` never spends a call), each a `tool_run` with recorded usage,
  deduped against re-runs, and Photo Advisor's result names the follow-up so the wait reads as work.
  The standalone path is the user's explicit ask. The live-AI proof item watches the first runs.
- **Synchronous composition adds seconds to the photo result on a weak connection** → inherent to
  running without a job queue (decision 7); mitigated by keeping the fan-out lean (severity gate +
  capped results) rather than by pretending the latency isn't there. A queue is the real fix, later.
- **A wrong or stale code, confidently cited** → every result carries the non-authoritative
  disclaimer and drops anything unsourced, and a `code_ref` is a proposal the user accepts one at a
  time. This is the §5/§7 risk; mitigated, not removed.
- **The severity gate could miss a code need the model mis-rated as `note`** → mitigated by
  tightening Photo Advisor's prompt to mark anything with a code/permit/inspection angle at least
  `attention`, and by the standalone query as the always-available escape hatch. An empty search
  posts "no specific code found" and proposes nothing.
- **Live code search is unproven until a key exists** → proven offline against the mock's canned
  result and a composed-run test; the real `web_search` proof is deferred like every prior tool's.

## Open Questions

- Is the severity gate the right proxy, or should Photo Advisor emit an explicit "code-relevant"
  flag per finding? Severity + the prompt tweak is the cheaper v1; an explicit flag is a small
  follow-up if the gate proves too coarse in live use.
- Should composition move to a background job so the photo result returns instantly and codes
  stream in? The right long-term UX (decision 7), but it needs infra we don't have; revisit at the
  hardening pass (#11).
- Should an accepted `code_ref` composed from a finding, plus an accepted line item for the same
  repair, be visibly linked ("this line is permit-required")? The deferred line-item badge; wants a
  committed line and a cross-suggestion reference.
