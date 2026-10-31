# Pinned GitHub Action SHAs

Workflows pin third-party actions to full **40-character** commit SHAs with a `# vX.Y.Z` comment on the same line.

## Verify pins

From the repo root (requires `gh` authenticated for GitHub API):

```bash
npm run verify-action-pins
```

The script scans `.github/workflows` and `.github/actions` for every `uses:` reference (step `- uses:`, `- name:` / `- id:` first, job-level reusable workflows, and flow `- {uses: ...}` mappings) in `.yml` and `.yaml`.

Allowed refs:

- Local `./` paths under the repo
- `docker://` images only when pinned by digest (`@sha256:` plus 64 hex digits)
- Everything else must be a full **40-character** commit SHA (`owner/repo@<sha>`). Tags, short SHAs, and unpinned docker images fail immediately.

The script exits non-zero when no `uses:` refs are found. When `GH_TOKEN` or `GITHUB_TOKEN` is set, every remote SHA pin with a `# vX.Y.Z` comment is checked against the GitHub API. Without a token, missing or invalid tokens also fail (exit 1), not only the SHA shape check.

After changing a pin or tag comment, run this before merging.
