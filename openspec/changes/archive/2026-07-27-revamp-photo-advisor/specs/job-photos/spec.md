# job-photos

## ADDED Requirements

### Requirement: A job holds photos in captioned sets
A project SHALL hold its photos as **sets**, where a set is one or more photos plus **one caption for
the whole set**. Each set SHALL be a `photo_sets` row carrying a non-null `business_id` and
`project_id`, the caption, an analysis status, and timestamps, with Row-Level Security enforced. Every
photo SHALL belong to a set (`set_id`). Sets and their photos SHALL be reachable only through the
tenant-scoped handle, which stamps `business_id` from the session, never from input.

#### Scenario: A set is recorded against its business and project
- **WHEN** a user posts a set of photos to one of their projects
- **THEN** a `photo_sets` row is created carrying that business and project and the one caption, and
  each photo row carries that set's `set_id`

#### Scenario: Cross-tenant set read is blocked
- **WHEN** a user from business A requests business B's photo set
- **THEN** Row-Level Security returns no rows, no signed URL is issued, and no bytes are exposed

### Requirement: The Photos surface is a history of sets
The job's photos SHALL be shown as a **history of sets** — each set a card with its photo count, its
caption, its time, and a review badge (analyzing / N to review / no action) — newest first, not a
gallery of loose photos. Opening a set SHALL show its photos as a hero image plus thumbnails and its
one caption. There SHALL be no per-photo caption and no loose photo grid.

#### Scenario: The surface lists sets, newest first, with review badges
- **WHEN** a job has several posted sets
- **THEN** they are listed newest-first as cards showing each set's photo count, caption, time, and a
  review badge, with no loose-photo gallery

#### Scenario: Opening a set shows its photos and its one caption
- **WHEN** the user opens a set
- **THEN** its photos are shown as a hero plus thumbnails with the single set caption, and no per-photo
  caption is shown

## MODIFIED Requirements

### Requirement: Uploading a photo is a user action recorded in the job's shared memory
Capturing photos SHALL let the user **take several in a row** or **pick several from the phone**, write
**one caption for the set**, and **post the set** — an outer-layer user action, never a tool run and
never a suggestion, performed by a server action that resolves the business from the session. A
successful post SHALL store each prepared photo, create the set with its caption, and add a `photo`
context entry referencing the set, authored by the user. Posting SHALL **not** call the model and SHALL
succeed independently of any analysis (so a bad connection never blocks getting the photos into the
job).

#### Scenario: Upload adds a photo context entry
- **WHEN** a user posts a set of photos to a project
- **THEN** the photos and the set are stored and a single `photo` context entry referencing the set is
  added to that project's shared context, authored by the user, with nothing left pending

#### Scenario: Upload is not a suggestion and involves no model
- **WHEN** a set of photos is posted
- **THEN** no suggestion is created, no tool is run, no `tool_run` is recorded, and no model call is
  made by the post itself

#### Scenario: A failed object write leaves no orphan
- **WHEN** an object write fails part-way through posting a set
- **THEN** no partial set, photo row, or context entry is left behind, and the user is told the post
  failed

### Requirement: Photos are shown through short-lived signed URLs
Stored photos SHALL never be served from a public URL. Displaying a set SHALL issue short-lived signed
URLs for the requesting tenant's own photos only — thumbnails for the set's photos and a full-size URL
signed **at the moment** a photo is opened rather than at render, and never substituted with a
lower-resolution image when it cannot be signed. Photos SHALL appear on the job's **Photos** surface as
a history of sets, not as a loose grid on the context surface.

#### Scenario: A gallery renders signed URLs
- **WHEN** a user opens a set
- **THEN** each photo is shown via a short-lived signed URL scoped to that photo, and no publicly
  readable URL is produced

#### Scenario: Opening a photo signs it at that moment
- **WHEN** a user opens a photo full-size some minutes after the set was rendered
- **THEN** a URL is signed for that photo at that moment; if it cannot be signed the user is told so,
  and the thumbnail is never shown in its place

#### Scenario: Photos appear on the job surface
- **WHEN** a project has photos
- **THEN** they appear on the job's Photos surface as a history of sets (each set's cover, caption,
  time, and review badge), not as a loose grid on the context surface

### Requirement: A photo can be captioned and deleted
The **caption belongs to the set** — one caption for the whole set, settable and changeable by its
owner. A user SHALL be able to delete their own **photo** (removing the photo row and both its objects)
and to delete a whole **set** (removing its photos, all their objects, and the `photo` context entry
that referenced the set), so the job's shared memory never cites a photo or set that no longer exists.
Both SHALL be tenant-scoped and server-side.

#### Scenario: Caption a photo
- **WHEN** a user sets or changes the caption on one of their sets
- **THEN** the caption is stored on the set and shown with it, and there is no separate per-photo
  caption

#### Scenario: Delete removes the row, the objects, and the context entry
- **WHEN** a user deletes one of their sets
- **THEN** the set's photo rows and both objects of each photo are removed from storage, and the
  `photo` context entry naming that set is removed from the project's shared context

#### Scenario: Deleting one photo leaves the others untouched
- **WHEN** a user deletes one set from a project that has several
- **THEN** only that set's rows, objects, and context entry are removed, and the others are untouched

### Requirement: A successful upload emits a photo-uploaded event
Posting a set SHALL emit an event through the platform's event seam, carrying the project and the
posted set, so a subscriber (Photo Advisor) can run on the set **automatically and decoupled from the
post** — a slow or failed analysis SHALL NOT block or undo the post. The set SHALL carry an analysis
status (analyzing, done, failed) that the surface reflects, and a failed analysis SHALL be retryable.

#### Scenario: Upload emits the event
- **WHEN** a set post completes successfully
- **THEN** an event is emitted for that project carrying the set, through the same event seam any
  subscriber is dispatched from, and the analysis of the whole set is triggered automatically

#### Scenario: No subscriber means nothing happens
- **WHEN** the event is emitted and no tool is subscribed to it
- **THEN** no tool runs and nothing is suggested, and the set post still succeeds

#### Scenario: A failed analysis leaves the set posted and retryable
- **WHEN** the analysis of a set fails or does not complete
- **THEN** the set remains posted with a *failed* status the surface shows, and the user can retry the
  analysis without re-posting the photos
