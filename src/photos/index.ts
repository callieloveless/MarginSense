/**
 * The job-photo domain module (add-photo-capture): storage-key derivation, upload limits and
 * validation, and the resize math the client uploader uses. Framework/DB-free by design — the
 * tenant handle, the server action, and the client component all import from here so a photo's
 * rules live in exactly one place.
 */

export * from "./photos";
