# DIDI-1161 consent phone layout mutants

Each mutant was applied alone on `src/auth/mcp-oauth/consent-page-styles.ts`, then the full `npm test` suite ran with `GIT_CONFIG_*` unset. Restored with `git checkout --` on that file after each run.

Verified at head `25bfeba8d1cc54f356d33bec799d82a279f7b06a`.

| Id  | Mutant                                                              | Result | Killing test(s)                                                  |
| --- | ------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| L1  | Remove phone `@media (max-width: 639.98px)` block                   | Killed | `test/mcp-oauth-consent-layout.browser.test.ts`                  |
| L2  | Remove desktop `@media (min-width: 640px)` block                    | Killed | `test/mcp-oauth-consent-layout.browser.test.ts`                  |
| L3  | Revert all layout media blocks                                      | Killed | `test/mcp-oauth-consent-layout.browser.test.ts`                  |
| L4  | Phone `.consent-name-line` `display: block`                         | Killed | `test/mcp-oauth-consent-layout.browser.test.ts`                  |
| L5  | Remove phone `.consent-name-line::before` spacer                    | Killed | `test/mcp-oauth-consent-layout.browser.test.ts` (320 px tag row) |
| L6  | Desktop `flex-wrap: nowrap`                                         | Killed | `test/mcp-oauth-consent-layout.browser.test.ts`                  |
| L7  | Remove desktop `min-width: 0` on name                               | Killed | `test/mcp-oauth-consent-layout.browser.test.ts`                  |
| L8  | Remove `overflow-wrap: anywhere` on name                            | Killed | `test/mcp-oauth-consent-layout.browser.test.ts`                  |
| L9  | Remove phone tag `order: 2`                                         | Killed | `test/mcp-oauth-consent-layout.browser.test.ts` (320 px tag row) |
| L10 | Phone `flex-wrap: nowrap`                                           | Killed | `test/mcp-oauth-consent-layout.browser.test.ts`                  |
| L11 | Phone name `flex: 0 0 100%` instead of `1 1 auto`                   | Killed | `test/mcp-oauth-consent-layout.browser.test.ts`                  |
| L12 | Desktop `.consent-name-line` `font-size: 0.875rem` (drop 0.9375rem) | Killed | `test/mcp-oauth-consent-layout.browser.test.ts` (font pin)       |

Totals: 12 mutants run, 12 killed, 0 survived, 0 equivalent, 0 skipped.
