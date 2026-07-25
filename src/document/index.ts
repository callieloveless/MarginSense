/**
 * The client-document domain module (add-client-document): the client-safe payload schema and its
 * validation. Framework/DB-free — the public render, the tenant seam, and 10b's generator all
 * validate against this one definition, so no internal figure can reach a client document.
 */

export * from "./document";
