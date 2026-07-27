# photo-advisor Specification

## Purpose
Turning one job photo into a diagnosis the job remembers and the **repair hours** it implies.
This capability owns what a vision tool may and may not say: findings carry a severity and name
the photo behind them; repair labor becomes candidate line items whose minutes drive the profit
signal, with the cost left to the engine and the business's own burdened rate; and **nothing is
ever priced** — materials are named and handed to `material-finder`, because a price this tool
cannot source would be fabricated and a zero-cost line would quietly overstate a job's profit. It
is the first capability giving advice about physical work, so it also establishes the shared
licensed-professional disclaimer that `code-finder` reuses (constitution §5, §7).
## Requirements
### Requirement: Photo Advisor reads one job photo and proposes what it finds
The system SHALL provide a Photo Advisor tool that takes a **whole photo set** — all of its photos and
the one set caption — and an optional question, sends the images to the model in a single call so it
reasons across the set, and proposes what it finds into the job as `finding` context entries. It SHALL
post a summary of what it saw to the single project conversation. The tool SHALL receive the images
through its validated input and SHALL NOT be given a storage or database handle. The number of images
sent in one analysis MAY be bounded.

#### Scenario: A photo produces findings
- **WHEN** Photo Advisor runs on a posted set
- **THEN** the model is called with the set's images and caption, and each finding it returns is
  proposed as a `pending` `finding` context-entry suggestion, with a summary posted to the conversation

#### Scenario: A question focuses the run
- **WHEN** Photo Advisor runs on a set with a question
- **THEN** the question is included in the request and the findings answer it

#### Scenario: The tool gets no handle to the photo store
- **WHEN** Photo Advisor's `run` executes
- **THEN** the set's images reach it as validated input resolved by the caller, and the tool has no
  method that could read another photo, another set, another project, or any stored row

### Requirement: A photo can be taken or chosen from the Photo Advisor surface
Photo Advisor SHALL run on a set **automatically when the set is posted** — there is no separate
pick-a-photo-and-run surface. The analysis SHALL be decoupled from posting (the Photos capture is how a
set enters the job) and SHALL be **retryable** from the set when it fails, so a run never depends on the
post and a failed run never loses the photos. A job with no sets SHALL offer to shoot one rather than an
empty picker.

#### Scenario: Capture and run in one step
- **WHEN** a user posts a set
- **THEN** Photo Advisor runs on the whole set automatically, without the user opening a separate tool
  surface or taking a second step

#### Scenario: Run on a photo already on the job
- **WHEN** a set already on the job has been analyzed
- **THEN** its recommendations are shown on the set, and the analysis can be retried from there

#### Scenario: A job with no photos yet
- **WHEN** a job has no sets and the user opens Photos
- **THEN** the surface offers to shoot a set, rather than presenting an empty picker

### Requirement: Repair labor is proposed as line items that preview their profit impact
When the project has an active estimate, Photo Advisor SHALL propose the repair labor a finding
implies as `estimate_line_item` suggestions targeting that estimate, each carrying its estimated
labor minutes, so the user sees what accepting the work does to the job's profit per hour before
committing to it. The line's cost SHALL be derived by the engine from the business's own burdened
labor rate — never supplied by the model. When the project has no active estimate, Photo Advisor
SHALL propose findings only and SHALL say plainly that candidate work needs an estimate, rather
than proposing a line item with no estimate to land in.

#### Scenario: Labor work previews its profit impact
- **WHEN** Photo Advisor proposes repair labor for a project with an active estimate
- **THEN** each labor candidate is an `estimate_line_item` suggestion carrying its estimated
  labor minutes, and its effect on the estimate's profit per hour and red/yellow/green signal is
  shown before the user accepts

#### Scenario: The model never supplies a labor cost
- **WHEN** a labor candidate is proposed
- **THEN** it carries minutes only, and its cost is computed by the engine from the business's
  burdened labor rate

#### Scenario: No active estimate
- **WHEN** Photo Advisor runs on a project with no active estimate
- **THEN** its findings are still proposed, no line-item suggestion is created, and the
  conversation post says the candidate work needs an estimate to be added to

### Requirement: An implausible labor estimate is surfaced and flagged, never dropped silently
When a proposed labor candidate exceeds a plausibility bound, Photo Advisor SHALL still propose
it with its actual estimated minutes, and its conversation post SHALL say that the estimate looks
high. It SHALL NOT silently discard the candidate or quietly reduce its minutes.

#### Scenario: An oversized estimate is proposed with a warning
- **WHEN** the model returns a labor candidate beyond the plausibility bound
- **THEN** the candidate is still proposed with the minutes the model gave, and the conversation
  post states that the estimate looks high and should be checked

#### Scenario: Minutes are never silently altered
- **WHEN** any labor candidate is proposed
- **THEN** the minutes on the suggestion are the minutes the model returned, neither capped nor
  rounded away without saying so

### Requirement: Photo Advisor names materials but never prices them
Photo Advisor SHALL NOT propose material line items and SHALL NOT attach a price to anything: it
does not search the web, so a price it produced would be fabricated (constitution §7), and a
zero-cost line accepted into an estimate would overstate that job's profit. The materials a
repair needs SHALL instead be named in the finding, and the conversation post SHALL hand pricing
to the tool that can source it.

#### Scenario: No material line item is ever proposed
- **WHEN** Photo Advisor identifies materials a repair needs
- **THEN** no `estimate_line_item` suggestion for a material is created, and no zero-cost or
  fabricated-cost line can enter the estimate

#### Scenario: Materials are named in the finding
- **WHEN** a repair needs materials
- **THEN** the finding states what is needed, in the job's shared context

#### Scenario: The post hands pricing off
- **WHEN** Photo Advisor names one or more materials
- **THEN** its conversation post says they still need pricing and names Material Finder

### Requirement: Findings carry a severity and the photo that produced them
Each `finding` Photo Advisor proposes SHALL carry a severity — `safety`, `attention`, or `note` — and a
reference to the **set** it was derived from (and MAY name a specific photo within the set), so the
job's shared memory records how serious a diagnosis is and which set it came from.

#### Scenario: A finding names its photo and its severity
- **WHEN** Photo Advisor proposes a finding from a set
- **THEN** the proposed entry carries that set's reference and one of the three severities, and both
  survive into the committed context entry when the user accepts

#### Scenario: A safety finding is distinguishable
- **WHEN** a finding concerns a safety problem
- **THEN** it carries severity `safety`, so it is distinguishable from a cosmetic note without reading
  the prose

### Requirement: Physical-work advice carries the licensed-professional disclaimer
Every Photo Advisor result SHALL carry the licensed-professional, non-authoritative disclaimer
(constitution §5, §7): it SHALL be attached to the run's conversation message, so it lives in the
durable record beside the advice, and it SHALL also be shown on the tool's surface before a run.
The disclaimer text SHALL come from one shared definition that other physical-work tools reuse
rather than each writing its own.

#### Scenario: Every run's post carries the disclaimer
- **WHEN** Photo Advisor completes a run and posts to the conversation
- **THEN** the post carries the licensed-professional, non-authoritative disclaimer

#### Scenario: The disclaimer is visible before running
- **WHEN** the user opens the Photo Advisor surface
- **THEN** the disclaimer is shown there, before any run

#### Scenario: One shared definition
- **WHEN** another physical-work tool needs the same disclaimer
- **THEN** it uses the same shared text rather than a second copy that can drift

### Requirement: Photo Advisor requires a configured model and degrades plainly without one
Photo Advisor SHALL require the model to run. When AI is unconfigured, its surface SHALL render a
plain "connect AI" state and the run SHALL be unavailable, rather than failing when invoked.

#### Scenario: AI unconfigured
- **WHEN** no model is configured and the user opens Photo Advisor
- **THEN** the surface explains that AI isn't connected, running is unavailable, and nothing
  throws

### Requirement: Nothing Photo Advisor produces is committed until the user accepts
Everything Photo Advisor proposes — findings and candidate labor alike — SHALL be a `pending`
suggestion; no estimate or context change SHALL occur until the user accepts it, and the run
SHALL be recorded as a `tool_run` linked to what it produced.

#### Scenario: Proposals stay pending
- **WHEN** Photo Advisor proposes findings and labor lines
- **THEN** they are `pending`, nothing in the estimate or context changes until the user accepts,
  and a `tool_run` records the run and is referenced by the suggestions and the post

### Requirement: A set's recommendations are saved on the set and in the queue
What Photo Advisor finds for a set SHALL be **saved on that set** — surfaced on the set with a "see
what MarginSense found" reveal where each proposal can be confirmed or dismissed in place — **and**
SHALL appear in the job's shared "Waiting on you" queue as the same durable `pending` suggestions
(tagged with the set that produced them). The set's review badge SHALL reflect its state: *analyzing*
while a run is in flight, *N to review* while it has pending suggestions, and *no action* when it has
none (found nothing, or all have been acted on). Nothing SHALL be committed until the user accepts, and
the run SHALL be recorded as a `tool_run`.

#### Scenario: Recommendations show on the set and in the queue
- **WHEN** Photo Advisor proposes findings and candidate labor for a set
- **THEN** they are shown on the set's detail for confirm/dismiss and also appear in the job's
  "Waiting on you" queue, are the same durable pending suggestions, and accepting in either place
  commits once

#### Scenario: The set badge reflects what is waiting
- **WHEN** a set has two pending suggestions and then the user accepts both
- **THEN** the set badge reads *2 to review* and afterward reads *no action*

#### Scenario: A set that finds nothing reads "no action"
- **WHEN** Photo Advisor completes a set's analysis and proposes nothing
- **THEN** the set's badge reads *no action* and no suggestion is created

