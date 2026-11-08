# Navigation session read cache (DIDI-1185)

## Goal

Exercises, Routines, and Programs list/detail routes keep practitioner-scoped GET results in **bounded in-memory** storage for the active browser session. Valid revisits render immediately without a loading flash and without redundant network reads. This is **not** a browser disk cache, service worker, or shared CDN cache; exercise **media** remains `Cache-Control: no-store` per DIDI-1155.

## Implementation choices

| Decision          | Choice                                              | Rationale                                                                        |
| ----------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Storage           | Module singleton `SessionReadCache`                 | One cache per tab/session document; no persistence APIs.                         |
| Capacity          | 192 success entries, LRU eviction                   | Covers typical filter/query/detail combinations without unbounded growth.        |
| Data budget       | ~6 MiB approximate serialized payload               | List/page snapshots dominate; byte estimate via `JSON.stringify` length.         |
| In-flight cap     | 32 distinct keys                                    | Prevents unbounded concurrent dedupe maps.                                       |
| Tombstones        | 512 per-key invalidation generations (pruned)       | Bounded metadata when keys are invalidated but not re-read.                      |
| Validity          | Until explicit invalidation or session epoch change | No focus/mount/reconnect SWR for valid hits.                                     |
| Session epoch     | `practitioner_id` from practitioner session         | Switching practitioner or auth error clears all buckets and in-flight work.      |
| Same-ID re-login  | Full document reload on Sign out                    | Hard navigation drops the module singleton; no separate session token in POC.    |
| React integration | `useSessionCachedRead` + `SessionReadCacheProvider` | Synchronous peek for instant paint; fetches only on miss or `force`.             |
| Mutations         | Thin client wrappers invalidate key prefixes        | Keeps invalidation beside HTTP write paths without changing backend semantics.   |
| Superseded GETs   | `status: "superseded"` + hook retry                 | Invalidated in-flight responses do not surface `loadFailed` or builder redirect. |
| In-flight cancel  | `AbortSignal` + consumer release on unmount         | Sole consumers abort; shared deduped reads stay alive until all consumers exit.  |

## Cache keys

Keys are `epoch|resource|{sorted params}` via `buildSessionReadCacheKey`. Page-level snapshots use resources such as `exercise_library.page`, `routines.page`, `programs.page`. Detail reads use `navigation-read-cache-keys` helpers (`exercises.detail`, `routines.detail`, `programs.builder_by_code`, etc.).

## Mutation invalidation matrix

| Mutation surface                                           | Invalidated key patterns                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Exercise library save/pin/remove/undo/update my copy       | All exercise list/detail keys plus **all** `programs.builder_by_code` (library-update row projections) |
| Exercise request submit / approve                          | Same as exercise library list invalidation (My exercises “new from requests”)                          |
| Routine library save/remove/adopt/keep/undo/update my copy | Routine list/detail keys plus programs list and **all** `programs.builder_by_code`                     |
| Program list create/restore/delete                         | All `programs.list`, `programs.list_deleted`, `programs.page`                                          |
| Program builder row/name/publish/library-update mutations  | Above list keys plus matching `programs.builder_by_code` when code is known                            |

### Paths intentionally not invalidated (no cached read on write path)

| Surface                                          | Rationale                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `ExerciseRequests` draft `PATCH` (`updateDraft`) | Draft review uses `getRequest`; covered by `navigation-read-cache-production.integration.test.tsx`.                |
| `ProgramsNewPage` create then navigate           | New builder code has no prior `programs.builder_by_code` entry; list keys invalidated via `createProgram` wrapper. |
| Exercise media GETs                              | Out of scope (DIDI-1155 `no-store`).                                                                               |
| My defaults                                      | Not part of Exercises/Routines/Programs navigation cache.                                                          |

Failed GETs are **not** stored. Load-more or retry after error does not poison prior success entries (`retainOnError` on list/detail hooks).

## Lifecycle

- **Logout** (`postAuthSignOut` + full navigation): in-memory cache discarded with the document.
- **Session replacement**: `SessionReadCacheProvider` calls `bindSession` when practitioner session identity changes.
- **Late responses**: Per-key invalidation generation and session generation prevent superseded in-flight writes from repopulating the cache; hooks auto-retry superseded fetches.

## Limits (defaults)

- `DEFAULT_SESSION_READ_CACHE_MAX_ENTRIES` = 192
- `DEFAULT_SESSION_READ_CACHE_MAX_IN_FLIGHT` = 32
- `DEFAULT_SESSION_READ_CACHE_MAX_RETAINED_BYTES` = 6 × 1024 × 1024
- `DEFAULT_SESSION_READ_CACHE_MAX_KEY_GENERATION_ENTRIES` = 512
