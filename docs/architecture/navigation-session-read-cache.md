# Navigation session read cache (DIDI-1185)

## Goal

Exercises, Routines, and Programs list/detail routes keep practitioner-scoped GET results in **bounded in-memory** storage for the active browser session. Valid revisits render immediately without a loading flash and without redundant network reads. This is **not** a browser disk cache, service worker, or shared CDN cache; exercise **media** remains `Cache-Control: no-store` per DIDI-1155.

## Implementation choices

| Decision          | Choice                                              | Rationale                                                                      |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Storage           | Module singleton `SessionReadCache`                 | One cache per tab/session document; no persistence APIs.                       |
| Capacity          | 192 success entries, LRU eviction                   | Covers typical filter/query/detail combinations without unbounded growth.      |
| In-flight cap     | 32 distinct keys                                    | Prevents unbounded concurrent dedupe maps.                                     |
| Validity          | Until explicit invalidation or session epoch change | No focus/mount/reconnect SWR for valid hits.                                   |
| Session epoch     | `practitioner_id` from practitioner session         | Switching practitioner or auth error clears all buckets and in-flight work.    |
| React integration | `useSessionCachedRead` + `SessionReadCacheProvider` | Synchronous peek for instant paint; fetches only on miss or `force`.           |
| Mutations         | Thin client wrappers invalidate key prefixes        | Keeps invalidation beside HTTP write paths without changing backend semantics. |

## Cache keys

Keys are `epoch|resource|{sorted params}` via `buildSessionReadCacheKey`. Page-level snapshots use resources such as `exercise_library.page`, `routines.page`, `programs.page`. Detail reads use `navigation-read-cache-keys` helpers (`exercises.detail`, `routines.detail`, `programs.builder_by_code`, etc.).

## Mutation invalidation matrix

| Mutation surface                                           | Invalidated key patterns                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Exercise library save/pin/remove/undo/update my copy       | All `exercises.approved_search`, `exercises.my_list`, `exercise_library.page`, and affected `exercises.detail` |
| Routine library save/remove/adopt/keep/undo/update my copy | All `routines.community_search`, `routines.my_list`, `routines.page`, and affected `routines.detail`           |
| Program list create/restore/delete                         | All `programs.list`, `programs.list_deleted`, `programs.page`                                                  |
| Program builder row/name/publish mutations                 | Above list keys plus matching `programs.builder_by_code` when code is known                                    |

Failed GETs are **not** stored. Load-more or retry after error does not poison prior success entries (`retainOnError` on list/detail hooks).

## Lifecycle

- **Logout** (`postAuthSignOut` + full navigation): in-memory cache discarded with the document.
- **Session replacement**: `SessionReadCacheProvider` calls `bindSession` when practitioner session identity changes.
- **Late responses**: Per-key invalidation generation and session generation prevent superseded in-flight writes from repopulating the cache.
