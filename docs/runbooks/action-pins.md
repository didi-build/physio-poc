# Pinned GitHub Action SHAs

Workflows pin third-party actions to full **40-character** commit SHAs with a `# vX.Y.Z` comment on the same line.

## Verify pins

From the repo root (requires `gh` authenticated for GitHub API when verifying tag comments):

```bash
npm run verify-action-pins
```

The script normalizes CRLF line endings and skips full-line `#` comments. Every remaining line that contains a `uses` token (including quoted keys, spaced colons, escaped keys, or uppercase `USES`) must match strict `uses: <ref>` on that same line or the run fails with file and line. YAML anchors and aliases on those lines are rejected.

It scans `.github/workflows/*.yml` and `.yaml`, recursively scans `action.yml` / `action.yaml` under `.github/actions/**`, and follows local `./` refs from the **repository root** (as GitHub does): composite action manifests are scanned recursively, and local reusable workflow files (`./.github/workflows/...`) are scanned as workflows. Paths with `../`, missing manifests, or targets outside the repo fail.

Allowed refs:

- Local `./` paths under the repo (resolved from the repo root)
- `docker://` images only when pinned by digest (`@sha256:` plus 64 hex digits)
- Everything else must be a full **40-character** commit SHA (`owner/repo@<sha>`). Tags, short SHAs, and unpinned docker images fail immediately.

When `GH_TOKEN` or `GITHUB_TOKEN` is set, every remote SHA pin found (including inside nested local action manifests) is checked against the GitHub API; lines with a `# vX.Y.Z` comment must resolve to the pinned SHA. Without a token, local shape checks still run and unpinned or malformed refs fail; tag resolution is skipped after local validation passes.

The script exits non-zero when no `uses:` refs are found or when any check fails.

After changing a pin, local action, or tag comment, run this before merging.
