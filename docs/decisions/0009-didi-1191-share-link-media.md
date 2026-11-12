# 0009. Public share-link exercise media on the Worker (DIDI-1191)

- **Status:** accepted
- **Date:** 2026-11-12

## Context

Published program share links expose per-row exercise media to recipients who have no practitioner session. A prior approach served images from a global version-scoped public URL that did not bind access to an open share link, which allowed guessing version identifiers and continued fetch after a link closed or expired.

Architecture ruling on [DIDI-1191 comment 9ac2b301](https://linear.app/didi-build/issue/DIDI-1191#comment-9ac2b301).

## Decision

Serve link-page exercise media only under the public share-link API prefix:

`GET /api/public/share-links/{token}/media/{exerciseVersionId}/{start|end}`

The share-link JSON embeds link-scoped `start_url` and `end_url` using that shape. The link token is the only credential; there are no signed URLs and no alternate public media route.

Every request is evaluated fail-closed:

1. The link exists, is open, and is not expired.
2. The requested exercise version id appears on the published snapshot for that link.
3. The version is approved and its media set visibility is `public` (approved media set for that snapshot version).

Any failure returns **404** with a **code-only** JSON body that does not distinguish closed, expired, or missing links. Responses never expose storage keys, bucket URLs, or practitioner-authenticated media URLs.

Production serves these bytes on the **Worker** through `handleRequest` and the shared program/media service layer (not Node-only `extraRouteHandlers`). Image bytes are read from the same object storage port used elsewhere for media.

Successful and failed GET responses use the correct `Content-Type`, `Cache-Control: private, max-age=300` (300 seconds or less), and `X-Content-Type-Options: nosniff`. No public or CDN caching. GET performs no writes and no view counting.

## Reasons

- Binding media to the share-link token closes anonymous version guessing and post-close access.
- Snapshot and approved-set gating keeps published link media aligned with what was published, not live library edits.
- Uniform 404 bodies avoid leaking link lifecycle state to anonymous callers.
- Private short caching limits retention on shared devices without inviting shared caches.
- Worker routing matches production entry and avoids a Node-only bypass.

## Consequences

- The global `GET /api/exercise-versions/{versionId}/media/{start|end}?access=public` route and its session-guard exemption are removed.
- Tests and mutants must cover each fail-closed branch, response headers, Worker wiring, and no-write-on-GET for media fetches.
- Future object storage bindings on the Worker must back the same `ObjectStoragePort` used to persist generated media.
