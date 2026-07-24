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
The system SHALL provide a Photo Advisor tool that takes **one** job photo and an optional
question, sends the image to the model, and proposes what it finds into the job as `finding`
context entries. It SHALL post a summary of what it saw to the single project conversation. The
tool SHALL receive the image through its validated input and SHALL NOT be given a storage or
database handle.

#### Scenario: A photo produces findings
- **WHEN** the user runs Photo Advisor on a job photo
- **THEN** the model is called with that image, and each finding it returns is proposed as a
  `pending` `finding` context-entry suggestion, with a summary posted to the conversation

#### Scenario: A question focuses the run
- **WHEN** the user runs Photo Advisor on a photo with a question
- **THEN** the question is included in the request and the findings answer it

#### Scenario: The tool gets no handle to the photo store
- **WHEN** Photo Advisor's `run` executes
- **THEN** the image reaches it as validated input resolved by the caller, and the tool has no
  method that could read another photo, another project, or any stored row

### Requirement: A photo can be taken or chosen from the Photo Advisor surface
The Photo Advisor surface SHALL let the user both **capture a new photo and run on it in one
step** — the photo joining the job through the same storage path as any other — and **choose a
photo already on the job**. Running SHALL NOT require navigating to another screen first.

#### Scenario: Capture and run in one step
- **WHEN** the user takes a photo from the Photo Advisor surface and runs
- **THEN** the photo is stored against the job exactly as an upload would be, and the run happens
  on it without a separate upload step

#### Scenario: Run on a photo already on the job
- **WHEN** the job already has photos and the user opens Photo Advisor
- **THEN** the user can select one of them and run on it

#### Scenario: A job with no photos yet
- **WHEN** the job has no photos and the user opens Photo Advisor
- **THEN** the surface offers to take one, rather than presenting an empty picker

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
Each `finding` Photo Advisor proposes SHALL carry a severity — `safety`, `attention`, or `note` —
and a reference to the photo it was derived from, so the job's shared memory records how serious
a diagnosis is and which picture it came from.

#### Scenario: A finding names its photo and its severity
- **WHEN** Photo Advisor proposes a finding from a photo
- **THEN** the proposed entry carries that photo's reference and one of the three severities, and
  both survive into the committed context entry when the user accepts

#### Scenario: A safety finding is distinguishable
- **WHEN** a finding concerns a safety problem
- **THEN** it carries severity `safety`, so it is distinguishable from a cosmetic note without
  reading the prose

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

