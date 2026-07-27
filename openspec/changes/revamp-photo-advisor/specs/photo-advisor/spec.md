# photo-advisor

## MODIFIED Requirements

### Requirement: Photo Advisor reads one job photo and proposes what it finds
The system SHALL provide a Photo Advisor tool that takes a **whole photo set** — all of its photos and
the one set caption — and an optional question, sends the images to the model in a single call so it
reasons across the set, and proposes what it finds into the job as `finding` context entries. It SHALL
post a summary of what it saw to the single project conversation. The tool SHALL receive the images
through its validated input and SHALL NOT be given a storage or database handle. The number of images
sent in one analysis MAY be bounded; when a set exceeds the bound the surface SHALL say so rather than
silently ignore photos.

#### Scenario: A set produces findings
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
pick-a-photo-and-run surface. The analysis SHALL be decoupled from posting (Photos capture is the way a
set enters the job) and SHALL be **retryable** from the set when it fails, so a run never depends on the
post and a failed run never loses the photos.

#### Scenario: A posted set analyzes automatically
- **WHEN** a user posts a set
- **THEN** Photo Advisor runs on the whole set without the user opening a separate tool surface

#### Scenario: A failed run is retryable from the set
- **WHEN** a set's analysis fails
- **THEN** the set shows that it didn't finish and offers to retry the analysis, and retrying does not
  re-post the photos or duplicate what a partial run already proposed

### Requirement: Findings carry a severity and the photo that produced them
Each `finding` Photo Advisor proposes SHALL carry a severity — `safety`, `attention`, or `note` — and a
reference to the **set** it was derived from (and MAY name a specific photo within the set), so the
job's shared memory records how serious a diagnosis is and which set it came from.

#### Scenario: A finding names its set and its severity
- **WHEN** Photo Advisor proposes a finding from a set
- **THEN** the proposed entry carries that set's reference and one of the three severities, and both
  survive into the committed context entry when the user accepts

#### Scenario: A safety finding is distinguishable
- **WHEN** a finding concerns a safety problem
- **THEN** it carries severity `safety`, so it is distinguishable from a cosmetic note without reading
  the prose

## ADDED Requirements

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
