# Pinned GitHub Action SHAs

Workflows pin third-party actions to full **40-character** commit SHAs with a `# vX.Y.Z` comment on the same line.

## Verify pins

From the repo root (requires `gh` authenticated for GitHub API):

```bash
npm run verify-action-pins
```

The script reads `.github/workflows/*.{yml,yaml}`. Every `- uses:` line must reference a **40-character** commit SHA (`owner/repo@<sha>`). Tag refs such as `@v4` fail immediately without calling GitHub.

When `GH_TOKEN` / `GITHUB_TOKEN` is set, pinned lines with a `# vX.Y.Z` comment are also checked against the GitHub API. Without a token, only the SHA ref shape check runs (exit 0 if all refs are SHAs).

After changing a pin or tag comment, run this before merging.
