# Program publish DIDI-1189 mutation results

Full `npm test` per mutant on the implementation head (mutant applied, then `git checkout --` on touched files).

| Mutant | Change                                                                                                                                             | Status | Full-suite result                                                                              | Killing tests                                                                                                                                                                                                                                                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1     | Remove `draft_version = ?` guard and `draftVersion` binding from `buildPublishSnapshotUpdateStatement`                                             | Killed | `Test Files 1 failed \| 219 passed (220)`; `Tests 4 failed \| 2261 passed \| 4 skipped (2269)` | `returns stale_draft_retry when draft_version changes before the guarded publish write`; `repository publish signals stale_draft_retry when draft_version races the batch`; `maps stale_draft_retry over HTTP without placeholders_block_publish`; `keeps publish batch statements guarded by draft_version`                                      |
| M2     | Replace guarded `sql.batch` in `ProgramsRepository.publish` with sequential `sql.run` per statement                                                | Killed | `Test Files 2 failed \| 218 passed (220)`; `Tests 6 failed \| 2259 passed \| 4 skipped (2269)` | `rolls back snapshot, link, and expiry settings when the open-link expiry write fails in the publish batch`; DIDI-1189 stale cases above; `rejects repository publish when a placeholder is inserted before the snapshot write`; `leaves link, expiry setting, and snapshot unchanged when HTTP publish races placeholder insert with expires_in` |
| M3     | Throw `PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE` instead of `PUBLISH_STALE_DRAFT_SIGNAL` on stale draft; remove service `stale_draft_retry` mapping | Killed | `Test Files 1 failed \| 219 passed (220)`; `Tests 3 failed \| 2262 passed \| 4 skipped (2269)` | `returns stale_draft_retry when draft_version changes before the guarded publish write`; `repository publish signals stale_draft_retry when draft_version races the batch`; `maps stale_draft_retry over HTTP without placeholders_block_publish`                                                                                                 |

## Main baseline (pre-fix) regression proof

Against `main` publish + `setLinkExpiry` two-await code, a one-off service test with `run` spy failing `share_links` `expires_at` after publish succeeded:

```
AssertionError: expected { published_version: 1, …(3) } to deeply equal { published_version: 1, …(3) }

- Expected
+ Received

  {
-   "link_expires_in": "never",
+   "link_expires_in": "1_week",
    "open_expires_at": null,
    "published_snapshot_json": "{...}",
    "published_version": 1,
  }
```

After the fix, `test/program-publish-didi-1189.test.ts` `rolls back snapshot...` passes with a guarded `batch` failure on the open-link expiry statement.
