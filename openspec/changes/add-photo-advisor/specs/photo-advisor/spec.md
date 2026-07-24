## ADDED Requirements

### Requirement: Photo Advisor reads one job photo and proposes what it finds
The system SHALL provide a Photo Advisor tool that takes **one** of the job's stored photos and
an optional question, sends the image to the model, and proposes what it finds into the job: a
diagnosis as `finding` context entries and the work it implies as candidate estimate line items.
It SHALL post a summary of what it saw to the single project conversation. The tool SHALL
receive the image through its validated input and SHALL NOT be given a storage or database
handle.

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

### Requirement: Candidate work is proposed as line items that preview their profit impact
When the project has an active estimate, Photo Advisor SHALL propose the work a finding implies
as `estimate_line_item` suggestions targeting that estimate — **labor** lines carrying estimated
labor minutes, and **material** lines carrying a description and quantity — so the user sees what
accepting the work does to the job's profit per hour before committing to it. When the project
has no active estimate, it SHALL propose findings only and SHALL say plainly that candidate work
needs an estimate, rather than proposing a line item with no estimate to land in.

#### Scenario: Labor work previews its profit impact
- **WHEN** Photo Advisor proposes repair labor for a project with an active estimate
- **THEN** each labor candidate is an `estimate_line_item` suggestion carrying its estimated
  labor minutes, and its effect on the estimate's profit per hour and red/yellow/green signal is
  shown before the user accepts

#### Scenario: No active estimate
- **WHEN** Photo Advisor runs on a project with no active estimate
- **THEN** its findings are still proposed, no line-item suggestion is created, and the
  conversation post says the candidate work needs an estimate to be added to

### Requirement: Photo Advisor never invents a price
Photo Advisor SHALL NOT attach a price to anything it proposes: it does not search the web, so a
material candidate SHALL be proposed **unpriced** — its description and quantity only
(constitution §7 — the app never fabricates a price it cannot source). Its conversation post
SHALL point the user at the tool that can price it.

#### Scenario: A material candidate carries no price
- **WHEN** Photo Advisor proposes a material the repair needs
- **THEN** the suggestion carries the material's description and quantity with no unit cost, and
  no fabricated or estimated price reaches the job

#### Scenario: The post hands pricing off
- **WHEN** Photo Advisor proposes one or more unpriced materials
- **THEN** its conversation post says the materials still need pricing and names Material Finder

### Requirement: Findings are traceable to the photo that produced them
Each `finding` Photo Advisor proposes SHALL carry a reference to the photo it was derived from,
so a diagnosis in the job's shared memory can always be traced back to the picture behind it.

#### Scenario: A finding names its photo
- **WHEN** Photo Advisor proposes a finding from a photo
- **THEN** the proposed entry carries that photo's reference, and it survives into the committed
  context entry when the user accepts

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
Everything Photo Advisor proposes — findings and candidate line items alike — SHALL be a
`pending` suggestion; no estimate or context change SHALL occur until the user accepts it, and
the run SHALL be recorded as a `tool_run` linked to what it produced.

#### Scenario: Proposals stay pending
- **WHEN** Photo Advisor proposes findings and line items
- **THEN** they are `pending`, nothing in the estimate or context changes until the user accepts,
  and a `tool_run` records the run and is referenced by the suggestions and the post
