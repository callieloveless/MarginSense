## ADDED Requirements

### Requirement: A job holds photos as tenant-isolated assets
Each project SHALL be able to hold photos, where every photo is recorded as a row carrying a
non-null `business_id` and `project_id`, its storage key, thumbnail key, content type, byte
size, pixel dimensions, an optional caption, and its uploader — with Row-Level Security
enforced on the table. The stored object SHALL live in a private bucket under a key derived
from the business and project (`business_id/project_id/…`), and both the row and the object
SHALL be reachable only through the tenant-scoped handle, which stamps `business_id` and the
key prefix from the session, never from input.

#### Scenario: An uploaded photo is recorded against its business and project
- **WHEN** a user uploads a photo to one of their projects
- **THEN** a photo row is created carrying that business and project, the storage key, thumbnail
  key, content type, byte size, and dimensions, and the object is stored under the business's
  key prefix

#### Scenario: The tenant is never taken from input
- **WHEN** an upload request carries a `business_id` or a storage key of its own
- **THEN** it is ignored: the `business_id` and the key prefix are stamped from the session's
  tenant handle

#### Scenario: Cross-tenant read is blocked
- **WHEN** a user from business A requests business B's project photos
- **THEN** Row-Level Security returns no rows, no signed URL is issued, and no photo bytes are
  exposed

#### Scenario: Cross-tenant delete is blocked
- **WHEN** a user from business A attempts to delete a photo belonging to business B
- **THEN** the delete is rejected and nothing in business B changes

### Requirement: Uploading a photo is a user action recorded in the job's shared memory
Uploading a photo SHALL be an outer-layer user action — never a tool run and never a
suggestion — performed by a server action that resolves the business from the session. A
successful upload SHALL add a `photo` context entry to that project's shared context, authored
by the user, so every tool that reads the project's one memory sees the photo
(constitution §4).

#### Scenario: Upload adds a photo context entry
- **WHEN** a user uploads a photo to a project
- **THEN** the photo is stored and a `photo` context entry referencing it is added to that
  project's shared context, authored by the user, with nothing left pending

#### Scenario: Upload is not a suggestion and involves no model
- **WHEN** a photo is uploaded
- **THEN** no suggestion is created, no tool is run, no `tool_run` is recorded, and no model call
  is made

### Requirement: Photos are downscaled and stripped of location metadata before upload
A photo SHALL be prepared on the device before any byte leaves it: downscaled so its long edge
is at most 1568 pixels, re-encoded so embedded camera metadata — including GPS coordinates — is
discarded, and accompanied by a small thumbnail produced in the same pass. The server SHALL
validate the content type against the accepted image types and reject an upload above the
maximum size, so an oversized or non-image file never reaches storage.

#### Scenario: A large phone photo is downscaled and stripped
- **WHEN** a user uploads a photo whose long edge exceeds 1568 pixels or that carries EXIF GPS
  data
- **THEN** what is stored is the re-encoded image with its long edge at most 1568 pixels and no
  embedded camera or location metadata, plus a thumbnail

#### Scenario: A non-image or oversized file is rejected
- **WHEN** an upload carries a content type outside the accepted image types, or exceeds the
  maximum accepted size
- **THEN** the upload is rejected with a plain message, no object is written, and no photo row or
  context entry is created

### Requirement: Photos are shown through short-lived signed URLs
Stored photos SHALL never be served from a public URL. Displaying a job's photos SHALL issue
short-lived signed URLs for the requesting tenant's own photos only, and the gallery SHALL be
phone-first, showing each photo's thumbnail with its caption.

#### Scenario: A gallery renders signed URLs
- **WHEN** a user opens a project's photos
- **THEN** each photo is displayed via a short-lived signed URL scoped to that photo, and no
  publicly readable URL is produced

#### Scenario: Photos appear on the job surface
- **WHEN** a project has photos
- **THEN** they are shown as a phone-first grid on the job's context surface, each with its
  caption when set, alongside the upload control

### Requirement: A photo can be captioned and deleted
A user SHALL be able to set or change a short caption on their own photo, and SHALL be able to
delete their own photo — which removes the photo row and both the full-size and thumbnail
objects from storage. Both actions SHALL be tenant-scoped and server-side.

#### Scenario: Caption a photo
- **WHEN** a user sets a caption on one of their photos
- **THEN** the caption is stored with the photo and shown with it

#### Scenario: Delete removes the row and the objects
- **WHEN** a user deletes one of their photos
- **THEN** the photo row is removed and both the full-size and thumbnail objects are deleted from
  storage, so no orphaned object remains

### Requirement: A successful upload emits a photo-uploaded event
A successful photo upload SHALL emit a `photo.uploaded` event through the platform's event seam,
carrying the project and the uploaded photo, so a tool can later subscribe to it without the
upload path naming that tool. With no tool subscribed, emitting SHALL be a no-op that changes
nothing and SHALL NOT fail the upload.

#### Scenario: Upload emits the event
- **WHEN** a photo upload completes successfully
- **THEN** a `photo.uploaded` event is emitted for that project carrying the photo, through the
  same event seam any future subscriber is dispatched from

#### Scenario: No subscriber means nothing happens
- **WHEN** `photo.uploaded` is emitted and no tool is subscribed to it
- **THEN** no tool runs, no `tool_run` is recorded, nothing is suggested, and the upload still
  succeeds

### Requirement: Photo storage degrades gracefully when unconfigured
When object storage is not configured, the system SHALL report photo storage as unconfigured and
the job surface SHALL render a plain "connect storage" state rather than failing — mirroring how
the AI layer behaves without an API key. No partial photo record SHALL be left behind.

#### Scenario: No storage configured
- **WHEN** object storage is not configured and a user opens a project's photos
- **THEN** the surface shows a plain "connect storage" state, uploading is unavailable, and
  nothing throws

#### Scenario: A failed object write leaves no orphan row
- **WHEN** the object write fails part-way through an upload
- **THEN** no photo row and no `photo` context entry are created, and the user is told the upload
  failed
