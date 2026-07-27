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
context entry referencing the set, authored by the user, so every tool that reads the project's one
memory sees the set. Posting SHALL **not** call the model and SHALL succeed independently of any
analysis (so a bad connection never blocks getting the photos into the job).

#### Scenario: Posting a set records it in shared memory with no model call
- **WHEN** a user posts a set of photos
- **THEN** the photos and the set are stored, a `photo` context entry referencing the set is added to
  the project's shared context, and no model is called and no suggestion is created by the post itself

#### Scenario: A failed object write leaves no orphan
- **WHEN** an object write fails part-way through posting a set
- **THEN** no partial set, photo row, or context entry is left behind, and the user is told the post
  failed

### Requirement: A successful upload emits a photo-uploaded event
Posting a set SHALL emit an event through the platform's event seam, carrying the project and the
posted set, so Photo Advisor runs on the set **automatically and decoupled from the post** — a slow or
failed analysis SHALL NOT block or undo the post. The set SHALL carry an analysis status (analyzing,
done, failed) that the surface reflects, and a failed analysis SHALL be retryable.

#### Scenario: Posting a set auto-triggers its analysis
- **WHEN** a set post completes successfully
- **THEN** an analysis of the whole set is triggered automatically, the set shows an *analyzing* state,
  and the post has already succeeded regardless of the analysis outcome

#### Scenario: A failed analysis leaves the set posted and retryable
- **WHEN** the analysis of a set fails or does not complete
- **THEN** the set remains posted with a *failed* status the surface shows, and the user can retry the
  analysis without re-posting the photos

### Requirement: Photos are shown through short-lived signed URLs
Stored photos SHALL never be served from a public URL. Displaying a set SHALL issue short-lived signed
URLs for the requesting tenant's own photos only — thumbnails for the set's photos and a full-size URL
signed **at the moment** a photo is opened rather than at render, and never substituted with a
lower-resolution image when it cannot be signed.

#### Scenario: A set renders signed thumbnail URLs
- **WHEN** a user opens a set
- **THEN** each photo is shown via a short-lived signed URL scoped to that photo, and no publicly
  readable URL is produced

#### Scenario: Opening a photo signs it at that moment
- **WHEN** a user opens a photo full-size some minutes after the set was rendered
- **THEN** a URL is signed for that photo at that moment; if it cannot be signed the user is told so,
  and the thumbnail is never shown in its place

### Requirement: A photo can be captioned and deleted
The **caption belongs to the set** — one caption for the whole set, settable and changeable by its
owner. A user SHALL be able to delete their own **photo** (removing the photo row and both its objects)
and to delete a whole **set** (removing its photos, all their objects, and the `photo` context entry
that referenced the set), so the job's shared memory never cites a photo or set that no longer exists.
Both SHALL be tenant-scoped and server-side.

#### Scenario: A set's caption is set and shown
- **WHEN** a user sets or changes the caption on one of their sets
- **THEN** the caption is stored on the set and shown with it, and there is no separate per-photo
  caption

#### Scenario: Deleting a set removes its photos, objects, and context entry
- **WHEN** a user deletes one of their sets
- **THEN** the set's photo rows and both objects of each photo are removed from storage, and the
  `photo` context entry naming that set is removed from the project's shared context

#### Scenario: Deleting one set leaves the others untouched
- **WHEN** a user deletes one set from a project that has several
- **THEN** only that set's rows, objects, and context entry are removed
