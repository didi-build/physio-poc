# Program publish DIDI-1189 mutation results

Full `npm test` per mutant on the implementation commit (mutant applied on that head, then `git checkout --` on touched files).

| Mutant | Change                                                                                                                          | Status | Killing test(s)                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1     | Remove `draft_version = ?` guard and binding from `buildPublishSnapshotUpdateStatement`                                         | Killed | `program publish DIDI-1189` stale-draft and guard-SQL cases; `CTO privileged review` placeholder race cases                                                                                                                                                |
| M2     | Replace guarded `sql.batch` in `ProgramsRepository.publish` with sequential `sql.run` per statement                             | Killed | `rolls back snapshot, link, and expiry settings when the open-link expiry write fails in the publish batch`; stale-draft cases; `CTO privileged review` batch race cases (`Test Files 2 failed`, `Tests 7 failed`, full suite)                             |
| M3     | Map `PUBLISH_STALE_DRAFT_MESSAGE` to `PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE` and service code to `placeholders_block_publish` | Killed | `returns stale_draft_retry when draft_version changes before the guarded publish write`; `maps stale_draft_retry over HTTP without placeholders_block_publish`; `repository publish throws PUBLISH_STALE_DRAFT_MESSAGE when draft_version races the batch` |

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
