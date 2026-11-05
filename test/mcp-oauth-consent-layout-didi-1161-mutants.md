# DIDI-1161 consent phone layout mutants

Each mutant was applied alone on `src/auth/mcp-oauth/consent-page-styles.ts`, then the full `npm test` suite ran with `GIT_CONFIG_*` unset. Restored from the committed head after each run.

Verified at head `a2202155b0b01040ea61ce72441cddfbbc284a07`.

| Id  | Mutant                                            | Result   | Killing test(s)                                 |
| --- | ------------------------------------------------- | -------- | ----------------------------------------------- |
| L1  | Remove phone `@media (max-width: 639.98px)` block | Killed   | `test/mcp-oauth-consent-layout.browser.test.ts` |
| L2  | Remove desktop `@media (min-width: 640px)` block  | Killed   | `test/mcp-oauth-consent-layout.browser.test.ts` |
| L3  | Revert all layout media blocks to main            | Killed   | `test/mcp-oauth-consent-layout.browser.test.ts` |
| L4  | Phone `.consent-name-line` `display: block`       | Killed   | `test/mcp-oauth-consent-layout.browser.test.ts` |
| L5  | Remove phone `.consent-name-line::before` spacer  | Survived | (full suite green)                              |
| L6  | Desktop `flex-wrap: nowrap`                       | Killed   | `test/mcp-oauth-consent-layout.browser.test.ts` |
| L7  | Remove desktop `min-width: 0` on name             | Killed   | `test/mcp-oauth-consent-layout.browser.test.ts` |
| L8  | Remove `overflow-wrap: anywhere` on name          | Killed   | `test/mcp-oauth-consent-layout.browser.test.ts` |
| L9  | Remove phone tag `order: 2`                       | Survived | (full suite green)                              |
| L10 | Phone `flex-wrap: nowrap`                         | Killed   | `test/mcp-oauth-consent-layout.browser.test.ts` |
| L11 | Phone name `flex: 0 0 100%` instead of `1 1 auto` | Killed   | `test/mcp-oauth-consent-layout.browser.test.ts` |
| L12 | Remove `white-space: normal` on name              | Survived | (full suite green)                              |

Totals: 12 mutants run, 9 killed, 3 survived, 0 skipped.
